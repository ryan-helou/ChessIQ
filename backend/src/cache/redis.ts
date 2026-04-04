import { createClient, RedisClientType } from "redis";

let client: RedisClientType | null = null;

export async function initRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("REDIS_URL not set, skipping Redis");
    return;
  }

  if (client) return;

  client = createClient({ url });

  client.on("error", (err: Error) => {
    console.error("Redis Client Error", err.message);
  });

  await client.connect();
}

export async function getRedis(): Promise<RedisClientType | null> {
  return client;
}

export async function cacheGameAnalysis(
  gameId: string,
  analysis: unknown,
  ttlSeconds: number = 604800
): Promise<void> {
  if (!client) return;
  const key = `game:${gameId}`;
  const value = JSON.stringify(analysis);
  await client.setEx(key, ttlSeconds, value);
}

export async function getCachedGameAnalysis(gameId: string): Promise<unknown | null> {
  if (!client) return null;
  const key = `game:${gameId}`;
  const value = await client.get(key);
  if (!value) return null;
  return JSON.parse(value);
}

export async function healthCheck(): Promise<boolean> {
  if (!client) return false;
  try {
    const pong = await client.ping();
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
