export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { getAllGames, getProfile, getStats } from "@/lib/chess-com-api";
import {
  parseAllGames,
  getOpeningStats,
  getRatingHistory,
  getResultBreakdown,
  getTimeControlStats,
  getStreaks,
  getColorStats,
  getRatingHistoryByTimeClass,
} from "@/lib/game-analysis";

// Module-level in-memory cache (persists across requests in same serverless instance)
const responseCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const searchParams = request.nextUrl.searchParams;
  const months = parseInt(searchParams.get("months") ?? "6", 10);

  // Cache hit
  const cacheKey = `${username}:${months}`;
  const hit = responseCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json(hit.data);
  }

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
    const colorStats = getColorStats(games);
    const ratingHistoryByTimeClass = getRatingHistoryByTimeClass(games);

    const result = {
      profile,
      stats,
      games,
      openings,
      ratingHistory,
      resultBreakdown,
      timeControlStats,
      colorStats,
      ratingHistoryByTimeClass,
      streaks,
      totalGames: games.length,
    };
    responseCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data from Chess.com" },
      { status: 500 }
    );
  }
}
