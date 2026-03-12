"""
NexusLearn Intent Classifier
Single fast LLM call: classifies student message → which agent + topic.
Uses Ollama/local model for zero-cost, offline-first operation.
"""

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger("IntentClassifier")

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "qwen2.5:7b"  # fast, runs on RTX 3060

SYSTEM_PROMPT = """You are a classifier for an AI programming tutor. 
Given a student's message, return ONLY a JSON object with these fields:
- agent: one of [chat, guide, solve, research, question, ideagen, co_writer]
- topic: programming topic as a short slug (e.g. "recursion", "linked-lists", "sorting", "oop", "general")
- confidence: float 0.0 to 1.0

Agent selection rules:
- chat: greetings, off-topic, "how are you", "what can you do"
- guide: "explain", "teach me", "how does", "what is", "I don't understand", "show me how"
- solve: "write", "code", "implement", "debug", "fix", "create a function", "build"
- research: "compare", "deep dive", "analyze", "difference between", "pros and cons"
- question: "quiz me", "test me", "give me a problem", "practice question", "challenge"
- ideagen: "ideas for", "what could I build", "project suggestion", "brainstorm"
- co_writer: "help me write", "improve my code", "refactor", "review my"

Return ONLY the JSON object, no explanation."""


@dataclass
class Intent:
    agent: str
    topic: str
    confidence: float


KEYWORD_RULES = [
    # (keywords, agent, topic_hint)
    (["explain", "teach", "how does", "what is", "don't understand", "show me how", "help me understand"], "guide", None),
    (["quiz", "test me", "practice question", "challenge", "give me a problem"], "question", None),
    (["write", "implement", "code", "build", "create", "debug", "fix this", "function that"], "solve", None),
    (["compare", "difference between", "pros and cons", "deep dive", "analyze"], "research", None),
    (["ideas", "brainstorm", "project", "build something", "what could i"], "ideagen", None),
    (["refactor", "review my", "improve my code", "co-write"], "co_writer", None),
    (["hi", "hello", "hey", "what can you", "how are you", "thanks"], "chat", "general"),
]

TOPIC_KEYWORDS = {
    "recursion": ["recursion", "recursive", "base case", "call itself"],
    "linked-lists": ["linked list", "node", "pointer", "next pointer"],
    "sorting": ["sort", "bubble sort", "merge sort", "quicksort", "insertion sort"],
    "trees": ["tree", "binary tree", "bst", "traversal", "root", "leaf"],
    "graphs": ["graph", "bfs", "dfs", "dijkstra", "node", "edge", "path"],
    "dynamic-programming": ["dynamic programming", "dp", "memoization", "tabulation", "optimal substructure"],
    "oop": ["class", "object", "inheritance", "polymorphism", "encapsulation", "oop"],
    "arrays": ["array", "list", "index", "slice", "append"],
    "strings": ["string", "substring", "palindrome", "anagram", "regex"],
    "complexity": ["time complexity", "big o", "space complexity", "o(n)", "o(log n)"],
}


async def classify_intent(message: str) -> Intent:
    """
    Classify a student message using fast keyword rules first,
    falling back to an LLM call if ambiguous.
    """
    msg_lower = message.lower()

    # 1. Fast keyword classification
    for keywords, agent, topic_hint in KEYWORD_RULES:
        if any(kw in msg_lower for kw in keywords):
            topic = topic_hint or _detect_topic(msg_lower)
            return Intent(agent=agent, topic=topic, confidence=0.85)

    # 2. LLM classification for ambiguous messages
    try:
        intent = await _llm_classify(message)
        if intent.confidence > 0.6:
            return intent
    except Exception as e:
        logger.debug(f"LLM classify failed: {e}")

    # 3. Default fallback
    return Intent(agent="chat", topic=_detect_topic(msg_lower) or "general", confidence=0.5)


def _detect_topic(text: str) -> str:
    """Keyword-based topic detection from student message."""
    for topic, keywords in TOPIC_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            return topic
    return "general"


async def _llm_classify(message: str) -> Intent:
    """Single LLM call for ambiguous classification."""
    payload = {
        "model": DEFAULT_MODEL,
        "prompt": f"Student message: \"{message}\"",
        "system": SYSTEM_PROMPT,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 80},
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(OLLAMA_URL, json=payload)
        resp.raise_for_status()
        raw = resp.json().get("response", "")

    # Extract JSON from response
    match = re.search(r'\{.*?\}', raw, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON in LLM response: {raw}")

    data = json.loads(match.group())
    return Intent(
        agent=data.get("agent", "chat"),
        topic=data.get("topic", "general"),
        confidence=float(data.get("confidence", 0.7)),
    )
