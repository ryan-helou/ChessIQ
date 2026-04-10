import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";

const RAILWAY_BACKEND_URL = "https://chessiq-production.up.railway.app";
const ACCEPTABLE = new Set(["brilliant", "great", "best", "excellent", "good"]);

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
 * Body: { fen: string, move: string } — single move check (fallback)
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
 * POST /api/puzzles/evaluate-move?batch=1
 * Body: { fen: string } — precomputes ALL legal moves in parallel
 * Returns: { goodMoves: string[] } — UCI strings classified as good or better
 */
export async function PUT(request: NextRequest) {
  try {
    const { fen } = await request.json();
    if (!fen) return NextResponse.json({ error: "Missing fen" }, { status: 400 });

    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });

    // Evaluate all legal moves in parallel at depth 12
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

    return NextResponse.json({ goodMoves });
  } catch (error) {
    console.error("[evaluate-move batch] error:", error);
    return NextResponse.json({ goodMoves: [] });
  }
}
