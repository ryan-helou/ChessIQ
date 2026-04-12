import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";

/** GET /api/puzzles/rating?username=... */
export async function GET(request: NextRequest) {
  try {
    const username = request.nextUrl.searchParams.get("username");
    if (!username) return NextResponse.json({ rating: 1200 });

    await ensureDbInit().catch(() => {});

    const result = await query(
      `SELECT rating FROM user_puzzle_ratings WHERE username = $1`,
      [username]
    );
    return NextResponse.json({ rating: result.rows[0]?.rating ?? 1200 });
  } catch {
    return NextResponse.json({ rating: 1200 });
  }
}
