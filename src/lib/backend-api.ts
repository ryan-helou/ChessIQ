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
 * Strict centipawn-based accuracy for a single move.
 * Excludes book/forced moves (always 100).
 * At 30cp drop → ~81%, 60cp → ~66%, 100cp → ~50%, 200cp → ~24%.
 */
function calcMoveAccuracy(evalDrop: number, classification: string): number {
  if (classification === "book" || classification === "forced") return 100;
  if (evalDrop >= 0) return 100; // position improved or neutral
  const drop = -evalDrop; // positive centipawns lost
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-drop / 150) - 3.1669));
}

/**
 * Overall accuracy for one side: mean accuracy of non-book, non-forced moves.
 */
function calcGameAccuracy(moves: AnalyzedMove[], color: "white" | "black"): number {
  const scoredMoves = moves.filter(
    (m) => m.color === color && m.classification !== "book" && m.classification !== "forced"
  );
  if (scoredMoves.length === 0) return 100;
  return scoredMoves.reduce((sum, m) => sum + m.accuracy, 0) / scoredMoves.length;
}

/**
 * Submit a game PGN for Stockfish analysis using local analyzer.
 * Returns the full analysis synchronously (may take 1-5 minutes for deep analysis).
 */
export async function analyzeGame(
  pgn: string,
  depth: number = 14,
  chessComId?: string,
  signal?: AbortSignal
): Promise<GameAnalysisResult> {
  try {
    const response = await fetch(`/api/game-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgn, depth, chessComId }),
      signal,
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

    // Recalculate per-move accuracy using stricter centipawn formula
    const recalcedMoves: AnalyzedMove[] = analysis.moves.map((m: any) => ({
      ...m,
      accuracy: calcMoveAccuracy(m.evalDrop, m.classification),
      isBlunder: m.classification === "blunder",
      isMistake: m.classification === "mistake",
      isInaccuracy: m.classification === "inaccuracy",
      tacticalThemes: m.tacticalThemes || [],
    }));

    // Recalculate overall accuracy excluding book/forced moves
    const whiteAccuracy = calcGameAccuracy(recalcedMoves, "white");
    const blackAccuracy = calcGameAccuracy(recalcedMoves, "black");

    return {
      gameId: "", // Will be filled by caller if needed
      pgn,
      moves: recalcedMoves,
      blunders: blunderMoves.map((m: any) => ({
        moveNumber: m.moveNumber,
        playerMove: m.move,
        bestMove: m.bestMove,
        evalBeforeCp: m.evalBefore,
        evalAfterCp: m.engineEval,
        severity: m.classification as "blunder" | "mistake" | "inaccuracy",
        missedTactic: null,
        consequence: null,
      })),
      whiteAccuracy,
      blackAccuracy,
      evalGraph: analysis.evalGraph,
      // Handle both old format (blunders/mistakes/inaccuracies) and new format (blunderCounts/etc)
      blunderCounts: analysis.blunders || analysis.blunderCounts || { white: 0, black: 0 },
      mistakeCounts: analysis.mistakes || analysis.mistakeCounts || { white: 0, black: 0 },
      inaccuracyCounts: analysis.inaccuracies || analysis.inaccuracyCounts || { white: 0, black: 0 },
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
