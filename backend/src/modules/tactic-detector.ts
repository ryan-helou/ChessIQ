import { Chess, Square, PieceSymbol, Color } from "chess.js";

// ─────────────────────────────────────────────────────────────
// Tactical Theme Detection
// ─────────────────────────────────────────────────────────────
// Uses chess.js heuristics to classify what type of tactic the
// engine's best move exploits. No extra Stockfish calls needed —
// works entirely from FEN + PV data already computed.
//
// Theme names match Lichess puzzle themes for compatibility.
// ─────────────────────────────────────────────────────────────

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const ALL_SQUARES: Square[] = [];
for (const file of "abcdefgh") {
  for (const rank of "12345678") {
    ALL_SQUARES.push((file + rank) as Square);
  }
}

/**
 * Detect tactical themes present in the engine's best move.
 *
 * @param fenBefore  Position before the best move (side to move = the blundering player's opponent... no, the side whose turn it is should play bestMove)
 * @param bestMoveUci  Engine's best move in UCI format
 * @param pv  Principal variation (full best line) — used for multi-move tactics
 * @param evalDrop  How much eval the player lost by NOT playing this (centipawns, positive = bad for player)
 * @returns Array of Lichess-compatible theme strings
 */
export function detectTactics(
  fenBefore: string,
  bestMoveUci: string,
  pv: string[],
  evalDrop: number = 0
): string[] {
  if (!bestMoveUci || bestMoveUci.length < 4) return [];

  const themes: string[] = [];

  try {
    const chess = new Chess(fenBefore);
    const sideToMove = chess.turn();
    const opponent: Color = sideToMove === "w" ? "b" : "w";

    // Parse the best move
    const from = bestMoveUci.slice(0, 2) as Square;
    const to = bestMoveUci.slice(2, 4) as Square;
    const promotion = bestMoveUci.length > 4 ? bestMoveUci[4] as PieceSymbol : undefined;

    const movingPiece = chess.get(from);
    if (!movingPiece) return [];

    const capturedPiece = chess.get(to);

    // Make the best move
    const moveResult = chess.move({ from, to, promotion });
    if (!moveResult) return [];

    // Position after best move
    const afterBestMove = new Chess(chess.fen());

    // ── Check for checkmate patterns ──
    if (afterBestMove.isCheckmate()) {
      if (isBackRankMate(afterBestMove, opponent)) {
        themes.push("backRankMate");
      }
      themes.push("mate");
      return themes; // Mate themes are sufficient
    }

    // ── Fork detection ──
    if (detectFork(afterBestMove, to, movingPiece.type, sideToMove, opponent)) {
      themes.push("fork");
    }

    // ── Pin detection ──
    if (detectPin(afterBestMove, sideToMove, opponent)) {
      themes.push("pin");
    }

    // ── Skewer detection ──
    if (detectSkewer(afterBestMove, sideToMove, opponent)) {
      themes.push("skewer");
    }

    // ── Discovered attack ──
    if (detectDiscoveredAttack(fenBefore, from, to, sideToMove, opponent)) {
      themes.push("discoveredAttack");
    }

    // ── Double check ──
    if (afterBestMove.inCheck()) {
      const kingSquare = findKing(afterBestMove, opponent);
      if (kingSquare) {
        const checkers = afterBestMove.attackers(kingSquare, sideToMove);
        if (checkers.length >= 2) {
          themes.push("doubleCheck");
        }
      }
    }

    // ── Hanging piece ──
    if (capturedPiece && !isDefended(new Chess(fenBefore), to, opponent)) {
      themes.push("hangingPiece");
    }

    // ── Trapped piece detection ──
    if (detectTrappedPiece(afterBestMove, opponent, sideToMove)) {
      themes.push("trappedPiece");
    }

    // ── Sacrifice detection ──
    if (detectSacrifice(movingPiece.type, capturedPiece?.type, evalDrop)) {
      themes.push("sacrifice");
    }

    // ── Promotion ──
    if (promotion) {
      themes.push("promotion");
    }

    // If we detected nothing specific but there was a large eval drop, tag as general tactics
    if (themes.length === 0 && evalDrop >= 200) {
      // Try to detect from PV continuation (multi-move tactics)
      const pvThemes = detectFromPV(fenBefore, pv, sideToMove);
      themes.push(...pvThemes);
    }
  } catch {
    // If anything goes wrong with chess.js, return empty
    return [];
  }

  return [...new Set(themes)]; // deduplicate
}

// ─────────────────────────────────────────────────────────────
// Individual tactic detectors
// ─────────────────────────────────────────────────────────────

/**
 * Fork: the moved piece attacks 2+ enemy pieces worth >= 3 (minor piece or higher),
 * or attacks king + any piece.
 */
function detectFork(
  board: Chess,
  movedTo: Square,
  _pieceType: PieceSymbol,
  attacker: Color,
  defender: Color
): boolean {
  // Get all squares this piece attacks from its new position
  const targets: { square: Square; value: number }[] = [];

  for (const sq of ALL_SQUARES) {
    const piece = board.get(sq);
    if (!piece || piece.color !== defender) continue;

    // Check if our piece on movedTo attacks this square
    if (board.isAttacked(sq, attacker)) {
      // Verify the attacker is actually the moved piece (not another piece)
      const attackers = board.attackers(sq, attacker);
      if (attackers.includes(movedTo)) {
        targets.push({ square: sq, value: PIECE_VALUES[piece.type] });
      }
    }
  }

  if (targets.length < 2) return false;

  // Fork is meaningful if attacking king + anything, or 2+ pieces worth >= minor piece
  const attacksKing = targets.some((t) => t.value >= 100);
  const valuableTargets = targets.filter((t) => t.value >= 3);

  return attacksKing ? targets.length >= 2 : valuableTargets.length >= 2;
}

/**
 * Pin: an enemy piece cannot move because it would expose a more valuable piece
 * (or the king) behind it along a ray.
 */
function detectPin(
  board: Chess,
  attacker: Color,
  defender: Color
): boolean {
  const defenderKingSquare = findKing(board, defender);
  if (!defenderKingSquare) return false;

  // Look for sliding piece rays (bishop/queen diagonals, rook/queen files/ranks)
  for (const sq of ALL_SQUARES) {
    const piece = board.get(sq);
    if (!piece || piece.color !== attacker) continue;
    if (!["b", "r", "q"].includes(piece.type)) continue;

    const ray = getRay(sq, defenderKingSquare);
    if (!ray) continue;

    // Check if the sliding piece type can actually move along this ray direction
    if (!canSlideAlongRay(piece.type, sq, defenderKingSquare)) continue;

    // Look for exactly one defender piece between attacker and king
    const between = ray.filter((s) => {
      const p = board.get(s);
      return p !== null;
    });

    if (between.length === 1) {
      const pinnedPiece = board.get(between[0]);
      if (pinnedPiece && pinnedPiece.color === defender && pinnedPiece.type !== "k") {
        // It's a pin if the pinned piece is worth less than what's behind it (king = always)
        return true;
      }
    }
  }
  return false;
}

/**
 * Skewer: an attack on a high-value piece that, when it moves, exposes a piece behind it.
 * Opposite of a pin — the more valuable piece is in front.
 */
function detectSkewer(
  board: Chess,
  attacker: Color,
  defender: Color
): boolean {
  for (const sq of ALL_SQUARES) {
    const piece = board.get(sq);
    if (!piece || piece.color !== attacker) continue;
    if (!["b", "r", "q"].includes(piece.type)) continue;

    // Check all directions this piece can slide
    const directions = getSlidingDirections(piece.type);

    for (const [dr, dc] of directions) {
      const piecesOnRay: { square: Square; type: PieceSymbol; color: Color }[] = [];

      let r = "87654321".indexOf(sq[1]) + dr;
      let c = "abcdefgh".indexOf(sq[0]) + dc;

      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const raySquare = ("abcdefgh"[c] + "87654321"[r]) as Square;
        const rayPiece = board.get(raySquare);
        if (rayPiece) {
          piecesOnRay.push({ square: raySquare, type: rayPiece.type, color: rayPiece.color });
          if (piecesOnRay.length >= 2) break;
        }
        r += dr;
        c += dc;
      }

      // Skewer: first piece is defender's high-value, second is defender's any piece
      if (piecesOnRay.length >= 2) {
        const first = piecesOnRay[0];
        const second = piecesOnRay[1];
        if (
          first.color === defender &&
          second.color === defender &&
          PIECE_VALUES[first.type] > PIECE_VALUES[second.type] &&
          PIECE_VALUES[first.type] >= 5 // at least a rook in front
        ) {
          // Verify the sliding piece actually attacks the first piece
          if (board.isAttacked(first.square, attacker)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Discovered attack: the moved piece was blocking an attack line.
 * Compare what pieces the attacker's other pieces target before and after the move.
 */
function detectDiscoveredAttack(
  fenBefore: string,
  movedFrom: Square,
  movedTo: Square,
  attacker: Color,
  defender: Color
): boolean {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  const moveResult = after.move({ from: movedFrom, to: movedTo });
  if (!moveResult) return false;

  // Check if moving the piece revealed an attack on a valuable defender piece
  for (const sq of ALL_SQUARES) {
    const piece = after.get(sq);
    if (!piece || piece.color !== defender) continue;
    if (PIECE_VALUES[piece.type] < 3) continue; // only care about minor+ pieces

    // Was this square NOT attacked before (from that direction) but IS attacked now?
    const attackersBefore = before.attackers(sq, attacker);
    const attackersAfter = after.attackers(sq, attacker);

    // New attackers appeared (not the moved piece itself)
    const newAttackers = attackersAfter.filter(
      (a) => !attackersBefore.includes(a) && a !== movedTo
    );

    if (newAttackers.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Back-rank mate: checkmate where the king is on rank 1 or 8,
 * trapped by its own pawns.
 */
function isBackRankMate(board: Chess, loser: Color): boolean {
  const kingSquare = findKing(board, loser);
  if (!kingSquare) return false;

  const rank = kingSquare[1];
  const backRank = loser === "w" ? "1" : "8";
  if (rank !== backRank) return false;

  // Check if own pawns are blocking escape
  const kingFile = "abcdefgh".indexOf(kingSquare[0]);
  const pawnRank = loser === "w" ? "2" : "7";
  let blockedByOwnPawns = 0;

  for (const df of [-1, 0, 1]) {
    const f = kingFile + df;
    if (f < 0 || f >= 8) continue;
    const sq = ("abcdefgh"[f] + pawnRank) as Square;
    const piece = board.get(sq);
    if (piece && piece.color === loser && piece.type === "p") {
      blockedByOwnPawns++;
    }
  }

  return blockedByOwnPawns >= 2; // at least 2 pawns blocking escape
}

/**
 * Trapped piece: after the best move, an enemy piece (worth >= minor) has no safe squares.
 */
function detectTrappedPiece(
  board: Chess,
  defender: Color,
  attacker: Color
): boolean {
  for (const sq of ALL_SQUARES) {
    const piece = board.get(sq);
    if (!piece || piece.color !== defender) continue;
    if (PIECE_VALUES[piece.type] < 3) continue; // only minor+ pieces
    if (piece.type === "k") continue;

    // Check if this piece has any safe squares
    // Temporarily set the turn to the defender to check their moves
    const testBoard = new Chess(board.fen());
    // We need to check if this piece can move to any safe square
    // Use a simpler heuristic: is the piece attacked and not defended?
    const isAttacked = testBoard.isAttacked(sq, attacker);
    if (!isAttacked) continue;

    const isDefendedByOwn = testBoard.attackers(sq, defender).length > 1; // > 1 because the piece itself
    if (isDefendedByOwn) continue;

    // Piece is attacked and not well defended — check if it can escape
    // Get possible destination squares for this piece type
    const escapeSquares = getEscapeSquares(sq, piece.type, defender);
    let hasSafeEscape = false;

    for (const esc of escapeSquares) {
      const escPiece = testBoard.get(esc);
      // Can't move to own pieces
      if (escPiece && escPiece.color === defender) continue;
      // Is the escape square safe?
      if (!testBoard.isAttacked(esc, attacker)) {
        hasSafeEscape = true;
        break;
      }
    }

    if (!hasSafeEscape) return true;
  }
  return false;
}

/**
 * Sacrifice: the best move gives up material but the eval improves.
 */
function detectSacrifice(
  movedPieceType: PieceSymbol,
  capturedType: PieceSymbol | undefined,
  evalDrop: number
): boolean {
  const movedValue = PIECE_VALUES[movedPieceType];
  const capturedValue = capturedType ? PIECE_VALUES[capturedType] : 0;

  // The "best move" loses material (piece moved is worth more than what it captures,
  // or it moves to a square where it can be captured for free)
  // But the eval says it's good — that's a sacrifice
  if (movedValue > capturedValue + 1 && movedValue >= 3) {
    // Only tag sacrifice if the eval drop was significant (player missed something good)
    return evalDrop >= 150;
  }
  return false;
}

/**
 * Try to detect tactics from the full PV line (for multi-move tactics).
 */
function detectFromPV(
  fenBefore: string,
  pv: string[],
  sideToMove: Color
): string[] {
  if (pv.length < 2) return [];

  const themes: string[] = [];
  const chess = new Chess(fenBefore);
  void sideToMove; // used for context; PV alternates sides

  // Play through the PV to see what happens
  for (let i = 0; i < Math.min(pv.length, 6); i++) {
    const uci = pv[i];
    if (!uci || uci.length < 4) break;

    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length > 4 ? uci[4] as PieceSymbol : undefined;

    const captured = chess.get(to);
    const moveResult = chess.move({ from, to, promotion });
    if (!moveResult) break;

    // Check for interesting things happening in the PV
    if (chess.isCheckmate()) {
      if (i <= 4) themes.push("mate");
      break;
    }

    // If the opponent is making moves and losing material, the tactic is working
    if (i % 2 === 0 && captured && PIECE_VALUES[captured.type] >= 3) {
      // Our move captured something valuable
      themes.push("materialGain");
    }
  }

  return themes;
}

// ─────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────

function findKing(board: Chess, color: Color): Square | null {
  for (const sq of ALL_SQUARES) {
    const piece = board.get(sq);
    if (piece && piece.type === "k" && piece.color === color) {
      return sq;
    }
  }
  return null;
}

function isDefended(board: Chess, square: Square, byColor: Color): boolean {
  return board.attackers(square, byColor).length > 0;
}

/**
 * Get the squares between two squares on a ray (exclusive of endpoints).
 * Returns null if not on a straight line.
 */
function getRay(from: Square, to: Square): Square[] | null {
  const fc = "abcdefgh".indexOf(from[0]);
  const fr = "87654321".indexOf(from[1]);
  const tc = "abcdefgh".indexOf(to[0]);
  const tr = "87654321".indexOf(to[1]);

  const dc = Math.sign(tc - fc);
  const dr = Math.sign(tr - fr);

  // Must be on a straight line (horizontal, vertical, or diagonal)
  const diffC = Math.abs(tc - fc);
  const diffR = Math.abs(tr - fr);
  if (diffC !== diffR && diffC !== 0 && diffR !== 0) return null;
  if (diffC === 0 && diffR === 0) return null;

  const squares: Square[] = [];
  let r = fr + dr;
  let c = fc + dc;

  while (r !== tr || c !== tc) {
    if (r < 0 || r >= 8 || c < 0 || c >= 8) return null;
    squares.push(("abcdefgh"[c] + "87654321"[r]) as Square);
    r += dr;
    c += dc;
  }

  return squares;
}

/**
 * Check if a piece type can slide along the ray from `from` to `to`.
 */
function canSlideAlongRay(pieceType: PieceSymbol, from: Square, to: Square): boolean {
  const fc = "abcdefgh".indexOf(from[0]);
  const fr = "87654321".indexOf(from[1]);
  const tc = "abcdefgh".indexOf(to[0]);
  const tr = "87654321".indexOf(to[1]);

  const isDiagonal = Math.abs(tc - fc) === Math.abs(tr - fr);
  const isStraight = fc === tc || fr === tr;

  if (pieceType === "b") return isDiagonal;
  if (pieceType === "r") return isStraight;
  if (pieceType === "q") return isDiagonal || isStraight;
  return false;
}

function getSlidingDirections(pieceType: PieceSymbol): [number, number][] {
  const diagonals: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const straights: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  if (pieceType === "b") return diagonals;
  if (pieceType === "r") return straights;
  if (pieceType === "q") return [...diagonals, ...straights];
  return [];
}

/**
 * Get possible escape squares for a piece (simplified — just movement squares, not full legal moves).
 */
function getEscapeSquares(sq: Square, pieceType: PieceSymbol, _color: Color): Square[] {
  const file = "abcdefgh".indexOf(sq[0]);
  const rank = "87654321".indexOf(sq[1]);
  const squares: Square[] = [];

  if (pieceType === "n") {
    const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    for (const [dr, dc] of knightMoves) {
      const r = rank + dr;
      const c = file + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) {
        squares.push(("abcdefgh"[c] + "87654321"[r]) as Square);
      }
    }
  } else {
    const directions = getSlidingDirections(pieceType);
    for (const [dr, dc] of directions) {
      // Check up to 7 squares in each direction
      for (let i = 1; i <= 7; i++) {
        const r = rank + dr * i;
        const c = file + dc * i;
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
          squares.push(("abcdefgh"[c] + "87654321"[r]) as Square);
        } else {
          break;
        }
      }
    }
  }

  return squares;
}
