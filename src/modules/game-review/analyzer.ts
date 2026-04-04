import { Chess } from "chess.js";
import { StockfishEngine, EngineEval } from "../stockfish/engine";

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

// Classify moves based on centipawn loss
function classifyMove(evalDrop: number, isBook: boolean): MoveClassification {
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
function moveAccuracy(evalBefore: number, evalAfter: number, color: "white" | "black"): number {
  // Calculate win probability before and after
  const winProb = (cp: number) => 1 / (1 + Math.pow(10, -cp / 400));

  const probBefore = color === "white" ? winProb(evalBefore) : winProb(-evalBefore);
  const probAfter = color === "white" ? winProb(evalAfter) : winProb(-evalAfter);

  // Accuracy = how much of the win probability was preserved
  if (probBefore <= 0.001) return 100; // Already lost, can't lose more
  const accuracy = (probAfter / probBefore) * 100;
  return Math.max(0, Math.min(100, accuracy));
}

// Convert UCI move to SAN using chess.js
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
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  if (history.length === 0) {
    throw new Error("No moves in PGN");
  }

  const engine = new StockfishEngine();
  await engine.start();

  const moves: AnalyzedMove[] = [];
  const evalGraph: { move: number; eval: number; mate: number | null }[] = [];

  // Reset to starting position
  const game = new Chess();
  let prevEval = 0; // Starting position is roughly equal

  // Evaluate starting position
  try {
    const startEval = await engine.evaluatePosition(game.fen(), depth);
    prevEval = startEval.eval;
  } catch {
    prevEval = 0;
  }

  const bookMoves = Math.min(6, Math.floor(history.length * 0.1)); // First ~10% are "book"

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const fenBefore = game.fen();
    const color: "white" | "black" = move.color === "w" ? "white" : "black";
    const moveNumber = Math.floor(i / 2) + 1;

    // Get engine's best move for this position
    let bestEval: EngineEval;
    try {
      bestEval = await engine.evaluatePosition(fenBefore, depth);
    } catch {
      bestEval = { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] };
    }

    // Play the actual move
    game.move(move.san);
    const fenAfter = game.fen();

    // Evaluate the position after the player's move
    let afterEval: EngineEval;
    try {
      afterEval = await engine.evaluatePosition(fenAfter, depth);
    } catch {
      afterEval = { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] };
    }

    // Calculate eval drop from mover's perspective
    const evalAfterMove = afterEval.eval;
    let evalDrop: number;
    if (color === "white") {
      evalDrop = evalAfterMove - bestEval.eval;
    } else {
      evalDrop = -evalAfterMove - (-bestEval.eval);
    }

    const isBook = i < bookMoves;
    const classification = classifyMove(evalDrop, isBook);
    const accuracy = isBook ? 100 : moveAccuracy(bestEval.eval, evalAfterMove, color);

    const bestMoveSan = uciToSan(fenBefore, bestEval.bestMove);

    moves.push({
      moveNumber,
      move: `${move.from}${move.to}${move.promotion ?? ""}`,
      san: move.san,
      fen: fenAfter,
      fenBefore,
      color,
      engineEval: evalAfterMove,
      mate: afterEval.mate,
      bestMove: bestEval.bestMove,
      bestMoveSan,
      evalBefore: bestEval.eval,
      evalDrop,
      classification,
      accuracy,
    });

    evalGraph.push({
      move: i + 1,
      eval: evalAfterMove,
      mate: afterEval.mate,
    });

    prevEval = evalAfterMove;
  }

  engine.quit();

  // Calculate overall stats
  const whiteMoves = moves.filter((m) => m.color === "white");
  const blackMoves = moves.filter((m) => m.color === "black");

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    moves,
    whiteAccuracy: avg(whiteMoves.map((m) => m.accuracy)),
    blackAccuracy: avg(blackMoves.map((m) => m.accuracy)),
    evalGraph,
    blunders: {
      white: whiteMoves.filter((m) => m.classification === "blunder").length,
      black: blackMoves.filter((m) => m.classification === "blunder").length,
    },
    mistakes: {
      white: whiteMoves.filter((m) => m.classification === "mistake").length,
      black: blackMoves.filter((m) => m.classification === "mistake").length,
    },
    inaccuracies: {
      white: whiteMoves.filter((m) => m.classification === "inaccuracy").length,
      black: blackMoves.filter((m) => m.classification === "inaccuracy").length,
    },
  };
}
