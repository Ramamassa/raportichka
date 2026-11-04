@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto no_node
node "%~dp0scripts\start-bot.mjs" %*
if errorlevel 1 goto failed
goto end
:no_node
echo Install Node.js 24 or newer: https://nodejs.org/
goto wait
:failed
echo Raportichka Bot could not start. See the error above.
:wait
pause
:end
endlocal
