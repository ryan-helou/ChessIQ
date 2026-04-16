/**
 * Background worker for game analysis
 * Run separately: node -r tsconfig-paths/register src/workers/game-analysis-worker.ts
 */

import analysisQueue from "@/lib/bull-queue";
import { analyzeGame } from "@/modules/game-review/analyzer";
import { query } from "@/lib/db";
import type { GameAnalysis, AnalyzedMove } from "@/modules/game-review/analyzer";

interface AnalysisJobData {
  games: Array<{
    id: string;
    pgn: string;
    white_username: string;
    black_username: string;
  }>;
  username: string;
  depth: number;
}

/**
 * Process each game analysis job
 */
analysisQueue.process(async (job) => {
  const { games, username, depth = 12 } = job.data as AnalysisJobData;

  console.log(
    `[worker] Starting analysis of ${games.length} games for ${username}`
  );

  let analyzedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < games.length; i++) {
    const game = games[i];

    try {
      console.log(`[worker] Analyzing game ${i + 1}/${games.length}`);

      // Analyze with Stockfish
      const analysis = await analyzeGame(game.pgn, depth);

      // Store analyzed moves in database
      await storeAnalyzedMoves(game.id, analysis);

      // Store detected blunders in database
      await storeBlunders(game.id, analysis, game.white_username, username);

      // Update game analysis status
      await query(
        `UPDATE games SET analysis_status = $1, analysis_completed_at = NOW() WHERE id = $2`,
        ["complete", game.id]
      );

      analyzedCount++;

      // Update job progress
      job.progress(Math.round(((i + 1) / games.length) * 100));
    } catch (error) {
      console.error(
        `[worker] Error analyzing game ${game.id}:`,
        error instanceof Error ? error.message : error
      );
      errorCount++;
      // Continue with next game on error
    }
  }

  console.log(
    `[worker] Analysis complete: ${analyzedCount} games analyzed, ${errorCount} errors`
  );

  return {
    analyzed: analyzedCount,
    errors: errorCount,
    total: games.length,
  };
});

/**
 * Store analyzed moves in database
 */
async function storeAnalyzedMoves(
  gameId: string,
  analysis: GameAnalysis
): Promise<void> {
  for (const move of analysis.moves) {
    await query(
      `
      INSERT INTO analyzed_moves (
        game_id, move_number, fen, move, san, best_move, evaluation_cp,
        accuracy, is_blunder, is_mistake, is_inaccuracy, depth_analyzed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (game_id, move_number, depth_analyzed) DO UPDATE SET
        evaluation_cp = $7,
        accuracy = $8,
        is_blunder = $9,
        is_mistake = $10,
        is_inaccuracy = $11
      `,
      [
        gameId,
        move.moveNumber,
        move.fen,
        move.move,
        move.san,
        move.bestMove,
        move.engineEval,
        Math.round(move.accuracy),
        move.classification === "blunder",
        move.classification === "mistake",
        move.classification === "inaccuracy",
        18, // depth analyzed
      ]
    );
  }
}

/**
 * Store detected blunders in database
 */
async function storeBlunders(
  gameId: string,
  analysis: GameAnalysis,
  whiteUsername: string,
  currentUsername: string
): Promise<void> {
  for (const move of analysis.moves) {
    if (
      move.classification === "blunder" ||
      move.classification === "mistake"
    ) {
      // Determine if this is our blunder or opponent's
      const isOurBlunder =
        (move.color === "white" && whiteUsername === currentUsername) ||
        (move.color === "black" && whiteUsername !== currentUsername);

      if (isOurBlunder) {
        await query(
          `
          INSERT INTO blunders (
            game_id, move_number, player_move, best_move, eval_before_cp,
            eval_after_cp, severity, missed_tactic, consequence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (game_id, move_number) DO UPDATE SET
            severity = $7,
            eval_after_cp = $6
          `,
          [
            gameId,
            move.moveNumber,
            move.move,
            move.bestMove,
            move.evalBefore,
            move.engineEval,
            move.classification === "blunder" ? "blunder" : "mistake",
            null, // missed_tactic (would need tactical theme detection)
            null, // consequence
          ]
        );
      }
    }
  }
}

/**
 * Handle job failures
 */
analysisQueue.on("failed", (job, err) => {
  console.error(`[worker] Job ${job.id} failed:`, err.message);
});

/**
 * Handle job completion
 */
analysisQueue.on("completed", (job) => {
  console.log(
    `[worker] Job ${job.id} completed:`,
    job.returnvalue
  );
});

console.log("[worker] Game analysis worker started. Waiting for jobs...");
