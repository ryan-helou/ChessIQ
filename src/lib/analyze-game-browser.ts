import { Chess } from "chess.js";
import { BrowserStockfish } from "./stockfish-browser";
import type { EngineEval } from "./stockfish-browser";

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

export interface AnalyzedMove {
  moveNumber: number;
  move: string;
  san: string;
  fen: string;
  fenBefore: string;
  color: "white" | "black";
  engineEval: number;
  mate: number | null;
  bestMove: string;
  bestMoveSan: string;
  evalBefore: number;
  evalDrop: number;
  classification: MoveClassification;
  accuracy: number;
}

export interface GameAnalysis {
  moves: AnalyzedMove[];
  whiteAccuracy: number;
  blackAccuracy: number;
  evalGraph: { move: number; eval: number; mate: number | null }[];
  blunders: { white: number; black: number };
  mistakes: { white: number; black: number };
  inaccuracies: { white: number; black: number };
}

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

function moveAccuracy(evalBefore: number, evalAfter: number, color: "white" | "black"): number {
  const winProb = (cp: number) => 1 / (1 + Math.pow(10, -cp / 400));
  const probBefore = color === "white" ? winProb(evalBefore) : winProb(-evalBefore);
  const probAfter = color === "white" ? winProb(evalAfter) : winProb(-evalAfter);
  if (probBefore <= 0.001) return 100;
  const accuracy = (probAfter / probBefore) * 100;
  return Math.max(0, Math.min(100, accuracy));
}

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

export async function analyzeGameBrowser(
  pgn: string,
  depth: number = 16,
  onProgress?: (moveIndex: number, totalMoves: number, move: AnalyzedMove) => void
): Promise<GameAnalysis> {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  if (history.length === 0) throw new Error("No moves in PGN");

  const engine = new BrowserStockfish();
  await engine.init();

  const moves: AnalyzedMove[] = [];
  const evalGraph: { move: number; eval: number; mate: number | null }[] = [];
  const game = new Chess();

  const bookMoves = Math.min(6, Math.floor(history.length * 0.1));

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const fenBefore = game.fen();
    const color: "white" | "black" = move.color === "w" ? "white" : "black";
    const moveNumber = Math.floor(i / 2) + 1;

    // Get engine's eval of the position before the move
    const bestEval = await engine.evaluate(fenBefore, depth);

    // Play the actual move
    game.move(move.san);
    const fenAfter = game.fen();

    // Evaluate the position after the move
    const afterEval = await engine.evaluate(fenAfter, depth);

    // Eval drop from mover's perspective
    let evalDrop: number;
    if (color === "white") {
      evalDrop = afterEval.eval - bestEval.eval;
    } else {
      evalDrop = -afterEval.eval - (-bestEval.eval);
    }

    const isBook = i < bookMoves;
    const classification = classifyMove(evalDrop, isBook);
    const accuracy = isBook ? 100 : moveAccuracy(bestEval.eval, afterEval.eval, color);
    const bestMoveSan = uciToSan(fenBefore, bestEval.bestMove);

    const analyzedMove: AnalyzedMove = {
      moveNumber,
      move: `${move.from}${move.to}${move.promotion ?? ""}`,
      san: move.san,
      fen: fenAfter,
      fenBefore,
      color,
      engineEval: afterEval.eval,
      mate: afterEval.mate,
      bestMove: bestEval.bestMove,
      bestMoveSan,
      evalBefore: bestEval.eval,
      evalDrop,
      classification,
      accuracy,
    };

    moves.push(analyzedMove);
    evalGraph.push({ move: i + 1, eval: afterEval.eval, mate: afterEval.mate });

    onProgress?.(i, history.length, analyzedMove);
  }

  engine.destroy();

  const whiteMoves = moves.filter((m) => m.color === "white");
  const blackMoves = moves.filter((m) => m.color === "black");
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

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
