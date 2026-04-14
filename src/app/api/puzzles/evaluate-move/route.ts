import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";

const RAILWAY_BACKEND_URL = "https://chessiq-production.up.railway.app";
const ACCEPTABLE = new Set(["brilliant", "great", "best", "excellent", "good"]);

async function getCachedGoodMoves(fen: string): Promise<string[] | null> {
  try {
    const result = await query(
      `SELECT good_moves FROM position_good_moves WHERE fen = $1`,
      [fen]
    );
    return result.rows[0]?.good_moves ?? null;
  } catch {
    return null;
  }
}

async function setCachedGoodMoves(fen: string, goodMoves: string[]): Promise<void> {
  try {
    await query(
      `INSERT INTO position_good_moves (fen, good_moves)
       VALUES ($1, $2)
       ON CONFLICT (fen) DO NOTHING`,
      [fen, goodMoves]
    );
  } catch { /* silent */ }
}

// ── Railway evaluation ────────────────────────────────────────────────────────

function classifyMove(fen: string, uci: string): Promise<string> {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const chess = new Chess(fen);
  const piece = chess.get(from as Parameters<typeof chess.get>[0]);
  const isPromotion = piece?.type === "p" && (to[1] === "8" || to[1] === "1");

  const moveResult = chess.move({
    from,
    to,
    ...(isPromotion ? { promotion: (uci[4] as "q" | "r" | "b" | "n") ?? "q" } : {}),
  });

  if (!moveResult) return Promise.resolve("illegal");

  const pgn = `[SetUp "1"]\n[FEN "${fen}"]\n\n${chess.pgn()}`;

  return fetch(`${RAILWAY_BACKEND_URL}/api/analyze/game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pgn, depth: 12 }),
    signal: AbortSignal.timeout(8000),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((analysis) => {
      const moves = analysis?.moves ?? analysis?.analysis?.moves ?? [];
      return moves[0]?.classification ?? "unknown";
    })
    .catch(() => "unknown");
}

/**
 * POST /api/puzzles/evaluate-move
 * Single move check (fallback when batch not ready)
 */
export async function POST(request: NextRequest) {
  try {
    const { fen, move } = await request.json();
    if (!fen || !move) return NextResponse.json({ error: "Missing fen or move" }, { status: 400 });

    const classification = await classifyMove(fen, move);
    return NextResponse.json({ classification, acceptable: ACCEPTABLE.has(classification) });
  } catch (error) {
    console.error("[evaluate-move] error:", error);
    return NextResponse.json({ classification: "unknown", acceptable: false });
  }
}

/**
 * PUT /api/puzzles/evaluate-move
 * Batch — returns all good moves for a position.
 * Checks DB cache first; only calls Railway on a cache miss.
 */
export async function PUT(request: NextRequest) {
  try {
    const { fen } = await request.json();
    if (!fen) return NextResponse.json({ error: "Missing fen" }, { status: 400 });

    await ensureDbInit().catch((err: Error) => console.error('[db-init] failed:', err.message));

    // ── Cache hit ──
    const cached = await getCachedGoodMoves(fen);
    if (cached !== null) {
      return NextResponse.json({ goodMoves: cached, fromCache: true });
    }

    // ── Cache miss — evaluate via Railway ──
    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });

    const results = await Promise.all(
      legal.map(async (m) => {
        const uci = m.from + m.to + (m.promotion ?? "");
        const classification = await classifyMove(fen, uci);
        return { uci, classification };
      })
    );

    const goodMoves = results
      .filter((r) => ACCEPTABLE.has(r.classification))
      .map((r) => r.uci);

    // Store in cache for future requests
    await setCachedGoodMoves(fen, goodMoves);

    return NextResponse.json({ goodMoves, fromCache: false });
  } catch (error) {
    console.error("[evaluate-move batch] error:", error);
    return NextResponse.json({ goodMoves: [] });
  }
}
