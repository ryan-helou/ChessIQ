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

// ============================================================
// Chess.com Expected Points Model (Classification V2)
// ============================================================
//
// Expected Points converts engine eval to a 0.0-1.0 scale
// representing the expected game outcome (1.0 = win, 0.5 = draw, 0.0 = loss).
// Moves are classified by how many expected points are lost.
//
// The win probability function uses a logistic curve scaled by rating.
// Higher-rated players convert smaller advantages more reliably.

/**
 * Convert centipawns (from the player's perspective) to expected points (0-1).
 * Uses a logistic model similar to Chess.com's, where the steepness
 * depends on the player's rating.
 */
function expectedPoints(cpFromPlayerPerspective: number, rating: number = 1500): number {
  // K factor controls how steep the curve is.
  // Higher-rated players convert advantages more efficiently.
  // Chess.com uses a rating-dependent model; we approximate:
  //   ~1200 rating: K ≈ 580 (needs bigger advantage to be "winning")
  //   ~1500 rating: K ≈ 500
  //   ~2000 rating: K ≈ 400
  //   ~2500 rating: K ≈ 320 (small advantages are significant)
  const K = Math.max(280, 640 - rating * 0.12);

  return 1 / (1 + Math.pow(10, -cpFromPlayerPerspective / K));
}

/**
 * Classify a move based on expected points lost (Chess.com V2 thresholds).
 */
function classifyMove(
  epLost: number,
  isBook: boolean,
  isBrilliant: boolean,
  isGreat: boolean,
): MoveClassification {
  if (isBook) return "book";
  if (isBrilliant) return "brilliant";
  if (isGreat) return "great";

  // Chess.com Classification V2 thresholds:
  if (epLost <= 0.005) return "best";      // effectively 0
  if (epLost <= 0.02)  return "excellent";
  if (epLost <= 0.05)  return "good";
  if (epLost <= 0.10)  return "inaccuracy";
  if (epLost <= 0.20)  return "mistake";
  return "blunder";
}

/**
 * Detect if a move is a "Brilliant" move (Chess.com definition):
 * - Best or near-best move in the position
 * - Involves a piece sacrifice
 * - Player is not already completely winning
 * - Position is not lost even without the move
 */
function detectBrilliant(
  move: { san: string; piece: string; captured?: string },
  epLost: number,
  epBefore: number,
  epAfter: number,
): boolean {
  // Must be a good move (low EP loss)
  if (epLost > 0.02) return false;

  // Must involve a sacrifice — capturing with a higher-value piece
  // or moving a piece to a square where it can be captured
  // Simplified: look for piece sacrifices via SAN (captures where attacker > defender)
  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const isCapture = move.san.includes("x");

  if (!isCapture) return false;

  const attackerValue = pieceValues[move.piece] ?? 0;
  const capturedValue = move.captured ? (pieceValues[move.captured] ?? 0) : 0;

  // Sacrifice: giving up more material than gaining
  const isSacrifice = attackerValue > capturedValue + 1;
  if (!isSacrifice) return false;

  // Should not already be completely winning (EP > 0.90)
  if (epBefore > 0.90) return false;

  // Should not be in a bad position after (EP < 0.35)
  if (epAfter < 0.35) return false;

  return true;
}

/**
 * Detect if a move is a "Great" move (Chess.com definition):
 * - Critical to the outcome of the game
 * - Turns a losing position into equal, or equal into winning
 */
function detectGreat(
  epLost: number,
  epBefore: number,
  epAfter: number,
): boolean {
  // Must be a good move
  if (epLost > 0.03) return false;

  // Must represent a significant improvement in the game state
  // (opponent blundered and player found the refutation)
  // Detect: position was bad/equal for player and is now much better
  const wasLosing = epBefore < 0.40;
  const nowWinning = epAfter > 0.65;

  const wasEqual = epBefore >= 0.40 && epBefore <= 0.60;
  const nowClearlyBetter = epAfter > 0.75;

  return (wasLosing && nowWinning) || (wasEqual && nowClearlyBetter);
}

/**
 * Calculate move accuracy (0-100) using expected points model.
 * Chess.com accuracy = expected points retained as a percentage.
 */
function moveAccuracy(
  evalBefore: number,
  evalAfter: number,
  color: "white" | "black",
  rating: number = 1500,
): number {
  // Convert evals (white perspective) to player perspective
  const cpBefore = color === "white" ? evalBefore : -evalBefore;
  const cpAfter = color === "white" ? evalAfter : -evalAfter;

  const epBefore = expectedPoints(cpBefore, rating);
  const epAfter = expectedPoints(cpAfter, rating);

  // If position was already lost, any move is "100% accurate" (nothing to lose)
  if (epBefore <= 0.01) return 100;

  // Accuracy = how much of your expected points you retained
  const accuracy = (epAfter / epBefore) * 100;
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

    // Expected Points model (Chess.com Classification V2)
    // Convert evals to player's perspective for EP calculation
    const cpBeforePlayer = color === "white" ? bestEvalWhite : -bestEvalWhite;
    const cpAfterPlayer = color === "white" ? afterEvalWhite : -afterEvalWhite;

    // TODO: pass actual player rating from game metadata
    const playerRating = 1500;

    const epBefore = expectedPoints(cpBeforePlayer, playerRating);
    const epAfter = expectedPoints(cpAfterPlayer, playerRating);
    const epLost = Math.max(0, epBefore - epAfter);

    const isBook = i < bookMoves;

    // Detect special classifications
    const isBrilliant = !isBook && detectBrilliant(move, epLost, epBefore, epAfter);
    const isGreat = !isBook && !isBrilliant && detectGreat(epLost, epBefore, epAfter);

    const classification = classifyMove(epLost, isBook, isBrilliant, isGreat);
    const accuracy = isBook ? 100 : moveAccuracy(bestEvalWhite, afterEvalWhite, color, playerRating);

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
      mate: afterEval.mate !== null
        ? (color === "white" ? -afterEval.mate : afterEval.mate)
        : null,
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
      mate: afterEval.mate !== null
        ? (color === "white" ? -afterEval.mate : afterEval.mate)
        : null,
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
