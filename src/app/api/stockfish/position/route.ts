export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";

const RAILWAY_BACKEND_URL = "https://chessiq-production.up.railway.app";

export async function POST(request: NextRequest) {
  try {
    const { moves, depth = 14 } = await request.json() as { moves: string[]; depth?: number };

    if (!Array.isArray(moves)) {
      return NextResponse.json({ bestMove: null }, { status: 400 });
    }

    // Replay moves to validate them and build a PGN
    const chess = new Chess();
    const validMoves: string[] = [];
    for (const san of moves) {
      try {
        chess.move(san);
        validMoves.push(san);
      } catch {
        break;
      }
    }

    // Build a minimal PGN — the Railway backend just needs movelist text.
    // We need at least 1 move for the backend to return analysis.
    // We add one extra legal move so the last analyzed position IS the target FEN,
    // and we read bestMove from the second-to-last move (the extra move's previous position).
    //
    // Simpler: send the moves as-is. The backend returns analysis for each position
    // AFTER each move. So result.moves[last].bestMove is the best move in the
    // position AFTER the last move in validMoves — that is the current board position.
    //
    // If validMoves is empty, we need a special case: best move from starting position.
    // We send a dummy 1-move game and read result.moves[0].bestMove would be the best
    // response to that dummy move... which is not what we want.
    // Instead for the empty case: add a dummy move, then the best response = engine's best
    // from start. But actually bestMove from the starting position requires us to analyze
    // the starting position itself. The backend analyzes positions AFTER each move.
    //
    // Solution: always append one extra legal move to the move list. The backend will
    // analyze the position AFTER that extra move. The bestMove of the PREVIOUS entry
    // (index validMoves.length - 1 if original moves were non-empty, or index 0) will
    // be the best move from our target position... but that's the best move FROM the
    // position before the last move, not from the target.
    //
    // Actually re-reading analyzer.ts: the backend returns `bestMove` as the best move
    // from the position AFTER the move was played (i.e., the opponent's best reply).
    // We want the best move FOR the side to move in our target position.
    //
    // Correct approach: the target position has a side-to-move. The best move FROM that
    // position is what the engine would play next. So we need the backend to analyze
    // a position where our target FEN is the "position before move". That means we
    // need to append one dummy move, and then read the bestMove from the LAST element
    // in result.moves (which analyzed the position our dummy move created, but whose
    // bestMove field is the best move from the position before the dummy was played...
    // wait, that depends on the backend's contract).
    //
    // Let me look at this differently. The analyzer returns for each move:
    //   - The position AFTER the move (fen)
    //   - The best move FROM that position (bestMove)
    //
    // So result.moves[i].bestMove = engine's best move from the position AFTER move i.
    // That means: if we send N moves, result.moves[N-1].bestMove is the best move from
    // the final position. This is exactly what we want.
    //
    // Edge case: N=0 (empty moves). We can't send an empty PGN. Send "e4" (1 move),
    // then result.moves[0].bestMove is the best response to e4 from the starting
    // position after e4 — not the best first move. For the opening browser starting
    // at start position, we should just not show an arrow (or call with a dummy).
    // The UI only needs engine arrows when the user has navigated somewhere meaningful.
    // Return null for empty movePath.

    if (validMoves.length === 0) {
      // For starting position, call with a dummy move and read bestMove from index 0
      // which is the best reply to e4 — not useful. Just return the engine's best first
      // move by sending "e4" and reading the bestMove as the best response... Actually
      // we want the best FIRST move. The best first move from start position is well-known
      // (e4 or d4). We can hardcode it, or we can send a 1-move PGN and read from index
      // -1 which doesn't exist. Let's just return the best first move via a trick:
      // send a 2-move PGN where we play both sides 1 move, then read from index 0
      // result.moves[0].bestMove = best move after e4 = c5 or e5. That's not the best
      // first move from start.
      //
      // For now, just return null for start position. The board is uninteresting there.
      return NextResponse.json({ bestMove: null });
    }

    // Build PGN from valid moves
    const pgnChess = new Chess();
    let pgn = "";
    for (let i = 0; i < validMoves.length; i++) {
      const moveNum = Math.floor(i / 2) + 1;
      if (i % 2 === 0) pgn += `${moveNum}. `;
      pgnChess.move(validMoves[i]);
      pgn += validMoves[i] + " ";
    }
    pgn = pgn.trim();

    const body = JSON.stringify({ pgn, depth: Math.min(depth, 20) });
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
      try {
        const response = await fetch(`${RAILWAY_BACKEND_URL}/api/analyze/game`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(25_000),
        });

        if (!response.ok) {
          // Don't retry client errors
          if (response.status >= 400 && response.status < 500) break;
          lastError = new Error(`Railway ${response.status}`);
          continue;
        }

        const result = await response.json();
        const movesArr = result?.moves;
        if (!Array.isArray(movesArr) || movesArr.length === 0) {
          return NextResponse.json({ bestMove: null });
        }

        const lastMove = movesArr[movesArr.length - 1];
        return NextResponse.json({
          bestMove: lastMove?.bestMove ?? null,
          evalCp: typeof lastMove?.engineEval === "number" ? lastMove.engineEval : null,
        });
      } catch (err) {
        lastError = err;
      }
    }

    console.warn("[stockfish/position] Railway unavailable:", lastError);
    return NextResponse.json({ bestMove: null });
  } catch {
    return NextResponse.json({ bestMove: null });
  }
}
