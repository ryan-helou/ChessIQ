/**
 * Chess IQ Backend API Client
 * Frontend client for calling the local game analysis endpoint
 */

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
 * Submit a game PGN for Stockfish analysis using local analyzer.
 * Returns the full analysis synchronously (may take 1-5 minutes for deep analysis).
 */
export async function analyzeGame(
  pgn: string,
  depth: number = 18
): Promise<GameAnalysisResult> {
  try {
    const response = await fetch(`/api/game-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgn, depth }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Analysis failed: ${response.status}`);
    }

    const analysis = await response.json();

    // Adapt the response from GameAnalysis to GameAnalysisResult format
    const blunderMoves = analysis.moves.filter(
      (m: any) => m.classification === "blunder"
    );
    const mistakeMoves = analysis.moves.filter(
      (m: any) => m.classification === "mistake"
    );
    const inaccuracyMoves = analysis.moves.filter(
      (m: any) => m.classification === "inaccuracy"
    );

    return {
      gameId: "", // Will be filled by caller if needed
      pgn,
      moves: analysis.moves.map((m: any) => ({
        ...m,
        isBlunder: m.classification === "blunder",
        isMistake: m.classification === "mistake",
        isInaccuracy: m.classification === "inaccuracy",
        tacticalThemes: [], // TODO: Add tactical theme detection
      })),
      blunders: blunderMoves.map((m: any) => ({
        moveNumber: m.moveNumber,
        playerMove: m.move,
        bestMove: m.bestMove,
        evalBeforeCp: m.evalBefore,
        evalAfterCp: m.engineEval,
        severity: m.classification as "blunder" | "mistake" | "inaccuracy",
        missedTactic: null, // TODO: Detect missed tactics
        consequence: null, // TODO: Describe consequence of blunder
      })),
      whiteAccuracy: analysis.whiteAccuracy,
      blackAccuracy: analysis.blackAccuracy,
      evalGraph: analysis.evalGraph,
      blunderCounts: analysis.blunders,
      mistakeCounts: analysis.mistakes,
      inaccuracyCounts: analysis.inaccuracies,
      analysisDepth: depth,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Game analysis failed: ${errorMessage}`);
  }
}

/**
 * Check if local game analysis is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    // Check if the local Stockfish engine can be started
    // For now, assume it's healthy if the API route exists
    const response = await fetch(`/api/game-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pgn: "1. e2-e4 e7-e5", // Invalid PGN, but let's see if endpoint responds
      }),
      signal: AbortSignal.timeout(5000),
    });
    // We expect it to fail with 400 due to invalid PGN, but that means endpoint exists
    return response.status === 400 || response.ok;
  } catch {
    return false;
  }
}
