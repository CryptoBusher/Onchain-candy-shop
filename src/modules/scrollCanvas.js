// https://scroll.io/canvas/mint

import fs from "fs";

import { ethers } from "ethers";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";

import { logger } from "../logger/logger.js";
import { randFloat, randInt, generateUaHeaders, generateRandomUsername, sleep, getRandomSample } from '../utils/helpers.js'
import { AlreadyDoneError } from "../errors.js";
import { count } from "console";


export class ScrollCanvas {
    static ADDRESS = "0xB23AF8707c442f59BDfC368612Bd8DbCca8a7a5a";
    static ABI = JSON.parse(fs.readFileSync('./src/abi/scrollCanvas.json', "utf8"));
    static BADGE_ABI = JSON.parse(fs.readFileSync('./src/abi/scrollCanvasBadge.json', "utf8"));
    static CACHE = {}

    constructor(signer, gasPriceMultiplierRange, gasLimitMultiplierRange, proxy=null) {
        this.signer = signer;
        this.gasPriceMultiplierRange = gasPriceMultiplierRange;
        this.gasLimitMultiplierRange = gasLimitMultiplierRange;
        this.proxy = proxy;

        this.contract = new ethers.Contract(ScrollCanvas.ADDRESS, ScrollCanvas.ABI, this.signer);
        this.uaHeaders = generateUaHeaders();
    }

    #getDefaultHeaders() {
        return {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'origin': 'https://scroll.io',
            'priority': 'u=1, i',
            'referer': 'https://scroll.io/',
            'sec-ch-ua': this.uaHeaders.secChUa,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': this.uaHeaders.platform,
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'cross-site',
            'user-agent': this.uaHeaders.userAgent
        };
    }

    #getGasPriceMultiplier() {
        return randFloat(...this.gasPriceMultiplierRange);
    }

    #getGasLimitMultiplier() {
        return randFloat(...this.gasLimitMultiplierRange);
    }

    async mintProfile(username=undefined, refCode=undefined) {
        if (await this.#isProfileMinted()) {
            throw new AlreadyDoneError(`wallet ${this.signer.address} has already minted canvas profile`);
        }

        while(true) {
            if (!username || await this.#isUsernameUsed(username)) {
                logger.debug(`Generating new username as is was not defined or already used`);
                username = generateRandomUsername();
            } else {
                break;
            }
        }

        let value = await this.#getProfileMintFee();

        if (!refCode) {
            logger.info('Going to mint profile without ref code (no any discounts will be applied)');
        } else {
            value /= BigInt(2);  // 50% discount with ref code
        }

        const signature = refCode ? await this.#getProfileMintSignature(refCode) : '0x';

        const feeData = await this.signer.provider.getFeeData();
        logger.debug(`feeData: ${JSON.stringify(feeData)}`);

        const estimatedGasPrice = feeData.gasPrice;
        const gasPrice = estimatedGasPrice * BigInt(parseInt(this.#getGasPriceMultiplier() * 100)) / BigInt(100);
        logger.debug(`gasPrice: ${gasPrice}`);

        const estimatedGasLimit = await this.contract.mint.estimateGas(
            username,
            signature,
            { value, gasPrice }
        );

        const gasLimit = estimatedGasLimit * BigInt(parseInt(this.#getGasLimitMultiplier() * 100)) / BigInt(100);
        logger.debug(`gasLimit: ${gasLimit}`);

        const tx = await this.contract.mint(
            username,
            signature,
            { value, gasPrice, gasLimit }
        );
        logger.debug(`tx: ${JSON.stringify(tx)}`);

        const receipt = await tx.wait();
        return [ await receipt.hash, username];
    }

    async #getProfileMintSignature(refCode) {
        const url = `https://canvas.scroll.cat/code/${refCode}/sig/${this.signer.address}`;

        const settings = {
            method: 'GET',
            timeout: 10000,
            headers: this.#getDefaultHeaders(),
        };


        if (this.proxy) {
            settings.agent = new HttpsProxyAgent(this.proxy);
        }

        for (let i = 0; i < 3; i++) {
            try {
                const response = await fetch(url, settings);
                if (![200, 201].includes(response.status)) {
                    throw new Error(`server response status ${response.status}`);
                }
                const data = await response.json();

                if (!('signature' in data)) {
                    throw new Error(`server response: ${JSON.stringify(data)}`);
                }

                return data.signature;
            } catch (e) {
                logger.error(`Failed to get registration signature, reason: ${e.message}, retrying after delay...`);
                await sleep(randInt(1, 2));  // Max 3-6 seconds for wallet
            }
        }
    
        throw new Error(`Failed to get profile mint signature`);
    }

    async #isProfileMinted() {
        const profile = await this.contract.getProfile(this.signer.address);
        return await this.contract.isProfileMinted(await profile);
    }

    async #isUsernameUsed(username) {
        return await this.contract.isUsernameUsed(username);
    }

    async #getProfileMintFee() {
        return await this.contract.MINT_FEE();
    }

    async getBadgesReadyForMint(userMax, badgesToSkip) {
        // Get all badges data
        if (!ScrollCanvas.CACHE.badgesData) {
            logger.debug('Missing cached badges data, fetching...');
            ScrollCanvas.CACHE.badgesData = await this.#getAllBadgesData();
        }
        let allBadgesData = ScrollCanvas.CACHE.badgesData;

        // Remove badges to skip
        const allBadgesDataWithSkips = allBadgesData.filter(badge => !badgesToSkip.includes(badge.badgeContract));
    
        // Get badges minted status
        const allBadgeAddresses = allBadgesDataWithSkips.map(badge => badge.badgeContract);
        const mintedResults = await this.#checkAllBadgesMintedStatus(allBadgeAddresses);
        const badgesDataWithMintedStatus = allBadgesDataWithSkips.map(nft => {
            const mintedToken = mintedResults.find(token => token.badgeContract === nft.badgeContract);
            nft.isMinted = mintedToken ? mintedToken.isMinted : false;
            return nft;
        })
        
        // Count amount of already minted badges + badges that we failed to check
        const counts = { true: 0, false: 0, null: 0 };
        badgesDataWithMintedStatus.forEach(nft => {
            if (nft.isMinted === true) {
                counts.true += 1;
            } else if (nft.isMinted === false) {
                counts.false += 1;
            } else {
                counts.null += 1;
            }
        });

        logger.info(`Already minted: ${counts.true}, not minted: ${counts.false}, failed to check: ${counts.null}`);

        if (counts.true >= userMax) {
            throw new AlreadyDoneError(`user already minted ${count.true} badges, user limit was set to ${userMax}`);
        }

        if (counts.null === badgesDataWithMintedStatus.length) {
            throw new Error(`failed to get minted status for all badges, probably softare is outdated or shit RPC`);
        }

        // Remove already minted and failed badges
        const notMintedBadges = badgesDataWithMintedStatus.filter(nft => nft.isMinted === false);

        // Check all badges eligibility
        const eligibilityResults = await this.#getAllBadgeEligibility(notMintedBadges);

        const eligibleBadges = notMintedBadges.filter(badge => {
            const result = eligibilityResults.find(res => res.badgeContract === badge.badgeContract);
            return result && result.eligibility === true;
        });

        const eligibleBadgesNames = eligibleBadges.map(badge => badge.name);
        const eligibleBadgesString = eligibleBadgesNames.join(', ');

        logger.info(`User is eligible for ${eligibleBadges.length} badges` + (eligibleBadges.length > 0 ? `: ${eligibleBadgesString}` : ''));

        // Update eligible badges with tx data
        const txDataResults = await this.#getAllEligibleBadgeTxData(eligibleBadges);

        const badgesWithTxData = eligibleBadges.map(badge => {
            const txDataResult = txDataResults.find(tx => tx.badgeContract === badge.badgeContract);
            return {
                ...badge,
                txData: txDataResult ? txDataResult.txData : null,
            };
        });

        const badgesReadyForMint = badgesWithTxData.filter(item => item.txData !== null);

        // Get random badges
        const remainingToMintAmount = userMax - counts.true  // how much badges remaining to fill user max
        if (remainingToMintAmount >= badgesReadyForMint.length) {
            return badgesReadyForMint;
        } else {
            return getRandomSample(badgesReadyForMint, remainingToMintAmount);
        }
    }

    async #getAllBadgesData() {
        let allBadgesData = [];
        let pageNumber = 1;

        while(true) {
            const data = await this.#getBadgeDataOnPage(pageNumber);
            if(data.data.length === 0) {
                break;
            }

            allBadgesData.push(...data.data);

            if (allBadgesData >= data.total) {
                break;
            }

            pageNumber += 1;
            await sleep(randInt(1, 3));
        }

        return allBadgesData;
    }

    async #getBadgeDataOnPage(page) {
        const url = `https://badge-registry.canvas.scroll.cat/badges?page_number=${page}&sort=minted&category=all&page_size=20`;

        const headers = {
            'sec-ch-ua': this.uaHeaders.secChUa,
            'Referer': 'https://scroll.io/',
            'sec-ch-ua-mobile': '?0',
            'user-agent': this.uaHeaders.userAgent,
            'sec-ch-ua-platform': this.uaHeaders.platform,
        };

        const settings = {
            method: 'GET',
            timeout: 10000,
            headers: headers,
        };

        if (this.proxy) {
            settings.agent = new HttpsProxyAgent(this.proxy);
        }

        for (let i = 0; i < 3; i++) {
            try {
                const response = await fetch(url, settings);
                if (![200, 201].includes(response.status)) {
                    throw new Error(`server response status ${response.status}`);
                }

                const data = await response.json();

                if (!('data' in data)) {
                    throw new Error(`server response: ${JSON.stringify(data)}`);
                }

                if (!('total' in data)) {
                    throw new Error(`server response: ${JSON.stringify(data)}`);
                }
                
                return data;
            } catch (e) {
                logger.error(`failed to get badges data, reason: ${e.message}, retrying after delay...`);
                await sleep(randInt(1, 2));  // Max 3-6 seconds for wallet
            }
        }
    
        throw new Error(`failed to get badges data on page ${page}`);
    }

    async #checkAllBadgesMintedStatus(badgesContractAddresses) {
        const results = [];

        const promises = badgesContractAddresses.map(async (badgeAddress) => {
            try {
                const isMinted = await this.#isBadgeMinted(badgeAddress);
                results.push({
                    badgeContract: badgeAddress,
                    isMinted: isMinted,
                });
            } catch (error) {
                logger.error(`error getting mint status for badge ${badgeAddress}: ${error.message}`);
                results.push({
                    badgeContract: badgeAddress,
                    isMinted: null
                });
            }
        });
    
        await Promise.all(promises);
    
        return results;
    }

    async #isBadgeMinted(badgeAddress) {
        const contract = new ethers.Contract(badgeAddress, ScrollCanvas.BADGE_ABI, this.signer.provider);
        return await contract.hasBadge(this.signer.address);
    }

    async #getAllBadgeEligibility(badgesData) {
        const results = [];

        const promises = badgesData.map(async (badgeData) => {
            try {
                const eligibility = await this.#isEligibleForBadge(badgeData);
                results.push({
                    badgeContract: badgeData.badgeContract,
                    eligibility: eligibility,
                });
            } catch (error) {
                logger.error(`error checking eligibility for badge ${badgeData.name} with CA ${badgeData.badgeContract}: ${error.message}`);
                results.push({
                    badgeContract: badgeData.badgeContract,
                    eligibility: null,
                });
            }
        });
    
        await Promise.all(promises);
    
        return results;
    }

    async #isEligibleForBadge(badgeData) {
        if (badgeData?.eligibilityCheck) {
            const contract = new ethers.Contract(badgeData.badgeContract, ScrollCanvas.BADGE_ABI, this.signer.provider);
            return await contract.isEligible(this.signer.address);
        } else if (badgeData?.baseURL) {
            const url = `${badgeData.baseURL}/check?badge=${badgeData.badgeContract}&recipient=${this.signer.address}`;

            const settings = {
                method: 'GET',
                timeout: 10000,
                headers: this.#getDefaultHeaders(),
            };
    
            if (this.proxy) {
                settings.agent = new HttpsProxyAgent(this.proxy);
            }

            const response = await fetch(url, settings);
            if (![200, 201].includes(response.status)) {
                throw new Error(`server response status ${response.status}`);
            }

            const data = await response.json();

            if (!('code' in data)) {
                throw new Error(`server response: ${JSON.stringify(data)}`);
            }
            
            return Boolean(data.code);
        } else if (badgeData.eligibilityCheck === false) {
            return true;  // only one nft has such data and it looks like it is mintable from any account
        } else {
            throw new Error(`not implemented, please contact Busher`);
        }
    }

    async #getAllEligibleBadgeTxData(badgesData) {
        const results = [];

        const promises = badgesData.map(async (badgeData) => {
            try {
                const txData = await this.#getEligibleBadgeTxData(badgeData);
                results.push({
                    badgeContract: badgeData.badgeContract,
                    txData: txData,
                });
            } catch (error) {
                logger.error(`error getting tx data for badge ${badgeData.name} with CA ${badgeData.badgeContract}: ${error.message}`);
                results.push({
                    badgeContract: badgeData.badgeContract,
                    txData: null
                });
            }
        });
    
        await Promise.all(promises);
    
        return results;
    }

    async #getEligibleBadgeTxData(badgeData) {
        let baseUrl = badgeData.baseURL;
        if (!baseUrl) {
            baseUrl = 'https://canvas.scroll.cat/badge';
        }

        const url = baseUrl + `/claim?badge=${badgeData.badgeContract}&recipient=${this.signer.address}`;

        const settings = {
            method: 'GET',
            timeout: 10000,
            headers: this.#getDefaultHeaders(),
        };

        if (this.proxy) {
            settings.agent = new HttpsProxyAgent(this.proxy);
        }


        const response = await fetch(url, settings);
        if (![200, 201].includes(response.status)) {
            throw new Error(`server response status ${response.status}`);
        }

        const data = await response.json();

        if (!data?.tx?.to || !data?.tx?.data) {
            throw new Error(`server response: ${JSON.stringify(data)}`);
        }
        
        return data.tx;
    }

    async mintBadge(badgeData) {
        if (!badgeData?.txData?.to || !badgeData?.txData?.data) {
            throw new Error(`missing tx data for wallet ${this.signer.address} and badge ${badgeData.name} with CA ${badgeData.badgeContract}`);
        }

        if (await this.#isBadgeMinted(badgeData.badgeContract)) {
            throw new AlreadyDoneError(`wallet ${this.signer.address} has already minted badge ${badgeData.name} with CA ${badgeData.badgeContract}`);
        }

        const feeData = await this.signer.provider.getFeeData();
        logger.debug(`feeData: ${JSON.stringify(feeData)}`);

        const estimatedGasPrice = feeData.gasPrice;
        const gasPrice = estimatedGasPrice * BigInt(parseInt(this.#getGasPriceMultiplier() * 100)) / BigInt(100);
        badgeData.txData.gasPrice = gasPrice;
        logger.debug(`gasPrice: ${gasPrice}`);

        const estimatedGasLimit = await this.signer.estimateGas(badgeData.txData);
        const gasLimit = estimatedGasLimit * BigInt(parseInt(this.#getGasLimitMultiplier() * 100)) / BigInt(100);
        badgeData.txData.gasLimit = gasLimit;
        logger.debug(`gasLimit: ${gasLimit}`);

        const tx = await this.signer.sendTransaction(badgeData.txData);
        logger.debug*`tx: ${JSON.stringify(tx)}`;

        const receipt = await tx.wait();
        return await receipt.hash;
    }

    async getPersonalRefCode() {
        const url = `https://canvas.scroll.cat/acc/${this.signer.address}/code`;

        const settings = {
            method: 'GET',
            timeout: 10000,
            headers: this.#getDefaultHeaders(),
        };

        if (this.proxy) {
            settings.agent = new HttpsProxyAgent(this.proxy);
        }

        for (let i = 0; i < 3; i++) {
            try {
                const response = await fetch(url, settings);
                if (![200, 201].includes(response.status)) {
                    throw new Error(`server response status ${response.status}`);
                }

                const data = await response.json();

                if (!('code' in data)) {
                    throw new Error(`server response: ${JSON.stringify(data)}`);
                }
                
                return data.code;
            } catch (e) {
                logger.debug(`Failed to get personal ref code, reason: ${e.message}, retrying after delay...`);
                await sleep(randInt(3, 6));  // Max 10-20 seconds for wallet
            }
        }
    
        throw new Error(`Failed to get ref code`);
    }
}
