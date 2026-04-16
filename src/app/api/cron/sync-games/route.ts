import { NextRequest, NextResponse } from "next/server";
import { getAllGames } from "@/lib/chess-com-api";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { usernameToUserId } from "@/lib/user-id";

function getOpening(pgn: string): string {
  const m = pgn.match(/\[ECOUrl\s+"([^"]+)"\]/);
  if (!m) return "Unknown Opening";
  const parts = m[1].split("/openings/");
  return parts[1]
    ? parts[1].split("?")[0].replace(/-/g, " ").replace(/\.\.\./g, "").trim()
    : "Unknown Opening";
}

function getResult(game: { white: { result: string }; black: { result: string } }): string {
  if (game.white.result === "win") return "1-0";
  if (game.black.result === "win") return "0-1";
  return "1/2-1/2";
}

/**
 * GET /api/cron/sync-games
 * Called every 5 minutes by server.mjs setInterval.
 * Fetches new games from Chess.com for all registered users and queues them for analysis.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDbInit();

  // Get users due for sync (oldest first, cap at 20 per invocation)
  const usersResult = await query(
    `SELECT id, chess_com_username, last_synced_at FROM users
     WHERE last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '1 minute'
     ORDER BY last_synced_at ASC NULLS FIRST
     LIMIT 10`
  );

  const users = usersResult.rows;
  let totalSynced = 0;
  let totalNewGames = 0;
  let errors = 0;

  for (const user of users) {
    try {
      // Fetch 2 months of games (covers current + previous archive month)
      const games = await getAllGames(user.chess_com_username, 2);

      // Filter to only games newer than last sync
      const lastSync = user.last_synced_at ? new Date(user.last_synced_at).getTime() / 1000 : 0;
      const newGames = lastSync > 0
        ? games.filter((g) => g.end_time > lastSync)
        : games; // First sync: take all

      if (newGames.length > 0) {
        const userId = usernameToUserId(user.chess_com_username);
        const cols = 12;
        const placeholders = newGames.map((_, i) =>
          `($${i * cols + 1},$${i * cols + 2},$${i * cols + 3},$${i * cols + 4},$${i * cols + 5},$${i * cols + 6},$${i * cols + 7},$${i * cols + 8},$${i * cols + 9},$${i * cols + 10},$${i * cols + 11},$${i * cols + 12},'pending')`
        ).join(",");

        const chessComId = (g: typeof newGames[0]) =>
          String(g.url?.split("/").pop() ?? g.end_time);

        const flat = newGames.flatMap((g) => [
          userId,
          chessComId(g),
          g.pgn,
          g.white.username,
          g.black.username,
          g.white.rating ?? null,
          g.black.rating ?? null,
          g.time_class ?? null,
          g.eco ?? null,
          getOpening(g.pgn),
          g.end_time ? new Date(g.end_time * 1000).toISOString() : null,
          getResult(g),
        ]);

        await query(
          `INSERT INTO games (user_id, chess_com_id, pgn, white_username, black_username, white_elo, black_elo, time_class, eco, opening, played_at, result, analysis_status)
           VALUES ${placeholders}
           ON CONFLICT (chess_com_id) DO UPDATE SET
             analysis_status = CASE WHEN games.analysis_status = 'complete' THEN 'complete' ELSE 'pending' END,
             pgn = EXCLUDED.pgn,
             white_elo = COALESCE(EXCLUDED.white_elo, games.white_elo),
             black_elo = COALESCE(EXCLUDED.black_elo, games.black_elo),
             time_class = COALESCE(EXCLUDED.time_class, games.time_class),
             eco = COALESCE(EXCLUDED.eco, games.eco),
             opening = COALESCE(EXCLUDED.opening, games.opening),
             played_at = COALESCE(EXCLUDED.played_at, games.played_at),
             result = COALESCE(EXCLUDED.result, games.result)`,
          flat
        );

        totalNewGames += newGames.length;
      }

      await query("UPDATE users SET last_synced_at = NOW() WHERE id = $1", [user.id]);
      totalSynced++;

      // 200ms delay to respect Chess.com rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`[sync-games] Error syncing ${user.chess_com_username}:`, err);
      errors++;
    }
  }

  // Immediately trigger analysis if we found new games (cache warming)
  if (totalNewGames > 0) {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      fetch(`http://localhost:${process.env.PORT || 3000}/api/cron/analyze-pending`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(90_000),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ synced: totalSynced, newGames: totalNewGames, errors });
}
