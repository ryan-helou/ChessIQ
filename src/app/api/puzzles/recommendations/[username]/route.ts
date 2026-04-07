import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type {
  PuzzleRecommendation,
  WeaknessProfile,
  Puzzle,
  BlunderPuzzle,
  PuzzleStats,
} from "@/lib/puzzle-api";

/**
 * GET /api/puzzles/recommendations/[username]
 * Returns personalized puzzle recommendations based on user's tactical weaknesses
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const searchParams = request.nextUrl.searchParams;
    const rating = parseInt(searchParams.get("rating") ?? "1200", 10);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);

    // Get all blunders for this player (white or black)
    const blundersResult = await query(
      `
      SELECT b.*, g.white_username, g.black_username
      FROM blunders b
      JOIN games g ON b.game_id = g.id
      WHERE g.white_username = $1 OR g.black_username = $1
      ORDER BY b.move_number DESC
      `,
      [username]
    );

    const totalBlunders = blundersResult.rows.length;

    // Count blunders by tactical theme
    const themeMap = new Map<string, number>();
    const ownBlunderMap = new Map<string, BlunderPuzzle>();

    for (const blunder of blundersResult.rows) {
      const theme = blunder.missed_tactic || "unknown";
      themeMap.set(theme, (themeMap.get(theme) ?? 0) + 1);

      // Create blunder puzzle entries (limit to top ones)
      if (ownBlunderMap.size < limit) {
        // Get the analyzed move to extract more details
        const moveResult = await query(
          `
          SELECT fen, san FROM analyzed_moves
          WHERE game_id = $1 AND move_number = $2
          LIMIT 1
          `,
          [blunder.game_id, blunder.move_number]
        );

        if (moveResult.rows.length > 0) {
          const move = moveResult.rows[0];
          const id = `${blunder.game_id}-${blunder.move_number}`;
          ownBlunderMap.set(id, {
            gameId: blunder.game_id,
            moveNumber: blunder.move_number,
            fen: move.fen,
            bestMove: blunder.best_move,
            bestMoveSan: move.san,
            severity: blunder.severity,
            evalDrop: Math.abs(blunder.eval_after_cp - (blunder.eval_before_cp ?? 0)),
            theme,
          });
        }
      }
    }

    // Build weakness profiles
    const weaknesses: WeaknessProfile[] = Array.from(themeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([theme, count]) => ({
        theme,
        count,
        percentage: Math.round((count / totalBlunders) * 100) || 0,
      }));

    // Get Lichess puzzles for top weakness themes
    let puzzles: Puzzle[] = [];
    if (weaknesses.length > 0) {
      const topThemes = weaknesses.map((w) => w.theme);

      const puzzlesResult = await query(
        `
        SELECT id, fen, moves, rating, themes, opening_tags, move_count
        FROM puzzles
        WHERE themes && $1::TEXT[]
        ORDER BY rating DESC, popularity DESC
        LIMIT $2
        `,
        [topThemes, limit]
      );

      puzzles = puzzlesResult.rows.map((p: any) => ({
        id: p.id,
        fen: p.fen,
        moves: p.moves,
        rating: p.rating,
        themes: p.themes || [],
        openingTags: p.opening_tags || [],
        moveCount: p.move_count,
      }));
    }

    // Get user's puzzle attempt stats
    const statsResult = await query(
      `
      SELECT
        COUNT(*) as total_attempted,
        SUM(CASE WHEN solved THEN 1 ELSE 0 END) as total_solved
      FROM puzzle_attempts
      WHERE username = $1
      `,
      [username]
    );

    const stats: PuzzleStats = {
      totalAttempted: parseInt(statsResult.rows[0]?.total_attempted ?? "0"),
      totalSolved: parseInt(statsResult.rows[0]?.total_solved ?? "0"),
      solveRate:
        statsResult.rows[0]?.total_attempted > 0
          ? Math.round(
              (parseInt(statsResult.rows[0].total_solved) /
                parseInt(statsResult.rows[0].total_attempted)) *
                100
            )
          : 0,
      byTheme: [],
    };

    const recommendation: PuzzleRecommendation = {
      weaknesses,
      totalBlunders,
      puzzles,
      ownBlunderPuzzles: Array.from(ownBlunderMap.values()),
      stats,
    };

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error("Error fetching puzzle recommendations:", error);
    return NextResponse.json(
      { error: "Failed to fetch puzzle recommendations", details: String(error) },
      { status: 500 }
    );
  }
}
