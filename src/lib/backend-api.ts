/**
 * Chess IQ Backend API Client
 * Frontend client for calling the game analysis backend (Railway)
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface AnalyzedMove {
  moveNumber: number;
  move: string;
  san: string;
  fen: string;
  fenBefore: string;
  color: "white" | "black";
  bestMove: string;
  bestMoveSan: string;
  engineEval: number;
  mate: number | null;
  evalBefore: number;
  evalDrop: number;
  classification: MoveClassification;
  accuracy: number;
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

export interface GameAnalysisResult {
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

/**
 * Submit a game PGN for Stockfish analysis.
 * Returns the full analysis synchronously (may take 1-5 minutes).
 */
export async function analyzeGame(
  pgn: string,
  depth: number = 18
): Promise<GameAnalysisResult> {
  const response = await fetch(`${BACKEND_URL}/api/analyze/game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pgn, depth }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Analysis failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Check backend health
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "healthy";
  } catch {
    return false;
  }
}
