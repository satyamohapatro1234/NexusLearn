"""
NexusLearn Agent Contract
Shared dataclasses that define the request/response interface
every agent in the hierarchy must follow.
"""

from dataclasses import dataclass, field
from typing import Optional, Literal


AgentName = Literal["chat", "guide", "solve", "research", "question", "ideagen", "co_writer"]

VoicePersona = Literal["emma", "grace", "carter", "frank", "davis", "mike", "samuel"]


@dataclass
class BKTEvent:
    """A mastery update triggered by an agent response."""
    student_id: str
    topic: str
    correct: bool          # did the student demonstrate correct understanding?
    confidence: float = 1.0  # how confident we are in this signal (0-1)


@dataclass
class StudentRequest:
    """
    The enriched request every agent receives.
    Raw student input is transformed here by the Superintendent
    before routing to a domain agent.
    """
    # From student
    student_id: str
    session_id: str
    message: str

    # Resolved by Superintendent
    topic: str = ""                # e.g. "recursion", "linked-lists"
    mastery_score: float = 0.0    # current BKT mastery for this topic
    notebook_context: str = ""    # last 3 notebook entries as text
    session_goal: str = ""        # what we're working on today
    mode: str = "learn"           # "learn" | "practice" | "solve" | "explore"

    # Voice persona for TTS (injected by Superintendent per agent)
    voice_persona: VoicePersona = "emma"

    # Which agent is handling this (set by Superintendent)
    assigned_agent: AgentName = "chat"


@dataclass
class AgentResponse:
    """
    The enriched response every agent returns.
    Contains content plus metadata for the Superintendent
    to update state and plan the next step.
    """
    agent_name: AgentName
    content: str                          # main text/HTML/code response

    content_type: str = "text"            # "text" | "html_lesson" | "code" | "quiz" | "remotion"
    voice_persona: VoicePersona = "emma"  # which voice should read this
    speak_text: str = ""                  # if different from content (e.g. content is code, speak_text is explanation)

    # State updates
    bkt_update: Optional[BKTEvent] = None
    notebook_entry: Optional[str] = None   # what to write to the notebook

    # Routing hints for Superintendent
    next_suggested_agent: Optional[AgentName] = None
    next_suggested_action: str = ""        # human-readable hint for the UI

    # For Remotion video lessons
    remotion_config: Optional[dict] = None

    # For PageAgent teacher control
    page_actions: list = field(default_factory=list)

    # For redirect (when mastery gate blocks)
    redirect_reason: str = ""
    is_redirect: bool = False
