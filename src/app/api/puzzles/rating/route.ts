import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/** GET /api/puzzles/rating?username=... */
export async function GET(request: NextRequest) {
  try {
    const username = request.nextUrl.searchParams.get("username");
    if (!username) return NextResponse.json({ rating: 1200 });

    await query(`
      CREATE TABLE IF NOT EXISTS user_puzzle_ratings (
        username TEXT PRIMARY KEY,
        rating INTEGER NOT NULL DEFAULT 1200,
        games_played INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `, []);

    const result = await query(
      `SELECT rating FROM user_puzzle_ratings WHERE username = $1`,
      [username]
    );
    return NextResponse.json({ rating: result.rows[0]?.rating ?? 1200 });
  } catch {
    return NextResponse.json({ rating: 1200 });
  }
}
