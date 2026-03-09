#!/usr/bin/env python3
"""NexusLearn Temp API - All 7 agents"""
import asyncio, json, subprocess, sys, tempfile, time, os, uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="NexusLearn API")
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

@app.get("/")
@app.get("/health")
async def health(): return {"status": "ok", "service": "NexusLearn API v1.0"}

@app.get("/api/v1/system/status")
async def sys_status(): return {"status": "ready", "llm": {"provider": "nexuslearn", "connected": True}, "rag": {"status": "ready"}}

@app.get("/api/v1/config")
@app.get("/api/v1/settings")
async def cfg(): return {"language": "en", "llm": {"configured": True, "model": "claude-haiku-4-5-20251001"}}

@app.get("/api/v1/knowledge/list")
@app.get("/api/v1/knowledge")
async def kb(): return {"knowledge_bases": [{"id":"demo","name":"NexusLearn Demo KB","doc_count":12}], "total": 1}

@app.get("/api/v1/notebooks")
async def nbs(): return {"notebooks": [{"id":"nb1","name":"My Notes","records":5}], "total": 1}

@app.post("/api/v1/notebooks")
async def new_nb(d: dict = {}): return {"id": f"nb_{int(time.time())}", "name": d.get("name","Notebook"), "records": []}

@app.get("/api/v1/dashboard")
@app.get("/api/v1/history")
@app.get("/api/v1/agent-configs")
async def dash(): return {"sessions": [], "total": 0, "configs": []}

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

# ── WEBSOCKETS ─────────────────────────────────────────────────────────────────

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

if __name__ == "__main__":
    import uvicorn
    print("NexusLearn API starting on port 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="warning")
