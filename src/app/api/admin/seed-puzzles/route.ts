export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Chess } from "chess.js";

const THEMES = [
  "fork",
  "pin",
  "skewer",
  "hangingPiece",
  "backRankMate",
  "mate",
  "discoveredAttack",
  "promotion",
  "sacrifice",
  "deflection",
];

// Lichess puzzle/next returns one puzzle at a time — call it N times per theme in parallel
async function fetchPuzzlesForTheme(theme: string, count: number): Promise<any[]> {
  const calls = Array.from({ length: count }, () =>
    fetch(`https://lichess.org/api/puzzle/next?angle=${theme}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  );

  const results = await Promise.all(calls);
  const puzzles: any[] = [];

  for (const data of results) {
    if (!data?.puzzle || !data?.game) continue;
    try {
      const chess = new Chess();
      chess.loadPgn(data.game.pgn);
      const history = chess.history({ verbose: true });
      const chess2 = new Chess();
      for (let i = 0; i < data.puzzle.initialPly; i++) {
        if (history[i]) chess2.move(history[i].san);
      }
      const solution = Array.isArray(data.puzzle.solution)
        ? data.puzzle.solution.join(" ")
        : data.puzzle.solution ?? "";

      if (!solution) continue;

      puzzles.push({
        id: data.puzzle.id,
        fen: chess2.fen(),
        moves: solution,
        rating: data.puzzle.rating ?? 1500,
        themes: data.puzzle.themes ?? [theme],
        openingTags: data.puzzle.openingTags ?? [],
        moveCount: solution.split(" ").length,
      });
    } catch {
      // skip malformed puzzle
    }
  }

  return puzzles;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * POST /api/admin/seed-puzzles?perTheme=20
 * Fetches puzzles from Lichess for each theme and upserts into local DB.
 * Safe to call multiple times — uses ON CONFLICT DO NOTHING.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const perTheme = parseInt(request.nextUrl.searchParams.get("perTheme") ?? "20", 10);

    // Ensure puzzles table exists
    await query(`
      CREATE TABLE IF NOT EXISTS puzzles (
        id TEXT PRIMARY KEY,
        fen TEXT NOT NULL,
        moves TEXT NOT NULL,
        rating INTEGER DEFAULT 1500,
        themes TEXT[] DEFAULT '{}',
        opening_tags TEXT[] DEFAULT '{}',
        move_count INTEGER DEFAULT 2,
        popularity INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `, []);

    await query(`CREATE INDEX IF NOT EXISTS idx_puzzles_themes ON puzzles USING GIN (themes)`, []);
    await query(`CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles (rating)`, []);

    let totalInserted = 0;
    let totalFetched = 0;
    const byTheme: Record<string, number> = {};

    // Process themes in small parallel batches to avoid hammering Lichess
    for (const theme of THEMES) {
      const puzzles = await fetchPuzzlesForTheme(theme, perTheme);
      totalFetched += puzzles.length;
      let inserted = 0;

      for (const p of puzzles) {
        try {
          const result = await query(
            `INSERT INTO puzzles (id, fen, moves, rating, themes, opening_tags, move_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, p.fen, p.moves, p.rating, p.themes, p.openingTags, p.moveCount]
          );
          if ((result.rowCount ?? 0) > 0) { inserted++; totalInserted++; }
        } catch { /* skip */ }
      }

      byTheme[theme] = inserted;
    }

    // Count totals in DB
    const countResult = await query(`SELECT COUNT(*) as total FROM puzzles`, []);
    const totalInDb = parseInt(countResult.rows[0]?.total ?? "0");

    return NextResponse.json({ fetched: totalFetched, inserted: totalInserted, totalInDb, byTheme });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/seed-puzzles
 * Returns current puzzle library stats.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await query(`
      SELECT unnest(themes) as theme, COUNT(*) as count
      FROM puzzles
      GROUP BY theme
      ORDER BY count DESC
    `, []);

    const total = await query(`SELECT COUNT(*) as total FROM puzzles`, []);

    return NextResponse.json({
      totalPuzzles: parseInt(total.rows[0]?.total ?? "0"),
      byTheme: result.rows,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
