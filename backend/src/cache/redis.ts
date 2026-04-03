import { createClient, RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function initRedis(): Promise<void> {
  if (client) return;

  client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  client.on("error", (err) => {
    console.error("Redis Client Error", err);
  });

  client.on("connect", () => {
    console.log("Redis connected");
  });

  await client.connect();
}

export async function getRedis(): Promise<RedisClientType> {
  if (!client) {
    await initRedis();
  }
  if (!client) throw new Error("Redis not initialized");
  return client;
}

export async function cacheEval(
  fen: string,
  depth: number,
  bestMove: string,
  eval: number,
  ttlSeconds: number = 86400 // 24 hours default
): Promise<void> {
  const cache = await getRedis();
  const key = `eval:${fen}:${depth}`;
  const value = JSON.stringify({ bestMove, eval });
  await cache.setEx(key, ttlSeconds, value);
}

export async function getCachedEval(
  fen: string,
  depth: number
): Promise<{ bestMove: string; eval: number } | null> {
  const cache = await getRedis();
  const key = `eval:${fen}:${depth}`;
  const value = await cache.get(key);
  if (!value) return null;
  return JSON.parse(value);
}

export async function cacheGameAnalysis(
  gameId: string,
  analysis: any,
  ttlSeconds: number = 604800 // 7 days default
): Promise<void> {
  const cache = await getRedis();
  const key = `game:${gameId}`;
  const value = JSON.stringify(analysis);
  await cache.setEx(key, ttlSeconds, value);
}

export async function getCachedGameAnalysis(gameId: string): Promise<any | null> {
  const cache = await getRedis();
  const key = `game:${gameId}`;
  const value = await cache.get(key);
  if (!value) return null;
  return JSON.parse(value);
}

export async function invalidateGameCache(gameId: string): Promise<void> {
  const cache = await getRedis();
  const key = `game:${gameId}`;
  await cache.del(key);
}

export async function healthCheck(): Promise<boolean> {
  try {
    const cache = await getRedis();
    const pong = await cache.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
