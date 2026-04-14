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

/**
 * Generate a human-readable annotation for a single analyzed move.
 * Returns null for good moves (best/excellent/great/brilliant/good/book/forced).
 */
export function annotateMove(move: AnalyzedMove): string | null {
  const { classification, evalDrop, san, bestMoveSan, fenBefore, bestMove } = move;

  // Only annotate bad moves
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
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `${severityPrefix(drop)}${bestLabel} ${TACTIC_VERB[missedTactic]}. This move loses ${pawns(drop)} pawns of material.`;
    }
    return `${severityPrefix(drop)}${bestLabel} was significantly better, costing roughly ${pawns(drop)} pawns.`;
  }

  if (classification === "mistake") {
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `${bestLabel} would ${TACTIC_VERB[missedTactic]} more effectively (${pawns(drop)} pawn difference).`;
    }
    return `A mistake. ${bestLabel} was the better choice, losing ${pawns(drop)} fewer pawns.`;
  }

  if (classification === "inaccuracy") {
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `Slightly inaccurate — ${bestLabel} could ${TACTIC_VERB[missedTactic]}.`;
    }
    return `Slightly inaccurate. ${bestLabel} was more precise (${pawns(drop)} pawn difference).`;
  }

  if (classification === "miss") {
    if (missedTactic && TACTIC_VERB[missedTactic]) {
      return `Missed opportunity: ${bestLabel} would ${TACTIC_VERB[missedTactic]}.`;
    }
    return `A missed opportunity. ${bestLabel} was stronger here.`;
  }

  return null;
}
