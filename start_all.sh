#!/bin/bash
set -e

echo "🚀 Starting NexusLearn..."
echo ""

PIDS=()
cleanup() {
    echo ""
    echo "⏹  Stopping all NexusLearn services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo "✅ All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# ── Sandbox note ──────────────────────────────────────────────────────────────
echo "🔒 Code sandbox: Pyodide WASM (browser-local, no Docker needed)"
echo "   Python runs in a Web Worker — zero server, zero Docker."
echo "   Other languages use the Wandbox API automatically."
echo ""

# ── 1. Ollama (LLM) ───────────────────────────────────────────────────────────
echo "🤖 Checking Ollama (LLM backend)..."
if pgrep -x ollama > /dev/null 2>&1; then
    echo "   ✅ Ollama already running (port 11434)"
else
    if command -v ollama &>/dev/null; then
        ollama serve > /dev/null 2>&1 &
        PIDS+=($!)
        echo "   ✅ Ollama started (PID: ${PIDS[-1]})"
    else
        echo "   ⚠️  Ollama not installed — Superintendent will use stubs"
        echo "      Install from https://ollama.com then: ollama pull qwen2.5:7b"
    fi
fi

# ── 2. VibeVoice TTS (optional, GPU required) ─────────────────────────────────
echo "🎙  Checking VibeVoice TTS..."
if python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    python3 -m uvicorn backend.services.vibevoice_service:app \
        --host 127.0.0.1 --port 8195 --no-access-log &
    PIDS+=($!)
    echo "   ✅ VibeVoice TTS on ws://localhost:8195 (PID: ${PIDS[-1]})"
else
    echo "   ⚠️  No CUDA GPU detected — browser TTS fallback active"
    echo "      To enable: pip install torch --index-url https://download.pytorch.org/whl/cu121"
fi

# ── 3. NexusLearn Backend ──────────────────────────────────────────────────────
echo "⚙️  Starting backend API..."
cd nexuslearn_backend
python3 -m uvicorn server:app \
    --host 127.0.0.1 --port 8001 --no-access-log &
PIDS+=($!)
echo "   ✅ Backend API on http://localhost:8001 (PID: ${PIDS[-1]})"
cd ..

# ── 4. Next.js Frontend ────────────────────────────────────────────────────────
echo "🌐 Starting frontend..."
cd web
npm run dev > /dev/null 2>&1 &
PIDS+=($!)
echo "   ✅ Frontend on http://localhost:3000 (PID: ${PIDS[-1]})"
cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NexusLearn is running!"
echo "  Open:    http://localhost:3000/nexus"
echo "  Backend: http://localhost:8001/docs"
echo "  TTS:     ws://localhost:8195 (GPU only)"
echo "  LLM:     http://localhost:11434 (Ollama)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop everything."
echo ""

wait
