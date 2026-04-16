import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { withCache, cachedResponse } from "@/lib/api-cache";

/**
 * Parses [%clk H:MM:SS] annotations from a PGN and returns clock times in seconds
 * per half-move index (0 = white move 1, 1 = black move 1, 2 = white move 2, …).
 */
function parseMoveTimes(pgn: string): (number | null)[] {
  const times: (number | null)[] = [];
  const re = /\{[^}]*\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\][^}]*\}/g;
  let match;
  while ((match = re.exec(pgn)) !== null) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseFloat(match[3]);
    times.push(h * 3600 + m * 60 + s);
  }
  return times;
}

/** Bucket label for a remaining time in seconds */
function bucket(seconds: number): string {
  if (seconds < 30) return "<30s";
  if (seconds < 60) return "30–60s";
  if (seconds < 120) return "1–2m";
  return ">2m";
}

const BUCKET_ORDER = [">2m", "1–2m", "30–60s", "<30s"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  await ensureDbInit().catch((err: Error) => console.warn("[db-init]", err.message));

  try {
    const { data, cached } = await withCache(`time-pressure:${username}`, async () => {
      // Fetch blunders + their game PGNs for this player (limit to recent 150 games)
      const result = await query(
        `SELECT
           b.game_id,
           b.move_number,
           b.fen_before,
           b.severity,
           g.pgn,
           g.white_username,
           g.black_username
         FROM blunders b
         JOIN games g ON b.game_id = g.id
         WHERE (g.white_username = $1 OR g.black_username = $1)
           AND g.pgn IS NOT NULL
           AND g.pgn != ''
         ORDER BY g.played_at DESC
         LIMIT 3000`,
        [username]
      );

      // Track bucket counts for total blunders and total moves
      const blunderBuckets = new Map<string, number>();
      const allMoveBuckets = new Map<string, number>(); // from parsed PGNs of games with blunders
      const pgnCache = new Map<string, (number | null)[]>();
      for (const b of BUCKET_ORDER) { blunderBuckets.set(b, 0); allMoveBuckets.set(b, 0); }

      for (const row of result.rows) {
        const pgn: string = row.pgn;
        const moveNumber: number = row.move_number;
        const fenBefore: string | null = row.fen_before;

        // Determine player color from FEN
        let color: "w" | "b" = "w";
        if (fenBefore) {
          const turn = fenBefore.split(" ")[1];
          color = turn === "b" ? "b" : "w";
        }

        // Half-move index
        const halfMoveIdx = color === "w"
          ? (moveNumber - 1) * 2
          : (moveNumber - 1) * 2 + 1;

        // Get or parse clock times for this game
        let times = pgnCache.get(row.game_id);
        if (!times) {
          times = parseMoveTimes(pgn);
          pgnCache.set(row.game_id, times);
        }

        const clockSeconds = times[halfMoveIdx] ?? null;
        if (clockSeconds == null) continue;

        const b = bucket(clockSeconds);
        blunderBuckets.set(b, (blunderBuckets.get(b) ?? 0) + 1);
      }

      const totalBlunders = Array.from(blunderBuckets.values()).reduce((a, b) => a + b, 0);

      // Compute total moves per bucket (from the same set of games + colors)
      // We do this from the pgnCache to understand the distribution of where time is spent
      const gameIds = Array.from(pgnCache.keys());
      if (gameIds.length > 0 && gameIds.length <= 200) {
        const gamesResult = await query(
          `SELECT id, pgn, white_username, black_username
           FROM games WHERE id = ANY($1::text[])`,
          [gameIds]
        );
        for (const g of gamesResult.rows) {
          const isWhite = g.white_username?.toLowerCase() === username.toLowerCase();
          const times = pgnCache.get(g.id) ?? parseMoveTimes(g.pgn);
          for (let i = 0; i < times.length; i++) {
            const isPlayerMove = isWhite ? i % 2 === 0 : i % 2 === 1;
            if (!isPlayerMove) continue;
            const t = times[i];
            if (t == null) continue;
            const b = bucket(t);
            allMoveBuckets.set(b, (allMoveBuckets.get(b) ?? 0) + 1);
          }
        }
      }

      const totalMoves = Array.from(allMoveBuckets.values()).reduce((a, b) => a + b, 0);

      const breakdown = BUCKET_ORDER.map((b) => {
        const blunderCount = blunderBuckets.get(b) ?? 0;
        const moveCount = allMoveBuckets.get(b) ?? 0;
        // Blunder rate = blunders in this bucket / total moves in this bucket
        const blunderRate = moveCount > 0 ? (blunderCount / moveCount) * 100 : null;
        return {
          bucket: b,
          blunders: blunderCount,
          moves: moveCount,
          blunderRate: blunderRate != null ? parseFloat(blunderRate.toFixed(1)) : null,
          pctOfBlunders: totalBlunders > 0 ? Math.round((blunderCount / totalBlunders) * 100) : 0,
        };
      });

      // Key insight: what % of blunders happened with <60s remaining?
      const underPressureBlunders =
        (blunderBuckets.get("<30s") ?? 0) + (blunderBuckets.get("30–60s") ?? 0);
      const timePressurePct =
        totalBlunders > 0 ? Math.round((underPressureBlunders / totalBlunders) * 100) : 0;

      return {
        totalBlunders,
        timePressurePct,
        underPressureBlunders,
        breakdown,
        hasClock: totalBlunders > 0 && Array.from(blunderBuckets.values()).some((v) => v > 0),
      };
    });

    return cachedResponse(data, cached);
  } catch (error) {
    console.error("[time-pressure]", error);
    return cachedResponse(
      { totalBlunders: 0, timePressurePct: 0, underPressureBlunders: 0, breakdown: [], hasClock: false },
      false
    );
  }
}
