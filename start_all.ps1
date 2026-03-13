# ============================================================
# NexusLearn - Windows startup script (no Docker required)
# ============================================================
# Starts: LiveKit server (native binary) + Backend + Frontend
# Auto-installs: faster-whisper, livekit Python SDK
#
# Usage (from project root):
#   powershell -ExecutionPolicy Bypass -File .\start_all.ps1
# ============================================================

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  NexusLearn - Starting all services" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Auto-install Python voice deps ----------------------------------------
Write-Host "[1/4] Checking Python voice dependencies..." -ForegroundColor Yellow

$fwCheck = pip show faster-whisper 2>&1
if ($fwCheck -notmatch "Name: faster-whisper") {
    Write-Host "  Installing faster-whisper..." -ForegroundColor Gray
    pip install faster-whisper --quiet
    Write-Host "  [OK] faster-whisper installed" -ForegroundColor Green
} else {
    Write-Host "  [OK] faster-whisper already installed" -ForegroundColor Green
}

$lvCheck = pip show livekit 2>&1
if ($lvCheck -notmatch "Name: livekit") {
    Write-Host "  Installing livekit Python SDK..." -ForegroundColor Gray
    pip install "livekit>=0.11.0" "livekit-api>=0.6.0" --quiet
    Write-Host "  [OK] livekit SDK installed" -ForegroundColor Green
} else {
    Write-Host "  [OK] livekit SDK already installed" -ForegroundColor Green
}

# -- 2. LiveKit server binary (no Docker) -------------------------------------
Write-Host ""
Write-Host "[2/4] Setting up LiveKit server (native binary, no Docker)..." -ForegroundColor Yellow

$livekitDir = Join-Path $Root "livekit-bin"
$livekitExe = Join-Path $livekitDir "livekit-server.exe"

if (-not (Test-Path $livekitDir)) {
    New-Item -ItemType Directory -Path $livekitDir | Out-Null
}

if (-not (Test-Path $livekitExe)) {
    Write-Host "  Downloading LiveKit server binary (~60 MB) for Windows..." -ForegroundColor Gray
    Write-Host "  (This only happens once - cached to livekit-bin\)" -ForegroundColor DarkGray

    $lkVersion  = "v1.8.3"
    $releaseUrl = "https://github.com/livekit/livekit/releases/download/$lkVersion/livekit_$($lkVersion.TrimStart('v'))_windows_amd64.zip"
    $zipPath    = Join-Path $livekitDir "livekit.zip"
    $downloaded = $false

    try {
        Import-Module BitsTransfer -ErrorAction Stop
        Write-Host "  Using BITS transfer (shows progress, auto-retries)..." -ForegroundColor DarkGray
        Start-BitsTransfer -Source $releaseUrl -Destination $zipPath -DisplayName "LiveKit Server" -ErrorAction Stop
        $downloaded = $true
        Write-Host "  [OK] Download complete" -ForegroundColor Green
    } catch {
        Write-Host "  BITS unavailable, trying Invoke-WebRequest..." -ForegroundColor DarkGray
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    }

    if (-not $downloaded) {
        try {
            $ProgressPreference = "SilentlyContinue"
            Invoke-WebRequest -Uri $releaseUrl -OutFile $zipPath -UseBasicParsing -TimeoutSec 300
            $downloaded = $true
            $ProgressPreference = "Continue"
            Write-Host "  [OK] Download complete" -ForegroundColor Green
        } catch {
            $ProgressPreference = "Continue"
            Write-Host "  [!] Auto-download failed: $_" -ForegroundColor Red
        }
    }

    if ($downloaded -and (Test-Path $zipPath)) {
        try {
            Expand-Archive -Path $zipPath -DestinationPath $livekitDir -Force
            Remove-Item $zipPath -Force
            $altExe = Join-Path $livekitDir "livekit.exe"
            if ((Test-Path $altExe) -and (-not (Test-Path $livekitExe))) {
                Rename-Item $altExe $livekitExe
            }
            if (Test-Path $livekitExe) {
                Write-Host "  [OK] LiveKit server ready at livekit-bin\livekit-server.exe" -ForegroundColor Green
            } else {
                Write-Host "  [!] Binary not found after extraction - check livekit-bin\ contents:" -ForegroundColor Red
                Get-ChildItem $livekitDir | ForEach-Object { Write-Host "      $($_.Name)" -ForegroundColor DarkGray }
                $livekitExe = $null
            }
        } catch {
            Write-Host "  [!] Extraction failed: $_" -ForegroundColor Red
            $livekitExe = $null
        }
    } else {
        Write-Host "  Manual install: https://github.com/livekit/livekit/releases/tag/$lkVersion" -ForegroundColor Cyan
        Write-Host "  Extract livekit.exe, rename to livekit-server.exe, place in livekit-bin\" -ForegroundColor Gray
        Write-Host "  Continuing without LiveKit (all other features work fine)" -ForegroundColor DarkYellow
        $livekitExe = $null
    }
} else {
    Write-Host "  [OK] LiveKit binary already present" -ForegroundColor Green
}

if ($livekitExe -and (Test-Path $livekitExe)) {
    Write-Host "  Starting LiveKit server on ws://localhost:7880 ..." -ForegroundColor Gray
    $livekitProc = Start-Process -FilePath $livekitExe -ArgumentList "--dev" -PassThru -WindowStyle Hidden
    Write-Host "  [OK] LiveKit running (PID: $($livekitProc.Id))  ws://localhost:7880" -ForegroundColor Green
} else {
    Write-Host "  [!] LiveKit not started - voice sessions unavailable (rest of app works fine)" -ForegroundColor DarkYellow
    $livekitProc = $null
}

# -- 3. Backend (FastAPI) -----------------------------------------------------
Write-Host ""
Write-Host "[3/4] Starting NexusLearn backend (FastAPI)..." -ForegroundColor Yellow

$backendPath = Join-Path $Root "nexuslearn_backend"
$backendProc = Start-Process -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8001", "--no-access-log" `
    -WorkingDirectory $backendPath `
    -PassThru -WindowStyle Hidden

Write-Host "  [OK] Backend running on http://localhost:8001  (PID: $($backendProc.Id))" -ForegroundColor Green

# -- 4. Frontend (Next.js) ----------------------------------------------------
Write-Host ""
Write-Host "[4/4] Starting Next.js frontend..." -ForegroundColor Yellow

$webPath = Join-Path $Root "web"
$frontendProc = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $webPath `
    -PassThru -WindowStyle Hidden

Write-Host "  [OK] Frontend running on http://localhost:3000  (PID: $($frontendProc.Id))" -ForegroundColor Green

# -- Summary ------------------------------------------------------------------
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "  App         ->  http://localhost:3000/nexus" -ForegroundColor White
Write-Host "  Backend API ->  http://localhost:8001" -ForegroundColor White
if ($livekitProc) {
    Write-Host "  LiveKit     ->  ws://localhost:7880  (voice ready)" -ForegroundColor White
} else {
    Write-Host "  LiveKit     ->  NOT running (voice sessions disabled)" -ForegroundColor DarkYellow
}
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

try {
    while ($true) { Start-Sleep -Seconds 5 }
} finally {
    Write-Host ""
    Write-Host "Stopping all services..." -ForegroundColor Yellow
    if ($livekitProc  -and -not $livekitProc.HasExited)  { Stop-Process -Id $livekitProc.Id  -Force -ErrorAction SilentlyContinue }
    if ($backendProc  -and -not $backendProc.HasExited)  { Stop-Process -Id $backendProc.Id  -Force -ErrorAction SilentlyContinue }
    if ($frontendProc -and -not $frontendProc.HasExited) { Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "[OK] All stopped." -ForegroundColor Green
}