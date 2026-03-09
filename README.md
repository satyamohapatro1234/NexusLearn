# 🎓 NexusLearn — AI-Powered Learning Studio

> **DeepTutor enhanced** with 6 new features: 3D Avatar • Voice I/O • Multi-language Code Studio • BKT Mastery Tracking • Live Terminal

Built on top of [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) — the best open-source AI tutor.

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

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/satyamohapatro1234/NexusLearn.git
cd NexusLearn
```

### 2. Backend Setup (Python)

```bash
cd backend
pip install -r requirements.txt

# Copy and configure
cp DeepTutor.env.example DeepTutor.env
# Edit DeepTutor.env — add your Ollama URL or Claude API key
```

**Use Ollama (free local LLM):**
```bash
# Install from https://ollama.com then:
ollama pull llama3.2
ollama serve
# In DeepTutor.env: LLM_PROVIDER=ollama, LLM_MODEL=llama3.2
```

### 3. Frontend Setup

```bash
cd web
npm install
npm run dev
```

### 4. Open NexusLearn

Navigate to: **http://localhost:3000/nexus**

---

## 🗂️ Project Structure

```
NexusLearn/
├── backend/                  # DeepTutor Python backend (FastAPI)
│   ├── src/
│   │   ├── agents/           # AI agents: solve, guide, research, etc.
│   │   ├── tools/            # code_executor, web_search, RAG
│   │   └── api/routers/      # REST + WebSocket endpoints
├── web/                      # Next.js frontend
│   ├── app/
│   │   ├── nexus/            # 🆕 NexusLearn main page
│   │   ├── guide/            # Guided learning (original DeepTutor)
│   │   ├── solver/           # Smart solver
│   │   └── research/         # Deep research
│   ├── components/
│   │   └── nexus/            # 🆕 New components
│   │       ├── AvatarPanel.tsx      # 3D avatar with Three.js
│   │       ├── CodeStudio.tsx       # Multi-language IDE + terminal
│   │       ├── VoiceControl.tsx     # Voice I/O (browser APIs)
│   │       └── MasteryDashboard.tsx # BKT skill tracking
│   ├── lib/
│   │   ├── bkt.ts            # 🆕 Bayesian Knowledge Tracing
│   │   └── piston.ts         # 🆕 Piston code execution API
│   └── public/avatars/       # 🆕 3D GLB avatar files
```

---

## 💻 Code Studio — Supported Languages

| Language | Icon | Runtime |
|----------|------|---------|
| Python | 🐍 | 3.10.0 |
| JavaScript | 🟨 | Node 18.15.0 |
| TypeScript | 🔷 | 5.0.3 |
| C++ | ⚙️ | GCC 10.2.0 |
| C | 🔧 | GCC 10.2.0 |
| Rust | 🦀 | 1.68.2 |
| Go | 🐹 | 1.20.3 |
| Java | ☕ | 15.0.2 |
| Kotlin | 🎯 | 1.8.20 |
| Ruby | 💎 | 3.0.1 |
| Bash | 📜 | 5.2.0 |
| Swift | 🍎 | 5.3.3 |

Powered by [Piston API](https://github.com/engineer-man/piston) — free, open source, no key needed.

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
- **[Piston](https://github.com/engineer-man/piston)** — Code execution engine

---

## 📄 License

MIT — see [LICENSE](LICENSE)
