// https://app.fuel.network/earn-points/deposit/

import fs from "fs";

import { ethers, AbiCoder, Signature, MaxUint256 } from "ethers";

import { logger } from "../logger/logger.js";
import { tokensData } from "../utils/constants.js";
import { getTokenContractNonce } from "../utils/web3custom.js"
import { randFloat } from '../utils/helpers.js'
import { NotImplementedError } from "../errors.js";


export class Fuel {
    static ADDRESS = "0x19b5cc75846BF6286d599ec116536a333C4C2c14";
    static ABI = JSON.parse(fs.readFileSync('./src/abi/fuel.json', "utf8"));
    static SUPPORTED_TOKENS = [
        'ETH',
        'USDC',
        'USDT'
    ]
    static DOMAINS_CACHE = {};
    
    constructor(signer, gasPriceMultiplierRange, gasLimitMultiplierRange) {
        this.signer = signer;
        this.gasPriceMultiplierRange = gasPriceMultiplierRange;
        this.gasLimitMultiplierRange = gasLimitMultiplierRange;
        this.contract = new ethers.Contract(Fuel.ADDRESS, Fuel.ABI, this.signer);
    }

    #getGasPriceMultiplier() {
        return randFloat(...this.gasPriceMultiplierRange);
    }

    #getGasLimitMultiplier() {
        return randFloat(...this.gasLimitMultiplierRange);
    }

    async performDeposit(coin, amount) {
        if (coin == 'ETH') {
            return await this.#deposit(coin, amount);
        } else if (Fuel.SUPPORTED_TOKENS.includes(coin)) {
            return await this.#depositWithPermit(coin, amount);
        } else {
            throw new NotImplementedError(`${coin} deposits are not implemented`);
        }
    }

    async #deposit(coin, amount) {
        const value = coin === 'ETH' ? amount : 0;
        const estimatedGasLimit = await this.contract.deposit.estimateGas(
            tokensData.mainnet[coin].address,
            amount,
            0,
            { value }
        );

        const gasLimit = estimatedGasLimit * BigInt(parseInt(this.#getGasLimitMultiplier() * 100)) / BigInt(100);

        const tx = await this.contract.deposit(
            tokensData.mainnet[coin].address,
            amount,
            0,
            { value, gasLimit }
        );

        const receipt = await tx.wait();
        return await receipt.hash;
    }

    async #depositWithPermit(coin, amount) {
        const deadline = MaxUint256;
        const signature = await this.#signPermit(coin, amount, deadline);

        const estimatedGasLimit = await this.contract.depositWithPermit.estimateGas(
            tokensData.mainnet[coin].address,
            amount,
            0,
            deadline,
            signature.v,
            signature.r,
            signature.s
        );

        const gasLimit = estimatedGasLimit * BigInt(parseInt(this.#getGasLimitMultiplier() * 100)) / BigInt(100);

        const tx = await this.contract.depositWithPermit(
            tokensData.mainnet[coin].address,
            amount,
            0,
            deadline,
            signature.v,
            signature.r,
            signature.s,
            { gasLimit }
        );


        const receipt = await tx.wait();
        return await receipt.hash;
    }

    async #signPermit(coin, amount, deadline) {
        const abiCoder = new AbiCoder();

        const domain = await this.#getDomain(coin);

        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };

        const tokenContractNonce = await getTokenContractNonce(
            tokensData.mainnet[coin].address,
            this.signer.address,
            this.signer.provider
        );

        const data = { 
            owner: this.signer.address, 
            spender: Fuel.ADDRESS, 
            value: amount,
            nonce: tokenContractNonce,
            deadline: deadline
        };

        const rawSig = await this.signer.signTypedData(domain, types, data);
        return Signature.from(rawSig);
    }

    async #getDomain(coin) {
        return Fuel.DOMAINS_CACHE[coin] ?? await this.#buildDomain(coin);
    }

    async #buildDomain(coin) {
        const tokenAddress = tokensData.mainnet[coin].address;
        const standardTokenAbi = JSON.parse(fs.readFileSync('./src/abi/standardToken.json', "utf8"));
	    const tokenContract = new ethers.Contract(tokenAddress, standardTokenAbi, this.signer.provider);

        const domain = {
            "name": await tokenContract.name(),
            "version": await tokenContract.version(),
            "chainId": 1,
            "verifyingContract": tokenAddress
        };

        Fuel.DOMAINS_CACHE[coin] = domain;
        return domain;
    }

    async getDepositedAmount(coin) {
        const depositedAmount = await this.contract.getBalance(this.signer.address, tokensData.mainnet[coin].address);
        logger.debug(`${this.signer.address} - already deposited ${coin} amount: ${depositedAmount}`);

        return depositedAmount;
    }
}