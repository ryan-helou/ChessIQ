export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getAllGames } from "@/lib/chess-com-api";
import { query } from "@/lib/db";
import { analyzeGame, type AnalyzedMove } from "@/modules/game-review/analyzer";
import { detectMissedTactic } from "@/lib/tactic-detector";

const SOFT_TIMEOUT_MS = 55_000; // Leave 5s headroom inside the 60s limit

/** Deterministic pseudo-UUID from a Chess.com username (no auth required). */
function usernameToUserId(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = Math.imul(31, h) + username.charCodeAt(i) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `00000000-0000-0000-0000-${hex.padStart(12, "0")}`;
}

/** Persist a single game + its analyzed moves + its blunders to the DB. */
async function persistGameAnalysis(
  chessComId: string,
  pgn: string,
  whiteUsername: string,
  blackUsername: string,
  username: string,
  moves: AnalyzedMove[],
) {
  const userId = usernameToUserId(username);

  // Determine accuracies
  const userMoves = moves.filter(
    (m) => (m.color === "white" && username.toLowerCase() === whiteUsername.toLowerCase()) ||
            (m.color === "black" && username.toLowerCase() === blackUsername.toLowerCase())
  );
  const accuracy = userMoves.length > 0
    ? Math.round(userMoves.reduce((s, m) => s + m.accuracy, 0) / userMoves.length)
    : null;

  // Upsert game row
  const gameResult = await query(
    `
    INSERT INTO games (
      user_id, chess_com_id, pgn, white_username, black_username,
      accuracy_white, accuracy_black, analysis_status, analysis_completed_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'complete', NOW())
    ON CONFLICT (chess_com_id) DO UPDATE SET
      analysis_status = 'complete',
      analysis_completed_at = NOW()
    RETURNING id
    `,
    [
      userId,
      chessComId,
      pgn,
      whiteUsername,
      blackUsername,
      username.toLowerCase() === whiteUsername.toLowerCase() ? accuracy : null,
      username.toLowerCase() === blackUsername.toLowerCase() ? accuracy : null,
    ]
  );

  const gameId: string = gameResult.rows[0].id;

  // Batch insert analyzed moves (skip if already present)
  for (const m of moves) {
    await query(
      `
      INSERT INTO analyzed_moves (game_id, move_number, fen, move, san, best_move, evaluation_cp, accuracy, is_blunder, is_mistake, is_inaccuracy)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (game_id, move_number, depth_analyzed) DO NOTHING
      `,
      [
        gameId,
        m.moveNumber,
        m.fen,
        m.move,
        m.san,
        m.bestMove,
        m.engineEval,
        m.accuracy,
        m.classification === "blunder",
        m.classification === "mistake",
        m.classification === "inaccuracy",
      ]
    ).catch(() => {}); // Ignore constraint violations (depth_analyzed nullable mismatch)
  }

  // Insert blunders + mistakes for this player's moves
  const badMoves = userMoves.filter(
    (m) => m.classification === "blunder" || m.classification === "mistake"
  );

  for (const m of badMoves) {
    const missedTactic = detectMissedTactic(m.fenBefore, m.bestMove);
    await query(
      `
      INSERT INTO blunders (game_id, move_number, player_move, best_move, eval_before_cp, eval_after_cp, severity, missed_tactic)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (game_id, move_number) DO NOTHING
      `,
      [
        gameId,
        m.moveNumber,
        m.move,
        m.bestMove,
        m.evalBefore,
        m.engineEval,
        m.classification, // "blunder" or "mistake"
        missedTactic,
      ]
    );
  }

  return { gameId, blundersFound: badMoves.length };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const body = await request.json();
    const { months = 1, gameCount = 20, depth = 18 } = body;

    const validCounts = [10, 20, 50, "all"];
    if (!validCounts.includes(gameCount)) {
      return NextResponse.json(
        { error: "Invalid gameCount. Must be 10, 20, 50, or 'all'" },
        { status: 400 }
      );
    }

    // Fetch games from Chess.com
    const chesscomGames = await getAllGames(username, months);
    if (!chesscomGames || chesscomGames.length === 0) {
      return NextResponse.json(
        { error: "No games found for this user in the specified period" },
        { status: 404 }
      );
    }

    // Cap to requested count
    const gamesToAnalyze = gameCount === "all"
      ? chesscomGames
      : chesscomGames.slice(0, gameCount as number);

    // Filter out already-complete games
    const pending = [];
    for (const game of gamesToAnalyze) {
      const chessComId = game.url.split("/").pop() ?? "";
      try {
        const existing = await query(
          `SELECT analysis_status FROM games WHERE chess_com_id = $1`,
          [chessComId]
        );
        if (existing.rows.length === 0 || existing.rows[0].analysis_status !== "complete") {
          pending.push({ game, chessComId });
        }
      } catch {
        pending.push({ game, chessComId });
      }
    }

    if (pending.length === 0) {
      return NextResponse.json({
        status: "already_complete",
        message: "All games in this period are already analyzed.",
        analyzed: 0,
        remaining: 0,
      });
    }

    // Process games within the soft timeout
    const started = Date.now();
    let analyzed = 0;
    let totalBlunders = 0;
    let errors = 0;

    for (const { game, chessComId } of pending) {
      if (Date.now() - started > SOFT_TIMEOUT_MS) break;
      if (!game.pgn) { errors++; continue; }

      try {
        const analysis = await analyzeGame(game.pgn, depth);
        const { blundersFound } = await persistGameAnalysis(
          chessComId,
          game.pgn,
          game.white.username,
          game.black.username,
          username,
          analysis.moves,
        );
        analyzed++;
        totalBlunders += blundersFound;
      } catch (err) {
        console.error(`[analyze-queue] Failed on game ${chessComId}:`, err);
        errors++;
      }
    }

    const remaining = pending.length - analyzed - errors;

    return NextResponse.json({
      status: remaining > 0 ? "partial" : "complete",
      message: remaining > 0
        ? `Analyzed ${analyzed} game${analyzed !== 1 ? "s" : ""}. Run again to analyze ${remaining} more.`
        : `Analyzed ${analyzed} game${analyzed !== 1 ? "s" : ""} — all done!`,
      analyzed,
      remaining,
      totalBlunders,
      errors,
    });
  } catch (error) {
    console.error("[analyze-queue] Error:", error);
    return NextResponse.json(
      { error: "Failed to analyze games", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
