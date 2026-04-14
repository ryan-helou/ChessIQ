import { redis, ensureRedisConnected } from "@/lib/redis";

/**
 * Redis-backed rate limiter using INCR + PEXPIRE.
 * Falls back to allowing the request if Redis is unavailable so auth
 * routes don't break during a Redis outage.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  try {
    await ensureRedisConnected();
    const count = await redis.incr(`rl:${key}`);
    if (count === 1) await redis.pExpire(`rl:${key}`, windowMs);
    return count <= max;
  } catch (err) {
    console.error("[rate-limit] Redis error — allowing request:", (err as Error).message);
    return true; // fail open: don't block users if Redis is down
  }
}

/** Extract the real client IP from a NextRequest headers object. */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}
