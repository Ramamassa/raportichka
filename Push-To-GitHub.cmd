@echo off
chcp 65001 >nul
title Отправка файлов Рапортички на GitHub
echo Отправка файлов в репозиторий GitHub...
git push -u origin main --force
if %errorlevel% neq 0 (
  echo.
  echo Ошибка отправки. Если Git запрашивает авторизацию, выполните в терминале:
  echo git push -u origin main --force
) else (
  echo.
  echo ========================================================
  echo Файлы успешно отправлены на GitHub!
  echo Теперь перейдите на Vercel и нажмите Redeploy.
  echo ========================================================
)
pause
