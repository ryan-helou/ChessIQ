import { redis, ensureRedisConnected } from "@/lib/redis";
import { NextResponse } from "next/server";

const DEFAULT_TTL = 300; // 5 minutes

export async function withCache<T>(
  cacheKey: string,
  compute: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL
): Promise<{ data: T; cached: boolean }> {
  try {
    await ensureRedisConnected();
    const cached = await redis.get(cacheKey);
    if (cached) return { data: JSON.parse(cached), cached: true };
  } catch { /* Redis unavailable — compute fresh */ }

  const data = await compute();

  try {
    await redis.setEx(cacheKey, ttlSeconds, JSON.stringify(data));
  } catch { /* Redis write failed — non-fatal */ }

  return { data, cached: false };
}

export function cachedResponse<T>(data: T, cached: boolean, maxAge: number = DEFAULT_TTL): NextResponse {
  const response = NextResponse.json(data);
  response.headers.set(
    "Cache-Control",
    `public, s-maxage=${maxAge}, stale-while-revalidate=60`
  );
  if (cached) response.headers.set("X-Cache", "HIT");
  return response;
}
