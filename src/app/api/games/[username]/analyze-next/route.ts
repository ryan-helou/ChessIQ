import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { analyzeGame, type AnalyzedMove } from "@/modules/game-review/analyzer";
import { usernameToUserId } from "@/lib/user-id";
import { persistGameAnalysis } from "@/lib/game-persistence";


/**
 * POST /api/games/[username]/analyze-next
 * Picks the next pending game for this user and analyzes it.
 * Returns progress. Call repeatedly until remaining === 0.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const body = await request.json().catch(() => ({}));
    const depth = body.depth ?? 14;
    const userId = usernameToUserId(username);

    // Atomically claim next pending game (or stale 'analyzing' job > 5 min old).
    // FOR UPDATE SKIP LOCKED prevents two concurrent requests from grabbing the same game.
    const nextResult = await query(
      `UPDATE games
       SET analysis_status = 'analyzing', analysis_started_at = NOW()
       WHERE id = (
         SELECT id FROM games
         WHERE user_id = $1
           AND pgn IS NOT NULL
           AND (
             analysis_status = 'pending'
             OR (analysis_status = 'analyzing' AND analysis_started_at < NOW() - INTERVAL '5 minutes')
           )
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, chess_com_id, pgn, white_username, black_username`,
      [userId]
    );

    if (nextResult.rows.length === 0) {
      // No more pending — count completed
      const doneResult = await query(
        `SELECT COUNT(*) as total FROM games WHERE user_id = $1 AND analysis_status = 'complete'`,
        [userId]
      );
      return NextResponse.json({
        done: true,
        remaining: 0,
        analyzed: parseInt(doneResult.rows[0]?.total ?? "0"),
        blundersFound: 0,
      });
    }

    const game = nextResult.rows[0];

    try {
      // Let the Railway backend's own 55s timeout handle it — avoids mid-flight abort mismatch
      const analysis = await analyzeGame(game.pgn, depth);
      const blundersFound = await persistGameAnalysis(
        game.id, username, game.white_username, game.black_username, analysis.moves
      );

      // Update game accuracy + mark complete
      const userMoves = analysis.moves.filter(
        (m: AnalyzedMove) => (m.color === "white" && username.toLowerCase() === game.white_username?.toLowerCase()) ||
                              (m.color === "black" && username.toLowerCase() === game.black_username?.toLowerCase())
      );
      const accuracy = userMoves.length > 0
        ? Math.round(userMoves.reduce((s: number, m: AnalyzedMove) => s + m.accuracy, 0) / userMoves.length)
        : null;

      await query(
        `UPDATE games SET
           analysis_status = 'complete',
           analysis_completed_at = NOW(),
           accuracy_white = COALESCE($2, accuracy_white),
           accuracy_black = COALESCE($3, accuracy_black)
         WHERE id = $1`,
        [
          game.id,
          username.toLowerCase() === game.white_username?.toLowerCase() ? accuracy : null,
          username.toLowerCase() === game.black_username?.toLowerCase() ? accuracy : null,
        ]
      );

      // Count remaining
      const remainingResult = await query(
        `SELECT COUNT(*) as cnt FROM games WHERE user_id = $1 AND analysis_status IN ('pending', 'analyzing')`,
        [userId]
      );
      const remaining = parseInt(remainingResult.rows[0]?.cnt ?? "0");

      return NextResponse.json({ done: remaining === 0, remaining, blundersFound, gameId: game.chess_com_id });
    } catch (err) {
      console.error(`[analyze-next] Failed game ${game.chess_com_id}:`, err);
      // Mark failed game as skipped so we don't retry it endlessly
      await query(
        `UPDATE games SET analysis_status = 'failed' WHERE id = $1`,
        [game.id]
      ).catch(() => {});

      // Count remaining and continue — don't crash the loop over one bad game
      const remainingResult = await query(
        `SELECT COUNT(*) as cnt FROM games WHERE user_id = $1 AND analysis_status IN ('pending', 'analyzing')`,
        [userId]
      ).catch(() => ({ rows: [{ cnt: "0" }] }));
      const remaining = parseInt(remainingResult.rows[0]?.cnt ?? "0");

      return NextResponse.json({
        done: remaining === 0,
        remaining,
        blundersFound: 0,
        gameId: game.chess_com_id,
        skipped: true,
      });
    }
  } catch (error) {
    console.error("[analyze-next] Error:", error);
    return NextResponse.json(
      { error: "Failed to analyze game", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
