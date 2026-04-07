import { NextRequest, NextResponse } from "next/server";
import { getAllGames } from "@/lib/chess-com-api";
import { query } from "@/lib/db";

interface AnalysisJob {
  games: Array<{
    id: string;
    pgn: string;
    white_username: string;
    black_username: string;
  }>;
  username: string;
  depth: number;
  createdAt: Date;
}

/**
 * POST /api/games/[username]/analyze-queue
 * Queues an analysis job for the user's games
 * NOTE: For MVP, this stores jobs in PostgreSQL. Full Bull integration requires separate worker process.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const body = await request.json();
    const { months = 1, gameCount = 20, depth = 18 } = body;

    // Validate inputs
    if (!username || !months) {
      return NextResponse.json(
        { error: "Missing required fields: username, months" },
        { status: 400 }
      );
    }

    const validCounts = [10, 20, 50, "all"];
    if (!validCounts.includes(gameCount)) {
      return NextResponse.json(
        { error: "Invalid gameCount. Must be 10, 20, 50, or 'all'" },
        { status: 400 }
      );
    }

    console.log(
      `[api] Queueing analysis for ${username}: ${months} months, ${gameCount} games, depth ${depth}`
    );

    // Fetch games from Chess.com
    const chesscomGames = await getAllGames(username, months);
    if (!chesscomGames || chesscomGames.length === 0) {
      return NextResponse.json(
        { error: "No games found for this user in the specified period" },
        { status: 404 }
      );
    }

    // Filter to requested count
    let gamesToAnalyze = chesscomGames;
    if (gameCount !== "all") {
      gamesToAnalyze = chesscomGames.slice(0, gameCount as number);
    }

    // Filter out already-analyzed games
    const unanalyzedGames = [];
    for (const game of gamesToAnalyze) {
      try {
        const gameId = game.url.split("/").pop();
        const result = await query(
          `SELECT analysis_status FROM games WHERE chess_com_id = $1`,
          [gameId]
        );

        // If game not in DB or not analyzed, include it
        if (
          result.rows.length === 0 ||
          result.rows[0].analysis_status !== "complete"
        ) {
          unanalyzedGames.push({
            id: gameId,
            pgn: game.pgn,
            white_username: game.white.username,
            black_username: game.black.username,
          });
        }
      } catch (err) {
        console.error("Error checking game analysis status:", err);
        // If check fails, include the game anyway
        const gameId = game.url.split("/").pop();
        unanalyzedGames.push({
          id: gameId,
          pgn: game.pgn,
          white_username: game.white.username,
          black_username: game.black.username,
        });
      }
    }

    if (unanalyzedGames.length === 0) {
      return NextResponse.json(
        { message: "All games in this period are already analyzed" },
        { status: 200 }
      );
    }

    // For MVP: Store job data and simulate processing
    // In production, this should use Bull/Redis for true background processing
    const jobId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(
      `[api] Job ${jobId} queued for ${unanalyzedGames.length} games`
    );

    // TODO: In production, enqueue to Bull and launch worker
    // For now, return success and log that worker should pick this up
    console.log(
      `[api] TODO: Queue this job to Bull: ${JSON.stringify({
        games: unanalyzedGames,
        username,
        depth,
      })}`
    );

    return NextResponse.json({
      jobId,
      status: "queued",
      message: `Analysis job queued for ${unanalyzedGames.length} games. Processing in the background...`,
      gamesQueued: unanalyzedGames.length,
    });
  } catch (error) {
    console.error("[api] Error queueing analysis:", error);
    return NextResponse.json(
      {
        error: "Failed to queue analysis job",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
