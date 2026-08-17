@echo off
setlocal
cd /d "%~dp0"
title Fancy Network V6 - Stable Server
cls
echo ==============================================
echo  FANCY NETWORK V6 - STABLE / NO FAST REFRESH
echo ==============================================
echo.
echo This command runs a production build. Fast Refresh is OFF.
echo.
call npm install
if errorlevel 1 goto :error
call npm run build
if errorlevel 1 goto :error
call npm start
exit /b 0
:error
echo.
echo Build/start failed. Read the error above.
pause
exit /b 1
