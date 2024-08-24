import fs from 'fs';

import { ethers, parseEther, formatEther, parseUnits, formatUnits, JsonRpcProvider } from "ethers";

import { tokensData } from './constants.js';
import { sleep, randInt } from './helpers.js'
import { logger } from './../logger/logger.js';


export const toWei = (chainName, tokenName, amount) => {
	if (tokenName === 'ETH') {
		const roundedAmountStr = amount.toFixed(18);
		return parseEther(roundedAmountStr);
	} else {
		const decimals = tokensData[chainName][tokenName].decimals
		const roundedAmountStr = amount.toFixed(decimals);
		return parseUnits(roundedAmountStr, decimals);
	}
};


export const fromWei = (chainName, tokenName, amount) => {
	if (tokenName === 'ETH') {
		return parseFloat(formatEther(amount.toString()));
	} else {
		return parseFloat(formatUnits(amount.toString(), tokensData[chainName][tokenName].decimals));
	}
};


export const getEthBalance = async (walletAddress, provider) => {
	return await provider.getBalance(walletAddress);
};


export const getTokenBalance = async (walletAddress, tokenAddress, provider) => {
	const standardTokenAbi = JSON.parse(fs.readFileSync('./src/abi/standardToken.json', "utf8"));
	const tokenContract = new ethers.Contract(tokenAddress, standardTokenAbi, provider);
	return await tokenContract.balanceOf(walletAddress);
};


export const getTokenContractNonce = async (tokenAddress, ownerAddress, provider) => {
	const standardTokenAbi = JSON.parse(fs.readFileSync('./src/abi/standardToken.json', "utf8"));
	const tokenContract = new ethers.Contract(tokenAddress, standardTokenAbi, provider);
	const nonce = await tokenContract.nonces(ownerAddress);

	return nonce;
};


export const waitForGas = async (rpc, gasPrices) => {
	const provider = new JsonRpcProvider(rpc);
    let currentMaxGas = gasPrices.startGwei;

    const timestampShift = gasPrices.delayMinutes * 60 * 1000 // minutes to miliseconds
    let nextCurrentMaxGasIncrease = Date.now() + timestampShift;

    while(true) {
        if ((Date.now() >= nextCurrentMaxGasIncrease) && (gasPrices.stepGwei !== 0) && (currentMaxGas < gasPrices.maxGwei)) {
            logger.info(`Increasing max gas ${currentMaxGas} -> ${currentMaxGas + gasPrices.stepGwei} GWEI`);
            currentMaxGas = currentMaxGas + gasPrices.stepGwei;
            nextCurrentMaxGasIncrease = Date.now() + timestampShift;
        }
        
        const feeData = await provider.getFeeData();
        const gasPriceGwei = parseFloat(formatUnits(feeData.gasPrice.toString(), "gwei"));

        if (gasPriceGwei <= currentMaxGas) {
            logger.debug(`current gas is ${gasPriceGwei.toFixed(1)}, my current max is ${currentMaxGas}`);
            return;
        } else {
            logger.debug(`current gas is ${gasPriceGwei.toFixed(1)}, my current max is ${currentMaxGas}, waiting...`);
            await sleep(randInt(30, 60));
        }
    }
};

