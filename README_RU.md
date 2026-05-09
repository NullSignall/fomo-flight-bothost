# Fomo Flight для Bothost

Это готовая папка для загрузки на Bothost как Node.js проект.

## Что выбрать в форме Bothost

- Название бота: `Fomo Flight`
- Платформа: `Telegram`
- Язык разработки: `Node.js`
- Версия Node.js: последняя доступная LTS
- Локация: можно оставить рекомендованную
- Переменные окружения:
  - `BOT_TOKEN` = токен бота от BotFather
  - `PORT` = `3000`, если Bothost просит порт явно
  - `DATA_PATH` = `./data/store.json`

## Что загрузить

Если Bothost просит GitHub repository, загрузи эту папку `bothost_app` в отдельный GitHub репозиторий.

Если Bothost разрешает ZIP/upload, загрузи архив `fomo-flight-bothost-app.zip`.

## После запуска

Bothost должен выдать публичный HTTPS URL. Его нужно вставить в BotFather:

```text
/mybots -> твой бот -> Bot Settings -> Menu Button -> Configure menu button
```

URL:

```text
https://url-ot-bothost/
```

Название кнопки:

```text
Fomo Flight
```

## Важно

Если токен бота был показан на скрине или отправлен куда-то, лучше перевыпустить токен в BotFather:

```text
/mybots -> твой бот -> API Token -> Revoke current token
```
