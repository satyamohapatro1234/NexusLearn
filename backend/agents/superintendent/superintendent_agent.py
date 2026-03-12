"""
NexusLearn Superintendent Agent
================================
The single entry point for all student interactions.
Routes every request through mastery gates, injects context,
picks the voice persona, and calls the correct domain agent.

This is the brain. No agent is called directly except through here.

Architecture:
    Student message
        → classify_intent (fast: keywords first, LLM fallback)
        → check mastery gate (YAML config)
        → inject notebook context + BKT score
        → assign voice persona
        → invoke domain agent
        → collect response + state updates
        → write to notebook
        → return enriched AgentResponse
"""

import logging
import time
from pathlib import Path
from typing import Optional

import yaml

from backend.agents.superintendent.contracts import (
    AgentName,
    AgentResponse,
    BKTEvent,
    StudentRequest,
    VoicePersona,
)
from backend.agents.superintendent.intent_classifier import classify_intent

logger = logging.getLogger("Superintendent")

# ── Config ────────────────────────────────────────────────────────────────────
_CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "mastery_gates.yaml"


def _load_config() -> dict:
    try:
        with open(_CONFIG_PATH) as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        logger.warning(f"mastery_gates.yaml not found at {_CONFIG_PATH}, using defaults")
        return {
            "mastery_gates": {"chat": 0.0, "guide": 0.0, "solve": 0.4, "question": 0.4,
                               "co_writer": 0.5, "research": 0.6, "ideagen": 0.7},
            "solve_hints_threshold": 0.7,
            "voice_personas": {"guide": "emma", "question": "grace", "solve": "carter",
                                "research": "frank", "chat": "davis", "ideagen": "grace",
                                "co_writer": "mike"},
        }


_config = _load_config()
MASTERY_GATES: dict = _config.get("mastery_gates", {})
SOLVE_HINTS_THRESHOLD: float = _config.get("solve_hints_threshold", 0.7)
VOICE_PERSONAS: dict = _config.get("voice_personas", {})
QUESTION_DIFFICULTY: dict = _config.get("question_difficulty", {"easy": 0.0, "medium": 0.55, "hard": 0.75})


# ── In-memory stores (replace with DB in production) ─────────────────────────
_mastery_scores: dict[str, dict[str, float]] = {}  # {student_id: {topic: score}}
_notebooks: dict[str, list[str]] = {}              # {student_id: [entry, ...]}
_session_goals: dict[str, str] = {}                # {session_id: goal}


def get_mastery(student_id: str, topic: str) -> float:
    return _mastery_scores.get(student_id, {}).get(topic, 0.0)


def update_mastery(student_id: str, topic: str, correct: bool) -> float:
    """
    Simplified BKT update.
    Full BKT is in web/lib/bkt.ts — this mirrors that logic in Python.
    """
    scores = _mastery_scores.setdefault(student_id, {})
    current = scores.get(topic, 0.1)

    # BKT-style update: correct → increase, incorrect → decrease
    if correct:
        # P(L_n) = P(L_{n-1}) + (1 - P(L_{n-1})) * 0.3  (learning gain)
        new_score = current + (1 - current) * 0.30
    else:
        # P(L_n) = P(L_{n-1}) * 0.7  (partial slip)
        new_score = current * 0.70

    new_score = max(0.0, min(1.0, new_score))
    scores[topic] = new_score
    logger.info(f"BKT update: student={student_id}, topic={topic}, {current:.2f}→{new_score:.2f}")
    return new_score


def write_notebook(student_id: str, entry: str):
    """Append an entry to the student's learning notebook."""
    entries = _notebooks.setdefault(student_id, [])
    timestamp = time.strftime("%H:%M")
    entries.append(f"[{timestamp}] {entry}")
    # Keep last 50 entries
    if len(entries) > 50:
        entries.pop(0)


def get_notebook_context(student_id: str, n: int = 3) -> str:
    """Get last n notebook entries as context string."""
    entries = _notebooks.get(student_id, [])
    recent = entries[-n:] if entries else []
    return "\n".join(recent) if recent else "No previous context for this student."


# ── Main Routing Logic ────────────────────────────────────────────────────────
async def route(
    student_id: str,
    session_id: str,
    message: str,
    language: str = "en",
) -> AgentResponse:
    """
    The main entry point. All student messages pass through here.

    1. Classify intent → agent + topic
    2. Check mastery gate
    3. Enrich request with context
    4. Invoke domain agent
    5. Update notebook + BKT
    6. Return response
    """
    # Step 1: Classify intent
    intent = await classify_intent(message)
    logger.info(f"Intent: agent={intent.agent}, topic={intent.topic}, confidence={intent.confidence:.2f}")

    # Step 2: Get mastery + check gate
    mastery = get_mastery(student_id, intent.topic)
    required_mastery = MASTERY_GATES.get(intent.agent, 0.0)

    if mastery < required_mastery:
        return _redirect_to_guide(
            student_id=student_id,
            session_id=session_id,
            message=message,
            topic=intent.topic,
            blocked_agent=intent.agent,
            mastery=mastery,
            required=required_mastery,
        )

    # Step 3: Build enriched request
    voice = VOICE_PERSONAS.get(intent.agent, "emma")

    # Determine question difficulty
    question_difficulty = "easy"
    for diff, threshold in sorted(QUESTION_DIFFICULTY.items(), key=lambda x: x[1], reverse=True):
        if mastery >= threshold:
            question_difficulty = diff
            break

    # Determine solve hints
    hints_enabled = mastery < SOLVE_HINTS_THRESHOLD

    notebook_ctx = get_notebook_context(student_id, n=3)
    session_goal = _session_goals.get(session_id, f"Learning {intent.topic}")

    request = StudentRequest(
        student_id=student_id,
        session_id=session_id,
        message=message,
        topic=intent.topic,
        mastery_score=mastery,
        notebook_context=notebook_ctx,
        session_goal=session_goal,
        voice_persona=voice,
        assigned_agent=intent.agent,
    )

    # Step 4: Invoke the domain agent
    response = await _invoke_agent(intent.agent, request, hints_enabled, question_difficulty, language)

    # Step 5: Update notebook
    if response.notebook_entry:
        write_notebook(student_id, f"{intent.agent.capitalize()}: {response.notebook_entry}")

    # Step 6: BKT update if applicable
    if response.bkt_update:
        new_mastery = update_mastery(student_id, intent.topic, response.bkt_update.correct)
        write_notebook(
            student_id,
            f"BKT: mastery updated {mastery:.2f}→{new_mastery:.2f} (topic: {intent.topic})"
        )

    return response


def _redirect_to_guide(
    student_id: str,
    session_id: str,
    message: str,
    topic: str,
    blocked_agent: str,
    mastery: float,
    required: float,
) -> AgentResponse:
    """
    Student tried to access an agent they haven't unlocked yet.
    Redirect them to the Guide with a friendly explanation.
    """
    mastery_pct = int(mastery * 100)
    required_pct = int(required * 100)

    speak_text = (
        f"Let's build your foundation first! "
        f"You're at {mastery_pct}% mastery for {topic}, "
        f"and to unlock that feature you'll need {required_pct}%. "
        f"Let me teach you more — then we can try that together."
    )

    content = (
        f"**Let's strengthen your foundation first.** 🎯\n\n"
        f"You're at **{mastery_pct}%** mastery for *{topic}*, "
        f"and this feature unlocks at **{required_pct}%**.\n\n"
        f"Let me guide you through some more material — you'll get there soon!"
    )

    logger.info(
        f"Gate blocked: student={student_id}, wanted={blocked_agent}, "
        f"mastery={mastery:.2f}, required={required:.2f}"
    )

    write_notebook(
        student_id,
        f"Gate: blocked {blocked_agent} (mastery={mastery:.2f}, need={required:.2f}). Redirecting to guide."
    )

    return AgentResponse(
        agent_name="guide",
        content=content,
        content_type="text",
        voice_persona="emma",
        speak_text=speak_text,
        next_suggested_agent="guide",
        next_suggested_action=f"Learn more about {topic} to unlock more features",
        is_redirect=True,
        redirect_reason=f"Mastery {mastery:.0%} < required {required:.0%} for {blocked_agent}",
    )


async def _invoke_agent(
    agent_name: AgentName,
    request: StudentRequest,
    hints_enabled: bool,
    question_difficulty: str,
    language: str,
) -> AgentResponse:
    """
    Invoke the correct domain agent with the enriched request.
    Falls back to a helpful stub if the real agent is unavailable.
    """
    voice = VOICE_PERSONAS.get(agent_name, "emma")

    # Build the context prefix injected into every agent's prompt
    context_prefix = _build_context_prefix(request, hints_enabled, question_difficulty)

    try:
        if agent_name == "chat":
            return await _invoke_chat(request, context_prefix, voice, language)
        elif agent_name == "guide":
            return await _invoke_guide(request, context_prefix, voice, language)
        elif agent_name == "solve":
            return await _invoke_solve(request, context_prefix, voice, hints_enabled, language)
        elif agent_name == "question":
            return await _invoke_question(request, context_prefix, voice, question_difficulty, language)
        elif agent_name == "research":
            return await _invoke_research(request, context_prefix, voice, language)
        elif agent_name == "ideagen":
            return await _invoke_ideagen(request, context_prefix, voice, language)
        elif agent_name == "co_writer":
            return await _invoke_co_writer(request, context_prefix, voice, language)
        else:
            return _stub_response(agent_name, request.message, voice)
    except Exception as e:
        logger.error(f"Agent {agent_name} failed: {e}")
        return _stub_response(agent_name, request.message, voice, error=str(e))


def _build_context_prefix(request: StudentRequest, hints_enabled: bool, question_difficulty: str) -> str:
    """
    Context injected into every agent's system prompt.
    This is how the Superintendent gives each agent shared memory.
    """
    lines = [
        f"=== SUPERINTENDENT CONTEXT ===",
        f"Student ID: {request.student_id}",
        f"Topic: {request.topic}",
        f"Mastery: {request.mastery_score:.0%}",
        f"Session goal: {request.session_goal}",
        f"",
        f"Recent history:",
        request.notebook_context,
        f"",
    ]
    if hints_enabled:
        lines.append("INSTRUCTION: Student is still learning — provide hints and explanations, not just answers.")
    if question_difficulty:
        lines.append(f"Question difficulty: {question_difficulty}")
    lines.append("=== END CONTEXT ===\n")
    return "\n".join(lines)


# ── Domain Agent Invokers ─────────────────────────────────────────────────────
# Each one tries to use the real DeepTutor agent, falls back to stub if unavailable.

async def _invoke_chat(request: StudentRequest, ctx: str, voice: str, lang: str) -> AgentResponse:
    try:
        from backend.agents.chat.chat_agent import ChatAgent
        agent = ChatAgent(module_name="chat", agent_name="chat_agent", language=lang)
        response_text = await agent.process(f"{ctx}\n{request.message}")
        return AgentResponse(
            agent_name="chat",
            content=response_text,
            voice_persona=voice,
            speak_text=response_text,
            notebook_entry=f"Chat: {request.message[:80]}",
        )
    except Exception as e:
        logger.debug(f"ChatAgent unavailable: {e}")
        return _stub_response("chat", request.message, voice)


async def _invoke_guide(request: StudentRequest, ctx: str, voice: str, lang: str) -> AgentResponse:
    try:
        from backend.agents.guide.guide_manager import GuideManager
        manager = GuideManager(language=lang)
        result = await manager.process(
            user_input=request.message,
            context=ctx,
            topic=request.topic,
        )
        content = result.get("content", result) if isinstance(result, dict) else str(result)
        return AgentResponse(
            agent_name="guide",
            content=content,
            content_type="html_lesson",
            voice_persona=voice,
            speak_text=_html_to_speech_text(content),
            notebook_entry=f"Guide taught: {request.topic} — {request.message[:60]}",
            next_suggested_agent="question",
            next_suggested_action="Take a quick quiz to test your understanding",
        )
    except Exception as e:
        logger.debug(f"GuideManager unavailable: {e}")
        return _stub_response("guide", request.message, voice)


async def _invoke_solve(
    request: StudentRequest, ctx: str, voice: str, hints_enabled: bool, lang: str
) -> AgentResponse:
    hint_instruction = (
        "Guide the student step by step with hints. Don't give the full solution immediately."
        if hints_enabled else
        "Student has solid mastery. Provide the solution and explain key concepts."
    )
    enriched_msg = f"{ctx}\nINSTRUCTION: {hint_instruction}\n\nStudent: {request.message}"
    try:
        from backend.agents.solve.main_solver import SolveAgent
        agent = SolveAgent(module_name="solve", agent_name="solve_agent", language=lang)
        result = await agent.process(enriched_msg)
        content = result.get("content", result) if isinstance(result, dict) else str(result)
        return AgentResponse(
            agent_name="solve",
            content=content,
            content_type="code",
            voice_persona=voice,
            speak_text=_code_to_speech_text(content),
            notebook_entry=f"Solve: attempted {request.topic} — hints={'on' if hints_enabled else 'off'}",
        )
    except Exception as e:
        logger.debug(f"SolveAgent unavailable: {e}")
        return _stub_response("solve", request.message, voice)


async def _invoke_question(
    request: StudentRequest, ctx: str, voice: str, difficulty: str, lang: str
) -> AgentResponse:
    enriched_msg = f"{ctx}\nGenerate a {difficulty} difficulty question about {request.topic}.\nStudent request: {request.message}"
    try:
        from backend.agents.question.question_agent import QuestionAgent
        agent = QuestionAgent(module_name="question", agent_name="question_agent", language=lang)
        result = await agent.process(enriched_msg)
        content = result.get("content", result) if isinstance(result, dict) else str(result)
        return AgentResponse(
            agent_name="question",
            content=content,
            content_type="quiz",
            voice_persona=voice,
            speak_text=content,
            notebook_entry=f"Question: {difficulty} difficulty quiz on {request.topic}",
            bkt_update=BKTEvent(
                student_id=request.student_id,
                topic=request.topic,
                correct=True,   # Will be updated when student answers
                confidence=0.0  # Zero confidence until answer received
            ),
        )
    except Exception as e:
        logger.debug(f"QuestionAgent unavailable: {e}")
        return _stub_response("question", request.message, voice)


async def _invoke_research(request: StudentRequest, ctx: str, voice: str, lang: str) -> AgentResponse:
    try:
        from backend.agents.research.research_orchestrator import ResearchOrchestrator
        orch = ResearchOrchestrator(language=lang)
        result = await orch.process(context=ctx, query=request.message)
        content = result.get("content", result) if isinstance(result, dict) else str(result)
        return AgentResponse(
            agent_name="research",
            content=content,
            content_type="text",
            voice_persona=voice,
            speak_text=_truncate_for_speech(content),
            notebook_entry=f"Research: {request.message[:80]}",
        )
    except Exception as e:
        logger.debug(f"ResearchOrchestrator unavailable: {e}")
        return _stub_response("research", request.message, voice)


async def _invoke_ideagen(request: StudentRequest, ctx: str, voice: str, lang: str) -> AgentResponse:
    try:
        from backend.agents.ideagen.ideagen_agent import IdeaGenAgent
        agent = IdeaGenAgent(module_name="ideagen", agent_name="ideagen_agent", language=lang)
        result = await agent.process(f"{ctx}\n{request.message}")
        content = result.get("content", result) if isinstance(result, dict) else str(result)
        return AgentResponse(
            agent_name="ideagen",
            content=content,
            voice_persona=voice,
            speak_text=content,
            notebook_entry=f"IdeaGen: generated ideas for {request.topic}",
        )
    except Exception as e:
        logger.debug(f"IdeaGenAgent unavailable: {e}")
        return _stub_response("ideagen", request.message, voice)


async def _invoke_co_writer(request: StudentRequest, ctx: str, voice: str, lang: str) -> AgentResponse:
    try:
        from backend.agents.co_writer.narrator_agent import NarratorAgent
        agent = NarratorAgent(module_name="co_writer", agent_name="narrator_agent", language=lang)
        result = await agent.process(f"{ctx}\n{request.message}")
        content = result.get("content", result) if isinstance(result, dict) else str(result)
        return AgentResponse(
            agent_name="co_writer",
            content=content,
            content_type="code",
            voice_persona=voice,
            speak_text=_code_to_speech_text(content),
            notebook_entry=f"Co-writer: collaborated on {request.topic}",
        )
    except Exception as e:
        logger.debug(f"CoWriterAgent unavailable: {e}")
        return _stub_response("co_writer", request.message, voice)


# ── Helpers ───────────────────────────────────────────────────────────────────
def _stub_response(agent_name: str, message: str, voice: str, error: str = "") -> AgentResponse:
    """Fallback when the real DeepTutor agent is unavailable."""
    stubs = {
        "chat":     "Hey! I'm here to help you learn. What would you like to work on today?",
        "guide":    f"Let me walk you through that concept step by step. You asked about: {message[:100]}... (connect the full DeepTutor backend to get the real lesson)",
        "solve":    f"Let's solve this together. I'll guide you through: {message[:100]}... (connect the full DeepTutor backend for complete solutions)",
        "research": f"Great question for deep research: {message[:100]}... (connect the full DeepTutor backend for full analysis)",
        "question": "Here's a practice question: What is the time complexity of a binary search on a sorted array of n elements, and why?",
        "ideagen":  "Here are some project ideas you could build to practice this topic: 1) A visualizer 2) A game using these concepts 3) A real-world application",
        "co_writer":"Let's write this together. Share your code or describe what you want to build.",
    }
    content = stubs.get(agent_name, "I'm here to help!")
    if error:
        content += f"\n\n*(Note: Real agent unavailable: {error})*"

    return AgentResponse(
        agent_name=agent_name,
        content=content,
        voice_persona=voice,
        speak_text=content.split("*(Note:")[0].strip(),
        notebook_entry=f"{agent_name}: {message[:60]}",
    )


def _html_to_speech_text(html: str) -> str:
    """Strip HTML tags for TTS."""
    import re
    clean = re.sub(r'<[^>]+>', ' ', html)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return _truncate_for_speech(clean)


def _code_to_speech_text(content: str) -> str:
    """Extract the explanation around code blocks for TTS."""
    import re
    # Remove code blocks — TTS shouldn't read raw code
    clean = re.sub(r'```[\s\S]*?```', ' [code block] ', content)
    clean = re.sub(r'`[^`]+`', ' [inline code] ', clean)
    return _truncate_for_speech(clean.strip())


def _truncate_for_speech(text: str, max_chars: int = 400) -> str:
    """Truncate text to a reasonable length for TTS."""
    if len(text) <= max_chars:
        return text
    # Cut at sentence boundary
    truncated = text[:max_chars]
    last_period = truncated.rfind('.')
    if last_period > max_chars * 0.6:
        return truncated[:last_period + 1]
    return truncated + "..."
