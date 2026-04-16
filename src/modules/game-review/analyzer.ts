import { Chess } from "chess.js";
import { STOCKFISH_BACKEND_URL } from "@/lib/stockfish-backend";

export interface AnalyzedMove {
  moveNumber: number;
  move: string; // UCI format (e2e4)
  san: string; // SAN format (e4)
  fen: string; // position after move
  fenBefore: string; // position before move
  color: "white" | "black";
  engineEval: number; // centipawns from white's perspective
  mate: number | null;
  bestMove: string; // UCI
  bestMoveSan: string; // SAN
  evalBefore: number; // eval before this move
  evalDrop: number; // how much eval changed (negative = bad for mover)
  classification: MoveClassification;
  accuracy: number; // 0-100
}

export type MoveClassification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "miss"
  | "forced"
  | "book";

export interface GameAnalysis {
  moves: AnalyzedMove[];
  whiteAccuracy: number;
  blackAccuracy: number;
  evalGraph: { move: number; eval: number; mate: number | null }[];
  blunders: { white: number; black: number };
  mistakes: { white: number; black: number };
  inaccuracies: { white: number; black: number };
}

export async function analyzeGame(
  pgn: string,
  depth: number = 18,
  signal?: AbortSignal
): Promise<GameAnalysis> {
  // Validate PGN
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  if (history.length === 0) {
    throw new Error("No moves in PGN");
  }

  // Call Railway backend for game analysis, with exponential backoff retry
  const MAX_ATTEMPTS = 3;
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1))); // 1s, 2s
    }
    try {
      const response = await fetch(`${STOCKFISH_BACKEND_URL}/api/analyze/game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn, depth }),
        signal: signal ?? AbortSignal.timeout(55_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        lastError = new Error(`Analysis engine returned ${response.status}${body ? `: ${body}` : ""}`);
        // Don't retry on 4xx (client errors)
        if (response.status >= 400 && response.status < 500) throw lastError;
        continue;
      }
      return await response.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry if signal was aborted
      if (signal?.aborted) throw lastError;
    }
  }
  throw lastError;
}

/**
 * Generate minimal stub analysis when Railway backend is unavailable
 * Still parses the PGN to identify moves and counts
 */
function generateStubAnalysis(pgn: string): GameAnalysis {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  const game = new Chess();
  const moves: AnalyzedMove[] = [];
  const evalGraph: { move: number; eval: number; mate: number | null }[] = [];

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const fenBefore = game.fen();
    const color: "white" | "black" = move.color === "w" ? "white" : "black";
    const moveNumber = Math.floor(i / 2) + 1;

    game.move(move.san);
    const fenAfter = game.fen();

    moves.push({
      moveNumber,
      move: `${move.from}${move.to}${move.promotion ?? ""}`,
      san: move.san,
      fen: fenAfter,
      fenBefore,
      color,
      engineEval: 0,
      mate: null,
      bestMove: move.san,
      bestMoveSan: move.san,
      evalBefore: 0,
      evalDrop: 0,
      classification: "best",
      accuracy: 100,
    });

    evalGraph.push({
      move: i + 1,
      eval: 0,
      mate: null,
    });
  }

  const whiteMoves = moves.filter((m) => m.color === "white");
  const blackMoves = moves.filter((m) => m.color === "black");

  return {
    moves,
    whiteAccuracy: 100,
    blackAccuracy: 100,
    evalGraph,
    blunders: { white: 0, black: 0 },
    mistakes: { white: 0, black: 0 },
    inaccuracies: { white: 0, black: 0 },
  };
}
