# ============================================================
# EduRAG 停止脚本 — 关闭所有服务窗口 + PostgreSQL 容器
# ============================================================
$ErrorActionPreference = "SilentlyContinue"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  EduRAG 系统停止" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 关闭前端和后端窗口 ──────────────────────────────────────
Write-Host "[1/2] 关闭应用窗口..." -ForegroundColor Yellow

$titles = @("EduRAG Backend", "EduRAG Frontend")
foreach ($title in $titles) {
    Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.MainWindowTitle -like "*$title*") {
            Write-Host "       关闭: $title" -ForegroundColor Gray
            $_.CloseMainWindow() | Out-Null
        }
    }
}

# 备用：通过端口杀进程
$backendPid = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess
if ($backendPid) {
    Write-Host "       终止端口 8000 进程 (PID: $backendPid)" -ForegroundColor Gray
    Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
}

$frontendPid = (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess
if ($frontendPid) {
    Write-Host "       终止端口 5173 进程 (PID: $frontendPid)" -ForegroundColor Gray
    Stop-Process -Id $frontendPid -Force -ErrorAction SilentlyContinue
}

# ── 停止 PostgreSQL ──────────────────────────────────────────
Write-Host "[2/2] 停止 PostgreSQL 容器..." -ForegroundColor Yellow

$Root = $PSScriptRoot
Push-Location -LiteralPath $Root
docker compose stop 2>&1 | Out-Null
Pop-Location
Write-Host "       PostgreSQL 已停止" -ForegroundColor Green

Write-Host ""
Write-Host "  所有服务已停止。" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
