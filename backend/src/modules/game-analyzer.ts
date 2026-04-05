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
  | "miss"
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
 * Classify a move based on expected points lost (Chess.com Classification V2).
 *
 * From Chess.com's article:
 *   Best:       EP lost = 0.00
 *   Excellent:  0.00 < EP lost <= 0.02
 *   Good:       0.02 < EP lost <= 0.05
 *   Inaccuracy: 0.05 < EP lost <= 0.10
 *   Mistake:    0.10 < EP lost <= 0.20
 *   Blunder:    0.20 < EP lost <= 1.00
 *
 * "Miss" is a special classification: failing to capitalize on opponent's
 * mistake (not gaining a winning position when one was available).
 */
function classifyMove(
  epLost: number,
  isBook: boolean,
  isBrilliant: boolean,
  isGreat: boolean,
  isMissedOpportunity: boolean,
): MoveClassification {
  if (isBook) return "book";
  if (isBrilliant) return "brilliant";
  if (isGreat) return "great";
  if (isMissedOpportunity) return "miss";

  // Chess.com Classification V2 exact thresholds:
  if (epLost <= 0.002) return "best";      // ~0.00 (float tolerance)
  if (epLost <= 0.02)  return "excellent";
  if (epLost <= 0.05)  return "good";
  if (epLost <= 0.10)  return "inaccuracy";
  if (epLost <= 0.20)  return "mistake";
  return "blunder";
}

/**
 * Detect if a move is a "Brilliant" move (Chess.com definition):
 * - Best or near-best move in the position
 * - Involves a good piece sacrifice
 * - Player is not already completely winning
 * - Position is not lost even without the move
 *
 * Chess.com: "more generous in defining a piece sacrifice for newer
 * players compared to those who are higher-rated."
 */
function detectBrilliant(
  move: { san: string; piece: string; captured?: string },
  epLost: number,
  epBefore: number,
  epAfter: number,
  rating: number = 1500,
): boolean {
  // Must be a good move (low EP loss)
  if (epLost > 0.02) return false;

  const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const isCapture = move.san.includes("x");

  if (!isCapture) return false;

  const attackerValue = pieceValues[move.piece] ?? 0;
  const capturedValue = move.captured ? (pieceValues[move.captured] ?? 0) : 0;

  // Rating-dependent sacrifice threshold:
  // Lower-rated players: material difference of 1 counts as sacrifice
  // Higher-rated players: need material difference of 2+
  const sacrificeThreshold = rating < 1200 ? 0.5 : rating < 1800 ? 1 : 2;
  const isSacrifice = attackerValue > capturedValue + sacrificeThreshold;
  if (!isSacrifice) return false;

  // Should not already be completely winning
  // More generous for lower-rated players (they convert less reliably)
  const winningThreshold = rating < 1200 ? 0.95 : rating < 1800 ? 0.92 : 0.88;
  if (epBefore > winningThreshold) return false;

  // Should not be in a bad position after
  if (epAfter < 0.35) return false;

  return true;
}

/**
 * Detect if a move is a "Great" move (Chess.com definition):
 * - Critical to the outcome of the game
 * - Turns a losing position into equal, or equal into winning
 * - Finding the only good move in a position
 *
 * Chess.com: "more generous in what we call a Great Move for new
 * players compared to higher-rated players."
 */
function detectGreat(
  epLost: number,
  epBefore: number,
  epAfter: number,
  rating: number = 1500,
): boolean {
  // Must be a good move
  if (epLost > 0.03) return false;

  // Rating-dependent thresholds for what counts as "losing" and "winning"
  // Lower-rated players get more generous thresholds
  const losingThreshold = rating < 1200 ? 0.45 : rating < 1800 ? 0.40 : 0.35;
  const winningThreshold = rating < 1200 ? 0.60 : rating < 1800 ? 0.65 : 0.70;
  const clearlyBetterThreshold = rating < 1200 ? 0.70 : rating < 1800 ? 0.75 : 0.80;

  const wasLosing = epBefore < losingThreshold;
  const nowWinning = epAfter > winningThreshold;

  const wasEqual = epBefore >= losingThreshold && epBefore <= 0.60;
  const nowClearlyBetter = epAfter > clearlyBetterThreshold;

  return (wasLosing && nowWinning) || (wasEqual && nowClearlyBetter);
}

/**
 * Detect if a move is a "Miss" (Chess.com Classification V2):
 * - Opponent just made a mistake (EP swung in your favor)
 * - You failed to capitalize and missed the winning opportunity
 * - Position goes from potentially winning back to equal/worse
 *
 * The engine evaluation required to determine winning/equal/losing
 * varies according to the player's rating.
 */
function detectMiss(
  epLost: number,
  epBefore: number,
  epAfter: number,
  opponentPreviousEpLost: number,
  rating: number = 1500,
): boolean {
  // Opponent must have just made a meaningful mistake (lost significant EP)
  if (opponentPreviousEpLost < 0.08) return false;

  // Player must have had a good position (opponent blundered into it)
  // Rating-dependent: higher-rated players should convert smaller advantages
  const winningEp = rating < 1200 ? 0.70 : rating < 1800 ? 0.65 : 0.60;
  if (epBefore < winningEp) return false;

  // Player's move must have given back significant advantage
  if (epLost < 0.08) return false;

  // Position after should no longer be clearly winning
  const stillWinning = rating < 1200 ? 0.65 : rating < 1800 ? 0.60 : 0.55;
  if (epAfter > stillWinning) return false;

  return true;
}

/**
 * Calculate move accuracy (0-100) using CAPS2 formula.
 *
 * Chess.com's CAPS2 uses an exponential decay model based on win percentage
 * points lost. This produces scores mostly between 50-95 for normal play,
 * giving a "school test grade" feel (per Chess.com's Accuracy article).
 *
 * Key CAPS2 features (from Chess.com articles & interviews):
 * - Exponential decay based on win% lost
 * - Mate-distance scoring: adjusts accuracy near forced mate sequences
 * - Book moves always score 100 (handled externally)
 *
 * Formula: accuracy = 103.1668 * exp(-0.04354 * wpLost) - 3.1668
 * where wpLost = (winPercentBefore - winPercentAfter) on a 0-100 scale.
 */
function moveAccuracy(
  evalBefore: number,
  evalAfter: number,
  color: "white" | "black",
  rating: number = 1500,
  mateBefore: number | null = null,
  mateAfter: number | null = null,
): number {
  // ── Mate-distance scoring ──
  // When positions involve forced mate, centipawn-based EP breaks down.
  // Use mate distance directly to determine accuracy.

  // If position was already a forced mate against the player, any move scores 100
  if (mateBefore !== null) {
    const mateForPlayer = color === "white" ? mateBefore : -mateBefore;
    // Mate against us (negative) — nothing to lose
    if (mateForPlayer < 0) return 100;

    // Player had mate and still has mate — check if mate distance got worse
    if (mateAfter !== null) {
      const mateAfterForPlayer = color === "white" ? -mateAfter : mateAfter;
      if (mateAfterForPlayer > 0) {
        // Still winning with mate — slightly penalize if mate got longer
        // but generally very good
        const distDiff = Math.max(0, mateAfterForPlayer - mateForPlayer);
        return Math.max(85, 100 - distDiff * 2);
      }
      // Had mate, now opponent has mate — catastrophic, let normal formula handle
    }

    // Player had mate but now it's just a centipawn advantage — penalize
    // but not as harshly if the position is still very winning
    if (mateAfter === null) {
      const cpAfterPlayer = color === "white" ? evalAfter : -evalAfter;
      if (cpAfterPlayer > 500) return 75; // Still very winning
      if (cpAfterPlayer > 200) return 55; // Lost the mate but decent position
      // Lost the mate badly — let normal formula handle it
    }
  }

  // If this move delivers checkmate, it's always 100
  if (mateAfter !== null) {
    const mateAfterForOpponent = color === "white" ? -mateAfter : mateAfter;
    if (mateAfterForOpponent === 0) return 100; // Checkmate delivered
  }

  // ── Standard CAPS2 calculation ──
  // Convert evals (white perspective) to player perspective
  const cpBefore = color === "white" ? evalBefore : -evalBefore;
  const cpAfter = color === "white" ? evalAfter : -evalAfter;

  const epBefore = expectedPoints(cpBefore, rating);
  const epAfter = expectedPoints(cpAfter, rating);

  // Win percentage lost (0-100 scale)
  const wpLost = Math.max(0, (epBefore - epAfter) * 100);

  // If position was already lost, any move is "100% accurate" (nothing to lose)
  if (epBefore <= 0.01) return 100;

  // CAPS2 exponential decay formula
  // wpLost=0 → 100, wpLost=1 → ~95.6, wpLost=5 → ~80, wpLost=10 → ~63.6
  // wpLost=20 → ~40, wpLost=50 → ~8.5
  const accuracy = 103.1668 * Math.exp(-0.04354 * wpLost) - 3.1668;
  return Math.max(0, Math.min(100, accuracy));
}

/**
 * Calculate game accuracy with CAPS2 dampening for consecutive blunders.
 *
 * From Chess.com: "reducing the penalty for multiple blunders" so that
 * "a few poor moves in a row doesn't skew your overall score too heavily."
 *
 * When a player makes consecutive blunders, each subsequent one has a
 * reduced impact on the overall average. This prevents a single bad
 * sequence from destroying the entire game score.
 */
function calculateGameAccuracy(moves: AnalyzedMove[]): number {
  if (moves.length === 0) return 0;

  const dampened: number[] = [];
  let consecutiveErrors = 0;

  for (const move of moves) {
    const isError = move.classification === "blunder" ||
                    move.classification === "mistake";

    if (isError) {
      consecutiveErrors++;
      // Dampen consecutive errors: 1st full weight, 2nd 70%, 3rd+ 50%
      // This prevents a blunder-streak from tanking the entire score
      const dampFactor = consecutiveErrors === 1 ? 1.0 :
                         consecutiveErrors === 2 ? 0.7 : 0.5;
      // Blend the low accuracy toward a floor (don't let it go below ~30)
      const dampedAccuracy = move.accuracy + (50 - move.accuracy) * (1 - dampFactor);
      dampened.push(Math.max(move.accuracy, dampedAccuracy));
    } else {
      consecutiveErrors = 0;
      dampened.push(move.accuracy);
    }
  }

  return dampened.reduce((a, b) => a + b, 0) / dampened.length;
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

/**
 * Extract player ratings from PGN headers.
 * Chess.com PGNs contain [WhiteElo "1234"] and [BlackElo "1234"] headers.
 */
function extractRatings(pgn: string): { white: number; black: number } {
  const whiteMatch = pgn.match(/\[WhiteElo\s+"(\d+)"\]/);
  const blackMatch = pgn.match(/\[BlackElo\s+"(\d+)"\]/);
  return {
    white: whiteMatch ? parseInt(whiteMatch[1], 10) : 1500,
    black: blackMatch ? parseInt(blackMatch[1], 10) : 1500,
  };
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

  // Extract player ratings from PGN headers for rating-dependent classification
  const ratings = extractRatings(pgn);

  const engine = await getEngine();
  const moves: AnalyzedMove[] = [];
  const blunders: Blunder[] = [];
  const evalGraph: { move: number; eval: number; mate: number | null }[] = [];

  // Reset to starting position
  const game = new Chess();
  const bookMoves = Math.min(6, Math.floor(history.length * 0.1));

  // Track EP loss per move for Miss detection
  let previousEpLost = 0;

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

    // Check if this move ends the game (checkmate or stalemate)
    const isCheckmate = game.isCheckmate();
    const isStalemate = game.isStalemate();
    // If checkmate: no need to evaluate — this is always the best move
    // Stockfish can't evaluate terminal positions, so skip the eval call
    let afterEval: EngineEval;
    if (isCheckmate) {
      // From opponent's perspective: they're mated = worst possible score
      // Use a large centipawn value to represent mate
      afterEval = { bestMove: "", eval: -10000, mate: 0, depth: 0, pv: [] };
    } else if (isStalemate) {
      // Stalemate = draw = 0 from both perspectives
      afterEval = { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] };
    } else {
      try {
        afterEval = await engine.evaluatePosition(fenAfter, depth, 15000);
      } catch (error) {
        console.error(`Failed to evaluate position after move ${moveNumber}:`, error);
        afterEval = { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] };
      }
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

    // Use actual player rating from PGN headers
    const playerRating = color === "white" ? ratings.white : ratings.black;

    const epBefore = expectedPoints(cpBeforePlayer, playerRating);
    const epAfter = expectedPoints(cpAfterPlayer, playerRating);
    const epLost = Math.max(0, epBefore - epAfter);

    const isBook = i < bookMoves;

    // Detect special classifications (all rating-dependent per Chess.com)
    const isBrilliant = !isBook && detectBrilliant(move, epLost, epBefore, epAfter, playerRating);
    const isGreat = !isBook && !isBrilliant && detectGreat(epLost, epBefore, epAfter, playerRating);

    // Detect "Miss": failing to capitalize on opponent's previous mistake
    const isMissedOpportunity = !isBook && !isBrilliant && !isGreat &&
      detectMiss(epLost, epBefore, epAfter, previousEpLost, playerRating);

    const classification = classifyMove(epLost, isBook, isBrilliant, isGreat, isMissedOpportunity);

    // Mate values from white's perspective for accuracy calculation
    const mateBeforeWhite = bestEval.mate !== null
      ? (color === "white" ? bestEval.mate : -bestEval.mate) : null;
    const mateAfterWhite = afterEval.mate !== null
      ? (color === "white" ? -afterEval.mate : afterEval.mate) : null;

    const accuracy = isBook ? 100 : moveAccuracy(
      bestEvalWhite, afterEvalWhite, color, playerRating,
      mateBeforeWhite, mateAfterWhite,
    );

    // Store this move's EP loss for next move's Miss detection
    previousEpLost = epLost;

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

  return {
    gameId,
    pgn,
    moves,
    blunders,
    // CAPS2: use dampened averaging that reduces impact of consecutive blunders
    whiteAccuracy: calculateGameAccuracy(whiteMoves),
    blackAccuracy: calculateGameAccuracy(blackMoves),
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
