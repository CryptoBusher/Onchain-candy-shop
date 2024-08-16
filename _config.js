import 'dotenv/config';


export const config = {
    rpc: process.env.MAINNET_RPC,                               // Нода, подтягивается из .env файла

    generalProxy: {
        address: process.env.GENERAL_PROXY_ADDRESS,             // Прокси, подтягивается из .env файла
        link: process.env.GENERAL_PROXY_LINK,                   // Ссылка на смену IP, подтягивается из .env файла
        sleepTimeSec: 15                                        // Время ожидания после запроса на смену IP (ответ может быть положительным сразу, но прокси еще не будет готов), секунды
    },

    telegramData: {	
		botToken: process.env.TG_BOT_TOKEN,                     // Токен Telegram бота, подтягивается из .env файла
		chatId: process.env.TG_CHAT_ID                          // ID чата для уведомлений (chatId или supergroupId/chatId), подтягивается из .env файла
	},

    accDelaySec: [100, 1000],                                   // Задержка между аккаунтами (min, max), секунды
    gasLimitMultipliers: [1.05, 1.1],                           // Увеличиваем gasLimit (min, max)
    activity: 'fuelDepoit',                                     // Выбираем активность, доступные: fuelDepoit

    gasPrices: {
		startGwei: 1,                                           // Стартовый газ
		stepGwei: 0.5,                                          // Шаг повышения газа
		delayMinutes: 0.1,                                      // Паузы между повышениями газа
		maxGwei: 2                                              // Максимальный газ
	},

    fuelDepoit: {
        currency: 'ETH',                                        // ETH, USDC, USDT
        untouchableAmount: [0.001, 0.003],                      // Неприкасаемая сумма (min, max)
        percentage: [0.95, 1],                                  // Сколько в процентах занести (после неприкасаемой суммы), (min, max)
        minAmount: 0.001,                                       // Минимальная сумма для заноса
        maxAmount: 2,                                           // Максимальная сумма для заноса
        singleDeposit: false,                                   // Скипать кошельки, которые уже занесли ранее
        roundWeiToFigures: [3, 5]                               // Округлять сумму в Wei до значений (min, max)
    }
}