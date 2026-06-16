# ============================================================
# EduRAG 数据库单独启动
# ============================================================
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "启动 PostgreSQL (Docker)..." -ForegroundColor Cyan
docker compose -f "$Root\docker-compose.yml" up -d

Write-Host "等待 PostgreSQL 就绪..." -ForegroundColor Yellow
$maxWait = 30
for ($i = 0; $i -lt $maxWait; $i++) {
    $healthy = docker inspect --format='{{.State.Health.Status}}' eduraq-postgres 2>$null
    if ($healthy -eq "healthy") { break }
    Start-Sleep -Seconds 1
}

if ($healthy -eq "healthy") {
    Write-Host "PostgreSQL 已就绪 (localhost:5432)" -ForegroundColor Green
} else {
    Write-Host "[警告] 健康检查超时，请手动确认" -ForegroundColor DarkYellow
}
