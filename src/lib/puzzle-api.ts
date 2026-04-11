/**
 * Chess IQ Puzzle API Client
 * Frontend client for puzzle recommendations and attempt tracking
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Puzzle {
  id: string;
  fen: string;
  moves: string; // space-separated UCI
  rating: number;
  themes: string[];
  openingTags: string[];
  moveCount: number;
}

export interface BlunderPuzzle {
  gameId: string;
  moveNumber: number;
  fen: string;
  bestMove: string;
  bestMoveSan: string;
  severity: string;
  evalDrop: number;
  theme: string | null;
}

export interface WeaknessProfile {
  theme: string;
  count: number;
  percentage: number;
}

export interface PuzzleStats {
  totalAttempted: number;
  totalSolved: number;
  solveRate: number;
  byTheme: { theme: string; attempted: number; solved: number }[];
}

export interface PuzzleRecommendation {
  weaknesses: WeaknessProfile[];
  totalBlunders: number;
  puzzles: Puzzle[];          // weakness-targeted
  randomPuzzles: Puzzle[];    // random from DB
  ownBlunderPuzzles: BlunderPuzzle[];
  stats: PuzzleStats;
}

export type PuzzleMode = "random" | "weakness" | "blunders";

// Unified puzzle type for the trainer (covers both Lichess and own-blunder)
export interface TrainerPuzzle {
  id: string;
  fen: string; // starting position
  solutionMoves: string[]; // UCI moves the player must find
  opponentMoves: string[]; // UCI moves auto-played between player moves
  rating: number | null;
  themes: string[];
  source: "lichess" | "own-blunder";
  sourceLabel: string; // e.g. "Lichess #abc" or "From your game"
}

// ─────────────────────────────────────────────────────────────
// Theme display names and colors
// ─────────────────────────────────────────────────────────────

export const THEME_LABELS: Record<string, string> = {
  fork: "Fork",
  pin: "Pin",
  skewer: "Skewer",
  discoveredAttack: "Discovered Attack",
  backRankMate: "Back Rank Mate",
  hangingPiece: "Hanging Piece",
  trappedPiece: "Trapped Piece",
  doubleCheck: "Double Check",
  sacrifice: "Sacrifice",
  promotion: "Promotion",
  mate: "Checkmate",
  materialGain: "Material Gain",
  // Lichess-specific themes we might match
  deflection: "Deflection",
  decoy: "Decoy",
  interference: "Interference",
  attraction: "Attraction",
  quietMove: "Quiet Move",
  zugzwang: "Zugzwang",
  endgame: "Endgame",
  middlegame: "Middlegame",
  positional: "Positional",
  exposedKing: "Exposed King",
  weakKingSafety: "King Safety",
  inactivePieces: "Inactive Pieces",
  pawnStructure: "Pawn Structure",
  poorPawnStructure: "Pawn Structure",
  overextension: "Overextension",
};

export const THEME_COLORS: Record<string, string> = {
  fork: "#e28c28",
  pin: "#5b8bb4",
  skewer: "#96bc4b",
  discoveredAttack: "#26c9c3",
  backRankMate: "#ca3431",
  hangingPiece: "#dbac18",
  trappedPiece: "#e26b50",
  doubleCheck: "#8b5cf6",
  sacrifice: "#26c9c3",
  promotion: "#88bf40",
  mate: "#ca3431",
  materialGain: "#96bc4b",
  positional: "#706e6b",
  exposedKing: "#ca3431",
  weakKingSafety: "#e26b50",
  inactivePieces: "#5b8bb4",
  pawnStructure: "#96bc4b",
  poorPawnStructure: "#dbac18",
  overextension: "#e28c28",
};

// ─────────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────────

export async function getPuzzleRecommendations(
  username: string,
  playerRating: number = 1200,
  limit: number = 20
): Promise<PuzzleRecommendation> {
  const res = await fetch(
    `/api/puzzles/recommendations/${encodeURIComponent(username)}?rating=${playerRating}&limit=${limit}`
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch puzzle recommendations: ${res.status}`);
  }

  return res.json();
}

export async function recordPuzzleAttempt(
  puzzleId: string,
  username: string,
  solved: boolean,
  attempts: number,
  timeSeconds: number | null,
  puzzleRating?: number | null,
): Promise<{ ratingChange: number; newRating: number } | null> {
  try {
    const res = await fetch(
      `/api/puzzles/${encodeURIComponent(puzzleId)}/attempt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, solved, attempts, timeSeconds, puzzleRating }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { ratingChange: data.ratingChange ?? 0, newRating: data.newRating ?? 1200 };
  } catch {
    return null;
  }
}

export async function getUserPuzzleRating(username: string): Promise<number> {
  try {
    const res = await fetch(`/api/puzzles/rating?username=${encodeURIComponent(username)}`);
    if (!res.ok) return 1200;
    const data = await res.json();
    return data.rating ?? 1200;
  } catch {
    return 1200;
  }
}

// ─────────────────────────────────────────────────────────────
// Puzzle conversion helpers
// ─────────────────────────────────────────────────────────────

/**
 * Convert a Lichess puzzle into a TrainerPuzzle.
 * Lichess puzzles: first move is opponent's setup move (auto-played),
 * remaining moves alternate player/opponent.
 */
export function lichessPuzzleToTrainer(puzzle: Puzzle): TrainerPuzzle {
  const allMoves = puzzle.moves.split(" ");
  const solutionMoves: string[] = [];
  const opponentMoves: string[] = [];

  // First move is opponent's (setup), then alternating player/opponent
  for (let i = 0; i < allMoves.length; i++) {
    if (i % 2 === 0) {
      opponentMoves.push(allMoves[i]); // opponent moves (including setup)
    } else {
      solutionMoves.push(allMoves[i]); // player must find these
    }
  }

  return {
    id: `lichess-${puzzle.id}`,
    fen: puzzle.fen,
    solutionMoves,
    opponentMoves,
    rating: puzzle.rating,
    themes: puzzle.themes,
    source: "lichess",
    sourceLabel: `Lichess #${puzzle.id}`,
  };
}

/**
 * Convert a blunder position into a TrainerPuzzle.
 * Own-blunder puzzles: show the position, player must find the best move.
 */
export function blunderPuzzleToTrainer(puzzle: BlunderPuzzle): TrainerPuzzle {
  // Estimate difficulty from how big the blunder was: 300cp→1200, 600cp→1500, 900cp→1800
  const estimatedRating = puzzle.evalDrop
    ? Math.round(Math.min(2400, Math.max(800, 900 + puzzle.evalDrop * 1.0)))
    : 1500;

  return {
    id: `blunder-${puzzle.gameId}-${puzzle.moveNumber}`,
    fen: puzzle.fen,
    solutionMoves: [puzzle.bestMove],
    opponentMoves: [],
    rating: estimatedRating,
    themes: puzzle.theme ? [puzzle.theme] : [],
    source: "own-blunder",
    sourceLabel: "From your game",
  };
}
