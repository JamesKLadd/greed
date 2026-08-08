@echo off
REM ============================================================
REM  Greed - start the online server (WebSocket, port 8787)
REM  Double-click this file to run the authoritative server.
REM ============================================================
title Greed Server
cd /d "%~dp0"

echo Starting the Greed server on ws://localhost:8787 ...
echo (Close this window to stop the server.)
echo.

call npm run server

echo.
echo Server stopped. Press any key to close this window.
pause >nul
