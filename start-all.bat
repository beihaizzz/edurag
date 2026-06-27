@echo off
REM ============================================================
REM EduRAG - One-click launcher (double-click to run)
REM Calls start-all.ps1 with ExecutionPolicy bypass.
REM
REM Usage:
REM   start-all.bat                  default (Backend + LangGraph + Frontend)
REM   start-all.bat -NoBrowser       do not open browser
REM   start-all.bat -NoLangGraph     skip LangGraph dev
REM   start-all.bat -Rebuild         reinstall frontend deps
REM   start-all.bat -SkipDbCheck     skip PostgreSQL 5432 check
REM ============================================================
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
    echo [X] powershell.exe not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
echo (Services run in separate windows. Press any key to close this launcher.)
pause >nul
exit /b %EXITCODE%