import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  release: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA,
  tracesSampleRate: 0.1,
  ignoreErrors: [
    "AbortError",
    "ECONNRESET",
    "ETIMEDOUT",
    "fetch failed",
  ],
});
