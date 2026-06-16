# EduRAG - Start frontend only
# Usage: .\start-frontend.ps1

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\frontend"

Write-Host "Starting EduRAG frontend..." -ForegroundColor Cyan
Write-Host "URL: http://localhost:5173" -ForegroundColor Green
Write-Host ""

npm run dev
