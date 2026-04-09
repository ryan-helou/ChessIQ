import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const THEME_TO_LICHESS: Record<string, string> = {
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  backRankMate: "backRankMate",
  mate: "mateIn2",
  hangingPiece: "hangingPiece",
  discoveredAttack: "discoveredAttack",
  promotion: "promotion",
};

async function fetchLichessPuzzles(themes: string[], count: number, rating: number): Promise<any[]> {
  const puzzles: any[] = [];
  const promises = themes.slice(0, 5).map(async (theme) => {
    const lichessTheme = THEME_TO_LICHESS[theme] ?? theme;
    try {
      const res = await fetch(
        `https://lichess.org/api/puzzle/next?angle=${lichessTheme}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.puzzle) {
        const game = data.game;
        // Build FEN from initialPly
        const { Chess } = await import("chess.js");
        const chess = new Chess();
        chess.loadPgn(game.pgn);
        const history = chess.history({ verbose: true });
        const chess2 = new Chess();
        for (let i = 0; i < data.puzzle.initialPly; i++) {
          if (history[i]) chess2.move(history[i].san);
        }
        return {
          id: `lichess-${data.puzzle.id}`,
          fen: chess2.fen(),
          moves: data.puzzle.solution,
          rating: data.puzzle.rating,
          themes: data.puzzle.themes || [theme],
          openingTags: [],
          moveCount: data.puzzle.solution?.length ?? 2,
        };
      }
    } catch { return null; }
    return null;
  });
  const results = await Promise.all(promises);
  for (const r of results) if (r) puzzles.push(r);
  return puzzles.slice(0, count);
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

    // If no blunders yet, return general puzzles from Lichess as a fallback
    if (totalBlunders === 0) {
      const generalThemes = ["fork", "pin", "skewer", "hangingPiece", "mate"];
      const fallbackPuzzles = await fetchLichessPuzzles(generalThemes, limit, rating).catch(() => []);
      return NextResponse.json({
        weaknesses: [],
        totalBlunders: 0,
        puzzles: fallbackPuzzles,
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

    // Get Lichess puzzles for top weakness themes
    let puzzles: Puzzle[] = [];
    if (weaknesses.length > 0) {
      try {
        const topThemes = weaknesses.map((w) => w.theme);

        const puzzlesResult = await query(
          `
          SELECT id, fen, moves, rating, themes, opening_tags, move_count
          FROM puzzles
          WHERE themes && $1::TEXT[]
          ORDER BY ABS(rating - $3), popularity DESC NULLS LAST
          LIMIT $2
          `,
          [topThemes, limit, rating]
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

        // Fallback: if no themed puzzles in local DB, fetch live from Lichess API
        if (puzzles.length === 0) {
          const lichessPuzzles = await fetchLichessPuzzles(topThemes, limit, rating);
          puzzles = lichessPuzzles;
        }
      } catch (err) {
        console.error("Error fetching puzzles:", err);
      }
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
