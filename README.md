# 🎓 NexusLearn — AI-Powered Learning Studio v2

> **DeepTutor enhanced** with a full AI teaching stack: Superintendent routing · VibeVoice TTS · Pyodide WASM · Remotion lesson videos · LiveKit voice sessions · PageAgent · 3D Avatar · BKT Mastery

Built on top of [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) — the best open-source AI tutor.

---

## 🏆 What We've Built (Completed)

### 🧠 Superintendent Agent Hierarchy
Every student message is routed through a central **Superintendent** that:
- Classifies intent (keyword-fast + LLM fallback)
- Checks **mastery gates** — if mastery too low, redirects to Guide instead of jumping ahead
- Injects per-student notebook context + BKT score into every agent prompt
- Assigns voice personas automatically (Emma=guide, Carter=solve, Frank=research, Grace=quiz…)
- Falls back to direct Ollama routing if unavailable — nothing crashes

### 🔊 VibeVoice TTS — 7 AI Voices
Local neural TTS server at `localhost:8195` with 7 pre-trained voice models:
`Emma (woman) · Grace (woman) · Carter (man) · Frank (man) · Davis (man) · Mike (man) · Samuel (man)`
Browser `SpeechSynthesis` fallback when VibeVoice is not running.

### 🐍 Pyodide WASM Python Execution
Python runs entirely **in the browser** via WebAssembly — zero latency, zero server, offline capable.
Other languages (JS, C++, Rust, Go, Java, Ruby, Bash) use Wandbox API (free, no key).

### 🎬 Remotion Animated Lesson Videos
The AI generates structured lesson animations: **Title → Concept → Code Typewriter → Quiz Slide**.
Driven by `LessonConfig` from the Superintendent's `remotion_config` response field.

### 🎙️ LiveKit Full-Duplex Voice Teacher
Real-time voice conversation with the AI teacher:
- Student mic → **faster-whisper STT** (GPU-accelerated, local) → Superintendent → VibeVoice → student speaker
- Voice persona changes automatically as the Superintendent routes between agents
- Graceful fallback: shows setup guide if LiveKit not running

### 🤖 PageAgent Teacher Control
The teacher agent can **type code and click Run** in the CodeStudio, synchronized with voice explanation — like a real screen-share tutoring session.

### 🎨 Visual Learning Studio
AI generates live animations, step-by-step breakdowns, and finds relevant YouTube videos for any topic.
8 quick-start chips: Gravity, Recursion, Photosynthesis, Sorting algorithms, Newton's laws, DNA replication, Binary search, Plate tectonics.

### 🎭 3D Teacher Avatar
Three.js animated GLB avatar with idle/talk/wave animations. Synced to voice output.

### 📊 BKT Mastery Tracking
Bayesian Knowledge Tracing (OATutor algorithm) in both TypeScript (frontend) and Python (backend mirror).
Mastery tab shows per-topic skill progress bars. Superintendent uses scores to gate advanced features.

### 🏠 Home Page Integration
- **NexusLearn Studio** quickAction card (Sparkles icon, violet) on the home page
- Deep-link cards from Tutor/Research/Solver responses → `/nexus?topic=…&tab=visual`
- 6-agent routing: Chat · Guide · Solve · Research · IdeaGen · Co-Writer · Question

### ⚡ Windows Startup Script
`start_all.ps1` — one command starts everything:
- Auto-installs `faster-whisper` + `livekit` Python SDK if missing
- Auto-downloads LiveKit server binary (no Docker needed)
- Starts LiveKit + FastAPI backend + Next.js frontend
- Ctrl+C cleanly stops all processes

---

## 🚧 Pending / Future Work

| Feature | Status | Notes |
|---------|--------|-------|
| **VibeVoice server packaging** | 🔜 Todo | Currently requires separate `pip install` + run in `vibevoice/` |
| **LiveKit binary auto-download reliability** | 🔜 Todo | GitHub release URL may change; consider `winget install livekit` |
| **Pyodide heavy packages** (numpy, pandas) | 🔜 Todo | Need explicit `pyodide.loadPackage()` calls in worker |
| **Mastery persistence** | 🔜 Todo | Currently in-memory; needs SQLite or Redis for cross-session |
| **Multi-language voice** | 🔜 Todo | VibeVoice currently English-only (Samuel voice = Indian English) |
| **Mobile voice sessions** | 🔜 Todo | LiveKit WebRTC works on mobile but UI not optimized |
| **Remotion video export** | 🔜 Todo | Can render MP4 server-side with `@remotion/renderer` |
| **PageAgent reliability** | 🔜 Todo | `data-nexus-id` selectors need hardening for edge cases |
| **Electron desktop app** | 🔮 Future | Bundle LiveKit binary + VibeVoice + Ollama into installer |
| **RAG knowledge base for voice** | 🔮 Future | VoiceTeacher could query student's uploaded documents |

---

---

## ✨ New Features Added

| Feature | Technology | Cost |
|---------|-----------|------|
| 🎭 **3D Teacher Avatar** | Three.js + ReadyPlayerMe GLBs | Free |
| 🎤 **Voice Input** | Web Speech API (browser built-in) | Free |
| 🔊 **Voice Output** | Speech Synthesis API (browser built-in) | Free |
| 💻 **Code Studio** | Piston API — 12+ languages | Free |
| 🧠 **BKT Mastery Tracking** | OATutor Bayesian algorithm | Free |
| 📊 **Mastery Dashboard** | Skill progress visualization | Free |

**100% free. Zero API keys needed.**

---

## 🚀 Quick Start (Windows)

### Option A — One command (recommended)
```powershell
# From project root:
powershell -ExecutionPolicy Bypass -File .\start_all.ps1
```
This auto-installs `faster-whisper` + `livekit` SDK, downloads the LiveKit binary (no Docker), and starts the backend + frontend.

### Option B — Manual

**1. Install Python deps**
```bash
pip install -r requirements.txt
```

**2. Start backend**
```bash
cd nexuslearn_backend
python -m uvicorn server:app --host 127.0.0.1 --port 8001
```

**3. Start frontend**
```bash
cd web
npm install
npm run dev
```

**4. (Optional) LiveKit for voice sessions — no Docker needed**
```bash
# Download livekit-server.exe from https://github.com/livekit/livekit/releases/latest
# Extract to livekit-bin\ then:
.\livekit-bin\livekit-server.exe --dev
```

**5. Open NexusLearn**
```
http://localhost:3000/nexus
```

**Ollama (local LLM — free):**
```bash
# Install from https://ollama.com then:
ollama pull qwen2.5-coder:7b
ollama serve
```
Auto-detected on startup — no configuration needed.

---

## 🗂️ Project Structure

```
NexusLearn/
├── backend/                        # DeepTutor Python backend (FastAPI)
│   ├── agents/
│   │   ├── superintendent/         # 🆕 Routing hierarchy + mastery gates
│   │   │   ├── superintendent_agent.py
│   │   │   ├── intent_classifier.py
│   │   │   └── contracts.py
│   │   └── teacher/
│   │       └── voice_teacher_agent.py  # 🆕 LiveKit + faster-whisper
│   ├── config/
│   │   └── mastery_gates.yaml      # 🆕 Mastery thresholds per agent
│   └── services/
│       └── vibevoice_service.py    # 🆕 VibeVoice TTS integration
├── nexuslearn_backend/             # Standalone FastAPI API (all 7 agents)
│   └── server.py                   # Superintendent WS + Ollama fallback
├── vibevoice/                      # 🆕 Local neural TTS (7 voices)
│   ├── modular/                    # Voice model architecture
│   ├── processor/                  # Tokenizer + feature processor
│   └── voices/streaming_model/     # .pt voice weights
├── web/                            # Next.js 14 frontend
│   ├── app/
│   │   ├── nexus/page.tsx          # 🆕 NexusLearn Studio (chat+code+visual+mastery)
│   │   ├── guide/ solver/ research/ ideagen/ co_writer/ question/
│   │   └── api/nexus/
│   │       ├── chat/               # REST → backend → Ollama fallback
│   │       └── visual/             # 🆕 AI visual generation
│   ├── components/nexus/
│   │   ├── AvatarPanel.tsx         # 3D avatar (Three.js + GLB)
│   │   ├── CodeStudio.tsx          # 🆕 Pyodide WASM + Wandbox
│   │   ├── VoiceControl.tsx        # 🆕 VibeVoice + SpeechSynthesis fallback
│   │   ├── VoiceTeacher.tsx        # 🆕 LiveKit full-duplex voice
│   │   ├── LessonVideo.tsx         # 🆕 Remotion animated lessons
│   │   ├── LessonCompositions.tsx  # 🆕 Title/Concept/Code/Quiz slides
│   │   └── VisualPanel.tsx         # 🆕 AI visual learning studio
│   └── lib/
│       ├── bkt.ts                  # Bayesian Knowledge Tracing
│       ├── usePyodide.ts           # 🆕 Pyodide WASM hook
│       ├── ttsClient.ts            # 🆕 VibeVoice TTS client
│       ├── pageActions.ts          # 🆕 PageAgent DOM control
│       └── lessonConfig.ts         # 🆕 Remotion config builder
├── start_all.ps1                   # 🆕 Windows one-command launcher
└── requirements.txt                # Python deps (incl. faster-whisper, livekit)
```

---

## 💻 Code Studio — Supported Languages

| Language | Runtime | Engine |
|----------|---------|--------|
| Python | 3.12 WASM | Pyodide (browser-local, offline) |
| JavaScript | Node 20 | Wandbox |
| C++ | GCC 13 | Wandbox |
| C | GCC 13 | Wandbox |
| Rust | 1.75 | Wandbox |
| Go | 1.22 | Wandbox |
| Java | 21 | Wandbox |
| Ruby | 3.3 | Wandbox |
| Bash | 5.2 | Wandbox |

Python runs **entirely in the browser** via WebAssembly — zero server, zero latency, works offline.
All other languages use [Wandbox](https://wandbox.org) — free, no API key.

---

## 🧠 BKT Mastery Tracking

Uses the Bayesian Knowledge Tracing algorithm from [OATutor](https://github.com/CAHLR/OATutor), piloted in real university classrooms.

```
P(mastery) updates after every interaction:
- Correct answer → mastery probability increases
- Wrong answer → mastery probability decreases slightly
- More practice → converges toward true mastery
```

Tracks per-topic, persists in localStorage across sessions.

---

## 🎭 Avatar Characters

| Avatar | Style |
|--------|-------|
| 🎯 The Coach | Motivating, energetic |
| 🧑‍🏫 The Mentor | Wise, patient |
| 🎓 The Scholar | Academic, precise |
| 💡 The Innovator | Creative, curious |

Switch avatars anytime in the left panel.

---

## 🏗️ Built On

- **[DeepTutor](https://github.com/HKUDS/DeepTutor)** — Multi-agent AI tutoring system (HKUDS)
- **[OATutor BKT Brain](https://github.com/CAHLR/OATutor)** — Bayesian Knowledge Tracing (CAHLR)
- **[Open TutorAI CE](https://github.com/Open-TutorAi/open-tutor-ai-CE)** — Avatar GLB files
- **[Pyodide](https://github.com/pyodide/pyodide)** — Python in WebAssembly
- **[Remotion](https://remotion.dev)** — Programmatic video / animations in React
- **[LiveKit](https://livekit.io)** — Open-source WebRTC voice infrastructure
- **[faster-whisper](https://github.com/SYSTRAN/faster-whisper)** — GPU-accelerated local STT
- **[Wandbox](https://wandbox.org)** — Free multi-language code execution

---

## 📄 License

MIT — see [LICENSE](LICENSE)
