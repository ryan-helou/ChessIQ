import { Chess } from "chess.js";
import { randomUUID } from "crypto";
import { getEngine, EngineEval } from "../lib/stockfish.js";

export interface AnalyzedMove {
  moveNumber: number;
  move: string; // UCI format (e2e4)
  san: string; // SAN format (e4)
  fen: string; // position after move
  fenBefore: string;
  color: "white" | "black";
  engineEval: number; // centipawns from white's perspective
  mate: number | null;
  bestMove: string; // UCI
  bestMoveSan: string;
  evalBefore: number;
  evalDrop: number;
  classification: MoveClassification;
  accuracy: number; // 0-100
  isBlunder: boolean;
  isMistake: boolean;
  isInaccuracy: boolean;
  tacticalThemes: string[]; // Will be populated in Phase 2
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
  | "book";

export interface Blunder {
  moveNumber: number;
  playerMove: string;
  bestMove: string;
  evalBeforeCp: number;
  evalAfterCp: number;
  severity: "blunder" | "mistake" | "inaccuracy";
  missedTactic: string | null;
  consequence: string | null;
}

export interface GameAnalysis {
  gameId: string;
  pgn: string;
  moves: AnalyzedMove[];
  blunders: Blunder[];
  whiteAccuracy: number;
  blackAccuracy: number;
  evalGraph: { move: number; eval: number; mate: number | null }[];
  blunderCounts: {
    white: number;
    black: number;
  };
  mistakeCounts: {
    white: number;
    black: number;
  };
  inaccuracyCounts: {
    white: number;
    black: number;
  };
  analysisDepth: number;
}

// Classify moves based on centipawn loss
function classifyMove(
  evalDrop: number,
  isBook: boolean
): MoveClassification {
  if (isBook) return "book";
  const loss = Math.abs(evalDrop);
  if (loss <= 10) return "best";
  if (loss <= 25) return "excellent";
  if (loss <= 50) return "good";
  if (loss <= 100) return "inaccuracy";
  if (loss <= 250) return "mistake";
  return "blunder";
}

// Convert centipawn loss to accuracy (Chess.com-like formula)
function moveAccuracy(
  evalBefore: number,
  evalAfter: number,
  color: "white" | "black"
): number {
  const winProb = (cp: number) => 1 / (1 + Math.pow(10, -cp / 400));

  const probBefore = color === "white" ? winProb(evalBefore) : winProb(-evalBefore);
  const probAfter = color === "white" ? winProb(evalAfter) : winProb(-evalAfter);

  if (probBefore <= 0.001) return 100;
  const accuracy = (probAfter / probBefore) * 100;
  return Math.max(0, Math.min(100, accuracy));
}

// Convert UCI move to SAN
function uciToSan(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = chess.move({ from, to, promotion });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

export async function analyzeGame(
  pgn: string,
  depth: number = 18
): Promise<GameAnalysis> {
  const gameId = randomUUID();
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  if (history.length === 0) {
    throw new Error("No moves in PGN");
  }

  const engine = await getEngine();
  const moves: AnalyzedMove[] = [];
  const blunders: Blunder[] = [];
  const evalGraph: { move: number; eval: number; mate: number | null }[] = [];

  // Reset to starting position
  const game = new Chess();
  const bookMoves = Math.min(6, Math.floor(history.length * 0.1));

  // Analyze each move
  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const fenBefore = game.fen();
    const color: "white" | "black" = move.color === "w" ? "white" : "black";
    const halfMoveNumber = i + 1;
    const moveNumber = Math.floor(i / 2) + 1;

    // Get engine's best move for this position
    let bestEval: EngineEval;
    try {
      bestEval = await engine.evaluatePosition(fenBefore, depth, 15000);
    } catch (error) {
      console.error(`Failed to evaluate position at move ${moveNumber}:`, error);
      bestEval = { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] };
    }

    // Play the actual move
    game.move(move.san);
    const fenAfter = game.fen();

    // Evaluate the position after the player's move
    let afterEval: EngineEval;
    try {
      afterEval = await engine.evaluatePosition(fenAfter, depth, 15000);
    } catch (error) {
      console.error(`Failed to evaluate position after move ${moveNumber}:`, error);
      afterEval = { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] };
    }

    // Stockfish UCI returns eval from side-to-move perspective.
    // bestEval.eval = from mover's perspective (before the move)
    // afterEval.eval = from OPPONENT's perspective (after the move)
    // Negate afterEval to get mover's perspective, then compare.

    // Convert both to white's perspective for consistent storage
    const bestEvalWhite = color === "white" ? bestEval.eval : -bestEval.eval;
    const afterEvalWhite = color === "white" ? -afterEval.eval : afterEval.eval;

    // evalDrop from mover's perspective (negative = worse move)
    const evalDrop = -afterEval.eval - bestEval.eval;

    const isBook = i < bookMoves;
    const classification = classifyMove(evalDrop, isBook);
    const accuracy = isBook ? 100 : moveAccuracy(bestEvalWhite, afterEvalWhite, color);

    const bestMoveSan = uciToSan(fenBefore, bestEval.bestMove);

    const isBlunder = classification === "blunder";
    const isMistake = classification === "mistake";
    const isInaccuracy = classification === "inaccuracy";

    const analyzedMove: AnalyzedMove = {
      moveNumber,
      move: `${move.from}${move.to}${move.promotion ?? ""}`,
      san: move.san,
      fen: fenAfter,
      fenBefore,
      color,
      engineEval: afterEvalWhite,
      mate: afterEval.mate,
      bestMove: bestEval.bestMove,
      bestMoveSan,
      evalBefore: bestEvalWhite,
      evalDrop,
      classification,
      accuracy,
      isBlunder,
      isMistake,
      isInaccuracy,
      tacticalThemes: [], // Populate in Phase 2
    };

    moves.push(analyzedMove);

    // Track blunders for separate table
    if (isBlunder || isMistake || isInaccuracy) {
      blunders.push({
        moveNumber,
        playerMove: analyzedMove.move,
        bestMove: bestEval.bestMove,
        evalBeforeCp: bestEvalWhite,
        evalAfterCp: afterEvalWhite,
        severity: isBlunder ? "blunder" : isMistake ? "mistake" : "inaccuracy",
        missedTactic: null, // Will be determined in Phase 3
        consequence: null, // Will be determined in Phase 3
      });
    }

    evalGraph.push({
      move: halfMoveNumber,
      eval: afterEvalWhite,
      mate: afterEval.mate,
    });

  }

  // Calculate overall stats
  const whiteMoves = moves.filter((m) => m.color === "white");
  const blackMoves = moves.filter((m) => m.color === "black");

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    gameId,
    pgn,
    moves,
    blunders,
    whiteAccuracy: avg(whiteMoves.map((m) => m.accuracy)),
    blackAccuracy: avg(blackMoves.map((m) => m.accuracy)),
    evalGraph,
    blunderCounts: {
      white: whiteMoves.filter((m) => m.classification === "blunder").length,
      black: blackMoves.filter((m) => m.classification === "blunder").length,
    },
    mistakeCounts: {
      white: whiteMoves.filter((m) => m.classification === "mistake").length,
      black: blackMoves.filter((m) => m.classification === "mistake").length,
    },
    inaccuracyCounts: {
      white: whiteMoves.filter((m) => m.classification === "inaccuracy").length,
      black: blackMoves.filter((m) => m.classification === "inaccuracy").length,
    },
    analysisDepth: depth,
  };
}
