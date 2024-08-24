import fs from "fs";

import fetch from "node-fetch";
import { HeaderGenerator } from 'header-generator';
import { faker } from '@faker-js/faker'

import { logger } from './../logger/logger.js';


export const sleep = (sec) => {
	return new Promise(resolve => setTimeout(resolve, sec * 1000));
};

export const randomChoice = (arr) => {
	const randomIndex = Math.floor(Math.random() * arr.length);
	return arr[randomIndex];
};

export const getRandomSample = (array, sampleSize) => {
    if (sampleSize > array.length) {
        throw new Error("Sample size must be less than or equal to the array length");
    }

    const arrayCopy = array.slice();

    for (let i = arrayCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arrayCopy[i], arrayCopy[j]] = [arrayCopy[j], arrayCopy[i]];
    }

    return arrayCopy.slice(0, sampleSize);
};

export const weightedRandomChoice = (options) => {
	let randomNumber = Math.random();
	let selectedOption;

	for (const item in options) {
		const probability = options[item];
		if (randomNumber < probability) {
			selectedOption = item;
			break;
		}
		randomNumber -= probability;
	};

	return selectedOption;
};

export const randFloat = (min, max) => {
	return Math.random() * (max - min) + min;
};

export const randInt = (min, max) => {
	return Math.floor(Math.random() * (max - min + 1) + min);
};

export const txtToArray = (filePath) => {
    return fs.readFileSync(filePath, 'utf8').toString().replace(/\r\n/g, '\n').split('\n').filter(n => n);
};

export const removeLineFromTxt = (filePath, lineToRemoveText) => {
    const allLines = txtToArray(filePath);
	const filteredLines = allLines.filter(line => line !== lineToRemoveText);

	const updatedContent = filteredLines.join('\n');
	fs.writeFileSync(filePath, updatedContent, 'utf8');
};

export const addLineToTxt = (filePath, lineToAdd, allowDuplicates=true) => {
    let allLines = txtToArray(filePath);
	allLines.push(lineToAdd);

    if (!allowDuplicates) {
        allLines = [...new Set(allLines)];
    }

	const updatedContent = allLines.join('\n');
	fs.writeFileSync(filePath, updatedContent, 'utf8');
};

export const clearTxtFile = (path) => {
    fs.writeFileSync(path, '');
};

export const changeProxyIp = async (link, delay) => {
    for (let i = 0; i < 10; i++) {
        try {
            const response = await fetch(link, {method: 'GET', timeout: 10000});
            if (response.status != 200) {
                throw new Error();
            }

            logger.debug(`IP change response: ${JSON.stringify(await response.json())}`);
            logger.debug(`Changed ip, sleeping ${delay} seconds`);
            await sleep(delay);
            return;

        } catch (e) {
            logger.debug('Failed to change proxy ip, retrying');
            await sleep(6);
        }
    }

    throw new Error(`Failed to change proxy IP`);
};

export const roundBigInt = (num, minFig, maxFig) => {
    const sigFigs = randInt(minFig, maxFig);

    if (num === 0n) {
        return 0n;
    }

    const numStr = num.toString();
    const length = numStr.length;

    if (length <= sigFigs) {
        return num;
    }

    const scale = BigInt(10 ** (length - sigFigs));
    const rounded = (num / scale) * scale;

    return rounded;
};

export const generateUaHeaders = () => {
    const headerGenerator = new HeaderGenerator();

    while (true) {
        const headers = headerGenerator.getHeaders();
        const { 'sec-ch-ua': secChUa, 'user-agent': userAgent, 'sec-ch-ua-platform': platform } = headers;

        if (secChUa && userAgent && platform) {
            return {
                secChUa,
                userAgent,
                platform
            }
        }
    }
};

export const generateRandomUsername = () => {
    while (true) {
        let username = faker.internet.userName();
        if (username.includes('.')) {
            username = randomChoice(username.split('.'))
        }

        if (username.length > 5) {
            return username;
        }
    }
};
