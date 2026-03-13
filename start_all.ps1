# ============================================================
# NexusLearn — Windows startup script (no Docker required)
# ============================================================
# Starts: LiveKit server (native binary) + Backend + Frontend
# Auto-installs: faster-whisper, livekit Python SDK
#
# Usage (from project root):
#   powershell -ExecutionPolicy Bypass -File .\start_all.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  NexusLearn — Starting all services" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Auto-install Python voice deps ────────────────────────────────────────
Write-Host "[1/4] Checking Python voice dependencies..." -ForegroundColor Yellow

$pip = "pip"

# faster-whisper
$fwCheck = pip show faster-whisper 2>&1
if ($fwCheck -notmatch "Name: faster-whisper") {
    Write-Host "  Installing faster-whisper (local GPU-accelerated STT)..." -ForegroundColor Gray
    pip install faster-whisper --quiet
    Write-Host "  ✅ faster-whisper installed" -ForegroundColor Green
} else {
    Write-Host "  ✅ faster-whisper already installed" -ForegroundColor Green
}

# livekit Python SDK
$lvCheck = pip show livekit 2>&1
if ($lvCheck -notmatch "Name: livekit") {
    Write-Host "  Installing livekit Python SDK..." -ForegroundColor Gray
    pip install "livekit>=0.11.0" "livekit-api>=0.6.0" --quiet
    Write-Host "  ✅ livekit SDK installed" -ForegroundColor Green
} else {
    Write-Host "  ✅ livekit SDK already installed" -ForegroundColor Green
}

# ── 2. LiveKit server binary (no Docker) ─────────────────────────────────────
Write-Host ""
Write-Host "[2/4] Setting up LiveKit server (native binary, no Docker)..." -ForegroundColor Yellow

$livekitDir  = Join-Path $Root "livekit-bin"
$livekitExe  = Join-Path $livekitDir "livekit-server.exe"

if (-not (Test-Path $livekitDir)) {
    New-Item -ItemType Directory -Path $livekitDir | Out-Null
}

if (-not (Test-Path $livekitExe)) {
    Write-Host "  Downloading LiveKit server binary for Windows..." -ForegroundColor Gray

    # Latest release — Windows amd64
    $releaseUrl = "https://github.com/livekit/livekit/releases/latest/download/livekit_windows_amd64.zip"
    $zipPath    = Join-Path $livekitDir "livekit.zip"

    try {
        Invoke-WebRequest -Uri $releaseUrl -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $livekitDir -Force
        Remove-Item $zipPath

        # The zip contains livekit-server.exe (or livekit.exe depending on release)
        # Rename if needed
        $altExe = Join-Path $livekitDir "livekit.exe"
        if ((Test-Path $altExe) -and (-not (Test-Path $livekitExe))) {
            Rename-Item $altExe $livekitExe
        }

        Write-Host "  ✅ LiveKit server binary downloaded to livekit-bin\" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ Auto-download failed: $_" -ForegroundColor Red
        Write-Host "  → Manual download: https://github.com/livekit/livekit/releases/latest" -ForegroundColor Gray
        Write-Host "    Get livekit_windows_amd64.zip, extract livekit-server.exe to livekit-bin\" -ForegroundColor Gray
        Write-Host "  → Continuing without voice sessions (app still works)" -ForegroundColor Gray
        $livekitExe = $null
    }
} else {
    Write-Host "  ✅ LiveKit binary already present" -ForegroundColor Green
}

# Start LiveKit in background
if ($livekitExe -and (Test-Path $livekitExe)) {
    Write-Host "  Starting LiveKit server on ws://localhost:7880 ..." -ForegroundColor Gray
    $livekitProc = Start-Process -FilePath $livekitExe `
        -ArgumentList "--dev" `
        -PassThru -WindowStyle Hidden
    Write-Host "  ✅ LiveKit running (PID: $($livekitProc.Id))  ws://localhost:7880" -ForegroundColor Green
} else {
    Write-Host "  ⚠ LiveKit not started — voice sessions unavailable (rest of app works fine)" -ForegroundColor DarkYellow
    $livekitProc = $null
}

# ── 3. Backend (FastAPI) ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Starting NexusLearn backend (FastAPI)..." -ForegroundColor Yellow

$backendPath = Join-Path $Root "nexuslearn_backend"
$backendProc = Start-Process -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8001", "--no-access-log" `
    -WorkingDirectory $backendPath `
    -PassThru -WindowStyle Hidden

Write-Host "  ✅ Backend running on http://localhost:8001  (PID: $($backendProc.Id))" -ForegroundColor Green

# ── 4. Frontend (Next.js) ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "[4/4] Starting Next.js frontend..." -ForegroundColor Yellow

$webPath = Join-Path $Root "web"
$frontendProc = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $webPath `
    -PassThru -WindowStyle Hidden

Write-Host "  ✅ Frontend running on http://localhost:3000  (PID: $($frontendProc.Id))" -ForegroundColor Green

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "  App          →  http://localhost:3000/nexus" -ForegroundColor White
Write-Host "  Backend API  →  http://localhost:8001" -ForegroundColor White
if ($livekitProc) {
    Write-Host "  LiveKit      →  ws://localhost:7880  (voice ready)" -ForegroundColor White
} else {
    Write-Host "  LiveKit      →  NOT running (voice sessions disabled)" -ForegroundColor DarkYellow
}
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Keep alive + cleanup on Ctrl+C ───────────────────────────────────────────
try {
    while ($true) { Start-Sleep -Seconds 5 }
} finally {
    Write-Host ""
    Write-Host "Stopping all services..." -ForegroundColor Yellow

    if ($livekitProc -and -not $livekitProc.HasExited)  { Stop-Process -Id $livekitProc.Id  -Force -ErrorAction SilentlyContinue }
    if ($backendProc -and -not $backendProc.HasExited)   { Stop-Process -Id $backendProc.Id  -Force -ErrorAction SilentlyContinue }
    if ($frontendProc -and -not $frontendProc.HasExited) { Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue }

    Write-Host "✅ All stopped." -ForegroundColor Green
}
