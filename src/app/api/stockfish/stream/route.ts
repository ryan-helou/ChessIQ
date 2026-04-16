import { NextRequest, NextResponse } from "next/server";
import { STOCKFISH_BACKEND_URL } from "@/lib/stockfish-backend";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEN_RE = /^[rnbqkpRNBQKP1-8]+(?:\/[rnbqkpRNBQKP1-8]+){7} [wb] (?:-|[KQkq]+) (?:-|[a-h][36]) \d+ \d+$/;

export async function GET(req: NextRequest) {
  const fen = req.nextUrl.searchParams.get("fen") ?? "";
  const maxDepth = req.nextUrl.searchParams.get("maxDepth") ?? "22";
  const multiPv = req.nextUrl.searchParams.get("multiPv") ?? "8";

  if (!fen || !FEN_RE.test(fen)) {
    return NextResponse.json({ error: "Invalid or missing fen" }, { status: 400 });
  }

  // 60 streams per IP per minute — fail closed so a misbehaving client can't
  // bypass the cap by waiting out a Redis outage.
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(`sf-stream:${ip}`, 60, 60_000, { failOpen: false });
  if (!rl.allowed) {
    const status = rl.reason === "unavailable" ? 503 : 429;
    return NextResponse.json(
      { error: rl.reason === "unavailable" ? "Engine temporarily unavailable" : "Too many engine requests" },
      { status, headers: rl.reason === "limit" ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
    );
  }

  const upstreamUrl = new URL(`${STOCKFISH_BACKEND_URL}/api/analyze/stream`);
  upstreamUrl.searchParams.set("fen", fen);
  upstreamUrl.searchParams.set("maxDepth", maxDepth);
  upstreamUrl.searchParams.set("multiPv", multiPv);

  let upstream: Response;
  try {
    const controller = new AbortController();
    const maxLifetime = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    req.signal.addEventListener("abort", () => {
      clearTimeout(maxLifetime);
      controller.abort();
    });
    upstream = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
  } catch (err) {
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
