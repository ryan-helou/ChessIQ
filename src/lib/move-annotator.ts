/**
 * Generates human-readable move annotations for the game review panel.
 * Given an analyzed move and its missed tactic, returns a short explanation
 * of what went wrong and what was better.
 */

import type { AnalyzedMove } from "@/lib/backend-api";
import { detectMissedTactic } from "@/lib/tactic-detector";

// Short phrases describing what a given tactic achieves
const TACTIC_VERB: Record<string, string> = {
  mate:              "delivers checkmate",
  backRankMate:      "forces back-rank mate",
  promotion:         "promotes a pawn to a queen",
  hangingPiece:      "captures the hanging (undefended) piece",
  fork:              "forks two pieces at once",
  discoveredAttack:  "unleashes a discovered attack",
  skewer:            "skewers a piece to win material",
  materialGain:      "wins material",
  pin:               "pins a piece to the king",
  exposedKing:       "exploits the exposed king",
  weakKingSafety:    "attacks the weak king shelter",
  inactivePieces:    "activates a dormant piece",
  pawnStructure:     "improves pawn structure",
  poorPawnStructure: "avoids a pawn weakness",
  overextension:     "avoids overextending",
  positional:        "secures a positional advantage",
};

// Severity context phrases
function severityPrefix(evalDropAbs: number): string {
  if (evalDropAbs >= 500) return "A serious blunder — ";
  if (evalDropAbs >= 200) return "A costly mistake — ";
  if (evalDropAbs >= 100) return "An inaccuracy — ";
  return "";
}

function pawns(cp: number): string {
  return (Math.abs(cp) / 100).toFixed(1);
}

// Tactic-specific descriptions for bad moves (what the opponent can now do)
const TACTIC_ALLOWS: Record<string, string> = {
  mate:              "This allows checkmate",
  backRankMate:      "This allows a devastating back-rank mate",
  promotion:         "This allows a pawn promotion to queen",
  hangingPiece:      "This leaves a piece hanging and undefended",
  fork:              "This allows a fork attacking two pieces simultaneously",
  discoveredAttack:  "This allows a dangerous discovered attack",
  skewer:            "This allows a skewer winning material behind the attacked piece",
  materialGain:      "This gives away material",
  pin:               "This allows a pin against the king",
  exposedKing:       "This fatally exposes the king",
  weakKingSafety:    "This weakens the king shelter",
  inactivePieces:    "This leaves pieces passive and uncoordinated",
  pawnStructure:     "This damages the pawn structure",
  poorPawnStructure: "This creates a lasting pawn weakness",
  overextension:     "This overextends the position dangerously",
  positional:        "This concedes a significant positional advantage",
};

/**
 * Generate a human-readable annotation for a single analyzed move.
 * Returns annotations for both positive moves (brilliant, great, best, excellent, forced)
 * and negative moves (blunder, mistake, inaccuracy, miss).
 * Returns null for routine moves (good, book).
 */
export function annotateMove(move: AnalyzedMove): string | null {
  const { classification, evalDrop, san, bestMoveSan, fenBefore, bestMove } = move;

  // --- Positive move annotations ---

  if (classification === "brilliant") {
    if (bestMoveSan && bestMoveSan === san) {
      return `A brilliant sacrifice — ${san} is an unexpected move that creates a decisive advantage.`;
    }
    return "A brilliant sacrifice — this unexpected move creates a decisive advantage.";
  }

  if (classification === "great") {
    return "An excellent move — capitalizing on the opponent's error with the strongest continuation.";
  }

  if (classification === "best") {
    return "The engine's top choice in this position.";
  }

  if (classification === "excellent") {
    return "A strong move maintaining the advantage.";
  }

  if (classification === "good" || classification === "book") {
    return null;
  }

  if (classification === "forced") {
    return "The only reasonable move in this position.";
  }

  // --- Negative move annotations ---

  if (!["blunder", "mistake", "inaccuracy", "miss"].includes(classification)) {
    return null;
  }

  const drop = Math.abs(evalDrop ?? 0);

  // Detect what tactical theme was available at this position
  const missedTactic =
    fenBefore && bestMove && bestMove.length >= 4
      ? detectMissedTactic(fenBefore, bestMove)
      : null;

  const bestLabel = bestMoveSan ? `${bestMoveSan}` : "the engine move";

  if (classification === "blunder") {
    if (missedTactic && TACTIC_ALLOWS[missedTactic]) {
      return `${severityPrefix(drop)}${TACTIC_ALLOWS[missedTactic]}. ${bestLabel} ${TACTIC_VERB[missedTactic]}, saving ${pawns(drop)} pawns.`;
    }
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `${severityPrefix(drop)}${bestLabel} ${TACTIC_VERB[missedTactic]}. This move loses ${pawns(drop)} pawns of material.`;
    }
    return `${severityPrefix(drop)}${bestLabel} was significantly better, costing roughly ${pawns(drop)} pawns.`;
  }

  if (classification === "mistake") {
    if (missedTactic && TACTIC_ALLOWS[missedTactic]) {
      return `${TACTIC_ALLOWS[missedTactic]}. ${bestLabel} would ${TACTIC_VERB[missedTactic]} instead (${pawns(drop)} pawn difference).`;
    }
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `${bestLabel} would ${TACTIC_VERB[missedTactic]} more effectively (${pawns(drop)} pawn difference).`;
    }
    return `A mistake. ${bestLabel} was the better choice, losing ${pawns(drop)} fewer pawns.`;
  }

  if (classification === "inaccuracy") {
    if (missedTactic && TACTIC_ALLOWS[missedTactic]) {
      return `Slightly inaccurate — ${TACTIC_ALLOWS[missedTactic].toLowerCase().replace("this ", "")}. ${bestLabel} was more precise.`;
    }
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `Slightly inaccurate — ${bestLabel} could ${TACTIC_VERB[missedTactic]}.`;
    }
    return `Slightly inaccurate. ${bestLabel} was more precise (${pawns(drop)} pawn difference).`;
  }

  if (classification === "miss") {
    if (missedTactic && TACTIC_ALLOWS[missedTactic]) {
      return `Missed opportunity: ${bestLabel} would ${TACTIC_VERB[missedTactic]}.`;
    }
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `Missed opportunity: ${bestLabel} would ${TACTIC_VERB[missedTactic]}.`;
    }
    return `A missed opportunity. ${bestLabel} was stronger here.`;
  }

  return null;
}
