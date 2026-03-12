import { NextRequest, NextResponse } from "next/server";

const NEXUSLEARN_API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export async function POST(req: NextRequest) {
  try {
    const { message, history, student_id, session_id } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    const sid = student_id || "student_001";
    const sessId = session_id || `session_${Date.now()}`;

    // Primary: NexusLearn backend with Superintendent routing
    // Uses /api/v1/nexus/ws WebSocket internally, but for simple REST we poll /api/v1/chat
    try {
      const resp = await fetch(`${NEXUSLEARN_API}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          student_id: sid,
          session_id: sessId,
          history: history || [],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const data = await resp.json();
        return NextResponse.json({
          response: data.response || data.content,
          agent: data.agent || "chat",
          voice: data.voice_persona || "emma",
          speak_text: data.speak_text || data.response,
          next_action: data.next_suggested_action || "",
        });
      }
    } catch { /* fallthrough */ }

    // Fallback: Ollama (free, offline)
    try {
      const systemPrompt = `You are NexusLearn, an expert AI programming tutor. 
You guide students through concepts step by step, with examples and encouragement.
When explaining code, walk through it line by line. Be warm, patient, and clear.`;
      const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "qwen2.5:7b",
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
        return NextResponse.json({
          response: data.message?.content || "No response.",
          agent: "chat",
          voice: "emma",
        });
      }
    } catch { /* fallthrough */ }

    return NextResponse.json({
      response: "⚠️ **No AI backend connected.**\n\nStart NexusLearn with:\n```\n./start_all.sh\n```",
      agent: "chat",
      voice: "emma",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
