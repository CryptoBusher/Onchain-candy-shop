import 'dotenv/config';


export const config = {
    rpcs: {                                                     // Ноды
        mainnet: "",
        scroll: ""
    },

    generalProxy: {
        address: process.env.GENERAL_PROXY_ADDRESS,             // Прокси, подтягивается из .env файла
        link: process.env.GENERAL_PROXY_LINK,                   // Ссылка на смену IP, подтягивается из .env файла
        sleepTimeSec: 15                                        // Время ожидания после запроса на смену IP в секундах (ответ может быть положительным сразу, но прокси еще не будет готов)
    },

    telegramData: {	
		botToken: process.env.TG_BOT_TOKEN,                     // Токен Telegram бота, подтягивается из .env файла
		chatId: process.env.TG_CHAT_ID                          // ID чата для уведомлений (chatId или supergroupId/chatId), подтягивается из .env файла
	},

    shuffleWallets: true,                                       // Перемешивать ли кошельки (true / false)
    providerTimeoutSec: 120,                                    // Таймаут ожидания ответа от провайдера в секундах
    accountDelaysSec: [10, 20],                                 // Задержка между аккаунтами в секундах (min, max)
    activityDelaysSec: [10, 20],                                // Задержка между действиями в рамках аккаунта в секундах (min, max)
    gasPriceMultiplierRange: [1.5, 1.8],                        // Увеличиваем gasPrice (min, max)
    gasLimitMultiplierRange: [1.3, 1.6],                        // Увеличиваем gasLimit (min, max)
    activity: 'scrollCanvas',                                   // Выбираем активность, доступные: fuelDepoit, fuelBalanceCheck, scrollCanvas

    gasPrices: {
        waitForGas: true,                                       // Ожидать ли указанный газ (true / false)
		startGwei: 2,                                           // Стартовый газ
		stepGwei: 0.5,                                          // Шаг повышения газа
		delayMinutes: 0.1,                                      // Паузы между повышениями газа
		maxGwei: 3                                              // Максимальный газ
	},

    //------------------//
    //--MODULES CONFIG--//
    //------------------//

    fuelDepoit: {
        currency: 'ETH',                                        // ETH, USDC, USDT
        untouchableAmount: [0.001, 0.003],                      // Неприкасаемая сумма (min, max)
        percentage: [0.95, 1],                                  // Сколько в процентах занести (после неприкасаемой суммы), (min, max)
        minAmount: 0.001,                                       // Минимальная сумма для заноса
        maxAmount: 2,                                           // Максимальная сумма для заноса
        singleDeposit: false,                                   // Скипать кошельки, которые уже занесли ранее
        roundWeiToFigures: [3, 5]                               // Округлять сумму в Wei до значений (min, max)
    },

    fuelBalanceCheck: {
        // nothing to adjust here
    },

    scrollCanvas: {
        addNewRefCodes: false,                                  // Парсить ли рефки новорегов и добавлять в текстовик для использования (true / false)
        maxBadgesAmount: [2, 4],                                // Лимит баджей на аккаунт с учетом ранее сминченных баджей (min, max)
        badgesToSkip: [                                         // Какие баджи скипать, я указал те, которые минтятся не как все и мне было лень с ними ебаться
            '0x2dBce60ebeAafb77e5472308f432F78aC3AE07d9',       // Scroll Origins NFT (unique)
            '0x97e02Bc54a98f48B7858357030dAb2f22f701c3B',       // RubyScore ranking on Scroll (unique)
            '0x218e736Cc77c1339e42Ac6829ae93AC3CEA65b7a',       // Conft 2024 Badge (unique)
            '0x450Efa43661F5D669c35Ed62e18Bed4D6E826508',       // Conft Scroll Box (unique)
            '0x20475183625aE0eD5Dcd2553a660B06FF52af8Bd',       // Scroll on Highlight (buggy)
        ]
    },
}