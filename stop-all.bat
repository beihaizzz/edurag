@echo off
REM ============================================================
REM EduRAG - Stop launcher (does not touch local PostgreSQL)
REM ============================================================
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-all.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
pause >nul
exit /b %EXITCODE%