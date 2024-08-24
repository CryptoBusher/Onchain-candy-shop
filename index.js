import fs from "fs";
import path from "path";

import { config } from './config.js';
import { logger } from './src/logger/logger.js';
import { TelegramBot } from './src/utils/telegram.js';
import { Fuel } from './src/modules/fuel.js';
import { ScrollCanvas } from "./src/modules/scrollCanvas.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { ethers, JsonRpcProvider, FetchRequest } from "ethers";
import { txtToArray, addLineToTxt, randomChoice, sleep, randInt, removeLineFromTxt, changeProxyIp, randFloat, roundBigInt } from './src/utils/helpers.js'
import { toWei, fromWei, getTokenBalance, getEthBalance, waitForGas } from "./src/utils/web3custom.js";
import { tokensData, chainExplorers } from "./src/utils/constants.js";
import { LowBalanceError, AlreadyDoneError } from "./src/errors.js";

const tgBot = config.telegramData.botToken ? new TelegramBot(config.telegramData.botToken, config.telegramData.chatId) : undefined;


class Runner {
    static ACTIVITY_CHAINS_MAP = {
        fuelDepoit: 'mainnet',
        fuelBalanceCheck: 'mainnet',
        scrollCanvas: 'scroll'
    }

    constructor(config) {
        this.config = config;
        this.activity =  this[this.config.activity];
        this.chain = Runner.ACTIVITY_CHAINS_MAP[this.config.activity];
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
    
    #getWalletData(random) {
        const walletsData = txtToArray('wallets.txt')

        if (random) {
            return randomChoice(walletsData);
        } else {
            return walletsData[0];
        }
        
    };

    #prepareSigner(privateKey, rpc, proxy=undefined) {
        let fetchRequest = undefined;
        if (proxy) {
            fetchRequest = new FetchRequest(rpc);
            fetchRequest.getUrlFunc = FetchRequest.createGetUrlFunc({
                agent: new HttpsProxyAgent(proxy),
            });
        };

        const provider = new JsonRpcProvider(fetchRequest ? fetchRequest : rpc);
        provider._getConnection().timeout = this.config.providerTimeoutSec * 1000;
        const signer = new ethers.Wallet(privateKey, provider);

        return signer;
    };

    async fuelDepoit(name, signer, _) {
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

        const fuel = new Fuel(signer, this.config.gasPriceMultiplierRange, this.config.gasLimitMultiplierRange);
        
        const currency = this.config.fuelDepoit.currency;

        if (this.config.fuelDepoit.singleDeposit) {
            const depositedAmount = await fuel.getDepositedAmount(currency);
            if (depositedAmount > 0n) {
                throw new AlreadyDoneError(`already deposited ${fromWei('mainnet', currency, depositedAmount)} ${currency}`);
            }
        }

        const amount = await getAmount(currency);

        logger.info(`${name} - trying to deposit ${fromWei('mainnet', currency, amount)} ${currency}`);
        const hash = await fuel.performDeposit(currency, amount);

        return [{
            info: `Deposited ${amount} ${currency}`,
            hash: hash
        }]
    }

    async fuelBalanceCheck(name, signer, _) {
        const fuel = new Fuel(signer, this.config.gasPriceMultiplierRange, this.config.gasLimitMultiplierRange);
        const results = {};

        for (const token of Fuel.SUPPORTED_TOKENS) {
            const depositedAmountWei = await fuel.getDepositedAmount(token);
            
            if (depositedAmountWei > 0) {
                const depositetAmountHuman = fromWei('mainnet', token, depositedAmountWei);
                results[token] = depositetAmountHuman
            }
        }

        if (Object.entries(results).length > 0) {
            for (const [key, value] of Object.entries(results)) {
                console.log(`${name} - has deposited ${value} ${key}`);
            }
        } else {
            logger.info(`${name} - hasn't deposited any tokens`);
        }
    }

    async scrollCanvas(name, signer, proxy) {
        const reportData = []

        async function scrollCanvasRegister() {
            logger.info(`${name} - registering account`);
            try {
                let refCode;
                let userName;
                
                const allRefCodes = txtToArray(path.join('data', 'scrollCanvas', 'refCodes.txt'));
                if (allRefCodes.length > 0) {
                    refCode = randomChoice(allRefCodes);
                }
                
                const usernamesData = txtToArray(path.join('data', 'scrollCanvas', 'usernames.txt'));
                for (const data of usernamesData) {
                    const [ accName, accUn ] = data.split('|');
                    if (accName === name) {
                        userName = accUn;
                        break;
                    }
                }

                const [ hash, actualUsername ] = await canvas.mintProfile(userName, refCode);

                const info = `registered profile with username ${actualUsername} and ref code ${refCode}`;
                logger.info(`${name} - ${info}, hash: ${hash}`);

                reportData.push({
                    info,
                    hash
                })

            } catch (e) {
                if (e.name === 'AlreadyDoneError') {
                    logger.info(e.message);
                    reportData.push({
                        info: e.message,
                        hash: null
                    })
                } else {
                    throw e;
                }
            }
        }

        async function saveRefCode() {
            logger.info(`${name} - fetching and saving personal ref code`);
            try {
                const refCode = await canvas.getPersonalRefCode();
                addLineToTxt(path.join('data', 'scrollCanvas', 'refCodes.txt'), refCode, false);
                
                logger.info(`${name} - personal ref code saved`);
            } catch(e) {
                logger.error(`${name} - ${e.message}`);
            }
        }

        async function scrollCanvasMintBadges(userMax, badgesToSkip, activityDelaysSec) {      
            logger.info(`${name} - minting badges`);

            try {
                const badges = await canvas.getBadgesReadyForMint(userMax, badgesToSkip);
                if (badges.length === 0) {
                    logger.info(`${name} - no any badges to mint`);
                    return;
                }

                for (const badge of badges) {
                    try {
                        logger.info(`${name} - trying to mint badge ${badge.name} with CA ${badge.badgeContract}`);
                        const hash = await canvas.mintBadge(badge);

                        const info = `minted badge ${badge.name} with CA ${badge.badgeContract}`;
                        logger.info(`${name} - ${info}, hash: ${hash}`);
        
                        reportData.push({
                            info,
                            hash
                        })

                    } catch (e) {
                        if (e.name === 'AlreadyDoneError') {  // in case specific badge is already minted
                            const info = `already minted badge ${badge.name} with CA ${badge.badgeContract}`;
                            logger.info(`${name} - ${info}`);
                            
                            reportData.push({
                                info,
                                hash: null
                            })
                        } else {
                            const info = `failed to mint badge ${badge.name} with CA ${badge.badgeContract}, see bot logs`;
                            logger.error(`${name} - failed to mint badge ${badge.name} with CA ${badge.badgeContract}, reason: ${e.message}`);

                            reportData.push({
                                info,
                                hash: null
                            })
                        }
                    }
    
                    const activityDelaySec = randInt(...activityDelaysSec);
                    logger.info(`${name} - sleeping ${(activityDelaySec / 60).toFixed(2)} minutes before next badge`);
                    await sleep(activityDelaySec);
                }

            } catch (e) {
                if (e.name === 'AlreadyDoneError') {  // in case module already done
                    logger.info(e.message);
                    reportData.push({
                        info: e.message,
                        hash: null
                    });
                } else {
                    throw e;
                }
            }
        }

        const canvas = new ScrollCanvas(signer, this.config.gasPriceMultiplierRange, this.config.gasLimitMultiplierRange, proxy);

        await scrollCanvasRegister();
        
        const delay = randInt(...this.config.activityDelaysSec);
        logger.info(`${name} - sleeping ${(delay / 60).toFixed(2)} minutes`);
        await sleep(delay);

        if (this.config.scrollCanvas.addNewRefCodes) {
            await saveRefCode();
        }

        await scrollCanvasMintBadges(
            randInt(...this.config.scrollCanvas.maxBadgesAmount),
            this.config.scrollCanvas.badgesToSkip,
            this.config.activityDelaysSec
        );

        return reportData;
    }

    async run() {
        while (true) {
            try {
                const walletData = this.#getWalletData(this.config.shuffleWallets);
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

                    const signer = this.#prepareSigner(privateKey, config.rpcs[this.chain], proxy);
                    
                    if (this.config.gasPrices.waitForGas) {
                        logger.info(`Waiting for gas...`);
                        await waitForGas(config.rpcs.mainnet, config.gasPrices);
                        logger.info(`gas ok, proceeding`);
                    }

                    const reportData = await this.activity(name, signer, proxy);
                    this.#processSuccess(walletData);

                    if (reportData) {  // if there is something to report to user, mostly for onchain write orepations
                        for (const activity of reportData) {
                            activity.txLink = activity.hash ? `${chainExplorers[this.chain]}tx/${activity.hash}` : null;   
                        }

                        let logDataString = '';
                        let tgDataString = '';
                        for (const activity of reportData) {
                            logDataString += `${activity.info}` + (activity.txLink ? `, tx link: ${activity.txLink}` : '') + ' | ';
                            logDataString = logDataString.slice(0, -2);  // remove last " |"

                            tgDataString += `<b>Info: </b>${activity.info}` + (activity.txLink ? ` (<a href="${activity.txLink}">transaction</a>)` : '') + '\n';
                        }

                        logger.info(`${name} - success, data: ${logDataString}`);
                        
                        if (tgBot) {
                            const tgMessage = `✅ #success\n\n<b>Wallet: </b>${name}\n<b>Module: </b>${this.config.activity}\n${tgDataString}\n<b>Links: </b> <a href="${chainExplorers[this.chain]}address/${signer.address}">Wallet</a> | <a href="https://debank.com/profile/${signer.address}/history">DeBank</a>`;
                            await tgBot.sendNotification(tgMessage);
                        };
                    }
                } catch (e) {
                    if (e.name === 'AlreadyDoneError') {
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

                        logger.error(`${name} - failed to perform activity, reason: ${e.message}`);
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

            if (this.config.accountDelaysSec[1] > 0) {
                const delayBeforeNext = randInt(this.config.accountDelaysSec[0], this.config.accountDelaysSec[1]);
                logger.info(`Sleeping ${(delayBeforeNext / 60).toFixed(2)} minutes before next`);
                await sleep(delayBeforeNext);
            }
        } 
    }
}


const main = async () => {
    const runner = new Runner(config);
    await runner.run();

}


main();
