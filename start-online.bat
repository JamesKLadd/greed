@echo off
REM ============================================================
REM  Greed - start EVERYTHING for online play.
REM  Opens the server and the dev client in their own windows,
REM  then opens the game in your browser.
REM ============================================================
cd /d "%~dp0"

echo Launching the Greed server and dev client in separate windows...

start "Greed Server" cmd /k "cd /d ""%~dp0"" && npm run server"
start "Greed Dev Client" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo Waiting for the dev client to warm up...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173"

echo.
echo Done. Two windows opened (Server + Dev Client) and the game
echo should be loading in your browser.
echo You can close THIS window.
timeout /t 4 /nobreak >nul
