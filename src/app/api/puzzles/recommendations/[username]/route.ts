import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";

async function fetchDbPuzzles(themes: string[] | null, count: number, rating: number, username?: string): Promise<any[]> {
  try {
    // Use parameterized queries throughout — no string interpolation of user input.
    // TABLESAMPLE BERNOULLI for fast random selection; falls back to ORDER BY RANDOM()
    // only when the sample returns too few rows.
    const hasUser = !!username;

    const result = themes && themes.length > 0
      ? hasUser
        ? await query(
            `SELECT id, fen, moves, rating, themes, opening_tags, move_count
             FROM puzzles TABLESAMPLE BERNOULLI(10)
             WHERE themes && $1::TEXT[]
               AND id NOT IN (SELECT puzzle_id FROM puzzle_attempts WHERE username = $2)
             LIMIT $3`,
            [themes, username, count]
          ).then(async (r) =>
            r.rows.length >= count ? r :
            query(
              `SELECT id, fen, moves, rating, themes, opening_tags, move_count
               FROM puzzles
               WHERE themes && $1::TEXT[]
                 AND id NOT IN (SELECT puzzle_id FROM puzzle_attempts WHERE username = $2)
               ORDER BY RANDOM() LIMIT $3`,
              [themes, username, count]
            )
          )
        : await query(
            `SELECT id, fen, moves, rating, themes, opening_tags, move_count
             FROM puzzles TABLESAMPLE BERNOULLI(10)
             WHERE themes && $1::TEXT[]
             LIMIT $2`,
            [themes, count]
          ).then(async (r) =>
            r.rows.length >= count ? r :
            query(
              `SELECT id, fen, moves, rating, themes, opening_tags, move_count
               FROM puzzles
               WHERE themes && $1::TEXT[]
               ORDER BY RANDOM() LIMIT $2`,
              [themes, count]
            )
          )
      : hasUser
        ? await query(
            `SELECT id, fen, moves, rating, themes, opening_tags, move_count
             FROM puzzles TABLESAMPLE BERNOULLI(1)
             WHERE id NOT IN (SELECT puzzle_id FROM puzzle_attempts WHERE username = $1)
             LIMIT $2`,
            [username, count]
          ).then(async (r) =>
            r.rows.length >= count ? r :
            query(
              `SELECT id, fen, moves, rating, themes, opening_tags, move_count
               FROM puzzles
               WHERE id NOT IN (SELECT puzzle_id FROM puzzle_attempts WHERE username = $1)
               ORDER BY RANDOM() LIMIT $2`,
              [username, count]
            )
          )
        : await query(
            `SELECT id, fen, moves, rating, themes, opening_tags, move_count
             FROM puzzles TABLESAMPLE BERNOULLI(1)
             LIMIT $1`,
            [count]
          ).then(async (r) =>
            r.rows.length >= count ? r :
            query(
              `SELECT id, fen, moves, rating, themes, opening_tags, move_count
               FROM puzzles
               ORDER BY RANDOM() LIMIT $1`,
              [count]
            )
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

    await ensureDbInit().catch(() => {});

    // Get all blunders for this player (white or black)
    let blundersResult;
    try {
      // Use UNION ALL instead of OR so each indexed column gets its own index scan
      blundersResult = await query(
        `SELECT b.*, g.white_username, g.black_username
         FROM blunders b
         JOIN games g ON b.game_id = g.id
         WHERE g.white_username = $1
         UNION ALL
         SELECT b.*, g.white_username, g.black_username
         FROM blunders b
         JOIN games g ON b.game_id = g.id
         WHERE g.black_username = $1`,
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

    // Fetch puzzles + stats all in parallel
    let puzzles: Puzzle[] = [];
    let randomPuzzles: Puzzle[] = [];
    let stats: PuzzleStats = { totalAttempted: 0, totalSolved: 0, solveRate: 0, byTheme: [] };

    try {
      const topThemes = weaknesses.map((w) => w.theme);
      const [p, rp, statsResult] = await Promise.all([
        topThemes.length > 0 ? fetchDbPuzzles(topThemes, limit, rating, username) : Promise.resolve([]),
        fetchDbPuzzles(null, limit, rating, username),
        query(
          `SELECT COUNT(*) as total_attempted, SUM(CASE WHEN solved THEN 1 ELSE 0 END) as total_solved
           FROM puzzle_attempts WHERE username = $1`,
          [username]
        ).catch(() => ({ rows: [] as any[] })),
      ]);
      puzzles = p;
      randomPuzzles = rp;

      const row = statsResult.rows[0];
      if (row?.total_attempted) {
        const attempted = parseInt(row.total_attempted ?? "0");
        const solved = parseInt(row.total_solved ?? "0");
        stats = {
          totalAttempted: attempted,
          totalSolved: solved,
          solveRate: attempted > 0 ? Math.round((solved / attempted) * 100) : 0,
          byTheme: [],
        };
      }
    } catch (err) {
      console.error("Error fetching puzzles/stats:", err);
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
