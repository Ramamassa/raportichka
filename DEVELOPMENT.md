# Рапортичка — Telegram-версия

Запуск: **Start-Bot.cmd**. Полная инструкция: **TELEGRAM.md**.

Существующий HTML/CSS/JavaScript и ExcelJS сохранены; сервер и бот выполнены на Node.js >=24 без отдельной установки Python. Bot API вызывается через встроенный fetch, доставка обновлений — long polling. @ngrok/ngrok подключает локальный HTTP-сервер к постоянному HTTPS-адресу аккаунта.

- Интерфейс: app.js, app.css, telegram.js, index.html.
- Авторизация: scripts/telegram-auth.mjs.
- API и атомарное хранение: scripts/telegram-server.mjs.
- Bot API: scripts/telegram-bot.mjs.
- Первый запуск: scripts/telegram-setup.mjs.
- Запуск: scripts/start-bot.mjs.
- Личные настройки и данные: .journal-runtime (не копировать в публичный репозиторий).

Проверки: npm test; npm run build. Просмотр без Telegram: node scripts/start-bot.mjs --preview.

Настоящая проверка Mini App требует токен нового бота, Telegram ID владельца, свободный HTTPS-домен и мобильный клиент Telegram. Локальный просмотр не подтверждает их работоспособность.
