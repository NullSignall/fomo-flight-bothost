# Fomo Flight для Bothost

Готовый Node.js проект для публикации Telegram Mini App игры Fomo Flight на Bothost.

## Настройки Bothost

- Название бота: `Fomo Flight`
- Платформа: `Telegram`
- Язык разработки: `Node.js`
- Образ: `node:20 Alpine`
- Локация: `Нидерланды`
- Использовать домен: включить
- Порт веб-приложения: `3000`
- Главный файл: `server.js`
- Git URL: `https://github.com/NullSignall/fomo-flight-bothost.git`
- Ветка: `main`

## Переменные окружения

```text
BOT_TOKEN=токен_бота_от_BotFather
PORT=3000
DATA_PATH=./data/store.json
PUBLIC_URL=https://твой-домен.bothost.tech
```

`PUBLIC_URL` нужен, чтобы бот отправлял кнопку запуска Mini App после команды `/start`.

## Telegram webhook

После деплоя нужно подключить webhook:

```text
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://твой-домен.bothost.tech/telegram/webhook
```

В ответ Telegram должен вернуть `{"ok":true,...}`.

## BotFather Mini App

В BotFather настрой кнопку меню:

```text
/mybots -> твой бот -> Bot Settings -> Menu Button -> Configure menu button
```

URL:

```text
https://твой-домен.bothost.tech/
```

Название кнопки:

```text
Fomo Flight
```

## Важно

Если токен бота был показан на скриншоте или отправлен куда-то, перевыпусти его:

```text
/mybots -> твой бот -> API Token -> Revoke current token
```
