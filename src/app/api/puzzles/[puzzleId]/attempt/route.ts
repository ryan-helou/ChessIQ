import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/puzzles/[puzzleId]/attempt
 * Records a puzzle attempt (solve/fail tracking)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ puzzleId: string }> }
) {
  try {
    const { puzzleId } = await params;
    const body = await request.json();
    const { username, solved, attempts, timeSeconds } = body;

    if (!username || typeof solved !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields: username, solved" },
        { status: 400 }
      );
    }

    // Record the attempt (prefix already stripped by the client)
    await query(
      `
      INSERT INTO puzzle_attempts (username, puzzle_id, solved, attempts, time_seconds)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [username, puzzleId, solved, attempts || 1, timeSeconds || null]
    );

    return NextResponse.json({
      success: true,
      message: "Puzzle attempt recorded",
    });
  } catch (error) {
    console.error("Error recording puzzle attempt:", error);
    return NextResponse.json(
      {
        error: "Failed to record puzzle attempt",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
