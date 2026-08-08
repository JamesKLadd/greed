@echo off
REM ============================================================
REM  Greed - start the dev client (Vite, http://localhost:5173)
REM  Double-click this file to run the web game in dev mode.
REM ============================================================
title Greed Dev Client
cd /d "%~dp0"

echo Starting the Greed dev client at http://localhost:5173 ...
echo (Close this window to stop it.)
echo.

call npm run dev

echo.
echo Dev client stopped. Press any key to close this window.
pause >nul
