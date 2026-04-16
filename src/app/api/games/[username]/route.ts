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
import { redis, ensureRedisConnected } from "@/lib/redis";

const CACHE_TTL_S = 5 * 60; // 5 minutes (Redis SETEX uses seconds)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const searchParams = request.nextUrl.searchParams;
  const months = Math.min(Math.max(parseInt(searchParams.get("months") ?? "6", 10) || 6, 1), 24);

  // Cache lookup (Redis, falls back silently on error)
  const cacheKey = `games:${username}:${months}`;
  try {
    await ensureRedisConnected();
    const cached = await redis.get(cacheKey);
    if (cached) return NextResponse.json(JSON.parse(cached));
  } catch { /* Redis unavailable — continue to live fetch */ }

  try {
    const [profileRes, statsRes, rawGamesRes] = await Promise.allSettled([
      getProfile(username),
      getStats(username),
      getAllGames(username, months),
    ]);

    // Games are required — fail fast if we can't fetch them
    if (rawGamesRes.status === "rejected") throw rawGamesRes.reason;

    const profile = profileRes.status === "fulfilled" ? profileRes.value : null;
    const stats   = statsRes.status  === "fulfilled" ? statsRes.value  : null;
    const rawGames = rawGamesRes.value;

    if (profileRes.status === "rejected") console.warn("[games route] profile fetch failed:", profileRes.reason);
    if (statsRes.status   === "rejected") console.warn("[games route] stats fetch failed:",   statsRes.reason);

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
    try {
      await redis.setEx(cacheKey, CACHE_TTL_S, JSON.stringify(result));
    } catch { /* Redis unavailable — skip caching */ }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data from Chess.com" },
      { status: 500 }
    );
  }
}
