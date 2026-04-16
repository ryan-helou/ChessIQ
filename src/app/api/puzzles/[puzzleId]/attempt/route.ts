import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { calcEloChange, getUserRating, updateUserRating, recordRatingHistory } from "@/modules/puzzle-engine";

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

    await ensureDbInit().catch((err: Error) => console.error('[db-init] failed:', err.message));

    // Record attempt
    await query(
      `INSERT INTO puzzle_attempts (username, puzzle_id, solved, attempts, time_seconds)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [username, puzzleId, solved, attempts || 1, timeSeconds || null]
    ).catch(() => {
      return query(
        `INSERT INTO puzzle_attempts (username, puzzle_id, solved, attempts, time_seconds)
         VALUES ($1, $2, $3, $4, $5)`,
        [username, puzzleId, solved, attempts || 1, timeSeconds || null]
      ).catch((err) => console.warn("[puzzle-attempt] insert failed:", err.message));
    });

    // Only update Elo for rated modes (random / weak spots) — not blunders
    const currentRating = await getUserRating(username);
    if (typeof puzzleRating === "number" && puzzleRating > 0) {
      const ratingChange = calcEloChange(currentRating, puzzleRating, solved, attempts || 1);
      const newRating = Math.max(100, currentRating + ratingChange);
      await updateUserRating(username, newRating);
      await recordRatingHistory(username, newRating);
      return NextResponse.json({ success: true, ratingChange, newRating });
    }

    return NextResponse.json({ success: true, ratingChange: null, newRating: currentRating });
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

    await ensureDbInit().catch((err: Error) => console.error('[db-init] failed:', err.message));
    const rating = await getUserRating(username);
    return NextResponse.json({ rating });
  } catch {
    return NextResponse.json({ rating: 1200 });
  }
}
