/**
 * Custom Next.js server for Railway deployment.
 *
 * Why a custom server instead of `next start`:
 *   - Railway runs persistent containers, so we use setInterval for cron jobs
 *     instead of an external cron scheduler.
 *   - Listens on process.env.PORT (required by Railway).
 *   - Schedules sync-games (every 5 min) and analyze-pending (every 2 min)
 *     as internal HTTP calls secured with CRON_SECRET.
 */

import { createServer } from "http";
import { parse } from "url";
import next from "next";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  const parsedUrl = parse(req.url ?? "/", true);
  handle(req, res, parsedUrl);
});

server.listen(port, () => {
  console.log(`> Ready on port ${port} [${process.env.NODE_ENV ?? "development"}]`);
  // Small delay to let the server fully initialize before first cron tick
  setTimeout(startCrons, 10_000);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`> ${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log("> HTTP server closed");
    process.exit(0);
  });
  // Force-exit after 10 s if connections don't drain in time
  setTimeout(() => {
    console.error("> Forced exit after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ─── Internal cron runner ──────────────────────────────────────────────────────

function callCron(path) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`[cron] CRON_SECRET not set — cron jobs will not run`);
    return;
  }
  fetch(`http://localhost:${port}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(90_000),
  })
    .then((res) => {
      if (!res.ok) console.error(`[cron] ${path} responded ${res.status}`);
      else res.json().then((d) => console.log(`[cron] ${path}`, d)).catch(() => {});
    })
    .catch((err) => console.error(`[cron] ${path} failed:`, err.message));
}

function startCrons() {
  console.log("> Cron jobs starting");

  // sync-games: every 1 minute (archives are Redis-cached so Chess.com load stays low)
  callCron("/api/cron/sync-games"); // fire immediately on startup too
  setInterval(() => callCron("/api/cron/sync-games"), 60 * 1000);

  // analyze-pending: every 30 seconds for faster queue drain
  callCron("/api/cron/analyze-pending");
  setInterval(() => callCron("/api/cron/analyze-pending"), 30 * 1000);

  console.log("> Cron jobs scheduled (sync-games: 1min, analyze-pending: 30s)");
}
