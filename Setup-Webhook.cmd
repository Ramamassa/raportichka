@echo off
chcp 65001 >nul
title Настройка Telegram Webhook
node "%~dp0scripts\setup-webhook.mjs"
pause
