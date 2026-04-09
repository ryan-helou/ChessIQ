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

/** Create a Chess instance with the active colour flipped. */
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

/** Check whether the piece sitting on `square` can be recaptured by `byColor`. */
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

/**
 * Simple static exchange evaluation — estimate net material gain from capturing on `square`.
 * Positive = winning trade, negative = losing trade.
 */
function staticExchangeEval(chess: Chess, square: string, capturingColor: "w" | "b"): number {
  const target = chess.get(square as Parameters<typeof chess.get>[0]);
  if (!target) return 0;

  const gain = PIECE_VALUE[target.type] ?? 0;

  // Find the least valuable attacker of this square for the capturing side
  const parts = chess.fen().split(" ");
  parts[1] = capturingColor;
  try {
    const temp = new Chess(parts.join(" "));
    const attackers = temp.moves({ verbose: true }).filter((m) => m.to === square);
    if (attackers.length === 0) return 0;
    // Pick lowest-value attacker
    attackers.sort(
      (a, b) => (PIECE_VALUE[a.piece] ?? 0) - (PIECE_VALUE[b.piece] ?? 0)
    );
    const attacker = attackers[0];
    const attackerValue = PIECE_VALUE[attacker.piece] ?? 0;
    // Simplistic SEE: gain - attacker value if recaptured (1 ply deep)
    const enemyColor: "w" | "b" = capturingColor === "w" ? "b" : "w";
    const afterCapture = new Chess(chess.fen());
    afterCapture.move({ from: attacker.from, to: square });
    const recaptured = isDefendedBy(afterCapture, square, enemyColor);
    return recaptured ? gain - attackerValue : gain;
  } catch {
    return 0;
  }
}

/**
 * Detect if a sliding piece on `sliderSq` pins an enemy piece to their king.
 * Returns true if any enemy piece along the slider's ray can't move (pinned).
 */
function detectPin(
  chess: Chess,
  sliderSq: string,
  enemyColor: "w" | "b"
): boolean {
  const slider = chess.get(sliderSq as Parameters<typeof chess.get>[0]);
  if (!slider || !["b", "r", "q"].includes(slider.type)) return false;

  const kingSquare = findKingSquare(chess, enemyColor);
  if (!kingSquare) return false;

  const [sc, sr] = [sliderSq.charCodeAt(0) - 97, parseInt(sliderSq[1]) - 1];
  const [kc, kr] = [kingSquare.charCodeAt(0) - 97, parseInt(kingSquare[1]) - 1];

  const dc = Math.sign(kc - sc);
  const dr = Math.sign(kr - sr);

  // Only along valid slider rays
  const isRook = slider.type === "r";
  const isBishop = slider.type === "b";
  const isQueen = slider.type === "q";
  const isDiagonal = dc !== 0 && dr !== 0;
  const isStraight = dc === 0 || dr === 0;

  if (isRook && isDiagonal) return false;
  if (isBishop && isStraight) return false;
  if (!isQueen && isDiagonal && isRook) return false;

  // Walk the ray looking for exactly one piece between slider and king
  let foundPiece: string | null = null;
  let c = sc + dc;
  let r = sr + dr;
  while (c >= 0 && c < 8 && r >= 0 && r < 8) {
    const sq = String.fromCharCode(97 + c) + (r + 1);
    if (sq === kingSquare) {
      // Found king with exactly one piece in between → pin
      return foundPiece !== null;
    }
    const piece = chess.get(sq as Parameters<typeof chess.get>[0]);
    if (piece) {
      if (foundPiece !== null) return false; // Two pieces in the way — not a pin
      if (piece.color !== enemyColor) return false; // Our own piece blocking
      foundPiece = sq;
    }
    c += dc;
    r += dr;
  }
  return false;
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

  const moverColor = chess.turn();
  const enemyColor: "w" | "b" = moverColor === "w" ? "b" : "w";

  let moveResult;
  try {
    moveResult = chess.move({ from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined });
  } catch {
    return null;
  }

  // 1. Checkmate
  if (chess.isCheckmate()) {
    const kingSquare = findKingSquare(chess, enemyColor);
    if (kingSquare) {
      const rank = kingSquare[1];
      if (rank === "1" || rank === "8") return "backRankMate";
    }
    return "mate";
  }

  // 2. Promotion
  if (moveResult.promotion) return "promotion";

  // 3. Hanging piece capture (undefended enemy piece)
  if (moveResult.captured) {
    const chessOriginal = new Chess(fenBefore);
    const wasDefended = isDefendedBy(chessOriginal, to, enemyColor);
    if (!wasDefended) return "hangingPiece";
  }

  // 4. Fork — piece now on `to` attacks 2+ valuable enemy pieces
  const attacked = valuablePiecesAttackedFrom(chess, to, enemyColor, 3);
  if (attacked >= 2) return "fork";

  // 5. Back-rank threat / discovered attack through check
  if (chess.isCheck()) {
    const kingSquare = findKingSquare(chess, enemyColor);
    if (kingSquare && (kingSquare[1] === "1" || kingSquare[1] === "8")) {
      if (moveResult.piece === "r" || moveResult.piece === "q") return "backRankMate";
    }
    if (moveResult.piece !== from) return "discoveredAttack"; // piece came from elsewhere
    if (moveResult.piece === "r" || moveResult.piece === "q") return "skewer";
    return "discoveredAttack";
  }

  // 6. Knight fork (softer — attacks 1+ valuable piece)
  if (moveResult.piece === "n" && attacked >= 1) return "fork";

  // 7. Winning capture via material gain (trade up even if defended)
  if (moveResult.captured) {
    const see = staticExchangeEval(new Chess(fenBefore), to, moverColor);
    if (see > 0) return "materialGain";
  }

  // 8. Pin — after the move, a sliding piece pins an enemy piece to their king
  if (detectPin(chess, to, enemyColor)) return "pin";

  // 9. Skewer — sliding piece attacks through an enemy piece to a more valuable piece
  if (["b", "r", "q"].includes(moveResult.piece)) {
    const flipped = withFlippedTurn(chess);
    const rayMoves = flipped.moves({ square: to as Parameters<typeof flipped.moves>[0]["square"], verbose: true });
    for (const m of rayMoves) {
      const target = chess.get(m.to as Parameters<typeof chess.get>[0]);
      if (!target || target.color !== enemyColor) continue;
      // Check if there's a more valuable piece behind this one
      const tc = m.to.charCodeAt(0) - 97;
      const tr = parseInt(m.to[1]) - 1;
      const fc = (to as string).charCodeAt(0) - 97;
      const fr = parseInt((to as string)[1]) - 1;
      const dc = Math.sign(tc - fc);
      const dr = Math.sign(tr - fr);
      let nc = tc + dc;
      let nr = tr + dr;
      while (nc >= 0 && nc < 8 && nr >= 0 && nr < 8) {
        const sq = String.fromCharCode(97 + nc) + (nr + 1);
        const behind = chess.get(sq as Parameters<typeof chess.get>[0]);
        if (behind) {
          if (behind.color === enemyColor && (PIECE_VALUE[behind.type] ?? 0) > (PIECE_VALUE[target.type] ?? 0)) {
            return "skewer";
          }
          break;
        }
        nc += dc;
        nr += dr;
      }
    }
  }

  // 10. Double attack / threat on a single valuable piece
  const singleAttack = valuablePiecesAttackedFrom(chess, to, enemyColor, 5);
  if (singleAttack >= 1) return "discoveredAttack";

  return null;
}
