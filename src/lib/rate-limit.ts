import { redis, ensureRedisConnected } from "@/lib/redis";

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: "limit"; retryAfterSec: number }
  | { allowed: false; reason: "unavailable" };

/**
 * Redis-backed rate limiter (INCR + PEXPIRE).
 *
 * `failOpen: true` (default for legacy callers): when Redis is unavailable,
 * the request is allowed through. Use ONLY for low-stakes endpoints where
 * an outage shouldn't break user flows (e.g. unauth GETs).
 *
 * `failOpen: false`: when Redis is unavailable, deny. Use for auth, password
 * reset, registration, paid actions, anything an attacker would target.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  options: { failOpen?: boolean } = {},
): Promise<RateLimitResult> {
  const failOpen = options.failOpen ?? true;
  try {
    await ensureRedisConnected();
    const count = await redis.incr(`rl:${key}`);
    if (count === 1) await redis.pExpire(`rl:${key}`, windowMs);
    if (count <= max) {
      return { allowed: true, remaining: Math.max(0, max - count) };
    }
    return { allowed: false, reason: "limit", retryAfterSec: Math.ceil(windowMs / 1000) };
  } catch (err) {
    console.error("[rate-limit] Redis error:", (err as Error).message);
    if (failOpen) return { allowed: true, remaining: max };
    return { allowed: false, reason: "unavailable" };
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
