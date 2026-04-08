/**
 * Tactical theme detection from analysis data.
 * Given a position (FEN) and the engine's best move (UCI),
 * returns the tactical theme that was available — or null if none detected.
 */
import { Chess } from "chess.js";

const PIECE_VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };

/** Return the square of the king of the given color, or null. */
function findKingSquare(chess: Chess, color: "w" | "b"): string | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === "k" && p.color === color) {
        return String.fromCharCode(97 + c) + (8 - r);
      }
    }
  }
  return null;
}

/**
 * Create a Chess instance with the active colour flipped.
 * Useful for generating pseudo-legal move lists for the non-active side.
 */
function withFlippedTurn(chess: Chess): Chess {
  const parts = chess.fen().split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  try {
    return new Chess(parts.join(" "));
  } catch {
    return chess;
  }
}

/**
 * Count how many pieces of `enemyColor` with value >= minValue
 * are attacked by the piece now sitting on `square`.
 */
function valuablePiecesAttackedFrom(
  chess: Chess,
  square: string,
  enemyColor: "w" | "b",
  minValue = 3
): number {
  // We need moves for the side that just moved — flip turn to get them
  const flipped = withFlippedTurn(chess);
  const moves = flipped.moves({ square: square as Parameters<typeof flipped.moves>[0]["square"], verbose: true });
  let count = 0;
  for (const m of moves) {
    const target = chess.get(m.to as Parameters<typeof chess.get>[0]);
    if (target && target.color === enemyColor && (PIECE_VALUE[target.type] ?? 0) >= minValue) {
      count++;
    }
  }
  return count;
}

/**
 * Check whether the piece sitting on `square` can be recaptured
 * by any piece of `byColor` (i.e. the square is defended by that side).
 */
function isDefendedBy(chess: Chess, square: string, byColor: "w" | "b"): boolean {
  const parts = chess.fen().split(" ");
  parts[1] = byColor;
  try {
    const temp = new Chess(parts.join(" "));
    const moves = temp.moves({ verbose: true });
    return moves.some((m) => m.to === square);
  } catch {
    return false;
  }
}

export function detectMissedTactic(
  fenBefore: string,
  bestMoveUci: string
): string | null {
  if (!fenBefore || !bestMoveUci || bestMoveUci.length < 4) return null;

  const from = bestMoveUci.slice(0, 2);
  const to = bestMoveUci.slice(2, 4);
  const promotion = bestMoveUci.length > 4 ? bestMoveUci[4] : undefined;

  let chess: Chess;
  try {
    chess = new Chess(fenBefore);
  } catch {
    return null;
  }

  // Determine who is making the best move
  const moverColor = chess.turn(); // "w" or "b"
  const enemyColor: "w" | "b" = moverColor === "w" ? "b" : "w";

  let moveResult;
  try {
    moveResult = chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
  } catch {
    return null;
  }

  // 1. Checkmate
  if (chess.isCheckmate()) {
    // Check if it's a back-rank mate
    const kingSquare = findKingSquare(chess, enemyColor);
    if (kingSquare) {
      const rank = kingSquare[1];
      if (rank === "1" || rank === "8") return "backRankMate";
    }
    return "mate";
  }

  // 2. Promotion
  if (moveResult.promotion) return "promotion";

  // 3. Hanging piece capture (enemy piece was undefended before the move)
  if (moveResult.captured) {
    // Was the captured piece defended by the enemy before the move?
    const chessOriginal = new Chess(fenBefore);
    const wasDefended = isDefendedBy(chessOriginal, to, enemyColor);
    if (!wasDefended) return "hangingPiece";
  }

  // 4. Fork — piece now on `to` attacks 2+ valuable enemy pieces (value >= 3)
  const attacked = valuablePiecesAttackedFrom(chess, to, enemyColor, 3);
  if (attacked >= 2) return "fork";

  // 5. Check that constrains the king significantly (discovered attack / skewer / pin)
  if (chess.isCheck()) {
    // If the moving piece is a rook/queen and the check is along a rank/file,
    // there may be a skewer or back-rank threat
    if (moveResult.piece === "r" || moveResult.piece === "q") {
      const kingSquare = findKingSquare(chess, enemyColor);
      if (kingSquare) {
        const rank = kingSquare[1];
        if (rank === "1" || rank === "8") return "backRankMate";
      }
      return "skewer";
    }
    return "discoveredAttack";
  }

  // 6. Knight move that attacks exactly one valuable piece → could still be a "fork"
  // if combined with a previous threat (softer detection)
  if (moveResult.piece === "n" && attacked >= 1) return "fork";

  return null;
}
