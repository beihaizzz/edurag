# EduRAG - Start backend only
# Usage: .\start-backend.ps1

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\backend"

Write-Host "Starting EduRAG backend..." -ForegroundColor Cyan
Write-Host "API:  http://localhost:8000" -ForegroundColor Green
Write-Host "Docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""

& ".\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
