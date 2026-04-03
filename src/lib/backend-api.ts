/**
 * Chess IQ Backend API Client
 * Frontend client for calling the game analysis backend (Railway)
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface AnalyzedMove {
  moveNumber: number;
  move: string;
  san: string;
  fen: string;
  bestMove: string;
  engineEval: number;
  accuracy: number;
  isBlunder: boolean;
  isMistake: boolean;
  isInaccuracy: boolean;
}

export interface Blunder {
  moveNumber: number;
  playerMove: string;
  bestMove: string;
  evalBeforeCp: number;
  evalAfterCp: number;
  severity: "blunder" | "mistake" | "inaccuracy";
}

export interface GameAnalysisResult {
  gameId: string;
  pgn: string;
  moves: AnalyzedMove[];
  blunders: Blunder[];
  whiteAccuracy: number;
  blackAccuracy: number;
  evalGraph: { move: number; eval: number; mate: number | null }[];
  analysisDepth: number;
  status: "pending" | "quick_pass" | "deep_pass" | "complete";
}

/**
 * Submit a game for analysis
 * @param pgn Game PGN string
 * @param userId Optional user ID
 * @param metadata Game metadata (ratings, time control, etc.)
 * @returns Promise with gameId and analysis summary
 */
export async function submitGameAnalysis(
  pgn: string,
  userId?: string,
  metadata?: {
    chess_com_id?: number;
    result?: string;
    played_at?: string;
    white_username?: string;
    black_username?: string;
    time_control?: string;
    opening_eco?: string;
    opening_name?: string;
  }
): Promise<{
  gameId: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  movesAnalyzed: number;
  blundersFound: number;
  analysisDepth: number;
}> {
  const response = await fetch(`${BACKEND_URL}/api/analyze/game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pgn,
      userId,
      metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Analysis failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get full analysis results for a game
 * @param gameId Game ID returned from submitGameAnalysis
 * @returns Promise with complete analysis including moves and blunders
 */
export async function getGameAnalysis(gameId: string): Promise<GameAnalysisResult> {
  const response = await fetch(`${BACKEND_URL}/api/analyze/game/${gameId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Game analysis not found");
    }
    throw new Error(`Failed to get analysis: ${response.status}`);
  }

  return response.json();
}

/**
 * Check analysis status (lightweight endpoint)
 * @param gameId Game ID
 * @returns Promise with status and accuracy scores
 */
export async function getAnalysisStatus(
  gameId: string
): Promise<{
  gameId: string;
  status: "pending" | "quick_pass" | "deep_pass" | "complete";
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  analysisComplete: boolean;
}> {
  const response = await fetch(`${BACKEND_URL}/api/analyze/game/${gameId}/status`);

  if (!response.ok) {
    throw new Error(`Failed to get status: ${response.status}`);
  }

  return response.json();
}

/**
 * Poll for analysis completion
 * Useful for waiting for analysis to complete in the UI
 * @param gameId Game ID
 * @param maxAttempts Maximum number of polling attempts (default: 180 = 1.5 hours every 30s)
 * @param delayMs Delay between polls in milliseconds (default: 30000 = 30 seconds)
 * @returns Promise that resolves when analysis is complete
 */
export async function waitForAnalysisCompletion(
  gameId: string,
  maxAttempts: number = 180,
  delayMs: number = 30000
): Promise<GameAnalysisResult> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const status = await getAnalysisStatus(gameId);
      if (status.analysisComplete) {
        return getGameAnalysis(gameId);
      }
    } catch (error) {
      console.error("Error checking analysis status:", error);
    }

    attempts++;
    if (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Analysis timeout: exceeded maximum wait time");
}

/**
 * Check backend health
 * @returns Promise<boolean> true if backend is healthy
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    if (!response.ok) return false;

    const data = await response.json();
    return data.status === "healthy";
  } catch {
    return false;
  }
}
