## 🚀 Onchain candy shop
Надоело копировать самого себя, создал репозиторий, который будет служить мне свалкой однокнопочных ончейн скриптов с простейшей логикой. По мере необходимости буду добавлять сюда модули.

<i>Связь с создателем: https://t.me/CrytoBusher</i> <br>
<i>Если ты больше по Твиттеру: https://twitter.com/CryptoBusher</i> <br>

<i>Залетай сюда, чтоб не пропускать дропы подобных скриптов: https://t.me/CryptoKiddiesClub</i> <br>
<i>И сюда, чтоб общаться с крутыми ребятами: https://t.me/CryptoKiddiesChat</i> <br>

## 💎 Модули
- [x] fuelDepoit - депозитит ETH / USDC / USDT в [Fuel](https://app.fuel.network/earn-points/deposit/) в мейннете

## ⌛️ На очереди
- [ ] fuelWithdraw

## 🤔 Преимущества
1. Рандомизация
2. Уведомления в телеграм
3. Поддержка прокси (вшит в провайдера)
4. Бесплатно

## ⚙️ Как подтягивать обновления
Для подтягивания обнов необходимо клонировать репозиторий на ваш ПК (а не качать архивом). Вам понадобится [GIT](https://git-scm.com/), но это того стоит.
```
git clone https://github.com/CryptoBusher/Onchain-candy-shop.git
```

После клонирования у вас появится папка с проектом, переходим в нее и производим настройки софта согласно инструкции в "Первый запуск". Для подтягивания обновлений, находясь в папке проекта, вписываем в терминале команду:
```
git pull
```

## 📚 Первый запуск
1. Устанавливаем [NodeJs](https://nodejs.org/en/download)
2. Скачиваем проект, в терминале, находясь в папке проекта, вписываем команду "npm i" для установки всех зависимостей
3. Меняем название файла "_wallets.txt" на "wallets.txt" и вбиваем свои кошельки, каждый с новой строки в формате "name|privateKey|httpProxy" или "name|privateKey" (если без прокси - будет использоваться generalProxy из .env файла - мобильный прокси, если он указан, иначе - без прокси).  Если используете прокси, то формат должен быть такой: "http://user:pass@host:port".
4. Меняем название файла ".env.example" на ".env", открываем через любой текстовый редактор и заполняем:
    1. GENERAL_PROXY_ADDRESS - мобильный прокси, который будет использован для кошельков без прокси (не обязательно)
    2. GENERAL_PROXY_LINK - ссылка на смену IP мобильного прокси (не обязательно)
    3. TG_BOT_TOKEN - токен Telegram бота (не обязательно)
    4. TG_CHAT_ID - ID чата, в который будут слаться уведомления. Можно указать чат супергруппы в формате "supergroupId/chatId" (не обязательно)
5. Меняем название файла "_config.js" на "config.js, открываем через любой редактор кода и заполняем (смотреть комментарии в файле).
6. Запускаем скрипт командой "node index.js". Если запускаетесь на сервере - "npm run start", тогда просмотреть лог можно в файле "out.log", а отслеживать в консоли прогресс можно командой "tail -f out.log".

## 🌵 Дополнительная информация
- Я не несу никакой ответственности за ваши средства.
- Подробный лог лежит в "src/logger/botlog.log"
- После прогона кошелек удаляется из "wallets.txt" и добавляется в файл "results/success_SECRET.txt" или "results/fail_SECRET.txt". Эти файлы будут содержать чувствительную информацию, потому, после использования необходимо их почистить.

## 💴 Донат
Если хочешь поддержать мой канал - можешь мне задонатить, все средства пойдут на развитие сообщества.
<b>0x77777777323736d17883eac36d822d578d0ecc80<b>
