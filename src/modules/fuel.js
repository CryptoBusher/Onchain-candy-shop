import fs from "fs";

import { ethers } from "ethers";

import { logger } from "../logger/logger.js";
import { tokensData } from "../utils/constants.js";


export class NotImplementedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotImplementedError';
    }
}


export class Fuel {
    static ADDRESS = "0x19b5cc75846BF6286d599ec116536a333C4C2c14";
    static ABI = JSON.parse(fs.readFileSync('./src/abi/fuel.json', "utf8"));
    
    constructor(signer, gasMultipliers) {
        this.signer = signer;
        this.gasMultipliers = gasMultipliers;
        this.contract = new ethers.Contract(Fuel.ADDRESS, Fuel.ABI, this.signer);
    }

    #getGasLimitMultiplier() {
        return randFloat(...this.gasMultipliers);
    }

    async performDeposit(currency, amount) {
        if (currency == 'ETH') {
            return await this.deposit(currency, amount);
        } else if (["USDT", "USDC"].includes(currency)) {
            return await this.depositStable(currency, amount);
        } else {
            throw new NotImplementedError(`${currency} deposits are not implemented`);
        }
    }

    async deposit(currency, amount) {
        const value = currency === 'ETH' ? amount : 0;
        const estimatedGasLimit = await this.contract.deposit.estimateGas(
            tokensData.mainnet[currency].address,
            amount,
            0,
            { value }
        );

        const gasLimit = estimatedGasLimit * BigInt(parseInt(this.#getGasLimitMultiplier() * 100)) / BigInt(100);

        const tx = await this.contract.deposit(
            tokensData.mainnet[currency].address,
            amount,
            0,
            { value, gasLimit }
        );

        const receipt = await tx.wait();
        return await receipt.hash;
    }

    async depositWithPermit(currency, amount) {
        const estimatedGasLimit = await this.contract.deposit.depositWithPermit(
            tokensData.mainnet[currency].address,
            amount,
            0,
        );

        // const gasLimit = estimatedGasLimit * BigInt(parseInt(this.#getGasLimitMultiplier() * 100)) / BigInt(100);

        // const tx = await this.contract.depositWithPermit(
        //     tokensData.mainnet[currency].address,
        //     amount,
        //     0,
        //     { gasLimit }
        // );

        // const receipt = await tx.wait();
        // return await receipt.hash;
    }

    async getDepositedAmount(currency) {
        const depositedAmount = await this.contract.getBalance(this.signer.address, tokensData.mainnet[currency].address);
        logger.debug(`${this.signer.address} - already deposited ${currency} amount: ${depositedAmount}`);

        return depositedAmount;
    }
}