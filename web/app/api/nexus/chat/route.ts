import { NextRequest, NextResponse } from "next/server";

const DEEPTUTOR_URL = process.env.DEEPTUTOR_API_URL || "http://localhost:8000";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // Try DeepTutor backend first
    try {
      const resp = await fetch(`${DEEPTUTOR_URL}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history || [], mode: "solve" }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return NextResponse.json({ response: data.response || data.content });
      }
    } catch { /* fallthrough */ }

    // Fallback: Ollama local LLM (free, no API key)
    try {
      const systemPrompt = `You are NexusLearn, an expert AI tutor. Explain concepts clearly with examples. Help with code, math, and science. Be encouraging. When showing code, explain it line by line.`;
      const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "llama3.2",
          messages: [
            { role: "system", content: systemPrompt },
            ...(history || []),
            { role: "user", content: message },
          ],
          stream: false,
          options: { temperature: 0.7, num_predict: 1024 },
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return NextResponse.json({ response: data.message?.content || "No response." });
      }
    } catch { /* fallthrough */ }

    return NextResponse.json({
      response: "⚠️ **No AI backend connected.** \n\nTo enable AI responses:\n\n**Option 1 — DeepTutor backend (recommended):**\n```\ncd backend && pip install -r requirements.txt && python main.py\n```\n\n**Option 2 — Ollama (free local LLM):**\n```\n# Install from ollama.com then:\nollama pull llama3.2 && ollama serve\n```\n\nThe **Code Studio** and **Mastery Tracking** features work without a backend!",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
