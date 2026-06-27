# ============================================================
# EduRAG 一键启动脚本 (本地 PostgreSQL 版, 并行启动)
# Usage:
#   .\start-all.ps1                # 启动 后端 + LangGraph dev + 前端
#   .\start-all.ps1 -NoLangGraph   # 不启动 LangGraph dev
#   .\start-all.ps1 -NoBrowser     # 不自动打开浏览器
#   .\start-all.ps1 -Rebuild       # 重装前端依赖后再启动
#   .\start-all.ps1 -SkipDbCheck   # 跳过 PostgreSQL 5432 端口检查
# ============================================================
[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$NoLangGraph,
    [switch]$Rebuild,
    [switch]$SkipDbCheck
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Write-Step($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Write-Err2($msg)  { Write-Host "    [X]  $msg" -ForegroundColor Red }

# 用 cmd /c start 强制新独立窗口（Windows Terminal 也会乖乖新开，而非合 tab）
function Start-InNewWindow {
    param([string]$Title, [string]$Command)
    # 注意: cmd start 的第一个引号参数会被当作窗口标题
    $escaped = $Command -replace '"','\"'
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "start", "`"$Title`"", "powershell.exe", "-NoExit", "-NoProfile", "-Command", "`"$escaped`"" `
        | Out-Null
}

function Test-Port {
    param([string]$HostName, [int]$Port, [int]$TimeoutMs = 1500)
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $tcp.BeginConnect($HostName, $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($ok -and $tcp.Connected) {
            $tcp.EndConnect($iar) | Out-Null
            return $true
        }
        return $false
    } catch { return $false } finally { $tcp.Close() }
}

function Wait-Url {
    param([string]$Url, [int]$TimeoutSec)
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -lt 500) { return $true }
        } catch { }
        Start-Sleep -Seconds 1
    }
    return $false
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  EduRAG  -  一键启动 (dev)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 0. 环境检查 ─────────────────────────────────────────────
Write-Step "环境检查"

if (-not (Test-Path "$PSScriptRoot\.env")) {
    if (Test-Path "$PSScriptRoot\.env.example") {
        Write-Warn2 ".env 不存在，自动从 .env.example 复制（请填入 API Key 后重启）"
        Copy-Item "$PSScriptRoot\.env.example" "$PSScriptRoot\.env"
    } else {
        Write-Err2 ".env 和 .env.example 都不存在"; exit 1
    }
} else { Write-Ok ".env 已就绪" }

$pythonExe    = "$PSScriptRoot\backend\.venv\Scripts\python.exe"
$langgraphExe = "$PSScriptRoot\backend\.venv\Scripts\langgraph.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Err2 "未找到 backend\.venv，请先在 backend 目录运行: uv sync"
    exit 1
}
Write-Ok "Backend venv 已就绪"

$nodeModules = "$PSScriptRoot\frontend\node_modules"
if ($Rebuild -or -not (Test-Path $nodeModules)) {
    Write-Warn2 "安装/更新前端依赖 (npm install)..."
    Push-Location "$PSScriptRoot\frontend"
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Err2 "npm install 失败"; exit 1 }
    Pop-Location
}
Write-Ok "Frontend node_modules 已就绪"

$langgraphAvailable = $false
if (-not $NoLangGraph) {
    if (Test-Path $langgraphExe) {
        $langgraphAvailable = $true
        Write-Ok "LangGraph CLI 已就绪"
    } else {
        Write-Warn2 "未找到 langgraph.exe，将跳过 LangGraph dev"
    }
}

# ── 1. 检查本地 PostgreSQL ──────────────────────────────────
Write-Host ""
Write-Step "检查本地 PostgreSQL (localhost:5432)"
if ($SkipDbCheck) {
    Write-Warn2 "已跳过 PostgreSQL 检查 (-SkipDbCheck)"
} else {
    if (Test-Port -HostName "127.0.0.1" -Port 5432) {
        Write-Ok "PostgreSQL 端口可访问"
    } else {
        Write-Err2 "PostgreSQL (localhost:5432) 无法连接，请先启动本地 PostgreSQL 服务"
        Write-Host "       已确认在跑可用 -SkipDbCheck 跳过检查" -ForegroundColor DarkGray
        exit 1
    }
}

# ── 2. 并行启动所有服务 ─────────────────────────────────────
Write-Host ""
Write-Step "并行启动服务窗口"

# 后端
$backendCmd = "Set-Location '$PSScriptRoot\backend'; & '$pythonExe' -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
Start-InNewWindow -Title "EduRAG Backend" -Command $backendCmd
Write-Ok "已开 'EduRAG Backend' 窗口  (:8000)"

# LangGraph
if ($langgraphAvailable) {
    $lgCmd = "Set-Location '$PSScriptRoot'; & '$langgraphExe' dev --port 2024 --no-browser --allow-blocking"
    Start-InNewWindow -Title "EduRAG LangGraph" -Command $lgCmd
    Write-Ok "已开 'EduRAG LangGraph' 窗口 (:2024)"
}

# 前端
$frontendCmd = "Set-Location '$PSScriptRoot\frontend'; npm run dev"
Start-InNewWindow -Title "EduRAG Frontend" -Command $frontendCmd
Write-Ok "已开 'EduRAG Frontend' 窗口 (:5173)"

# ── 3. 统一健康探测 ────────────────────────────────────────
Write-Host ""
Write-Step "等待服务就绪（并行探测）"

$backendReady   = Wait-Url -Url "http://localhost:8000/health" -TimeoutSec 90
if ($backendReady) { Write-Ok "Backend  就绪" } else { Write-Warn2 "Backend  未就绪，请看 'EduRAG Backend' 窗口" }

$langgraphReady = $false
if ($langgraphAvailable) {
    $langgraphReady = Wait-Url -Url "http://localhost:2024/ok" -TimeoutSec 60
    if ($langgraphReady) { Write-Ok "LangGraph 就绪" } else { Write-Warn2 "LangGraph 未就绪，请看 'EduRAG LangGraph' 窗口" }
}

$frontendReady  = Wait-Url -Url "http://localhost:5173" -TimeoutSec 45
if ($frontendReady) { Write-Ok "Frontend 就绪" } else { Write-Warn2 "Frontend 未就绪，请看 'EduRAG Frontend' 窗口" }

# ── 4. 打开浏览器 ───────────────────────────────────────────
if (-not $NoBrowser -and $frontendReady) {
    Start-Process "http://localhost:5173"
}

# ── 5. 总结 ─────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  启动完成" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend     : http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend API  : http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs     : http://localhost:8000/docs" -ForegroundColor Cyan
if ($langgraphAvailable) {
    Write-Host "  LangGraph    : http://localhost:2024" -ForegroundColor Cyan
    Write-Host "  LG Studio    : https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024" -ForegroundColor Cyan
}
Write-Host "  PostgreSQL   : localhost:5432  (本地服务)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  默认管理员    : admin001 / Admin@123" -ForegroundColor Yellow
Write-Host ""
Write-Host "  停止服务      : .\stop-all.ps1   (不动本地 PostgreSQL)" -ForegroundColor DarkGray
Write-Host ""
