# NexusLearn Backend API

FastAPI backend powering all NexusLearn agents. Includes Superintendent routing hierarchy, Ollama auto-detection, VibeVoice TTS endpoints, and LiveKit voice session management.

## Architecture

```
Student request
    │
    ▼
/api/v1/nexus/ws  (Superintendent WebSocket — primary)
    │  ├─ Superintendent.route() → classify intent → mastery gate → agent
    │  └─ Fallback: direct Ollama routing if Superintendent unavailable
    │
/api/v1/chat      (6-agent WebSocket — legacy, still works)
    └─ TutorAgent · SolverAgent · ResearchAgent · GuideAgent · IdeaGenAgent · CoWriterAgent
```

## Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `/api/v1/nexus/ws` | WebSocket | Superintendent-routed (primary) |
| `/api/v1/chat` | WebSocket | Direct 6-agent routing |
| `/api/v1/nexus/visual` | REST POST | AI visual generation |
| `/api/v1/nexus/mastery` | REST GET | Per-student BKT scores |
| `/api/v1/voice/token` | REST POST | LiveKit room token |
| `/api/v1/voice/start-agent` | REST POST | Spawn voice teacher agent |
| `/api/v1/config/detect` | REST GET | Auto-detect Ollama / LM Studio |
| `/api/v1/config/detect/apply` | REST POST | Register detected LLM |

## Start

```bash
cd nexuslearn_backend
pip install fastapi uvicorn websockets python-multipart
python -m uvicorn server:app --host 127.0.0.1 --port 8001
```

Or use the root `start_all.ps1` which starts everything automatically.

## LLM Auto-Detection

On startup the server probes `localhost:11434` (Ollama) and `localhost:1234` (LM Studio).
If found, it registers all available models automatically — no `.env` editing needed.

Tested with: `qwen2.5-coder:7b` on Ollama.

## Voice Endpoints

`/api/v1/voice/token` — returns a LiveKit JWT for the frontend `VoiceTeacher` component.
Returns `{ error, message }` gracefully if LiveKit is not running (frontend shows setup guide).

`/api/v1/voice/start-agent` — spawns `backend/agents/teacher/voice_teacher_agent.py` as a subprocess.
The agent handles: student audio → faster-whisper STT → Superintendent → VibeVoice TTS → LiveKit audio track.

