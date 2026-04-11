import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

async function fetchDbPuzzles(themes: string[] | null, count: number, rating: number, username?: string): Promise<any[]> {
  try {
    const result = themes && themes.length > 0
      ? await query(
          `SELECT id, fen, moves, rating, themes, opening_tags, move_count
           FROM puzzles
           WHERE themes && $1::TEXT[]
             AND ($3::TEXT IS NULL OR id NOT IN (
               SELECT puzzle_id FROM puzzle_attempts WHERE username = $3
             ))
           ORDER BY RANDOM()
           LIMIT $2`,
          [themes, count, username ?? null]
        )
      : await query(
          `SELECT id, fen, moves, rating, themes, opening_tags, move_count
           FROM puzzles
           WHERE ($2::TEXT IS NULL OR id NOT IN (
             SELECT puzzle_id FROM puzzle_attempts WHERE username = $2
           ))
           ORDER BY RANDOM()
           LIMIT $1`,
          [count, username ?? null]
        );
    return result.rows.map((p: any) => ({
      id: p.id,
      fen: p.fen,
      moves: p.moves,
      rating: p.rating,
      themes: p.themes || [],
      openingTags: p.opening_tags || [],
      moveCount: p.move_count,
    }));
  } catch {
    return [];
  }
}

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
    let blundersResult;
    try {
      blundersResult = await query(
        `
        SELECT b.*, g.white_username, g.black_username
        FROM blunders b
        JOIN games g ON b.game_id = g.id
        WHERE g.white_username = $1 OR g.black_username = $1
        ORDER BY b.move_number DESC
        `,
        [username]
      );
    } catch (dbError) {
      console.error("Database query error:", dbError);
      // If query fails, return empty recommendations
      return NextResponse.json({
        weaknesses: [],
        totalBlunders: 0,
        puzzles: [],
        randomPuzzles: [],
        ownBlunderPuzzles: [],
        stats: {
          totalAttempted: 0,
          totalSolved: 0,
          solveRate: 0,
          byTheme: [],
        },
      });
    }

    const totalBlunders = blundersResult.rows.length;

    // If no blunders yet, return general puzzles from local DB
    if (totalBlunders === 0) {
      const generalThemes = ["fork", "pin", "skewer", "hangingPiece", "mate"];
      const [fallbackPuzzles, randomPuzzles] = await Promise.all([
        fetchDbPuzzles(generalThemes, limit, rating, username),
        fetchDbPuzzles(null, limit, rating, username),
      ]);
      return NextResponse.json({
        weaknesses: [],
        totalBlunders: 0,
        puzzles: fallbackPuzzles,
        randomPuzzles,
        ownBlunderPuzzles: [],
        stats: { totalAttempted: 0, totalSolved: 0, solveRate: 0, byTheme: [] },
      });
    }

    // Count blunders by tactical theme
    const themeMap = new Map<string, number>();
    const ownBlunderMap = new Map<string, BlunderPuzzle>();

    for (const blunder of blundersResult.rows) {
      const theme = blunder.missed_tactic;
      if (!theme) continue;
      themeMap.set(theme, (themeMap.get(theme) ?? 0) + 1);

      // Create blunder puzzle entries (limit to top ones)
      if (ownBlunderMap.size < limit) {
        try {
          // Use fen_before stored directly on the blunder row (most reliable)
          const fenBefore = blunder.fen_before;
          if (fenBefore) {
            const id = `${blunder.game_id}-${blunder.move_number}`;
            ownBlunderMap.set(id, {
              gameId: blunder.game_id,
              moveNumber: blunder.move_number,
              fen: fenBefore,
              bestMove: blunder.best_move,
              bestMoveSan: blunder.player_move,
              severity: blunder.severity,
              evalDrop: Math.abs(blunder.eval_after_cp - (blunder.eval_before_cp ?? 0)),
              theme,
            });
          }
        } catch (err) {
          console.error("Error fetching move details:", err);
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
        percentage: totalBlunders > 0 ? Math.round((count / totalBlunders) * 100) : 0,
      }));

    // Fetch weakness-targeted puzzles and random puzzles in parallel
    let puzzles: Puzzle[] = [];
    let randomPuzzles: Puzzle[] = [];
    try {
      const topThemes = weaknesses.map((w) => w.theme);
      [puzzles, randomPuzzles] = await Promise.all([
        topThemes.length > 0 ? fetchDbPuzzles(topThemes, limit, rating, username) : Promise.resolve([]),
        fetchDbPuzzles(null, limit, rating, username),
      ]);
    } catch (err) {
      console.error("Error fetching puzzles:", err);
    }

    // Get user's puzzle attempt stats
    let stats: PuzzleStats = {
      totalAttempted: 0,
      totalSolved: 0,
      solveRate: 0,
      byTheme: [],
    };

    try {
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

      if (statsResult.rows.length > 0 && statsResult.rows[0].total_attempted) {
        stats = {
          totalAttempted: parseInt(statsResult.rows[0].total_attempted ?? "0"),
          totalSolved: parseInt(statsResult.rows[0].total_solved ?? "0"),
          solveRate:
            statsResult.rows[0].total_attempted > 0
              ? Math.round(
                  (parseInt(statsResult.rows[0].total_solved) /
                    parseInt(statsResult.rows[0].total_attempted)) *
                    100
                )
              : 0,
          byTheme: [],
        };
      }
    } catch (err) {
      console.error("Error fetching puzzle stats:", err);
    }

    const recommendation: PuzzleRecommendation = {
      weaknesses,
      totalBlunders,
      puzzles,
      randomPuzzles,
      ownBlunderPuzzles: Array.from(ownBlunderMap.values()),
      stats,
    };

    return NextResponse.json(recommendation);
  } catch (error) {
    console.error("Error fetching puzzle recommendations:", error);
    return NextResponse.json(
      {
        weaknesses: [],
        totalBlunders: 0,
        puzzles: [],
        randomPuzzles: [],
        ownBlunderPuzzles: [],
        stats: {
          totalAttempted: 0,
          totalSolved: 0,
          solveRate: 0,
          byTheme: [],
        },
      },
      { status: 200 }
    );
  }
}
