import { Chess, Square } from "chess.js";
import { randomUUID } from "crypto";
import { getEngine, EngineEval } from "../lib/stockfish.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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
  tacticalThemes: string[];
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
  blunderCounts: { white: number; black: number };
  mistakeCounts: { white: number; black: number };
  inaccuracyCounts: { white: number; black: number };
  analysisDepth: number;
}

// (Classification weights removed — game accuracy now uses per-move
// win% based formula for better robustness)

// ─────────────────────────────────────────────────────────────
// Position-dependent centipawn classification thresholds
// (WTF Algorithm — reverse-engineered from Chess.com behavior)
//
// The key insight: losing 30cp in an equal position is worse
// than losing 30cp when you're already up +500. These quadratic
// functions widen the thresholds as the previous eval increases.
// ─────────────────────────────────────────────────────────────

function getEvalLossThreshold(
  classification: "best" | "excellent" | "good" | "inaccuracy" | "mistake",
  prevEvalAbs: number,
): number {
  const e = prevEvalAbs;
  let threshold = 0;

  // Base quadratic thresholds (reverse-engineered from Chess.com).
  // Scaled by 0.75 to compensate for depth 18 analysis vs Chess.com's
  // deeper analysis — at lower depth, eval differences between moves
  // are smaller, so we need tighter thresholds to avoid over-promoting
  // moves to higher classifications.
  const DEPTH_SCALE = 0.75;

  switch (classification) {
    case "best":
      threshold = 0.0001 * e * e + 0.0236 * e - 3.7143;
      break;
    case "excellent":
      threshold = (0.0002 * e * e + 0.1231 * e + 27.5455) * DEPTH_SCALE;
      break;
    case "good":
      threshold = (0.0002 * e * e + 0.2643 * e + 60.5455) * DEPTH_SCALE;
      break;
    case "inaccuracy":
      threshold = (0.0002 * e * e + 0.3624 * e + 108.0909) * DEPTH_SCALE;
      break;
    case "mistake":
      threshold = (0.0003 * e * e + 0.4027 * e + 225.8182) * DEPTH_SCALE;
      break;
  }

  return Math.max(threshold, 0);
}

// ─────────────────────────────────────────────────────────────
// Piece values for sacrifice/hanging detection
// ─────────────────────────────────────────────────────────────

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: Infinity, m: 0,
};

// ─────────────────────────────────────────────────────────────
// Board analysis helpers (for brilliant move detection)
// ─────────────────────────────────────────────────────────────

/**
 * Get all pieces of a given color that can capture on a target square.
 */
function getAttackers(fen: string, square: Square, attackerColor: "w" | "b"): { square: Square; type: string }[] {
  const board = new Chess(fen);

  // Set the color to move to the attacker's color
  const parts = fen.split(" ");
  parts[1] = attackerColor;
  parts[3] = "-"; // clear en passant to avoid edge cases
  try {
    board.load(parts.join(" "));
  } catch {
    return [];
  }

  const attackers: { square: Square; type: string }[] = [];
  const moves = board.moves({ verbose: true });

  for (const move of moves) {
    if (move.to === square) {
      attackers.push({ square: move.from, type: move.piece });
    }
  }

  return attackers;
}

/**
 * Check if a piece is hanging (can be captured for profit or undefended).
 */
function isPieceHanging(
  fenBefore: string,
  fenAfter: string,
  square: Square,
): boolean {
  const boardBefore = new Chess(fenBefore);
  const boardAfter = new Chess(fenAfter);

  const piece = boardAfter.get(square);
  if (!piece) return false;

  const pieceColor = piece.color;
  const opponentColor = pieceColor === "w" ? "b" : "w";

  // Check if there was a piece on this square before (trade detection)
  const previousPiece = boardBefore.get(square);
  if (previousPiece && previousPiece.color !== pieceColor) {
    // Just traded — if we captured something of equal or greater value, not hanging
    if (PIECE_VALUES[previousPiece.type] >= PIECE_VALUES[piece.type]) {
      return false;
    }
  }

  const attackers = getAttackers(fenAfter, square, opponentColor);
  if (attackers.length === 0) return false;

  // If any attacker has lower value than this piece, it's hanging
  if (attackers.some(atk => PIECE_VALUES[atk.type] < PIECE_VALUES[piece.type])) {
    return true;
  }

  // If more attackers than defenders, it's hanging
  const defenders = getAttackers(fenAfter, square, pieceColor);
  if (attackers.length > defenders.length) {
    const minAttackerValue = Math.min(...attackers.map(a => PIECE_VALUES[a.type]));

    // If taking would be a sacrifice for the attacker and there are defenders, not truly hanging
    if (PIECE_VALUES[piece.type] < minAttackerValue && defenders.length > 0) {
      return false;
    }

    // Pawn defense counts
    if (defenders.some(d => PIECE_VALUES[d.type] === 1)) {
      return false;
    }

    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

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
 * Win probability from centipawns (Lichess formula, derived from real game data).
 * Returns 0-100 where 50 = equal.
 */
function winPercent(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/**
 * Per-move accuracy using the Lichess/CAPS2 exponential decay formula.
 * winDiff is the win percentage points lost (0-100 scale).
 */
function moveAccuracyFromWinDiff(winDiff: number): number {
  if (winDiff <= 0) return 100;
  // Lichess formula with +1 uncertainty bonus
  const raw = 103.1668 * Math.exp(-0.04354 * winDiff) - 3.1669 + 1;
  return Math.max(0, Math.min(100, raw));
}

// ─────────────────────────────────────────────────────────────
// Main analysis function
// ─────────────────────────────────────────────────────────────

export async function analyzeGame(
  pgn: string,
  depth: number = 18,
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

  // ── Phase 1: Evaluate every position with engine ──
  // First pass uses MultiPV=1 (fast). We'll selectively re-evaluate
  // positions with MultiPV=2 only where needed for brilliant/great detection.

  interface PositionEval {
    fen: string;
    topLine: EngineEval;          // best move
    secondLine: EngineEval | null; // 2nd best (for brilliant/great detection)
    isCheckmate: boolean;
    isStalemate: boolean;
    legalMoveCount: number;
  }

  const positionEvals: PositionEval[] = [];
  const game = new Chess();
  const bookMoveCount = Math.min(8, Math.floor(history.length * 0.1));

  // Send ucinewgame once at the start to clear hash tables
  engine["send"]("ucinewgame");
  engine["send"]("isready");
  await engine["waitFor"]("readyok", 5000);

  // Evaluate starting position (shallow for start pos, doesn't need MultiPV)
  const startEval = await engine.evaluate(game.fen(), depth, 1, 15000);
  const startBoard = new Chess(game.fen());
  positionEvals.push({
    fen: game.fen(),
    topLine: startEval.lines[0] || { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] },
    secondLine: null,
    isCheckmate: false,
    isStalemate: false,
    legalMoveCount: startBoard.moves().length,
  });

  // Evaluate each position after each move (MultiPV=1 for speed)
  for (let i = 0; i < history.length; i++) {
    game.move(history[i].san);
    const fen = game.fen();
    const isCheckmate = game.isCheckmate();
    const isStalemate = game.isStalemate();
    const legalMoveCount = game.moves().length;

    if (isCheckmate) {
      positionEvals.push({
        fen,
        topLine: { bestMove: "", eval: 0, mate: 0, depth: 0, pv: [] },
        secondLine: null,
        isCheckmate: true,
        isStalemate: false,
        legalMoveCount: 0,
      });
    } else if (isStalemate || game.isDraw()) {
      positionEvals.push({
        fen,
        topLine: { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] },
        secondLine: null,
        isCheckmate: false,
        isStalemate: true,
        legalMoveCount,
      });
    } else {
      // Skip deep analysis for book moves — use lower depth
      const evalDepth = i < bookMoveCount ? Math.min(depth, 10) : depth;

      // Skip deep analysis for forced moves (only 1 legal move)
      const useDepth = legalMoveCount <= 1 ? Math.min(evalDepth, 8) : evalDepth;

      try {
        const result = await engine.evaluate(fen, useDepth, 1, 15000);
        positionEvals.push({
          fen,
          topLine: result.lines[0] || { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] },
          secondLine: null,
          isCheckmate: false,
          isStalemate: false,
          legalMoveCount,
        });
      } catch (error) {
        console.error(`Failed to evaluate position at move ${i + 1}:`, error);
        positionEvals.push({
          fen,
          topLine: { bestMove: "", eval: 0, mate: null, depth: 0, pv: [] },
          secondLine: null,
          isCheckmate: false,
          isStalemate: false,
          legalMoveCount,
        });
      }
    }
  }

  // ── Phase 1b: Selective MultiPV=2 re-evaluation ──
  // Only re-evaluate positions where the player played the engine's top move
  // (candidates for brilliant/great). This is much faster than doing MultiPV=2
  // on every position since only ~30-50% of moves match the top move.
  for (let i = 0; i < history.length; i++) {
    const posBefore = positionEvals[i];
    if (posBefore.isCheckmate || posBefore.isStalemate) continue;
    if (posBefore.legalMoveCount <= 1) continue; // forced, no need
    if (i < bookMoveCount) continue; // book moves, no need

    const move = history[i];
    const playerMoveUCI = `${move.from}${move.to}${move.promotion ?? ""}`;
    const isTopMove = posBefore.topLine.bestMove === playerMoveUCI;

    if (isTopMove) {
      try {
        const result = await engine.evaluate(posBefore.fen, depth, 2, 15000);
        posBefore.topLine = result.lines[0] || posBefore.topLine;
        posBefore.secondLine = result.lines[1] || null;
      } catch {
        // Keep existing eval
      }
    }
  }

  // ── Phase 2: Classify every move ──

  const bookMoves = bookMoveCount;

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const color: "white" | "black" = move.color === "w" ? "white" : "black";
    const moveColor = move.color; // "w" | "b"
    const moveNumber = Math.floor(i / 2) + 1;
    const halfMoveNumber = i + 1;

    const posBefore = positionEvals[i];     // position before this move
    const posAfter = positionEvals[i + 1];  // position after this move

    const prevEval = posBefore.topLine;     // engine's best eval of position before
    const afterEval = posAfter.topLine;     // engine's eval of position after

    // ── Convert evaluations to the mover's perspective ──
    // Engine evals are always from side-to-move's perspective.
    // prevEval is from mover's perspective (they're about to move).
    // afterEval is from opponent's perspective (opponent is about to move).
    // We need both in mover's perspective to compute eval loss.

    const prevEvalType = prevEval.mate !== null ? "mate" : "cp";
    const afterEvalType = afterEval.mate !== null ? "mate" : "cp";

    // Mover's perspective absolute values
    const prevAbsEval = prevEval.mate !== null
      ? prevEval.mate
      : prevEval.eval;
    const afterAbsEval = afterEval.mate !== null
      ? -afterEval.mate  // negate: after is from opponent's perspective
      : -afterEval.eval;

    // For white's perspective storage (used in UI)
    const bestEvalWhite = moveColor === "w" ? prevEval.eval : -prevEval.eval;
    const afterEvalWhite = moveColor === "w" ? -afterEval.eval : afterEval.eval;
    const evalDrop = afterAbsEval - prevAbsEval; // negative = worse

    // Mate values from white's perspective
    const mateWhite = afterEval.mate !== null
      ? (moveColor === "w" ? -afterEval.mate : afterEval.mate)
      : null;

    // ── Compute centipawn eval loss from mover's perspective ──
    // Use the engine's best line eval vs the actual position eval
    let cpEvalLoss: number;

    const playerMoveUCI = `${move.from}${move.to}${move.promotion ?? ""}`;
    const isTopMove = posBefore.topLine.bestMove === playerMoveUCI;

    if (prevEvalType === "cp" && afterEvalType === "cp") {
      // Both are centipawn evaluations — straightforward loss calculation
      cpEvalLoss = prevEval.eval - (-afterEval.eval); // from mover's perspective
    } else {
      // Mate involved — use large values
      const prevCpEquiv = prevEval.mate !== null
        ? (prevEval.mate > 0 ? 10000 : -10000)
        : prevEval.eval;
      const afterCpEquiv = afterEval.mate !== null
        ? (-afterEval.mate > 0 ? 10000 : -10000)
        : -afterEval.eval;
      cpEvalLoss = prevCpEquiv - afterCpEquiv;
    }

    cpEvalLoss = Math.max(0, cpEvalLoss); // can't have negative loss

    // 2nd best line info (for brilliant/great detection)
    const secondLine = posBefore.secondLine;
    const secondAbsEval = secondLine
      ? (secondLine.mate !== null ? (secondLine.mate > 0 ? 10000 : -10000) : secondLine.eval)
      : null;

    // ── Determine classification ──
    let classification: MoveClassification = "good"; // default

    const noMate = prevEvalType === "cp" && afterEvalType === "cp";

    // Forced: only one legal move available
    if (posBefore.legalMoveCount <= 1) {
      classification = "forced";
    }
    // Standard case: no mates involved — use position-dependent thresholds
    else if (noMate) {
      const prevEvalAbs = Math.abs(prevEval.eval);

      // If the player played the engine's top move, classify based on
      // eval loss (should be ~0 but engine depth differences can cause
      // small discrepancies). Don't auto-assign "best" — validate it.
      if (isTopMove && cpEvalLoss <= getEvalLossThreshold("best", prevEvalAbs)) {
        classification = "best";
      } else {
        const thresholds: Array<"best" | "excellent" | "good" | "inaccuracy" | "mistake"> =
          ["best", "excellent", "good", "inaccuracy", "mistake"];

        classification = "blunder"; // default if no threshold matches
        for (const classif of thresholds) {
          if (cpEvalLoss <= getEvalLossThreshold(classif, prevEvalAbs)) {
            classification = classif;
            break;
          }
        }
      }
    }
    // No mate before, but player blundered into a mate
    else if (prevEvalType === "cp" && afterEvalType === "mate") {
      const mateForMover = -afterEval.mate!; // from mover's perspective
      if (mateForMover > 0) {
        classification = "best"; // found a mate — great!
      } else if (mateForMover >= -2) {
        classification = "blunder"; // allowed mate in 1-2
      } else if (mateForMover >= -5) {
        classification = "mistake";
      } else {
        classification = "inaccuracy";
      }
    }
    // Had forced mate before, no longer mate
    else if (prevEvalType === "mate" && afterEvalType === "cp") {
      const prevMateForMover = prevEval.mate!;
      const afterCpForMover = -afterEval.eval;

      if (prevMateForMover < 0 && afterCpForMover < 0) {
        // Was mated, still losing — best we can do
        classification = "best";
      } else if (afterCpForMover >= 400) {
        classification = "good"; // lost mate but still very winning
      } else if (afterCpForMover >= 150) {
        classification = "inaccuracy";
      } else if (afterCpForMover >= -100) {
        classification = "mistake";
      } else {
        classification = "blunder";
      }
    }
    // Both mate — compare mate distances
    else if (prevEvalType === "mate" && afterEvalType === "mate") {
      const prevMateForMover = prevEval.mate!;
      const afterMateForMover = -afterEval.mate!;

      if (prevMateForMover > 0) {
        // We had mate
        if (afterMateForMover < 0) {
          // Now opponent has mate — blunder
          classification = "blunder";
        } else if (afterMateForMover <= -4) {
          // Allowed opponent to have long mate — mistake
          classification = "mistake";
        } else if (afterMateForMover < prevMateForMover) {
          // Found a shorter or equal mate — best
          classification = "best";
        } else if (afterMateForMover <= prevMateForMover + 2) {
          // Slightly longer mate — excellent
          classification = "excellent";
        } else {
          classification = "good";
        }
      } else {
        // Opponent had mate against us
        if (afterMateForMover === prevMateForMover) {
          classification = "best"; // maintained same distance
        } else {
          classification = "good";
        }
      }
    }

    // ── Safeguards ──
    // Chess.com is conservative with blunders — most errors are mistakes.

    // Don't call it a blunder if the position is still completely winning
    if (classification === "blunder" && afterAbsEval >= 400) {
      classification = "mistake";
    }

    // Don't call it a blunder if you were already in a completely lost position
    if (
      classification === "blunder" &&
      prevAbsEval <= -400 &&
      prevEvalType === "cp" &&
      afterEvalType === "cp"
    ) {
      classification = "mistake";
    }

    // Downgrade mistake to inaccuracy if still clearly winning
    if (classification === "mistake" && afterAbsEval >= 600) {
      classification = "inaccuracy";
    }

    // Downgrade mistake to inaccuracy if already clearly lost
    if (
      classification === "mistake" &&
      prevAbsEval <= -600 &&
      prevEvalType === "cp" &&
      afterEvalType === "cp"
    ) {
      classification = "inaccuracy";
    }

    // ── Brilliant move detection ──
    // Chess.com awards brilliant very rarely. Requirements:
    // 1. Must be the engine's top move
    // 2. Not a promotion, not in check (forced moves aren't brilliant)
    // 3. Position is NOT already clearly winning (prevEval < 300cp)
    // 4. 2nd best move is significantly worse (gap >= 300cp between 1st and 2nd)
    // 5. Must involve a genuine sacrifice (hanging piece worth >= 3, i.e. minor piece+)
    // 6. The sacrifice must not be recapturable for equal/greater material
    if (classification === "best" && !move.san.includes("=")) {
      const lastBoard = new Chess(posBefore.fen);

      if (!lastBoard.isCheck()) {
        // Not already winning significantly
        const prevMoverEval = prevEval.mate !== null
          ? (prevEval.mate > 0 ? 10000 : -10000)
          : prevEval.eval;
        const notAlreadyWinning = prevMoverEval < 300;

        // Must have a 2nd line and the gap must be large
        const topEvalForGap = prevEval.mate !== null
          ? (prevEval.mate > 0 ? 10000 : -10000)
          : prevEval.eval;
        const hasLargeGap = secondAbsEval !== null &&
          Math.abs(topEvalForGap - secondAbsEval) >= 300;

        if (notAlreadyWinning && hasLargeGap && afterAbsEval >= 0) {
          // Look for hanging pieces of our color after the move (sacrifice)
          const currentBoard = new Chess(posAfter.fen);
          let foundSacrifice = false;

          for (const row of currentBoard.board()) {
            for (const piece of row) {
              if (!piece) continue;
              if (piece.color !== moveColor) continue;
              // Must be a significant piece (minor piece or higher, not pawn/king)
              if (piece.type === "k" || piece.type === "p") continue;

              // The piece we captured shouldn't count as our sacrifice
              const lastPieceOnTarget = lastBoard.get(move.to as Square);
              if (lastPieceOnTarget && PIECE_VALUES[lastPieceOnTarget.type] >= PIECE_VALUES[piece.type]) {
                continue;
              }

              if (isPieceHanging(posBefore.fen, posAfter.fen, piece.square as Square)) {
                foundSacrifice = true;
                break;
              }
            }
            if (foundSacrifice) break;
          }

          if (foundSacrifice) {
            classification = "brilliant";
          }
        }
      }
    }

    // ── Great move detection ──
    // Chess.com: "Critical to the outcome of the game — turning a losing
    // position into equal, or equal into winning, or finding the only
    // good move in a critical position."
    //
    // Conditions:
    // 1. Must be the best move (or near-best)
    // 2. Opponent's previous move was a mistake or blunder (created opportunity)
    // 3. Significant gap between 1st and 2nd best moves (only move that works)
    // 4. The moved piece isn't just a free capture
    if (
      classification === "best" &&
      i > 0 &&
      moves[i - 1] &&
      ["blunder", "mistake", "miss"].includes(moves[i - 1].classification) &&
      secondAbsEval !== null
    ) {
      const topEval = prevEval.mate !== null
        ? (prevEval.mate > 0 ? 10000 : -10000)
        : prevEval.eval;
      const gap = Math.abs(topEval - secondAbsEval);
      if (gap >= 150) {
        try {
          if (!isPieceHanging(posBefore.fen, posAfter.fen, move.to as Square)) {
            classification = "great";
          }
        } catch {
          // isPieceHanging can fail on edge cases, skip
        }
      }
    }

    // ── Miss detection ──
    // Opponent just made a mistake/blunder, but you failed to capitalize.
    // Must be an inaccuracy, mistake, or blunder.
    if (
      i > 0 &&
      moves[i - 1] &&
      ["blunder", "mistake"].includes(moves[i - 1].classification) &&
      ["inaccuracy", "mistake", "blunder"].includes(classification)
    ) {
      classification = "miss";
    }

    // ── Book moves ──
    // Apply book classification to early moves that are positively classified
    const isBook = i < bookMoves;
    if (isBook && ["best", "excellent", "good", "forced"].includes(classification)) {
      classification = "book";
    }

    // ── Calculate per-move accuracy ──
    // Use Lichess/CAPS2 exponential decay based on win% lost
    let accuracy: number;
    if (classification === "book" || classification === "forced") {
      accuracy = 100;
    } else if (posAfter.isCheckmate) {
      accuracy = 100; // delivering checkmate is always perfect
    } else {
      const wpBefore = winPercent(prevEval.mate !== null ? (prevEval.mate > 0 ? 1000 : -1000) : prevEval.eval);
      const wpAfter = winPercent(afterEval.mate !== null ? (afterEval.mate > 0 ? -1000 : 1000) : -afterEval.eval);
      // wpBefore/wpAfter are from side-to-move perspective already
      // prevEval is from mover's POV, afterEval from opponent POV (so negate)
      const winDiff = Math.max(0, wpBefore - wpAfter);
      accuracy = moveAccuracyFromWinDiff(winDiff);
    }

    // ── Build the move object ──
    const bestMoveSan = uciToSan(posBefore.fen, posBefore.topLine.bestMove);

    const isBlunder = classification === "blunder";
    const isMistake = classification === "mistake";
    const isInaccuracy = classification === "inaccuracy";

    const analyzedMove: AnalyzedMove = {
      moveNumber,
      move: playerMoveUCI,
      san: move.san,
      fen: posAfter.fen,
      fenBefore: posBefore.fen,
      color,
      engineEval: afterEvalWhite,
      mate: mateWhite,
      bestMove: posBefore.topLine.bestMove,
      bestMoveSan,
      evalBefore: bestEvalWhite,
      evalDrop,
      classification,
      accuracy,
      isBlunder,
      isMistake,
      isInaccuracy,
      tacticalThemes: [],
    };

    moves.push(analyzedMove);

    // Track blunders/mistakes/inaccuracies
    if (isBlunder || isMistake || isInaccuracy) {
      blunders.push({
        moveNumber,
        playerMove: playerMoveUCI,
        bestMove: posBefore.topLine.bestMove,
        evalBeforeCp: bestEvalWhite,
        evalAfterCp: afterEvalWhite,
        severity: isBlunder ? "blunder" : isMistake ? "mistake" : "inaccuracy",
        missedTactic: null,
        consequence: null,
      });
    }

    evalGraph.push({
      move: halfMoveNumber,
      eval: afterEvalWhite,
      mate: mateWhite,
    });
  }

  // ── Phase 3: Calculate game accuracy ──
  // Uses per-move win% accuracy averaged across all moves.
  // This is more robust than classification-weighted accuracy because
  // it doesn't amplify classification boundary errors into the score.

  const whiteMoves = moves.filter((m) => m.color === "white");
  const blackMoves = moves.filter((m) => m.color === "black");

  function gameAccuracy(playerMoves: AnalyzedMove[]): number {
    if (playerMoves.length === 0) return 0;
    const total = playerMoves.reduce((sum, m) => sum + m.accuracy, 0);
    return total / playerMoves.length;
  }

  return {
    gameId,
    pgn,
    moves,
    blunders,
    whiteAccuracy: gameAccuracy(whiteMoves),
    blackAccuracy: gameAccuracy(blackMoves),
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
