import { createClient } from "redis";

// Single client instance — Railway runs a persistent container so this lives
// for the lifetime of the process. In dev, reuse across hot-reloads.
const globalForRedis = globalThis as unknown as { _redis?: ReturnType<typeof createClient> };

export const redis =
  globalForRedis._redis ??
  createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
    },
  }).on("error", (err: Error) => console.error("[redis]", err.message));

if (process.env.NODE_ENV !== "production") globalForRedis._redis = redis;

let _connectPromise: Promise<void> | null = null;

/** Connect lazily — safe to call multiple times. */
export async function ensureRedisConnected(): Promise<void> {
  if (redis.isReady) return;
  if (!_connectPromise) {
    _connectPromise = (redis as ReturnType<typeof createClient>)
      .connect()
      .then(() => { /* connected */ })
      .catch((err: Error) => {
        console.error("[redis] connection failed:", err.message);
        _connectPromise = null;
      });
  }
  await _connectPromise;
}
