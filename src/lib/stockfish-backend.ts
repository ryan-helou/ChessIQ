const FALLBACK_URL = "http://localhost:3001";

function resolveBackendUrl(): string {
  const fromEnv = process.env.STOCKFISH_BACKEND_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STOCKFISH_BACKEND_URL is required in production. Set it in Railway environment variables.",
    );
  }

  return FALLBACK_URL;
}

export const STOCKFISH_BACKEND_URL = resolveBackendUrl();
