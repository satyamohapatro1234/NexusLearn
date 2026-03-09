# NexusLearn Test API Backend

A FastAPI backend that implements all 7 DeepTutor agents with realistic responses.
Use this for testing and development before connecting a real LLM.

## Agents Implemented
| Agent | Endpoint | Type |
|-------|----------|------|
| Chat | `/api/v1/chat` | REST + WebSocket |
| Solve | `/api/v1/solve/ws` | WebSocket (streaming) |
| Research | `/api/v1/research/run` | WebSocket (streaming) |
| Guide | `/api/v1/guide/session` | WebSocket (interactive) |
| IdeaGen | `/api/v1/ideagen/ws` | WebSocket (streaming) |
| Co-Writer | `/api/v1/co_writer/session` | WebSocket |
| Question Gen | `/api/v1/question/ws` + REST | Both |

## Start
```bash
cd nexuslearn_backend
pip install fastapi uvicorn websockets python-multipart
python -m uvicorn server:app --host 0.0.0.0 --port 8001
```

## Frontend Connection
Set in `web/.env.local`:
```
NEXT_PUBLIC_API_BASE=http://localhost:8001
```
