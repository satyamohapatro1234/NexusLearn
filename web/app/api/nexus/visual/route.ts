import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.DEEPTUTOR_API_URL || "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const resp = await fetch(`${BACKEND_URL}/api/v1/visual/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000), // LLM can be slow generating canvas code
    });
    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
