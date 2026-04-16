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

export interface CriticalMoment {
  moveIndex: number;
  moveNumber: number;
  color: "white" | "black";
  type: "turning_point" | "decisive_blunder" | "missed_win" | "brilliant_find";
  evalSwing: number;
  evalBefore: number;
  evalAfter: number;
  description: string;
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
  criticalMoments?: CriticalMoment[];
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
  depth: number = 12,
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
      criticalMoments: analysis.criticalMoments,
      analysisDepth: depth,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Game analysis failed: ${errorMessage}`);
  }
}

export interface AnalysisProgressEvent {
  moveIndex: number;
  totalMoves: number;
  eval: number;
  mate: number | null;
}

/**
 * Streaming game analysis — emits progress events as positions are evaluated,
 * then returns the full result. Falls back to non-streaming if SSE fails.
 */
export async function analyzeGameStreaming(
  pgn: string,
  depth: number = 12,
  chessComId?: string,
  onProgress?: (event: AnalysisProgressEvent) => void,
  signal?: AbortSignal,
): Promise<GameAnalysisResult> {
  // First check DB cache via the non-streaming route
  if (chessComId) {
    try {
      const cacheCheck = await fetch(`/api/game-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn, depth, chessComId }),
        signal,
      });
      if (cacheCheck.ok) {
        const ct = cacheCheck.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const analysis = await cacheCheck.json();
          if (analysis.moves?.length > 0) {
            return adaptAnalysis(pgn, depth, analysis);
          }
        }
      }
    } catch {
      // Cache miss or error — proceed with streaming
    }
  }

  // Stream from backend
  return new Promise<GameAnalysisResult>((resolve, reject) => {
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
      if (signal.aborted) { reject(new Error("Aborted")); return; }
    }

    fetch(`/api/game-review/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pgn, depth }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        // Fall back to non-streaming
        const result = await analyzeGame(pgn, depth, chessComId, signal);
        resolve(result);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === "progress" && onProgress) {
                onProgress(data);
              } else if (currentEvent === "done") {
                resolve(adaptAnalysis(pgn, depth, data));
                return;
              } else if (currentEvent === "error") {
                reject(new Error(data.message || "Analysis failed"));
                return;
              }
            } catch {}
            currentEvent = "";
          } else if (line === "") {
            currentEvent = "";
          }
        }
      }

      reject(new Error("Stream ended without result"));
    }).catch((err) => {
      if (err instanceof Error && err.name === "AbortError") {
        reject(err);
      } else {
        // Fall back to non-streaming
        analyzeGame(pgn, depth, chessComId, signal).then(resolve).catch(reject);
      }
    });
  });
}

function adaptAnalysis(pgn: string, depth: number, analysis: any): GameAnalysisResult {
  const recalcedMoves: AnalyzedMove[] = analysis.moves.map((m: any) => ({
    ...m,
    accuracy: calcMoveAccuracy(m.evalDrop, m.classification),
    isBlunder: m.classification === "blunder",
    isMistake: m.classification === "mistake",
    isInaccuracy: m.classification === "inaccuracy",
    tacticalThemes: m.tacticalThemes || [],
  }));

  const whiteAccuracy = calcGameAccuracy(recalcedMoves, "white");
  const blackAccuracy = calcGameAccuracy(recalcedMoves, "black");

  const blunderMoves = recalcedMoves.filter((m) => m.classification === "blunder");

  return {
    gameId: "",
    pgn,
    moves: recalcedMoves,
    blunders: blunderMoves.map((m) => ({
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
    blunderCounts: analysis.blunders || analysis.blunderCounts || { white: 0, black: 0 },
    mistakeCounts: analysis.mistakes || analysis.mistakeCounts || { white: 0, black: 0 },
    inaccuracyCounts: analysis.inaccuracies || analysis.inaccuracyCounts || { white: 0, black: 0 },
    criticalMoments: analysis.criticalMoments,
    analysisDepth: depth,
  };
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
