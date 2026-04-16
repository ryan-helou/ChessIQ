import { NextRequest, NextResponse } from "next/server";
import { STOCKFISH_BACKEND_URL } from "@/lib/stockfish-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { pgn?: string; depth?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { pgn, depth = 12 } = body;
  if (!pgn || typeof pgn !== "string") {
    return NextResponse.json({ error: "pgn is required" }, { status: 400 });
  }

  const controller = new AbortController();
  const maxLifetime = setTimeout(() => controller.abort(), 3 * 60 * 1000);
  req.signal.addEventListener("abort", () => {
    clearTimeout(maxLifetime);
    controller.abort();
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${STOCKFISH_BACKEND_URL}/api/analyze/game-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ pgn, depth }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(maxLifetime);
    const message = err instanceof Error ? err.message : "upstream fetch failed";
    return new NextResponse(`event: error\ndata: ${JSON.stringify({ message })}\n\n`, {
      status: 502,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(maxLifetime);
    return NextResponse.json(
      { error: `upstream status ${upstream.status}` },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
