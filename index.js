import fs from "fs";
import path from "path";

import { config } from './config.js';
import { logger } from './src/logger/logger.js';
import { TelegramBot } from './src/utils/telegram.js';
import { Fuel } from './src/modules/fuel.js';
import { HttpsProxyAgent } from "https-proxy-agent";
import { ethers, JsonRpcProvider, FetchRequest } from "ethers";
import { txtToArray, addLineToTxt, randomChoice, sleep, randInt, removeLineFromTxt, changeProxyIp, randFloat, roundBigInt } from './src/utils/helpers.js'
import { toWei, fromWei, getTokenBalance, getEthBalance, waitForGas } from "./src/utils/web3custom.js";
import { tokensData } from "./src/utils/constants.js";

const tgBot = config.telegramData.botToken ? new TelegramBot(config.telegramData.botToken, config.telegramData.chatId) : undefined;


class ActivityAlreadyPerformedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ActivityAlreadyPerformedError';
    }
}

class LowBalanceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LowBalance';
    }
}

class Runner {
    constructor(config) {
        this.config = config;
        this.activity =  this[this.config.activity];
    }

    #processSuccess(walletData) {
        const filePath = path.join('results', `success_SECRET.txt`);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '', 'utf-8');
        }
        addLineToTxt(filePath, walletData);
        this.#removeWalletData(walletData);
    };
    
    #processFail(walletData) {
        const filePath = path.join('results', `fail_SECRET.txt`);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '', 'utf-8');
        }
        addLineToTxt(filePath, walletData);
        this.#removeWalletData(walletData);
    };
    
    #removeWalletData(walletData) {
        removeLineFromTxt('wallets.txt', walletData);
    };
    
    #getRandomWalletData() {
        const walletsData = txtToArray('wallets.txt')
        return randomChoice(walletsData);
    };

    #prepareSigner(privateKey, proxy=undefined) {
        let fetchRequest = undefined;
        if (proxy) {
            fetchRequest = new FetchRequest(this.config.rpc);
            fetchRequest.getUrlFunc = FetchRequest.createGetUrlFunc({
                agent: new HttpsProxyAgent(proxy),
            });
        };

        const provider = new JsonRpcProvider(fetchRequest ? fetchRequest : this.config.rpc);
        const signer = new ethers.Wallet(privateKey, provider);

        return signer;
    };

    async fuelDepoit(name, signer) {
        const getAmount = async (currency) => {
            let walletBalance;
            if (currency === 'ETH') {
                walletBalance = await getEthBalance(signer.address, signer.provider);
            } else {
                walletBalance = await getTokenBalance(signer.address, tokensData.mainnet[currency].address, signer.provider);
            }

            const untouchableAmountMaxWei = toWei('mainnet', currency, this.config.fuelDepoit.untouchableAmount[1]);
            const minAmountWei = toWei('mainnet', currency, this.config.fuelDepoit.minAmount);
            const maxAmountWei = toWei('mainnet', currency, this.config.fuelDepoit.maxAmount);

            if (untouchableAmountMaxWei + minAmountWei > walletBalance) {
                throw new LowBalanceError(`max untouchable amount is set to ${this.config.fuelDepoit.untouchableAmount[1]} and min deposit amount is set to ${this.config.fuelDepoit.minAmount} but wallet balance is ${fromWei('mainnet', currency, walletBalance)}`);
            }

            const untouchableAmountHuman = randFloat(...this.config.fuelDepoit.untouchableAmount);
            const untouchableAmountWei = toWei('mainnet', currency, untouchableAmountHuman);
            const remainingBalanceWei = walletBalance - untouchableAmountWei;

            const maxPermittedAmountWei = remainingBalanceWei > maxAmountWei ? maxAmountWei : remainingBalanceWei;
            const percentage = randFloat(...this.config.fuelDepoit.percentage);
            const finalAmountSybilWei = maxPermittedAmountWei * BigInt(parseInt(percentage * 100)) / BigInt(100);
            
            const finalAmountWei = finalAmountSybilWei === walletBalance 
            ? finalAmountSybilWei // depositing full balance is not sybil
            : roundBigInt(finalAmountSybilWei, ...this.config.fuelDepoit.roundWeiToFigures);  

            return finalAmountWei;
        }

        const fuel = new Fuel(signer, this.config.gasLimitMultipliers);
        
        const currency = this.config.fuelDepoit.currency;

        if (this.config.fuelDepoit.singleDeposit) {
            const depositedAmount = await fuel.getDepositedAmount(currency);
            if (depositedAmount > 0n) {
                throw new ActivityAlreadyPerformedError(`already deposited ${fromWei('mainnet', currency, depositedAmount)} ${currency}`);
            }
        }

        const amount = await getAmount(currency);

        logger.info(`${name} - trying to deposit ${fromWei('mainnet', currency, amount)} ${currency}`);
        const hash = await fuel.performDeposit(currency, amount);

        return {
            info: `Deposited ${amount} ${currency}`,
            hash: hash
        }
    }


    async run() {
        while (true) {
            try {
                const walletData = this.#getRandomWalletData();
                if (!walletData) {
                    logger.info('No any wallets remaining');
                    if (tgBot) {
                        const tgMessage = `🚀 #completed\n\nNo any wallets remaining for in module ${this.config.activity}`;
                        await tgBot.sendNotification(tgMessage);
                    }
    
                    return;
                }

                let [ name, privateKey, proxy ] = walletData.split('|');

                try {  
                    if (!proxy && this.config.generalProxy.address) {
                        if (this.config.generalProxy.address && this.config.generalProxy.link) {
                            logger.info(`${name} - using general proxy`);
                            proxy = this.config.generalProxy.address;

                            logger.info(`${name} - changing proxy ip`);
                            await changeProxyIp(this.config.generalProxy.link, this.config.generalProxy.sleepTimeSec);
                        } else {
                            logger.warning(`${name} - running without proxy`);
                        }
                    }

                    const signer = this.#prepareSigner(privateKey, proxy);

                    logger.info(`Waiting for gas...`);
                    await waitForGas(signer.provider, config.gasPrices);
                    logger.info(`gas ok, proceeding`);

                    const result = await this.activity(name, signer);
                    logger.info(`${name} - success, hash: ${result.hash}`);
                    this.#processSuccess(walletData);

                    if (tgBot) {
                        const tgMessage = `✅ #success\n\n<b>Wallet: </b>${name}\n<b><b>Module: </b>${this.config.activity}\nInfo: </b>${result.info}\n\<b>Links: </b> <a href="https://etherscan.io/address/${signer.address}">Wallet</a> | <a href="https://etherscan.io/tx/${result.hash}">Tx</a> | <a href="https://debank.com/profile/${signer.address}/history?chain=eth">DeBank</a>`;
                        await tgBot.sendNotification(tgMessage);
                    };
                } catch (e) {
                    if (e.name === 'ActivityAlreadyPerformedError') {
                        logger.info(`${name} - ${e.message}`);
                        this.#processSuccess(walletData);
    
                        if (tgBot) {
                            const tgMessage = `🎯 #finished\n\n<b>Wallet: </b>${name}\n<b>Module: </b>${this.config.activity}\n<b>Info: </b>${e.message}`;
                            await tgBot.sendNotification(tgMessage);
                        }
    
                        continue;
                    } else {
                        if (e.code === 'INSUFFICIENT_FUNDS') {
                            e.message = 'insufficient funds';
                        }

                        logger.error(`${name} - failed to deposit, reason: ${e.message}`);
                        this.#processFail(walletData);
    
                        if (tgBot) {
                            const tgMessage = `⛔️ #fail\n\n<b>Wallet: </b>${name}\n<b>Module: </b>${this.config.activity}\n<b>Info: </b> ${e.message}`;
                            await tgBot.sendNotification(tgMessage);
                        };
                    }
                }
            } catch (e) {
                logger.error(`Unexpected error, reason: ${e.message}`);
                this.#processFail(walletData);

                if (tgBot) {
                    const tgMessage = `⛔️ #fail\n\n<Unexpected error in module ${this.config.activity}, reason: ${e.message}`;
                    await tgBot.sendNotification(tgMessage);
                };
            }

            const delayBeforeNext = randInt(this.config.accDelaySec[0], this.config.accDelaySec[1]);
            logger.info(`Sleeping ${(delayBeforeNext / 60).toFixed(2)} minutes before next`);
            await sleep(delayBeforeNext);
        } 
    }
}


const main = async () => {
    const runner = new Runner(config);
    await runner.run();

}


main();
