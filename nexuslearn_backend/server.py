#!/usr/bin/env python3
"""NexusLearn API - All 7 agents + Superintendent + VibeVoice + Auth"""
import asyncio, json, subprocess, sys, tempfile, time, os, uuid
import pathlib
import sqlite3
import hashlib
import secrets
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Auth DB setup ─────────────────────────────────────────────────────────────
_DB_PATH = pathlib.Path(__file__).parent.parent / "data" / "nexuslearn.db"
_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
_JWT_SECRET = os.environ.get("NEXUS_JWT_SECRET", "nexuslearn-dev-secret-change-in-production")

def _get_db():
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def _init_db():
    db = _get_db()
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            language TEXT DEFAULT 'en',
            llm_provider TEXT DEFAULT '',
            llm_model TEXT DEFAULT '',
            llm_base_url TEXT DEFAULT '',
            llm_api_key TEXT DEFAULT '',
            setup_done INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)
    db.commit()
    db.close()

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}:{hashed}"

def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split(":", 1)
        return hashlib.sha256(f"{salt}{password}".encode()).hexdigest() == hashed
    except Exception:
        return False

def _make_token(user_id: str) -> str:
    """Simple signed token: base64(user_id):signature"""
    import base64, hmac
    payload = base64.b64encode(user_id.encode()).decode()
    sig = hmac.new(_JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"

def _verify_token(token: str) -> Optional[str]:
    """Returns user_id if valid, None if invalid."""
    import base64, hmac
    try:
        payload, sig = token.rsplit(".", 1)
        expected = hmac.new(_JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not secrets.compare_digest(sig, expected):
            return None
        return base64.b64decode(payload.encode()).decode()
    except Exception:
        return None

_bearer = HTTPBearer(auto_error=False)

def _get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _verify_token(creds.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    db = _get_db()
    row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(row)

# ── Superintendent lazy loader ────────────────────────────────────────────────
# Avoids import errors if DeepTutor deps are missing
_project_root = str(pathlib.Path(__file__).parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

_superintendent = None
def _get_superintendent():
    global _superintendent
    if _superintendent is None:
        try:
            from backend.agents.superintendent import superintendent_agent
            _superintendent = superintendent_agent
        except Exception:
            pass
    return _superintendent

async def _auto_probe_llm():
    """On startup: probe Ollama and LM Studio; register any found models so the
    backend is immediately usable without going through Settings."""
    candidates = [
        ("ollama",    "http://localhost:11434",   "http://localhost:11434/v1"),
        ("lm_studio", "http://localhost:1234",    "http://localhost:1234/v1"),
    ]
    for provider, host, base_url in candidates:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{host}/api/tags")
                if r.status_code != 200:
                    continue
                models = [m["name"] for m in r.json().get("models", [])]
                for model in models:
                    if not any(c.get("model") == model and c.get("provider") == provider
                               for c in _llm_configs):
                        eid = str(uuid.uuid4())
                        _llm_configs.append({
                            "id": eid, "name": f"{provider} / {model}",
                            "provider": provider, "base_url": base_url,
                            "api_key": "", "model": model,
                            "is_active": False, "is_default": False,
                        })
                    if not any(c.get("model") == model and c.get("provider") == provider
                               for c in _emb_configs):
                        _emb_configs.append({
                            "id": str(uuid.uuid4()),
                            "name": f"{provider} / {model} (embedding)",
                            "provider": provider, "base_url": base_url,
                            "api_key": "", "model": model,
                            "is_active": False, "is_default": False,
                        })
                if _llm_configs and _active_configs["llm"] is None:
                    _llm_configs[0]["is_active"] = True
                    _active_configs["llm"] = _llm_configs[0]["id"]
                if _emb_configs and _active_configs["embedding"] is None:
                    _emb_configs[0]["is_active"] = True
                    _active_configs["embedding"] = _emb_configs[0]["id"]
        except Exception:
            pass  # provider not running — skip silently


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    await _auto_probe_llm()
    yield


app = FastAPI(title="NexusLearn API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

RESPONSES = {
  "recursion": """**Recursion** — a function that calls itself to solve a smaller version of the same problem.

**Two essential parts:**
1. **Base case** — the stopping condition
2. **Recursive case** — calls itself with simpler input

```python
def factorial(n):
    if n == 0: return 1          # Base case
    return n * factorial(n - 1)  # Recursive case

print(factorial(5))  # 120
```

**Call stack trace:**
```
factorial(5) → 5 × factorial(4)
                  → 4 × factorial(3)
                        → 3 × factorial(2)
                              → 2 × factorial(1)
                                    → 1 × factorial(0) = 1
```
Unwinds: 1→1→2→6→24→**120** ✓

**Memory trick:** Russian nesting dolls — each doll contains a smaller one until you reach the smallest (base case).""",

  "pointers": """**Pointers** store a **memory address** rather than a direct value.

```c
int x = 42;
int *ptr = &x;    // ptr = ADDRESS of x

printf("%d", x);    // 42 — the value
printf("%p", ptr);  // 0x7ffd... — the address  
printf("%d", *ptr); // 42 — dereferenced (value at that address)
```

| Operator | Meaning |
|----------|---------|
| `&var` | Address-of: get the address of var |
| `*ptr` | Dereference: get value at the address in ptr |

**Why they exist:**
- Pass large data without copying (performance)
- Dynamic memory allocation
- Build linked lists, trees, graphs
- Direct hardware access (embedded systems)

**Rust alternative:** References (`&T`, `&mut T`) with compile-time safety — no nulls, no dangling, no double-free.""",

  "bigo": """**Big O Notation** — how algorithm runtime grows with input size *n*.

| Notation | Name | Real example | n=1000 |
|----------|------|-------------|--------|
| O(1) | Constant | Array index lookup | 1 op |
| O(log n) | Logarithmic | Binary search | ~10 ops |
| O(n) | Linear | Sum array | 1,000 ops |
| O(n log n) | Linearithmic | Merge sort | ~10,000 ops |
| O(n²) | Quadratic | Bubble sort | 1,000,000 ops |
| O(2ⁿ) | Exponential | Naive recursion | 2^1000 💀 |

**Reading code complexity:**
```python
def example(arr):
    total = 0          # O(1)
    for x in arr:      # O(n) — runs n times
        total += x     # O(1) per iteration
    return total       # O(1)
# → Overall: O(n)
```

**Drop constants rule:** O(3n + 5) → **O(n)**, O(n² + n) → **O(n²)**

For interviews: always state time AND space complexity.""",

  "solve_fib": """## 🔍 Problem: Fibonacci Sequence
*InvestigateAgent → Scanning KB → 3 sources found ✓*

---
## Solution (3 approaches)

**❌ Naive — O(2ⁿ):**
```python
def fib(n):
    if n <= 1: return n
    return fib(n-1) + fib(n-2)  # recalculates everything!
```

**✓ Memoized — O(n) time, O(n) space:**
```python
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n <= 1: return n
    return fib(n-1) + fib(n-2)
```

**✅ Iterative — O(n) time, O(1) space (best):**
```python
def fib(n):
    if n <= 1: return n
    a, b = 0, 1
    for _ in range(2, n+1):
        a, b = b, a+b
    return b

# Verify: F(0..9) = 0,1,1,2,3,5,8,13,21,34
for i in range(10): print(f"F({i})={fib(i)}", end="  ")
```

---
## ✅ Recommendation
Use **iterative** in production. Minimal memory, maximum speed.
*PrecisionAnswerAgent: Solution verified correct and optimal.*""",

  "solve_list": """## 🔍 Problem: Reverse Linked List
*InvestigateAgent → Data structure problem detected ✓*

---
## Solution

**Iterative — O(n) time, O(1) space:**
```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val; self.next = next

def reverse_list(head):
    prev, curr = None, head
    while curr:
        next_node = curr.next  # save next
        curr.next = prev       # reverse pointer ← key step
        prev = curr            # advance prev
        curr = next_node       # advance curr
    return prev  # new head

# Test: 1→2→3→None  becomes  3→2→1→None
```

**Step-by-step trace:**
```
Start:  prev=None, curr=1→2→3
Step1:  1→None,    prev=1, curr=2→3
Step2:  2→1→None,  prev=2, curr=3
Step3:  3→2→1,     prev=3, curr=None  ← done!
```

*PrecisionAnswerAgent: Iterative solution is optimal for this problem.*""",

  "research_systems": """# 📄 Research Report: Systems Programming

## 1. What Is Systems Programming?

Software that provides direct services to hardware/OS, prioritizing performance, control, and predictability over abstraction convenience. Powers: kernels, databases, runtimes, compilers, embedded firmware.

---

## 2. The Four Core Languages

### C (1972) — The Foundation
```c
int sum(int *arr, int n) {
    int total = 0;
    for (int i = 0; i < n; i++) total += arr[i];
    return total;
}
```
Still powers: Linux kernel, CPython runtime, SQLite, PostgreSQL, nginx.
**Risk:** Manual memory → buffer overflows, use-after-free, undefined behavior.

### C++ (1985) — Object-Oriented Systems
```cpp
class Buffer {
    std::vector<char> data;
public:
    void append(char c) { data.push_back(c); }
    ~Buffer() { /* data freed automatically (RAII) */ }
};
```
Powers: Chrome, LLVM, Unreal Engine, all HFT systems.

### Rust (2015) — Safe Systems Programming
```rust
fn main() {
    let s = String::from("hello");
    let r = &s;           // borrow — OK
    println!("{}", r);    // valid
    println!("{}", s);    // also valid — immutable borrow
    // No use-after-free possible — compiler enforces it
}
```
**Adoption 2025:** Linux kernel drivers, Windows kernel, Android, AWS Firecracker, curl.

### Go (2009) — Concurrent Services
```go
func handleRequests(requests []Request) {
    for _, req := range requests {
        go process(req)  // goroutine — 2KB vs 1MB for OS thread
    }
}
```
Powers: Docker, Kubernetes, Terraform, Prometheus.

---

## 3. Memory Regions

```
┌──────────┬───────────────────────────────┐
│ Stack    │ Automatic, fast, limited ~8MB  │
│ Heap     │ Dynamic, explicit/GC           │
│ BSS      │ Uninitialized globals          │
│ Data     │ Initialized globals            │
│ Text     │ Executable code                │
└──────────┴───────────────────────────────┘
```

---

## 4. 2025–2026 Trends
- Rust officially in Linux kernel since 2022, accelerating adoption
- NSA/CISA recommend memory-safe languages for new projects
- Carbon language (Google) targeting C++ migration path
- WebAssembly bringing systems languages to browser at near-native speed

---

## 5. Learning Path for Students
**Weeks 1–8:** C → pointers, memory, system calls, file I/O  
**Weeks 9–16:** C++ → RAII, templates, STL, multithreading  
**Weeks 17–28:** Rust → ownership, borrowing, async/await  
**Weeks 29–40:** Go → goroutines, channels, building real backends

---
*6 sources consulted. Report confidence: HIGH.*""",

  "ideas": """## 💡 Project Ideas — Systems Programming Track

### 🟢 Beginner (1–2 weeks): File Stats CLI
A command-line tool in Rust that recursively scans directories:
- Count files per extension
- Find largest/smallest files
- Show total size
- Sort by modification date
**Teaches:** CLI arg parsing, filesystem I/O, Rust basics, `clap` crate

---

### 🟡 Intermediate (3–4 weeks): HTTP/1.1 Server from Scratch
Build in C or Go without using any HTTP libraries:
- Parse raw TCP bytes into HTTP requests
- Route GET/POST to handlers
- Serve static files
- Handle 100 concurrent connections
**Teaches:** Sockets, TCP, HTTP protocol, select()/epoll, concurrency

---

### 🟠 Advanced (4–6 weeks): Custom Memory Allocator
Replace `malloc()` with your own implementation:
- Free list with first-fit / best-fit strategies
- Block coalescing to reduce fragmentation
- Thread-safe version using mutex/spinlock
- Performance benchmark vs system malloc
**Teaches:** Memory layout, pointer arithmetic, OS internals, benchmarking

---

### 🔴 Expert (8–12 weeks): Toy Key-Value Database
```
Architecture:
  Client → Query Parser → Executor → Storage Engine
                                  → B-Tree Index
                                  → WAL (durability)
```
Support: GET/SET/DELETE, persistence, concurrent reads via MVCC
**Teaches:** B-trees, disk I/O, transaction concepts, concurrent data structures

---

### 🟣 Capstone (3–6 months): Mini OS Kernel
Start from bare metal (x86 protected mode):
- Bootloader (GRUB)
- Physical/virtual memory with paging
- Interrupt handling (keyboard, timer)
- Basic shell that runs programs
**Teaches:** CPU architecture, privilege levels, interrupts, virtual memory""",

  "questions": [
    {"q": "What is the output of `[x**2 for x in range(5)]`?",
     "opts": ["[1,4,9,16,25]", "[0,1,4,9,16]", "[0,1,2,3,4]", "SyntaxError"],
     "ans": 1, "exp": "range(5) generates 0,1,2,3,4 — squaring each: 0,1,4,9,16"},
    {"q": "What does `*args` do in a Python function?",
     "opts": ["Accepts keyword args only", "Accepts any number of positional args", "Multiplies arguments", "Declares a pointer"],
     "ans": 1, "exp": "*args packs all extra positional arguments into a tuple"},
    {"q": "What is the average time complexity for dict lookup in Python?",
     "opts": ["O(n)", "O(log n)", "O(1)", "O(n²)"],
     "ans": 2, "exp": "Python dicts are hash tables — average O(1) via hash function"},
    {"q": "In Rust, what does the borrow checker prevent?",
     "opts": ["Slow code", "Having both mutable and immutable references simultaneously", "Using generics", "Null values in strings"],
     "ans": 1, "exp": "Core Rust safety: either 1 &mut ref OR any number of & refs — never both at once"},
    {"q": "What is RAII in C++?",
     "opts": ["A sorting algorithm", "Resource Acquisition Is Initialization — tie resource lifetime to object lifetime", "A memory allocator type", "A compiler flag"],
     "ans": 1, "exp": "RAII ensures resources (memory, file handles, locks) are freed in destructors when object scope ends"},
  ]
}

def pick(topic: str) -> str:
    t = topic.lower()
    if any(w in t for w in ["recurs", "factorial", "base case"]): return RESPONSES["recursion"]
    if any(w in t for w in ["pointer", "deref", "address", "null", "&x", "*ptr"]): return RESPONSES["pointers"]
    if any(w in t for w in ["big o", "complex", "o(n", "o(log"]): return RESPONSES["bigo"]
    if any(w in t for w in ["fibonacci", "fib"]): return RESPONSES["solve_fib"]
    if any(w in t for w in ["linked list", "reverse list"]): return RESPONSES["solve_list"]
    if any(w in t for w in ["system", "c++", "rust", "go ", "golang", "kernel", "memory"]): return RESPONSES["research_systems"]
    if any(w in t for w in ["idea", "project", "build", "create"]): return RESPONSES["ideas"]
    return RESPONSES["bigo"]  # default to bigo as commonly useful

async def ws_stream(ws, text, key="content"):
    words = text.split()
    buf = []
    for w in words:
        buf.append(w)
        if len(buf) >= 10 or "\n" in w:
            await ws.send_json({key: " ".join(buf) + " "})
            buf = []
            await asyncio.sleep(0.018)
    if buf: await ws.send_json({key: " ".join(buf)})

# ── REST ──────────────────────────────────────────────────────────────────────

# ── AUTH ENDPOINTS ────────────────────────────────────────────────────────────

@app.post("/api/v1/auth/register")
async def auth_register(d: dict):
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    if not name or not email or len(password) < 6:
        raise HTTPException(400, "Name, email and password (min 6 chars) required")
    db = _get_db()
    existing = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if existing:
        db.close()
        raise HTTPException(409, "Email already registered")
    user_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?,?,?,?,?)",
        (user_id, name, email, _hash_password(password), time.strftime("%Y-%m-%dT%H:%M:%S"))
    )
    db.commit()
    db.close()
    token = _make_token(user_id)
    return {"token": token, "user": {"id": user_id, "name": name, "email": email, "setup_done": False, "language": "en"}}

@app.post("/api/v1/auth/login")
async def auth_login(d: dict):
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    db = _get_db()
    row = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    db.close()
    if not row or not _verify_password(password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    token = _make_token(row["id"])
    return {
        "token": token,
        "user": {
            "id": row["id"], "name": row["name"], "email": row["email"],
            "language": row["language"], "setup_done": bool(row["setup_done"]),
            "llm_provider": row["llm_provider"], "llm_model": row["llm_model"],
        }
    }

@app.get("/api/v1/auth/me")
async def auth_me(user: dict = Depends(_get_current_user)):
    return {
        "id": user["id"], "name": user["name"], "email": user["email"],
        "language": user["language"], "setup_done": bool(user["setup_done"]),
        "llm_provider": user["llm_provider"], "llm_model": user["llm_model"],
    }

@app.post("/api/v1/auth/update-profile")
async def auth_update_profile(d: dict, user: dict = Depends(_get_current_user)):
    db = _get_db()
    db.execute("""
        UPDATE users SET
            language=COALESCE(?, language),
            llm_provider=COALESCE(?, llm_provider),
            llm_model=COALESCE(?, llm_model),
            llm_base_url=COALESCE(?, llm_base_url),
            llm_api_key=COALESCE(?, llm_api_key),
            setup_done=COALESCE(?, setup_done)
        WHERE id=?
    """, (
        d.get("language"), d.get("llm_provider"), d.get("llm_model"),
        d.get("llm_base_url"), d.get("llm_api_key"),
        1 if d.get("setup_done") else None,
        user["id"]
    ))
    db.commit()
    db.close()
    return {"ok": True}

# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
@app.get("/health")
async def health(): return {"status": "ok", "service": "NexusLearn API v1.0"}

@app.get("/api/v1/system/status")
async def sys_status(): return {"status": "ready", "llm": {"provider": "nexuslearn", "connected": True}, "rag": {"status": "ready"}}

@app.get("/api/v1/config")
@app.get("/api/v1/settings")
async def cfg(): return {"language": "en", "llm": {"configured": True, "model": "claude-haiku-4-5-20251001"}}

# ── LLM / Embedding / TTS config store ────────────────────────────────────────
_llm_configs:  list = []
_emb_configs:  list = []

# TTS: seed a built-in browser/system TTS option that needs no API key
_DEFAULT_TTS_ID = "default-tts-browser"
_tts_configs: list = [
    {
        "id": _DEFAULT_TTS_ID,
        "name": "Browser TTS (built-in)",
        "provider": "browser",
        "model": "default",
        "api_key": "",
        "base_url": "",
        "is_active": True,
        "is_default": True,
    }
]

# Search: seed DuckDuckGo which requires no API key
_DEFAULT_SEARCH_ID = "default-search-ddg"
_search_configs: list = [
    {
        "id": _DEFAULT_SEARCH_ID,
        "name": "DuckDuckGo (no API key)",
        "provider": "duckduckgo",
        "model": "web",
        "api_key": "",
        "base_url": "https://api.duckduckgo.com",
        "is_active": True,
        "is_default": True,
    }
]

# Track which config is "active" per type
_active_configs: dict = {
    "llm": None,
    "embedding": None,
    "tts": _DEFAULT_TTS_ID,
    "search": _DEFAULT_SEARCH_ID,
}

# Default env-var fallbacks for local providers
_ENV_DEFAULTS = {
    "LLM_HOST":       "http://localhost:11434/v1",
    "LLM_API_KEY":    "",
    "EMB_HOST":       "http://localhost:11434/v1",
    "EMB_API_KEY":    "",
    "TTS_HOST":       "http://localhost:5500/v1",
    "TTS_API_KEY":    "",
}

_CONFIG_STORES = {
    "llm": _llm_configs,
    "embedding": _emb_configs,
    "tts": _tts_configs,
    "search": _search_configs,
}

def _resolve_url(base_url) -> str:
    if isinstance(base_url, dict):
        var = base_url.get("use_env", "LLM_HOST")
        return os.environ.get(var, _ENV_DEFAULTS.get(var, "http://localhost:11434/v1"))
    return base_url or "http://localhost:11434/v1"

def _resolve_key(api_key) -> str:
    if isinstance(api_key, dict):
        var = api_key.get("use_env", "")
        return os.environ.get(var, "")
    return api_key or ""

# ── Auto-detect local providers ───────────────────────────────────────────────
async def _fetch_ollama_models(root: str) -> list:
    """Return list of model names from an Ollama-compatible server."""
    import urllib.request, ssl
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(f"{root}/api/tags")
        with urllib.request.urlopen(req, context=ctx, timeout=4) as resp:
            data = json.loads(resp.read())
        return [m.get("name","") for m in data.get("models", []) if m.get("name")]
    except Exception:
        return []

@app.get("/api/v1/config/detect")
async def detect_providers():
    """Probe localhost for running LLM providers and return discovered models."""
    detected = []

    PROBES = [
        {"provider": "ollama",    "root": "http://localhost:11434", "url": "http://localhost:11434/v1"},
        {"provider": "lm_studio", "root": "http://localhost:1234",  "url": "http://localhost:1234/v1"},
    ]
    for probe in PROBES:
        models = await _fetch_ollama_models(probe["root"])
        if models:
            detected.append({
                "provider": probe["provider"],
                "base_url": probe["url"],
                "models": models,
                "running": True,
            })

    return {"detected": detected}

@app.post("/api/v1/config/test-llm")
async def test_llm_connection(d: dict):
    """Quick reachability check for a given LLM provider/model from the setup wizard."""
    import urllib.request, ssl
    provider = d.get("provider", "ollama")
    base_url = (d.get("base_url") or "http://localhost:11434").rstrip("/")
    model = d.get("model", "")

    # Normalise: always probe the root /api/tags (Ollama) or /v1/models (OpenAI-compat)
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    headers = {"Content-Type": "application/json"}
    api_key = d.get("api_key", "")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    # Try Ollama-style probe first (works for Ollama + LM Studio)
    for probe_path in ["/api/tags", "/v1/models"]:
        try:
            req = urllib.request.Request(f"{base_url}{probe_path}", headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=5) as resp:
                return {"ok": True, "message": f"Connected to {provider} at {base_url}"}
        except Exception:
            continue

    # For cloud providers (openai, anthropic, groq) just check creds exist
    if provider in ("openai", "anthropic", "groq", "openrouter") and api_key:
        return {"ok": True, "message": "API key provided — connection will be verified on first use"}

    raise HTTPException(status_code=503, detail=f"Could not reach {provider} at {base_url}")


@app.post("/api/v1/config/detect/apply")
async def apply_detected(d: dict):
    """Auto-create LLM + Embedding configs for a detected provider+model list."""
    provider = d.get("provider", "ollama")
    base_url = d.get("base_url", "http://localhost:11434/v1")
    models: list = d.get("models", [])

    created_llm = 0
    created_emb = 0
    for model in models:
        # LLM config
        if not any(c.get("model") == model and c.get("provider") == provider for c in _llm_configs):
            entry = {
                "id": str(uuid.uuid4()),
                "name": f"{provider} / {model}",
                "provider": provider,
                "base_url": base_url,
                "api_key": "",
                "model": model,
                "is_active": False,
                "is_default": False,
            }
            _llm_configs.append(entry)
            created_llm += 1

        # Embedding config — Ollama serves embeddings via /api/embeddings on the same server
        if not any(c.get("model") == model and c.get("provider") == provider for c in _emb_configs):
            entry = {
                "id": str(uuid.uuid4()),
                "name": f"{provider} / {model} (embedding)",
                "provider": provider,
                "base_url": base_url,
                "api_key": "",
                "model": model,
                "is_active": False,
                "is_default": False,
            }
            _emb_configs.append(entry)
            created_emb += 1

    # Set first as active for LLM if none is set yet
    if _llm_configs and _active_configs["llm"] is None:
        _llm_configs[0]["is_active"] = True
        _active_configs["llm"] = _llm_configs[0]["id"]

    # Set first as active for Embedding if none is set yet
    if _emb_configs and _active_configs["embedding"] is None:
        _emb_configs[0]["is_active"] = True
        _active_configs["embedding"] = _emb_configs[0]["id"]

    return {
        "created_llm": created_llm,
        "created_emb": created_emb,
        "created": created_llm,  # backwards-compat
        "configs": _llm_configs,
    }

# ── Status + Ports ─────────────────────────────────────────────────────────────
def _make_status(configs: list, active_id) -> dict:
    active = next((c for c in configs if c["id"] == active_id), None) if active_id else (configs[0] if configs else None)
    return {
        "configured": bool(active),
        "active_config_id": active["id"] if active else None,
        "active_config_name": active["name"] if active else None,
        "model": active.get("model") if active else None,
        "provider": active.get("provider") if active else None,
        "env_configured": {},
        "total_configs": len(configs),
    }

@app.get("/api/v1/config/status")
async def config_status():
    return {
        "llm":       _make_status(_llm_configs,    _active_configs["llm"]),
        "embedding": _make_status(_emb_configs,     _active_configs["embedding"]),
        "tts":       _make_status(_tts_configs,     _active_configs["tts"]),
        "search":    _make_status(_search_configs,  _active_configs["search"]),
    }

@app.get("/api/v1/config/ports")
async def config_ports():
    return {"backend_port": 8001, "frontend_port": 3000}

# ── Per-type helpers ───────────────────────────────────────────────────────────
def _get_store(t: str) -> list:
    return _CONFIG_STORES.get(t, [])

# ── LLM endpoints ──────────────────────────────────────────────────────────────
async def _test_llm(provider: str, base_url: str, api_key: str, model: str) -> dict:
    import urllib.request, urllib.error, ssl
    url = base_url.rstrip("/")
    ollama_root = url[:-3] if url.endswith("/v1") else url
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    if provider in ("ollama","lm_studio"):
        try:
            req = urllib.request.Request(f"{ollama_root}/api/tags")
            with urllib.request.urlopen(req, context=ctx, timeout=6) as resp:
                data = json.loads(resp.read())
            names = [m.get("name","") for m in data.get("models", [])]
            matched = next((n for n in names if n == model or n.startswith(model.split(":")[0])), None)
            if names and not matched:
                return {"success": False, "message": f"Model '{model}' not found. Available: {', '.join(names)}"}
            return {"success": True, "message": f"Connected to {provider} ✓  (model: {matched or model})"}
        except Exception as e:
            return {"success": False, "message": f"{provider} not reachable at {ollama_root}: {e}"}
    headers = {"Content-Type": "application/json"}
    if api_key: headers["Authorization"] = f"Bearer {api_key}"
    payload = json.dumps({"model": model, "messages": [{"role":"user","content":"Hi"}], "max_tokens":1, "stream":False}).encode()
    req = urllib.request.Request(f"{url}/chat/completions", data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            return {"success": True, "message": f"Connected to {provider} ({model}) ✓"}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")[:200]
        if e.code in (400,422): return {"success": True, "message": f"Connected to {provider} ({model}) ✓"}
        return {"success": False, "message": f"HTTP {e.code}: {body}"}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}

@app.post("/api/v1/config/llm/test")
async def test_llm_config(d: dict):
    return await _test_llm(d.get("provider","ollama"), _resolve_url(d.get("base_url")), _resolve_key(d.get("api_key","")), d.get("model",""))

@app.get("/api/v1/config/llm")
async def get_llm_configs(): return {"configs": _llm_configs}

@app.post("/api/v1/config/llm")
async def add_llm_config(d: dict):
    d["id"] = str(uuid.uuid4()); d["base_url"] = _resolve_url(d.get("base_url")); d.setdefault("is_active", False)
    _llm_configs.append(d)
    if len(_llm_configs) == 1: d["is_active"] = True; _active_configs["llm"] = d["id"]
    return d

@app.put("/api/v1/config/llm/{cfg_id}")
async def update_llm_config(cfg_id: str, d: dict):
    for i,c in enumerate(_llm_configs):
        if c["id"] == cfg_id: d["id"] = cfg_id; d["base_url"] = _resolve_url(d.get("base_url")); _llm_configs[i] = d; return d
    from fastapi import HTTPException; raise HTTPException(404, "Not found")

@app.delete("/api/v1/config/llm/{cfg_id}")
async def delete_llm_config(cfg_id: str):
    global _llm_configs; _llm_configs = [c for c in _llm_configs if c["id"] != cfg_id]
    if _active_configs["llm"] == cfg_id: _active_configs["llm"] = _llm_configs[0]["id"] if _llm_configs else None
    return {"ok": True}

@app.post("/api/v1/config/llm/{cfg_id}/active")
async def set_llm_active(cfg_id: str):
    for c in _llm_configs: c["is_active"] = (c["id"] == cfg_id)
    _active_configs["llm"] = cfg_id; return {"ok": True}

@app.post("/api/v1/config/llm/{cfg_id}/test")
async def test_llm_by_id(cfg_id: str):
    c = next((x for x in _llm_configs if x["id"] == cfg_id), None)
    if not c: return {"success": False, "message": "Config not found"}
    return await _test_llm(c.get("provider","ollama"), c.get("base_url",""), c.get("api_key",""), c.get("model",""))

# ── Embedding endpoints ─────────────────────────────────────────────────────────
@app.post("/api/v1/config/embedding/test")
async def test_emb_config(d: dict):
    return await _test_llm(d.get("provider","ollama"), _resolve_url(d.get("base_url")), _resolve_key(d.get("api_key","")), d.get("model",""))

@app.get("/api/v1/config/embedding")
async def get_emb_configs(): return {"configs": _emb_configs}

@app.post("/api/v1/config/embedding")
async def add_emb_config(d: dict):
    d["id"] = str(uuid.uuid4()); d.setdefault("is_active", False); _emb_configs.append(d)
    if len(_emb_configs) == 1: d["is_active"] = True; _active_configs["embedding"] = d["id"]
    return d

@app.put("/api/v1/config/embedding/{cfg_id}")
async def update_emb_config(cfg_id: str, d: dict):
    for i,c in enumerate(_emb_configs):
        if c["id"] == cfg_id: d["id"] = cfg_id; _emb_configs[i] = d; return d
    from fastapi import HTTPException; raise HTTPException(404, "Not found")

@app.delete("/api/v1/config/embedding/{cfg_id}")
async def del_emb_config(cfg_id: str):
    global _emb_configs; _emb_configs = [c for c in _emb_configs if c["id"] != cfg_id]; return {"ok": True}

@app.post("/api/v1/config/embedding/{cfg_id}/active")
async def set_emb_active(cfg_id: str):
    for c in _emb_configs: c["is_active"] = (c["id"] == cfg_id)
    _active_configs["embedding"] = cfg_id; return {"ok": True}

@app.post("/api/v1/config/embedding/{cfg_id}/test")
async def test_emb_by_id(cfg_id: str):
    c = next((x for x in _emb_configs if x["id"] == cfg_id), None)
    if not c: return {"success": False, "message": "Config not found"}
    return await _test_llm(c.get("provider","ollama"), c.get("base_url",""), c.get("api_key",""), c.get("model",""))

# ── TTS endpoints ───────────────────────────────────────────────────────────────
@app.post("/api/v1/config/tts/test")
async def test_tts_config(d: dict):
    return await _test_llm(d.get("provider","openai"), _resolve_url(d.get("base_url")), _resolve_key(d.get("api_key","")), d.get("model","tts-1"))

@app.get("/api/v1/config/tts")
async def get_tts_configs(): return {"configs": _tts_configs}

@app.post("/api/v1/config/tts")
async def add_tts_config(d: dict):
    d["id"] = str(uuid.uuid4()); d.setdefault("is_active", False); _tts_configs.append(d)
    if len(_tts_configs) == 1: d["is_active"] = True; _active_configs["tts"] = d["id"]
    return d

@app.put("/api/v1/config/tts/{cfg_id}")
async def update_tts_config(cfg_id: str, d: dict):
    for i,c in enumerate(_tts_configs):
        if c["id"] == cfg_id: d["id"] = cfg_id; _tts_configs[i] = d; return d
    from fastapi import HTTPException; raise HTTPException(404, "Not found")

@app.delete("/api/v1/config/tts/{cfg_id}")
async def del_tts_config(cfg_id: str):
    global _tts_configs; _tts_configs = [c for c in _tts_configs if c["id"] != cfg_id]; return {"ok": True}

@app.post("/api/v1/config/tts/{cfg_id}/active")
async def set_tts_active(cfg_id: str):
    for c in _tts_configs: c["is_active"] = (c["id"] == cfg_id)
    _active_configs["tts"] = cfg_id; return {"ok": True}

@app.post("/api/v1/config/tts/{cfg_id}/test")
async def test_tts_by_id(cfg_id: str):
    c = next((x for x in _tts_configs if x["id"] == cfg_id), None)
    if not c: return {"success": False, "message": "Config not found"}
    return await _test_llm(c.get("provider","openai"), c.get("base_url",""), c.get("api_key",""), c.get("model",""))

# ── Search endpoints ─────────────────────────────────────────────────────────────
@app.get("/api/v1/config/search")
async def get_search_configs(): return {"configs": _search_configs}

@app.post("/api/v1/config/search")
async def add_search_config(d: dict):
    d["id"] = str(uuid.uuid4()); d.setdefault("is_active", False); _search_configs.append(d)
    if len(_search_configs) == 1: d["is_active"] = True; _active_configs["search"] = d["id"]
    return d

@app.put("/api/v1/config/search/{cfg_id}")
async def update_search_config(cfg_id: str, d: dict):
    for i,c in enumerate(_search_configs):
        if c["id"] == cfg_id: d["id"] = cfg_id; _search_configs[i] = d; return d
    from fastapi import HTTPException; raise HTTPException(404, "Not found")

@app.delete("/api/v1/config/search/{cfg_id}")
async def del_search_config(cfg_id: str):
    global _search_configs; _search_configs = [c for c in _search_configs if c["id"] != cfg_id]; return {"ok": True}

@app.post("/api/v1/config/search/{cfg_id}/active")
async def set_search_active(cfg_id: str):
    for c in _search_configs: c["is_active"] = (c["id"] == cfg_id)
    _active_configs["search"] = cfg_id; return {"ok": True}

_sidebar_settings = {"description": "", "nav_order": None}

@app.get("/api/v1/settings/sidebar")
async def get_sidebar(): return _sidebar_settings

@app.put("/api/v1/settings/sidebar/description")
async def set_sidebar_desc(d: dict): _sidebar_settings["description"] = d.get("description", ""); return {"ok": True}

@app.put("/api/v1/settings/sidebar/nav-order")
async def set_sidebar_nav(d: dict): _sidebar_settings["nav_order"] = d.get("nav_order"); return {"ok": True}

@app.put("/api/v1/settings/theme")
async def set_theme(d: dict): return {"ok": True}

@app.put("/api/v1/settings/language")
async def set_language(d: dict): return {"ok": True}

DEMO_KB = {
  "name": "NexusLearn Demo KB",
  "is_default": True,
  "status": "ready",
  "statistics": {
    "raw_documents": 12,
    "images": 0,
    "content_lists": 3,
    "rag_initialized": True,
    "rag_provider": "llamaindex",
    "status": "ready",
    "rag": {"chunks": 120, "entities": 45, "relations": 30}
  }
}

# Dynamic in-memory KB store
_kbs: List[dict] = [DEMO_KB]
# Tracks KBs currently being processed: name -> start_time
_kb_processing: dict = {}

@app.get("/api/v1/knowledge/list")
async def kb_list(): return _kbs

@app.get("/api/v1/knowledge/health")
async def kb_health(): return {"status": "ok", "rag_available": True}

@app.get("/api/v1/knowledge/rag-providers")
async def rag_providers(): return ["llamaindex", "lightrag", "ragany"]

@app.get("/api/v1/knowledge")
async def kb(): return {"knowledge_bases": _kbs, "total": len(_kbs)}

@app.post("/api/v1/knowledge/create")
async def create_kb(
    name: str = Form(...),
    rag_provider: str = Form("llamaindex"),
    files: List[UploadFile] = File(default=[]),
):
    # Check for duplicate
    if any(k["name"] == name for k in _kbs):
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=f"Knowledge base '{name}' already exists")

    # Count file bytes for doc estimate
    doc_count = max(1, len(files))
    new_kb = {
        "name": name,
        "is_default": False,
        "status": "processing",
        "statistics": {
            "raw_documents": doc_count,
            "images": 0,
            "content_lists": 0,
            "rag_initialized": False,
            "rag_provider": rag_provider,
            "status": "processing",
            "rag": {"chunks": 0, "entities": 0, "relations": 0}
        }
    }
    _kbs.append(new_kb)
    _kb_processing[name] = time.time()

    # Simulate background indexing (resolve after ~8s)
    async def _finish_processing():
        await asyncio.sleep(8)
        for k in _kbs:
            if k["name"] == name:
                chunks = doc_count * 42
                k["status"] = "ready"
                k["statistics"].update({
                    "rag_initialized": True,
                    "status": "ready",
                    "content_lists": max(1, doc_count // 2),
                    "rag": {"chunks": chunks, "entities": chunks // 3, "relations": chunks // 5}
                })
                break
        _kb_processing.pop(name, None)

    asyncio.create_task(_finish_processing())
    return new_kb

@app.get("/api/v1/knowledge/{kb_name}")
async def get_kb(kb_name: str):
    from fastapi import HTTPException
    kb = next((k for k in _kbs if k["name"] == kb_name), None)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb

@app.delete("/api/v1/knowledge/{kb_name}")
async def delete_kb(kb_name: str):
    global _kbs
    _kbs = [k for k in _kbs if k["name"] != kb_name]
    _kb_processing.pop(kb_name, None)
    return {"ok": True}

@app.get("/api/v1/notebooks")
async def nbs(): return {"notebooks": [{"id":"nb1","name":"My Notes","records":5}], "total": 1}

@app.post("/api/v1/notebooks")
async def new_nb(d: dict = {}): return {"id": f"nb_{int(time.time())}", "name": d.get("name","Notebook"), "records": []}

@app.get("/api/v1/dashboard/recent")
async def dash_recent(limit: int = 50, type: str = None): return []

@app.get("/api/v1/dashboard")
@app.get("/api/v1/history")
@app.get("/api/v1/agent-configs")
async def dash(): return {"sessions": [], "total": 0, "configs": []}

@app.get("/api/v1/chat/sessions")
async def chat_sessions(limit: int = 20):
    sessions = []
    for sid, s in list(_chat_sessions.items())[-limit:]:
        user_msgs = [m for m in s.get("messages", []) if m["role"] == "user"]
        if not user_msgs:
            continue
        sessions.append({
            "session_id": sid,
            "title": user_msgs[0]["content"][:60] if user_msgs else "Chat session",
            "topic": s.get("topic"),
            "message_count": len(s.get("messages", [])),
            "created_at": s.get("created_at", 0),
        })
    return list(reversed(sessions))

@app.get("/api/v1/chat/sessions/{session_id}")
async def get_chat_session(session_id: str):
    s = _chat_sessions.get(session_id)
    if not s:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "messages": s.get("messages", []),
        "topic": s.get("topic"),
        "learned": s.get("learned", []),
        "created_at": s.get("created_at", 0),
        "settings": {},
    }

@app.get("/api/v1/solve/sessions")
async def solve_sessions(limit: int = 20): return []

@app.post("/api/v1/chat")
async def chat(d: dict): return {"response": pick(d.get("message","")), "agent": "ChatAgent"}

@app.post("/api/v1/question/generate")
async def questions(d: dict = {}):
    qs = [{"question": q["q"], "type": "multiple_choice", "options": q["opts"],
           "correct_answer": q["opts"][q["ans"]], "explanation": q["exp"]}
          for q in RESPONSES["questions"][:d.get("count",4)]]
    return {"questions": qs, "topic": d.get("topic","python"), "generated": len(qs)}

@app.post("/api/v1/code/run")
async def run_code(d: dict):
    if d.get("language","python").lower() != "python":
        return {"stdout":"","stderr":f"Use Wandbox for {d['language']}","exit_code":1}
    try:
        with tempfile.NamedTemporaryFile(mode="w",suffix=".py",delete=False) as f:
            f.write(d.get("code","print(42)")); fname = f.name
        r = subprocess.run([sys.executable,fname],capture_output=True,text=True,timeout=10)
        os.unlink(fname)
        return {"stdout":r.stdout,"stderr":r.stderr,"exit_code":r.returncode}
    except: return {"stdout":"","stderr":"Error running code","exit_code":-1}

@app.post("/api/v1/knowledge/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    return {"id":f"doc_{int(time.time())}","filename":file.filename,"status":"indexed","chunks":max(1,len(data)//1000)}

@app.post("/api/v1/ideagen/generate")
async def ideagen(d: dict = {}): return {"ideas": RESPONSES["ideas"]}

# ── Chat session memory ────────────────────────────────────────────────────────
_chat_sessions: dict = {}  # {session_id: {messages, topic, learned, turn, created_at}}

# ── Agent system prompts ───────────────────────────────────────────────────────
# Each agent has a distinct personality, a specific OUTPUT CONTRACT (format it
# must follow), and explicit behavioral rules so the LLM cannot slip into a
# generic chatbot style.
_AGENT_SYSTEMS = {
    "OnboardingAgent": """You are the OnboardingAgent — the friendly front-door of DeepTutor, an AI-powered learning platform.

Your personality: warm, curious, slightly enthusiastic. You genuinely want to know what the user is here to learn.

Your STRICT output contract for the very first greeting:
1. One sentence saying hello and what DeepTutor is.
2. A 3-item bullet list of what you can do (pick from: tutoring, problem solving, quizzes, deep research, guided paths).
3. ONE concrete question: ask what topic or skill they want to work on — and if they're a beginner or have some background.

For follow-up messages where the user is telling you their topic/background:
- Acknowledge their goal warmly and specifically (repeat the topic name).
- Ask ONE clarifying question to understand their current level or what they already know.
- Do NOT start teaching yet — that is TutorAgent's job.

NEVER say "I'll connect you with..." or "switching to another agent". Just be natural.
Maximum 100 words per response. No filler phrases like "Certainly!" or "Of course!".""",

    "TutorAgent": """You are the TutorAgent — a world-class human tutor inside DeepTutor. Think of the best teacher you ever had: patient, specific, uses real examples, never condescending.

Your personality: methodical but engaging. You love breaking things down. You celebrate small wins.

Your STRICT output contract:
1. **Concept in one sentence** — the clearest possible definition.
2. **Intuition / analogy** — explain it like the user is smart but new to this. Use a real-world analogy.
3. **Concrete example** — show it working (code, math, diagram in text, or narrative step-by-step).
4. **Key insight** — the one thing that makes it click, in bold.
5. **Your turn** — end with ONE specific question or mini-challenge that checks the user's understanding.

Rules:
- Adapt your depth: if the user says "beginner", start simple. If they show knowledge, level up.
- Never say "Great question!" — just answer.
- If a concept has common misconceptions, address the biggest one.
- Use markdown: headers, bold, code blocks where relevant.""",

    "CoachAgent": """You are the CoachAgent — a sharp Socratic practice coach inside DeepTutor. Your job is to build skill through active retrieval, not passive reading.

Your personality: direct, encouraging, like a sports coach. You push the user but celebrate effort.

Your STRICT behavioral flow:
- FIRST message on a topic: set the stage. Tell the user you'll run a short drill. Give them ONE focused question or exercise. Make it concrete (e.g. "What is the output of this code?", "Solve this: ...", "Explain X in your own words"). Then STOP — wait for their answer.
- AFTER they answer: give immediate, specific feedback. Highlight exactly what was right. Correct what was wrong with an explanation. Then either advance to a harder variant OR ask a follow-up to go deeper.
- DO NOT give the answer before they try.
- DO NOT give multiple questions at once.

Tone: short sentences. Direct. Add a "⚡" for a correct answer, "💡" for a correction.""",

    "SolverGuideAgent": """You are the SolverGuideAgent — a rigorous problem-solving expert inside DeepTutor. You think in systems: constraints, patterns, solutions.

Your personality: analytical, methodical, like a senior engineer walking a colleague through a problem.

Your STRICT output contract:
1. **Problem restatement** — restate the problem precisely in your own words (1-2 sentences). This confirms you understood it.
2. **Core challenge** — identify the single hardest part of this problem.
3. **Approach** — a numbered step-by-step plan (3-5 steps). Each step is an action, not a vague hint.
4. **Solution** — work through the solution completely. Show your work. For code: provide working code with comments.
5. **Verification** — show how to check the answer is correct.
6. **💡 Tip** — one insight about the pattern or technique that generalises beyond this problem.

Note: for iterative, multi-agent deep dives, suggest Smart Solver in the sidebar — but always give a complete answer here first.""",

    "ResearchGuideAgent": """You are the ResearchGuideAgent — a meticulous research librarian and analyst inside DeepTutor. You help users navigate complex knowledge landscapes.

Your personality: thorough, intellectually curious, precise with language. You love nuance and context.

Your STRICT output contract:
## [Topic Name]

### What it is
2-3 sentence precise definition.

### Key sub-topics to understand
Bullet list of 4-6 sub-topics, each with a one-line description.

### Core concepts
The 3-5 foundational ideas someone needs to grasp this topic, with a sentence on each.

### Open questions / frontiers
2-3 unsolved problems or active debates in this area (shows intellectual honesty).

### Where to go next
Suggest a learning path: what to study first, second, third.

Always note: *For a full cited research report on this topic, use **Deep Research** in the sidebar.*""",

    "ProgressAgent": """You are the ProgressAgent — a reflective learning coach inside DeepTutor. You help users consolidate and own what they've learned.

Your personality: thoughtful, encouraging, honest about gaps.

Your STRICT output contract:
## Learning Progress Summary

### Topics you've explored
List each topic/concept discussed, with a one-line description of what was covered.

### What you've understood well
2-3 specific things the user demonstrated understanding of, based on their messages.

### Gaps to address
1-2 areas where the conversation revealed uncertainty or shallowness — be specific and kind.

### Recommended next steps
3 concrete actions: a specific topic to study, a practice exercise to try, and a module to explore (e.g. try Smart Solver for X, or generate quiz questions on Y).

End with one encouraging sentence.""",
}

WELCOME_FALLBACK = (
    "👋 Hi! I'm **DeepTutor**, your AI learning companion.\n\n"
    "I can help you:\n"
    "- 🎓 Learn any topic with clear explanations and examples\n"
    "- 🧠 Solve problems step-by-step (try **Smart Solver**)\n"
    "- 📝 Practice with auto-generated quizzes\n"
    "- 🔬 Run deep research reports\n\n"
    "**What would you like to learn or work on today?** Tell me the topic and whether you're a beginner or have some background."
)

# Intent → agent routing
_INTENT_RULES = [
    (["hello", "hi", "hey", "start", "begin", "who are you", "what can you do", "what is this"], "OnboardingAgent"),
    (["solve", "calculate", "compute", "algorithm", "debug", "bug", "error", "fix", "code", "program", "implement", "write a function", "how do i write"], "SolverGuideAgent"),
    (["research", "investigate", "deep dive", "literature", "paper", "study", "survey", "compare", "overview of", "tell me about", "explain the field"], "ResearchGuideAgent"),
    (["quiz", "test me", "practice", "exercise", "question", "exam", "challenge me", "drill", "assess"], "CoachAgent"),
    (["progress", "what have i learned", "summary", "recap", "so far", "review my", "what did we"], "ProgressAgent"),
]

def _route_intent(message: str) -> str:
    """Route to specialist agent by keyword; default is TutorAgent."""
    low = message.lower()
    for keywords, agent in _INTENT_RULES:
        if any(kw in low for kw in keywords):
            return agent
    return "TutorAgent"


async def _stream_chat_tokens(ws: WebSocket, text: str) -> str:
    """Send text as {type: stream, content: token} events."""
    words = text.split()
    buf: list = []
    for w in words:
        buf.append(w)
        if len(buf) >= 8 or "\n" in w:
            await ws.send_json({"type": "stream", "content": " ".join(buf) + " "})
            buf = []
            await asyncio.sleep(0.022)
    if buf:
        await ws.send_json({"type": "stream", "content": " ".join(buf)})
    return text


async def _call_ollama_stream(ws: WebSocket, model: str, messages: list, base_url: str) -> str:
    """Stream tokens from Ollama's /api/chat endpoint; falls back to mock on error."""
    # Derive the Ollama native URL from the OpenAI-compat base_url
    # e.g. http://localhost:11434/v1 → http://localhost:11434/api/chat
    host = base_url.rstrip("/")
    if host.endswith("/v1"):
        host = host[:-3]
    ollama_url = f"{host}/api/chat"

    full_response = ""
    try:
        payload = {"model": model, "messages": messages, "stream": True}
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", ollama_url, json=payload) as resp:
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            full_response += token
                            await ws.send_json({"type": "stream", "content": token})
                        if chunk.get("done"):
                            break
                    except json.JSONDecodeError:
                        pass
    except Exception:
        if not full_response:
            full_response = await _stream_chat_tokens(ws, WELCOME_FALLBACK)
    return full_response


async def _get_llm_response(ws: WebSocket, messages: list, fallback_text: str) -> str:
    """Use the active LLM config to stream a response, or fall back to typed tokens."""
    active_id = _active_configs.get("llm")
    active_llm = next((c for c in _llm_configs if c["id"] == active_id), None)
    if active_llm and active_llm.get("provider") in ("ollama", "lm_studio"):
        result = await _call_ollama_stream(
            ws,
            active_llm.get("model", ""),
            messages,
            active_llm.get("base_url", "http://localhost:11434/v1"),
        )
        # _call_ollama_stream already falls back to WELCOME_FALLBACK on error,
        # but if it returned empty for a non-welcome call, use fallback_text
        return result if result.strip() else await _stream_chat_tokens(ws, fallback_text)
    return await _stream_chat_tokens(ws, fallback_text)


# ── WEBSOCKETS ─────────────────────────────────────────────────────────────────

@app.websocket("/api/v1/chat")
async def chat_ws_main(ws: WebSocket):
    """Primary chat WebSocket with multi-agent routing."""
    await ws.accept()
    try:
        d = await ws.receive_json()
        action = d.get("action", "chat")

        # ── Session management ───────────────────────────────────────────────
        session_id = d.get("session_id") or str(uuid.uuid4())
        if session_id not in _chat_sessions:
            _chat_sessions[session_id] = {
                "messages": [],
                "topic": None,
                "learned": [],
                "turn": 0,
                "created_at": time.time(),
            }
        session = _chat_sessions[session_id]
        await ws.send_json({"type": "session", "session_id": session_id})

        # ── Welcome / Onboarding flow ────────────────────────────────────────
        if action == "welcome":
            await ws.send_json({"type": "status", "stage": "OnboardingAgent is waking up…", "agent": "OnboardingAgent"})
            await asyncio.sleep(0.2)
            prompt_messages = [
                {"role": "system", "content": _AGENT_SYSTEMS["OnboardingAgent"]},
                {"role": "user", "content": "[system] Start session — greet the user."},
            ]
            fallback = WELCOME_FALLBACK
            response_text = await _get_llm_response(ws, prompt_messages, fallback)
            session["messages"].append({"role": "assistant", "content": response_text, "agent": "OnboardingAgent"})
            await ws.send_json({"type": "result", "content": response_text, "agent": "OnboardingAgent"})
            return

        # ── Normal chat with agent routing ───────────────────────────────────
        message = d.get("message", "").strip()
        if not message:
            await ws.close()
            return

        session["turn"] = session.get("turn", 0) + 1
        turn = session["turn"]

        # OrchestratorAgent: decide which specialist to invoke
        await ws.send_json({"type": "status", "stage": "OrchestratorAgent is routing…", "agent": "OrchestratorAgent"})
        await asyncio.sleep(0.15)

        # Route first: keyword-based fast path
        agent_name = _route_intent(message)

        # On turns 2-4 with no explicit intent detected, the OnboardingAgent keeps asking
        # about learning goals before switching to TutorAgent
        if agent_name == "TutorAgent" and turn <= 2 and session.get("topic") is None:
            agent_name = "OnboardingAgent"

        await ws.send_json({"type": "status", "stage": f"{agent_name} is thinking…", "agent": agent_name})

        # Build conversation context
        client_history = d.get("history", []) or session["messages"]
        # Strip agent metadata from history for LLM
        clean_history = [{"role": m["role"], "content": m["content"]} for m in client_history]

        # Inject topic context if we have it
        topic_note = ""
        if session.get("topic"):
            topic_note = f"\n\n[Context: the user's learning topic so far is: {session['topic']}]"

        # For ProgressAgent, summarise session
        if agent_name == "ProgressAgent":
            turns_text = "\n".join(
                f"{m['role'].upper()}: {m['content'][:200]}" for m in clean_history[-12:]
            )
            summary_prompt = (
                f"Here is the recent conversation:\n{turns_text}\n\n"
                "Now act as ProgressAgent."
            )
            prompt_messages = [
                {"role": "system", "content": _AGENT_SYSTEMS["ProgressAgent"]},
                {"role": "user", "content": summary_prompt},
            ]
        else:
            prompt_messages = (
                [{"role": "system", "content": _AGENT_SYSTEMS[agent_name] + topic_note}]
                + clean_history
                + [{"role": "user", "content": message}]
            )

        # Generic intelligent fallback (no LLM) — construct a real answer skeleton
        def _smart_fallback(msg: str) -> str:
            low = msg.lower()
            if agent_name == "OnboardingAgent":
                return (
                    "That's great! To get started, could you tell me a bit more about your "
                    "background with this topic? Are you a complete beginner, or do you have "
                    "some experience already? That will help me pitch the explanations just right."
                )
            if agent_name == "CoachAgent":
                return (
                    f"Let's practice! Here's a question on **{msg[:40]}**:\n\n"
                    "Think carefully and share your answer — I'll give you detailed feedback "
                    "once you do. Take your time!"
                )
            if agent_name == "SolverGuideAgent":
                return (
                    f"Got it — let me frame this problem:\n\n"
                    f"**The core challenge** in '{msg[:60]}' is breaking it into clear sub-steps.\n\n"
                    "**My approach:**\n"
                    "1. Understand the constraints\n"
                    "2. Identify the pattern or algorithm needed\n"
                    "3. Implement and verify\n\n"
                    "For a full step-by-step multi-agent breakdown, try **Smart Solver** in the sidebar."
                )
            if agent_name == "ResearchGuideAgent":
                return (
                    f"**{msg[:50]}** is a rich area. Key dimensions to explore:\n\n"
                    "- Foundational concepts and history\n"
                    "- Current state of the art\n"
                    "- Open problems and debates\n"
                    "- Practical applications\n\n"
                    "For a full cited report, head to **Deep Research** in the sidebar."
                )
            # TutorAgent default
            return (
                f"Great question about **{msg[:50]}**! Let me explain this clearly:\n\n"
                "This concept has a few key parts to understand. The best way to approach it "
                "is step by step — starting with the fundamentals and building up. "
                "What aspect would you like to dig into first?"
            )

        response_text = await _get_llm_response(ws, prompt_messages, _smart_fallback(message))

        # Store in session
        session["messages"].append({"role": "user", "content": message})
        session["messages"].append({"role": "assistant", "content": response_text, "agent": agent_name})

        # Extract topic from first substantive user message
        if session["topic"] is None and agent_name not in ("OnboardingAgent",) and message:
            session["topic"] = message[:80]
        elif session["topic"] is None and turn == 1:
            session["topic"] = message[:80]

        await ws.send_json({"type": "result", "content": response_text, "agent": agent_name})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@app.websocket("/api/v1/chat/ws")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            d = await ws.receive_json()
            msg = d.get("message", d.get("content", ""))
            await ws.send_json({"type":"thinking","content":"🤔 Processing..."})
            await asyncio.sleep(0.3)
            await ws.send_json({"type":"start"})
            await ws_stream(ws, pick(msg))
            await ws.send_json({"type":"end","agent":"ChatAgent"})
    except WebSocketDisconnect: pass

@app.websocket("/api/v1/solve/ws")
async def solve_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            d = await ws.receive_json()
            q = d.get("message", d.get("query", ""))
            for log,delay in [
                ("🔍 InvestigateAgent: Scanning knowledge base...", 0.35),
                ("📚 Found 3 relevant sources, extracting...", 0.25),
                ("✏️ NoteAgent: Synthesizing information...", 0.3),
                ("⚙️ SolveAgent: Building solution...", 0.4),
                ("✅ PrecisionAnswerAgent: Verifying correctness...", 0.3),
            ]:
                await ws.send_json({"type":"log","level":"info","content":log})
                await asyncio.sleep(delay)
            await ws.send_json({"type":"start","agent":"SolveAgent"})
            await ws_stream(ws, pick(q))
            await ws.send_json({"type":"end","agent":"SolveAgent"})
    except WebSocketDisconnect: pass

@app.websocket("/api/v1/research/run")
async def research_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            d = await ws.receive_json()
            topic = d.get("topic", d.get("query", "systems programming"))
            for msg,delay in [
                ("🗂️ RephraseAgent: Clarifying scope...", 0.4),
                (f"🔬 DecomposeAgent: Breaking into 5 subtopics...", 0.5),
                ("🔍 ResearchAgent: Investigating subtopic 1/5...", 0.5),
                ("🔍 ResearchAgent: Investigating subtopic 2/5...", 0.5),
                ("🔍 ResearchAgent: Investigating subtopic 3/5...", 0.4),
                ("📝 NoteAgent: Synthesizing findings...", 0.4),
                ("📄 ReportingAgent: Writing report...", 0.6),
                ("🔗 Adding citations...", 0.3),
            ]:
                await ws.send_json({"type":"progress","content":msg})
                await asyncio.sleep(delay)
            resp = RESPONSES["research_systems"] if any(w in topic.lower() for w in ["system","c++","rust","go","kernel"]) else RESPONSES["research_systems"]
            await ws.send_json({"type":"report_start"})
            await ws_stream(ws, resp, "report_content")
            await ws.send_json({"type":"report_end","word_count":len(resp.split())})
    except WebSocketDisconnect: pass

@app.websocket("/api/v1/guide/session")
async def guide_ws(ws: WebSocket):
    await ws.accept()
    sid = str(uuid.uuid4())
    WELCOME = """Welcome to **Guided Learning**! I am your personal AI tutor.

I adapt to your level and pace. I can:
- Explain any CS concept from scratch
- Generate interactive lessons with live quizzes
- Track your mastery across topics
- Use Socratic questioning to deepen understanding

**I specialise in:** Systems Programming (C++, Rust, Go), Algorithms & Data Structures, OS concepts.

What topic would you like to master? Tell me your current level and I will start from there!"""
    try:
        while True:
            d = await ws.receive_json()
            action = d.get("action","chat")
            message = d.get("message","")
            if action == "start":
                await ws.send_json({"type":"session_started","session_id":sid})
                await asyncio.sleep(0.2)
                await ws.send_json({"type":"message","role":"assistant","content":WELCOME})
            elif action == "chat":
                await ws.send_json({"type":"typing"})
                await asyncio.sleep(0.4)
                await ws.send_json({"type":"message","role":"assistant","content":pick(message)})
            elif action == "generate_lesson":
                await ws.send_json({"type":"generating"})
                await asyncio.sleep(0.7)
                await ws.send_json({"type":"lesson","html":make_lesson(message or "Recursion"),"title":f"Lesson: {message or 'Recursion'}"})
    except WebSocketDisconnect: pass

@app.websocket("/api/v1/ideagen/ws")
async def idea_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            d = await ws.receive_json()
            topic = d.get("topic", d.get("message","systems programming"))
            for msg,delay in [
                ("🧠 MaterialOrganizerAgent: Analysing profile...", 0.4),
                ("💡 IdeaGenerationAgent: Generating ideas...", 0.5),
                ("📊 Ranking by feasibility...", 0.3),
            ]:
                await ws.send_json({"type":"progress","content":msg})
                await asyncio.sleep(delay)
            await ws.send_json({"type":"start"})
            await ws_stream(ws, RESPONSES["ideas"])
            await ws.send_json({"type":"end"})
    except WebSocketDisconnect: pass

@app.websocket("/api/v1/co_writer/session")
async def cow_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            d = await ws.receive_json()
            await ws.send_json({"type":"thinking","content":"NarratorAgent analysing context..."})
            await asyncio.sleep(0.4)
            content = d.get("content",d.get("message",""))
            cont = """

## AI-Generated Continuation

Building on your content, here are the next logical sections:

**Expanding on the core concept:**
The implementation reveals subtle complexities when handling edge cases. Consider boundary conditions: what happens with an empty collection, a single element, or integer overflow at maximum values?

**Code example for the edge cases:**
```python
def robust_solution(data):
    # Handle edge cases first
    if data is None: raise ValueError("Input cannot be None")
    if len(data) == 0: return []
    if len(data) == 1: return data[:]
    
    # Core algorithm for n >= 2
    return sorted(data)
```

**Performance considerations:**
For large inputs (n > 10⁶), consider streaming approaches or parallel processing. The naive O(n²) approach becomes unacceptable above n ≈ 10⁵.

**Common pitfalls to warn readers about:**
1. Mutating input — always return a new collection unless explicitly modifying in-place
2. Off-by-one errors — double-check loop bounds
3. Ignoring overflow — use 64-bit integers when values may exceed 2^31"""
            await ws.send_json({"type":"start"})
            await ws_stream(ws, cont)
            await ws.send_json({"type":"end","agent":"CoWriterAgent"})
    except WebSocketDisconnect: pass

@app.websocket("/api/v1/question/ws")
async def question_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            d = await ws.receive_json()
            topic = d.get("topic","python")
            for msg,delay in [
                (f"🔍 RetrieveAgent: Finding content on {topic}...", 0.4),
                ("📝 GenerateAgent: Crafting questions...", 0.5),
                ("✅ RelevanceAnalyzer: Validating quality...", 0.3),
            ]:
                await ws.send_json({"type":"progress","content":msg})
                await asyncio.sleep(delay)
            qs = [{"question":q["q"],"type":"multiple_choice","options":q["opts"],
                   "correct_answer":q["opts"][q["ans"]],"explanation":q["exp"]}
                  for q in RESPONSES["questions"]]
            await ws.send_json({"type":"complete","questions":qs,"total":len(qs)})
    except WebSocketDisconnect: pass

def make_lesson(topic: str) -> str:
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>*{{box-sizing:border-box;margin:0;padding:0}}body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4ff;padding:1.5rem;color:#1e293b}}h1{{font-size:1.4rem;color:#1e40af;margin-bottom:1rem}}h2{{font-size:.95rem;font-weight:700;color:#4f46e5;margin-bottom:.5rem}}.card{{background:#fff;border-radius:12px;padding:1.1rem;margin-bottom:.8rem;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid #6366f1}}.tabs{{display:flex;gap:.4rem;margin-bottom:.8rem}}.tab{{padding:.4rem .9rem;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:.82rem;background:#e2e8f0;color:#475569;transition:all .2s}}.tab.on{{background:#6366f1;color:#fff}}.pane{{display:none}}.pane.on{{display:block}}pre{{background:#0f172a;color:#e2e8f0;padding:.9rem;border-radius:8px;overflow-x:auto;font-size:.8rem;line-height:1.6;margin:.5rem 0}}.btn{{background:#6366f1;color:#fff;border:none;padding:.4rem 1rem;border-radius:7px;cursor:pointer;font-size:.82rem;margin-top:.5rem;font-weight:600}}.res{{display:none;padding:.5rem .7rem;border-radius:7px;margin-top:.5rem;font-size:.82rem}}.ok{{background:#dcfce7;color:#166534}}.no{{background:#fee2e2;color:#991b1b}}.opt{{display:block;margin:.3rem 0;cursor:pointer;font-size:.85rem}}</style>
</head><body>
<h1>🎓 {topic}</h1>
<div class="tabs"><button class="tab on" data-t="learn">📖 Learn</button><button class="tab" data-t="code">💻 Code</button><button class="tab" data-t="quiz">🧠 Quiz</button></div>
<div id="learn" class="pane on">
<div class="card"><h2>Core Concept</h2><p><strong>{topic}</strong> is fundamental to computer science. It appears in algorithms, data structures, and system design across every programming language.</p></div>
<div class="card"><h2>Key Properties</h2><ul style="padding-left:1.2rem;margin-top:.4rem"><li>Deterministic — same input always produces same output</li><li>Composable — can be combined with other techniques</li><li>Analysable — time and space complexity are measurable</li></ul></div>
</div>
<div id="code" class="pane">
<div class="card"><h2>Python Example</h2>
<pre><code># {topic} implementation
def solution(data):
    if not data: return []
    return sorted(data)  # O(n log n)

print(solution([5,2,8,1]))  # [1,2,5,8]</code></pre>
</div></div>
<div id="quiz" class="pane">
<div class="card"><h2>Quick Quiz</h2>
<p style="margin-bottom:.6rem">What is the optimal time complexity for sorting?</p>
<label class="opt"><input type="radio" name="q" value="a"> O(n²)</label>
<label class="opt"><input type="radio" name="q" value="b"> O(n log n)</label>
<label class="opt"><input type="radio" name="q" value="c"> O(1)</label>
<button class="btn" id="sub">Check Answer</button>
<div id="res" class="res"></div>
</div></div>
<script>
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",function(){{var t=this.dataset.t;document.querySelectorAll(".tab").forEach(x=>x.classList.remove("on"));document.querySelectorAll(".pane").forEach(x=>x.classList.remove("on"));this.classList.add("on");document.getElementById(t).classList.add("on")}}));
document.getElementById("sub").addEventListener("click",function(){{var s=document.querySelector("input[name=q]:checked"),r=document.getElementById("res");r.style.display="block";if(!s){{r.className="res no";r.textContent="Select an answer!";return}}r.className=s.value==="b"?"res ok":"res no";r.textContent=s.value==="b"?"Correct! O(n log n) is the theoretical lower bound for comparison-based sorting.":"Not quite — O(n log n) is the answer (merge sort / heap sort achieve this)"}});
</script>
</body></html>"""

@app.websocket("/api/v1/knowledge/{kb_name}/progress/ws")
async def kb_progress_ws(ws: WebSocket, kb_name: str):
    await ws.accept()
    try:
        if kb_name in _kb_processing:
            # Stream simulated processing progress for a newly created KB
            stages = [
                (1,  "upload",   "Uploading documents...",        10),
                (2,  "chunking", "Splitting into chunks...",       30),
                (2,  "chunking", "Processing text...",             50),
                (1,  "indexing", "Building vector index...",       70),
                (1,  "indexing", "Extracting knowledge graph...",  85),
                (1,  "indexing", "Finalising...",                  95),
            ]
            for delay, stage, msg, pct in stages:
                await asyncio.sleep(delay)
                await ws.send_json({
                    "type": "progress",
                    "data": {"stage": stage, "message": msg,
                             "progress_percent": pct, "timestamp": time.time()}
                })
            # Wait until background task marks it ready (up to 12s)
            for _ in range(24):
                await asyncio.sleep(0.5)
                kb_entry = next((k for k in _kbs if k["name"] == kb_name), None)
                if kb_entry and kb_entry.get("status") == "ready":
                    break
            await ws.send_json({
                "type": "progress",
                "data": {"stage": "completed", "message": "Knowledge base ready!",
                         "progress_percent": 100, "timestamp": time.time()}
            })
        else:
            # Already-ready KB: just confirm status immediately
            await ws.send_json({"type": "progress", "status": "ready", "progress_percent": 100, "kb_name": kb_name})

        # Keep-alive until client disconnects
        while True:
            await asyncio.sleep(30)
            await ws.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass

# ── VISUAL GENERATION ─────────────────────────────────────────────────────────

_VISUAL_AGENT_SYSTEM = """You are VisualAgent inside DeepTutor. Your job: generate a complete self-contained
HTML5 canvas animation AND a structured step-by-step explanation for ANY topic.

OUTPUT FORMAT — you MUST respond with valid JSON only, no prose outside the JSON:
{
  "steps": [
    {"n": 1, "title": "...", "body": "...", "canvas_note": "what to highlight at this step"},
    ...up to 6 steps...
  ],
  "simulation_html": "<!DOCTYPE html>...(full standalone HTML with canvas+JS animation)..."
}

SIMULATION RULES:
- Self-contained: one HTML file, no external imports, no CDN links
- Canvas size: 640×360, background #0f172a (dark slate)
- Use requestAnimationFrame loop. Animate continuously.
- Colors: indigo #6366f1, cyan #22d3ee, emerald #10b981, white #f8fafc
- Label key objects with white text (ctx.fillText)
- Keep code under 200 lines. Comment each section briefly.
- For physics: show gravity/forces with arrows and labels
- For CS/algorithms: animate data structures step changes
- For chemistry: draw molecules as circles with bond lines
- For math: plot functions, animate proofs geometrically
- For biology: draw simplified diagrams with motion

STEP RULES:
- 4 to 6 steps maximum
- Each "body" is 1-2 plain sentences, no markdown
- "canvas_note" describes what the animation shows at that step (1 sentence)"""


async def _call_ollama_json(model: str, messages: list, base_url: str) -> dict:
    """Non-streaming Ollama call that expects JSON back. Returns parsed dict or error dict."""
    host = base_url.rstrip("/")
    if host.endswith("/v1"):
        host = host[:-3]
    url = f"{host}/api/chat"
    try:
        payload = {"model": model, "messages": messages, "stream": False,
                   "options": {"temperature": 0.7, "num_predict": 3000}}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(url, json=payload)
            if r.status_code != 200:
                return {"error": f"Ollama returned {r.status_code}"}
            raw = r.json().get("message", {}).get("content", "")
            # Strip markdown code fences if the model added them
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1]
                raw = raw.rsplit("```", 1)[0]
            return json.loads(raw)
    except json.JSONDecodeError as e:
        return {"error": f"JSON parse error: {e}", "raw": raw}
    except Exception as e:
        return {"error": str(e)}


async def _fetch_video_id(topic: str) -> str | None:
    """Try Invidious public API to get a YouTube video ID for the topic. No API key needed."""
    instances = [
        "https://inv.nadeko.net",
        "https://invidious.privacydev.net",
        "https://yt.cdaut.de",
    ]
    query = f"{topic} explained"
    for base in instances:
        try:
            url = f"{base}/api/v1/search?q={query}&type=video&sort_by=relevance"
            async with httpx.AsyncClient(timeout=6.0) as client:
                r = await client.get(url, headers={"Accept": "application/json"})
                if r.status_code == 200:
                    results = r.json()
                    if results and isinstance(results, list):
                        return results[0].get("videoId")
        except Exception:
            continue
    return None


@app.post("/api/v1/visual/generate")
async def visual_generate(body: dict):
    """Generate step-by-step explanation + canvas simulation + YouTube video ID for a topic."""
    topic = (body.get("topic") or "").strip()
    if not topic:
        return {"error": "topic is required"}

    active_id = _active_configs.get("llm")
    active_llm = next((c for c in _llm_configs if c["id"] == active_id), None)

    if not active_llm or active_llm.get("provider") not in ("ollama", "lm_studio"):
        return {"error": "No LLM configured. Go to Settings and connect Ollama."}

    messages = [
        {"role": "system", "content": _VISUAL_AGENT_SYSTEM},
        {"role": "user", "content": f"Topic: {topic}"},
    ]

    llm_result, video_id = await asyncio.gather(
        _call_ollama_json(active_llm["model"], messages, active_llm["base_url"]),
        _fetch_video_id(topic),
    )

    if "error" in llm_result:
        return {"error": llm_result["error"]}

    return {
        "topic": topic,
        "steps": llm_result.get("steps", []),
        "simulation_html": llm_result.get("simulation_html", ""),
        "video_id": video_id,
    }


if __name__ == "__main__":
    import uvicorn
    print("NexusLearn API starting on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="warning")


# ── SUPERINTENDENT: Unified routing endpoint ──────────────────────────────────
# All student messages flow through here. The Superintendent decides which
# of the 7 agents handles the message, enforces mastery gates, and injects
# shared context. The /api/v1/chat WebSocket above is kept for backwards-compat.

@app.websocket("/api/v1/nexus/ws")
async def nexus_ws(ws: WebSocket):
    """
    Primary NexusLearn WebSocket with Superintendent routing.
    Falls back to direct Ollama multi-agent routing if Superintendent unavailable.

    Client sends:
        {"message": "...", "student_id": "...", "session_id": "..."}

    Server streams back (compatible with existing frontend format):
        {"type": "thinking", "content": "..."}
        {"type": "start"}
        {"type": "delta", "content": "..."}
        {"type": "end", "agent": "...", "voice": "...", "metadata": {...}}
    """
    await ws.accept()
    try:
        while True:
            d = await ws.receive_json()
            msg = d.get("message", d.get("content", "")).strip()
            student_id = d.get("student_id", "student_001")
            session_id = d.get("session_id", f"session_{int(time.time())}")
            language = d.get("language", "en")

            if not msg:
                continue

            superintendent = _get_superintendent()

            if superintendent:
                # ── Superintendent path (full hierarchy) ──
                await ws.send_json({"type": "thinking", "content": "🤔 Routing to best agent..."})
                try:
                    response = await superintendent.route(
                        student_id=student_id,
                        session_id=session_id,
                        message=msg,
                        language=language,
                    )
                    await ws.send_json({"type": "start"})
                    content = response.content
                    chunk_size = 40
                    for i in range(0, len(content), chunk_size):
                        await ws.send_json({"type": "delta", "content": content[i:i+chunk_size]})
                        await asyncio.sleep(0.01)
                    await ws.send_json({
                        "type": "end",
                        "agent": response.agent_name,
                        "voice": response.voice_persona,
                        "speak_text": response.speak_text,
                        "content_type": response.content_type,
                        "next_action": response.next_suggested_action,
                        "page_actions": response.page_actions,
                        "remotion_config": response.remotion_config,
                        "metadata": {
                            "mastery": superintendent.get_mastery(student_id, "general"),
                        }
                    })
                except Exception as e:
                    await ws.send_json({"type": "error", "content": f"Superintendent error: {e}"})
                    # Fallback to direct Ollama routing via existing chat handler
                    await ws.send_json({"type": "thinking", "content": "⚡ Using direct routing fallback..."})
                    await asyncio.sleep(0.2)
                    await ws.send_json({"type": "start"})
                    await ws.send_json({"type": "delta", "content": await _get_llm_response(msg, "TutorAgent")})
                    await ws.send_json({"type": "end", "agent": "TutorAgent", "voice": "emma"})
            else:
                # ── No Superintendent — delegate to existing Ollama multi-agent WS handler logic ──
                # Re-use the same routing logic from /api/v1/chat by forwarding internally
                await ws.send_json({"type": "thinking", "content": "🤔 Routing via Ollama agents..."})
                await asyncio.sleep(0.2)
                await ws.send_json({"type": "start"})
                response = await _get_llm_response(msg, "TutorAgent")
                await ws.send_json({"type": "delta", "content": response})
                await ws.send_json({"type": "end", "agent": "TutorAgent", "voice": "emma"})

    except WebSocketDisconnect:
        pass


@app.get("/api/v1/nexus/mastery")
async def get_mastery_status(student_id: str = "student_001"):
    """Get current mastery scores for a student."""
    superintendent = _get_superintendent()
    if superintendent:
        topics = ["recursion", "linked-lists", "sorting", "trees", "graphs",
                  "dynamic-programming", "oop", "arrays", "strings", "complexity"]
        scores = {t: superintendent.get_mastery(student_id, t) for t in topics}
        return {"student_id": student_id, "mastery": scores}
    return {"student_id": student_id, "mastery": {}}


# ── LIVEKIT VOICE SESSIONS ────────────────────────────────────────────────────

@app.post("/api/v1/voice/token")
async def get_voice_token(d: dict = {}):
    """
    Generate a LiveKit room token for the VoiceTeacher frontend component.
    Returns error payload if LiveKit or voice_teacher_agent is unavailable —
    the frontend handles this gracefully (shows setup guide instead of crashing).
    """
    student_id = d.get("student_id", "student_001")
    room_name = d.get("room_name", f"nexuslearn-{student_id}")

    try:
        from backend.agents.teacher.voice_teacher_agent import create_room_token
        token = create_room_token(room_name, student_id, is_agent=False)
        if token:
            return {
                "token": token,
                "room": room_name,
                "url": "ws://localhost:7880",
                "student_id": student_id,
            }
    except Exception:
        pass

    # Graceful fallback: LiveKit not running
    return {
        "error": "LiveKit not available",
        "message": "Start LiveKit: docker run --rm -p 7880:7880 livekit/livekit-server --dev",
        "room": room_name,
    }


@app.post("/api/v1/voice/start-agent")
async def start_voice_agent(d: dict = {}):
    """
    Spawn the voice teacher agent for a LiveKit room.
    Best-effort — frontend continues even if this fails.
    """
    student_id = d.get("student_id", "student_001")
    room_name = d.get("room_name", f"nexuslearn-{student_id}")

    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "backend.agents.teacher.voice_teacher_agent",
             "--room", room_name, "--student", student_id],
            cwd=_project_root,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return {"status": "started", "room": room_name, "pid": proc.pid}
    except Exception as e:
        return {"status": "error", "error": str(e)}
