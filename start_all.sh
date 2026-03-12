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
    # Also stop sandbox Docker container
    docker stop nexuslearn-sandbox 2>/dev/null || true
    wait 2>/dev/null
    echo "✅ All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# 1. DifySandbox (Docker)
echo "🔒 Starting sandbox (isolated code execution)..."
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^nexuslearn-sandbox$"; then
    echo "   ✅ Sandbox already running"
else
    docker run -d \
        --name nexuslearn-sandbox \
        -p 8194:8194 \
        --privileged \
        --rm \
        langgenius/dify-sandbox:latest > /dev/null 2>&1 && \
        echo "   ✅ Sandbox started (port 8194)" || \
        echo "   ⚠️  Sandbox unavailable — install Docker to enable isolated code execution"
fi

# 2. VibeVoice TTS Service (GPU required)
echo "🎙  Starting VibeVoice TTS service..."
if python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    python3 -m uvicorn backend.services.vibevoice_service:app \
        --host 127.0.0.1 --port 8195 --no-access-log &
    PIDS+=($!)
    echo "   ✅ VibeVoice TTS on ws://localhost:8195 (PID: ${PIDS[-1]})"
else
    echo "   ⚠️  No CUDA GPU — falling back to browser TTS (install PyTorch+CUDA to enable VibeVoice)"
fi

# 3. NexusLearn Backend
echo "⚙️  Starting backend API..."
cd nexuslearn_backend
python3 -m uvicorn server:app \
    --host 127.0.0.1 --port 8001 --no-access-log &
PIDS+=($!)
echo "   ✅ Backend API on http://localhost:8001 (PID: ${PIDS[-1]})"
cd ..

# 4. Next.js Frontend
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
echo "  Sandbox: http://localhost:8194"
echo "  TTS:     ws://localhost:8195"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop everything."
echo ""

wait
