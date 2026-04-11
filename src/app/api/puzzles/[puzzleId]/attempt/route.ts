import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/** ELO-style rating change for puzzle training (K=20, like Chess.com) */
function calcEloChange(playerRating: number, puzzleRating: number, solved: boolean): number {
  const K = 20;
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
  const actual = solved ? 1 : 0;
  return Math.round(K * (actual - expected));
}

async function ensureRatingTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_puzzle_ratings (
      username TEXT PRIMARY KEY,
      rating INTEGER NOT NULL DEFAULT 1200,
      games_played INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `, []);
}

async function getUserRating(username: string): Promise<number> {
  const result = await query(
    `SELECT rating FROM user_puzzle_ratings WHERE username = $1`,
    [username]
  );
  return result.rows[0]?.rating ?? 1200;
}

async function updateUserRating(username: string, newRating: number): Promise<void> {
  await query(`
    INSERT INTO user_puzzle_ratings (username, rating, games_played)
    VALUES ($1, $2, 1)
    ON CONFLICT (username) DO UPDATE SET
      rating = $2,
      games_played = user_puzzle_ratings.games_played + 1,
      updated_at = NOW()
  `, [username, newRating]);
}

/**
 * POST /api/puzzles/[puzzleId]/attempt
 * Records attempt, updates ELO rating, returns { ratingChange, newRating }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ puzzleId: string }> }
) {
  try {
    const { puzzleId } = await params;
    const body = await request.json();
    const { username, solved, attempts, timeSeconds, puzzleRating } = body;

    if (!username || typeof solved !== "boolean") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await ensureRatingTable();

    // Record attempt
    await query(
      `INSERT INTO puzzle_attempts (username, puzzle_id, solved, attempts, time_seconds)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [username, puzzleId, solved, attempts || 1, timeSeconds || null]
    ).catch(() => {
      // Retry without ON CONFLICT if schema doesn't support it
      return query(
        `INSERT INTO puzzle_attempts (username, puzzle_id, solved, attempts, time_seconds)
         VALUES ($1, $2, $3, $4, $5)`,
        [username, puzzleId, solved, attempts || 1, timeSeconds || null]
      ).catch(() => {});
    });

    // Calculate ELO change
    const currentRating = await getUserRating(username);
    const pRating = typeof puzzleRating === "number" && puzzleRating > 0 ? puzzleRating : 1500;
    const ratingChange = calcEloChange(currentRating, pRating, solved);
    const newRating = Math.max(100, currentRating + ratingChange);

    await updateUserRating(username, newRating);

    return NextResponse.json({ success: true, ratingChange, newRating });
  } catch (error) {
    console.error("Error recording puzzle attempt:", error);
    return NextResponse.json({ success: false, ratingChange: 0, newRating: 1200 });
  }
}

/**
 * GET /api/puzzles/[puzzleId]/attempt?username=...
 * Returns current puzzle rating for a user
 */
export async function GET(
  request: NextRequest,
  { params: _params }: { params: Promise<{ puzzleId: string }> }
) {
  try {
    const username = request.nextUrl.searchParams.get("username");
    if (!username) return NextResponse.json({ rating: 1200 });

    await ensureRatingTable();
    const rating = await getUserRating(username);
    return NextResponse.json({ rating });
  } catch {
    return NextResponse.json({ rating: 1200 });
  }
}
