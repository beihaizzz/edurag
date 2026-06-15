# EduRAG - Start both backend and frontend
# Usage: .\start-all.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EduRAG - Start All Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Start backend in new window
Write-Host ""
Write-Host "[1/2] Starting backend (port 8000)..." -ForegroundColor Green
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\backend'; & '.\.venv\Scripts\python.exe' -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

# Start frontend in new window
Write-Host "[2/2] Starting frontend (port 5173)..." -ForegroundColor Green
Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\frontend'; npm run dev"

Write-Host ""
Write-Host "Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "API docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Default admin: admin001 / Admin@123" -ForegroundColor Yellow
Write-Host ""
