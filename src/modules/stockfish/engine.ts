/**
 * Stockfish Engine HTTP Wrapper — delegates to the Railway backend.
 */

import { STOCKFISH_BACKEND_URL } from "@/lib/stockfish-backend";

export interface EngineEval {
  bestMove: string;
  eval: number; // centipawns from white's perspective
  mate: number | null; // mate in N (positive = white wins, negative = black wins)
  depth: number;
  pv: string[]; // principal variation (best line)
}

export interface MultiLineEval {
  lines: EngineEval[];
}

/**
 * HTTP-based Stockfish Engine that calls the Railway backend
 * for position evaluation.
 */
export class StockfishEngine {
  private readonly backendUrl = STOCKFISH_BACKEND_URL;

  async start(): Promise<void> {
    // No initialization needed for HTTP-based engine
    // Just verify the backend is available
    try {
      const response = await fetch(`${this.backendUrl}/health`);
      if (!response.ok) {
        throw new Error("Railway backend is not available");
      }
    } catch (err) {
      // Backend might be temporarily unavailable, but we'll retry on analysis
      console.warn("Railway backend health check failed:", err);
    }
  }

  /**
   * Evaluate a single position
   * Note: This is a helper for potential future use.
   * Currently, analyzeGame() calls the Railway backend's game analysis endpoint directly.
   */
  async evaluatePosition(fen: string, depth: number = 20): Promise<EngineEval> {
    const result = await this.evaluate(fen, depth, 1);
    return (
      result.lines[0] || {
        bestMove: "",
        eval: 0,
        mate: null,
        depth: 0,
        pv: [],
      }
    );
  }

  /**
   * Evaluate a position with multiple lines
   * Note: This requires a separate endpoint on the Railway backend
   * that supports position evaluation (vs full game analysis)
   */
  async evaluate(
    fen: string,
    depth: number = 20,
    multiPv: number = 1
  ): Promise<MultiLineEval> {
    // If we need position-level evaluation in the future, we'd call:
    // POST /api/analyze/position with { fen, depth, multiPv }
    // For now, return empty until Railway backend adds this endpoint

    return {
      lines: [
        {
          bestMove: "",
          eval: 0,
          mate: null,
          depth: 0,
          pv: [],
        },
      ],
    };
  }

  quit(): void {
    // No cleanup needed for HTTP-based engine
  }
}




