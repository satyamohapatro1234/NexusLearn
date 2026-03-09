#!/bin/bash
echo "🚀 Starting NexusLearn (Backend + Frontend)..."

# Start backend
cd nexuslearn_backend
python3 -m uvicorn server:app --host 127.0.0.1 --port 8001 --no-access-log &
BACKEND_PID=$!
echo "  ✅ Backend API running on http://localhost:8001 (PID: $BACKEND_PID)"
cd ..

# Start frontend
cd web
npm run dev &
FRONTEND_PID=$!
echo "  ✅ Frontend running on http://localhost:3000 (PID: $FRONTEND_PID)"
cd ..

echo ""
echo "  Open: http://localhost:3000/nexus"
echo "  Press Ctrl+C to stop both."
wait
