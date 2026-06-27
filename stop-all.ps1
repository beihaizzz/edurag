# ============================================================
# EduRAG 停止脚本 — 关闭后端/前端/LangGraph 窗口
# 不会动本地 PostgreSQL 服务
# ============================================================
$ErrorActionPreference = "SilentlyContinue"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  EduRAG 系统停止" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 关闭服务窗口 ────────────────────────────────────────────
Write-Host "[1/2] 关闭应用窗口..." -ForegroundColor Yellow

$titles = @("EduRAG Backend", "EduRAG Frontend", "EduRAG LangGraph")
foreach ($title in $titles) {
    Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.MainWindowTitle -like "*$title*") {
            Write-Host "       关闭: $title" -ForegroundColor Gray
            $_.CloseMainWindow() | Out-Null
        }
    }
}

# ── 备用：按端口杀进程 ──────────────────────────────────────
Write-Host "[2/2] 清理残留端口..." -ForegroundColor Yellow
foreach ($port in @(8000, 5173, 2024)) {
    $procId = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess
    if ($procId) {
        Write-Host "       终止端口 $port 进程 (PID: $procId)" -ForegroundColor Gray
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "  应用已停止 (本地 PostgreSQL 未动)。" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
