import { redis, ensureRedisConnected } from "@/lib/redis";

const BASE_URL = "https://api.chess.com/pub";

async function redisCacheGet(key: string): Promise<string | null> {
  try { await ensureRedisConnected(); return await redis.get(key); } catch { return null; }
}
async function redisCacheSet(key: string, value: string, ttlS: number): Promise<void> {
  try { await redis.setEx(key, ttlS, value); } catch { /* ignore */ }
}

export interface ChessComProfile {
  username: string;
  name?: string;
  avatar?: string;
  country?: string;
  location?: string;
  joined: number;
  last_online: number;
  followers: number;
  status: string;
  league?: string;
}

export interface ChessComStats {
  chess_rapid?: RatingCategory;
  chess_blitz?: RatingCategory;
  chess_bullet?: RatingCategory;
  chess_daily?: RatingCategory;
}

export interface RatingCategory {
  last: { rating: number; date: number; rd: number };
  best: { rating: number; date: number; game: string };
  record: { win: number; loss: number; draw: number };
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  accuracies?: { white: number; black: number };
  uuid: string;
  fen: string;
  time_class: "rapid" | "blitz" | "bullet" | "daily";
  rules: string;
  white: GamePlayer;
  black: GamePlayer;
  eco?: string;
  initial_setup: string;
}

export interface GamePlayer {
  rating: number;
  result: string;
  username: string;
  uuid: string;
}

async function fetchJSON<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "ChessIQ/1.0" },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 300 },
    });
    if (res.status === 429) {
      // Rate limited — wait 2s then retry once
      if (attempt === 0) { await new Promise(r => setTimeout(r, 2000)); continue; }
      throw new Error("Chess.com rate limit exceeded");
    }
    if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`);
    return res.json();
  }
  throw new Error("Chess.com API fetch failed");
}

export async function getProfile(username: string): Promise<ChessComProfile> {
  const key = `chesscom:profile:${username}`;
  const cached = await redisCacheGet(key);
  if (cached) return JSON.parse(cached);
  const data = await fetchJSON<ChessComProfile>(`${BASE_URL}/player/${username}`);
  await redisCacheSet(key, JSON.stringify(data), 10 * 60); // 10 min
  return data;
}

export async function getStats(username: string): Promise<ChessComStats> {
  const key = `chesscom:stats:${username}`;
  const cached = await redisCacheGet(key);
  if (cached) return JSON.parse(cached);
  const data = await fetchJSON<ChessComStats>(`${BASE_URL}/player/${username}/stats`);
  await redisCacheSet(key, JSON.stringify(data), 10 * 60); // 10 min
  return data;
}

export async function getArchives(username: string): Promise<string[]> {
  const key = `chesscom:archives:${username}`;
  const cached = await redisCacheGet(key);
  if (cached) return JSON.parse(cached);
  const data = await fetchJSON<{ archives: string[] }>(
    `${BASE_URL}/player/${username}/games/archives`
  );
  await redisCacheSet(key, JSON.stringify(data.archives), 5 * 60); // 5 min
  return data.archives;
}

export async function getGamesForMonth(archiveUrl: string): Promise<ChessComGame[]> {
  const key = `chesscom:month:${archiveUrl}`;
  const cached = await redisCacheGet(key);
  if (cached) return JSON.parse(cached);
  const data = await fetchJSON<{ games: ChessComGame[] }>(archiveUrl);
  const games = data.games.filter((g) => g.rules === "chess");
  await redisCacheSet(key, JSON.stringify(games), 5 * 60); // 5 min
  return games;
}

export async function getAllGames(
  username: string,
  monthsBack: number = 6
): Promise<ChessComGame[]> {
  const archives = await getArchives(username);
  const recentArchives = archives.slice(-monthsBack);

  // Sequential fetches with 350ms delay to avoid hammering Chess.com under concurrent load
  const results: ChessComGame[][] = [];
  for (let i = 0; i < recentArchives.length; i++) {
    results.push(await getGamesForMonth(recentArchives[i]));
    if (i < recentArchives.length - 1) {
      await new Promise(r => setTimeout(r, 350));
    }
  }

  return results.flat().sort((a, b) => a.end_time - b.end_time);
}
