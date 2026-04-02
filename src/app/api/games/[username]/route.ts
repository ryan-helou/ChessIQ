import { NextRequest, NextResponse } from "next/server";
import { getAllGames, getProfile, getStats } from "@/lib/chess-com-api";
import {
  parseAllGames,
  getOpeningStats,
  getRatingHistory,
  getResultBreakdown,
  getTimeControlStats,
  getStreaks,
} from "@/lib/game-analysis";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const searchParams = request.nextUrl.searchParams;
  const months = parseInt(searchParams.get("months") ?? "6", 10);

  try {
    const [profile, stats, rawGames] = await Promise.all([
      getProfile(username),
      getStats(username),
      getAllGames(username, months),
    ]);

    const games = parseAllGames(rawGames, username);
    const openings = getOpeningStats(games);
    const ratingHistory = getRatingHistory(games);
    const resultBreakdown = getResultBreakdown(games);
    const timeControlStats = getTimeControlStats(games);
    const streaks = getStreaks(games);

    return NextResponse.json({
      profile,
      stats,
      games,
      openings,
      ratingHistory,
      resultBreakdown,
      timeControlStats,
      streaks,
      totalGames: games.length,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data from Chess.com" },
      { status: 500 }
    );
  }
}
