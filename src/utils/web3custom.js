import fs from 'fs';

import { ethers, parseEther, formatEther, parseUnits, formatUnits } from "ethers";
import { tokensData } from './constants.js';

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

