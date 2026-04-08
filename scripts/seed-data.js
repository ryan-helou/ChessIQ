#!/usr/bin/env node

const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function seedData() {
  const client = await pool.connect();
  try {
    // Create a sample user/game
    const userId = uuidv4();
    const gameId = uuidv4();
    const username = "ryanizgoated"; // Match the user from the UI

    console.log("Creating sample game...");
    await client.query(
      `
      INSERT INTO games (id, user_id, pgn, result, played_at, white_username, black_username, time_control, opening_eco, analysis_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        gameId,
        userId,
        "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6",
        "0-1",
        new Date(),
        username,
        "opponent",
        "blitz",
        "B30",
        "complete",
      ]
    );

    console.log("Creating sample analyzed moves...");
    // Create some analyzed moves
    const moves = [
      {
        move_number: 1,
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        move: "e2e4",
        san: "e4",
      },
      {
        move_number: 3,
        fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
        move: "d2d4",
        san: "d4",
      },
    ];

    for (const m of moves) {
      await client.query(
        `
        INSERT INTO analyzed_moves (game_id, move_number, fen, move, san, best_move, evaluation_cp, accuracy)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [gameId, m.move_number, m.fen, m.move, m.san, m.move, 50, 95]
      );
    }

    console.log("Creating sample blunders...");
    // Create some blunders with different themes
    const blunders = [
      {
        move_number: 10,
        player_move: "f6f5",
        best_move: "e5e4",
        eval_before: 150,
        eval_after: -250,
        severity: "blunder",
        missed_tactic: "fork",
      },
      {
        move_number: 15,
        player_move: "d6e6",
        best_move: "a7a6",
        eval_before: -100,
        eval_after: -450,
        severity: "mistake",
        missed_tactic: "pin",
      },
      {
        move_number: 22,
        player_move: "g7g6",
        best_move: "h7h6",
        eval_before: 50,
        eval_after: -300,
        severity: "blunder",
        missed_tactic: "backRankMate",
      },
    ];

    for (const b of blunders) {
      await client.query(
        `
        INSERT INTO blunders (game_id, move_number, player_move, best_move, eval_before_cp, eval_after_cp, severity, missed_tactic)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          gameId,
          b.move_number,
          b.player_move,
          b.best_move,
          b.eval_before,
          b.eval_after,
          b.severity,
          b.missed_tactic,
        ]
      );
    }

    console.log("Seeding complete!");
    console.log(`Created game ${gameId} for user ${username}`);
  } catch (error) {
    console.error("Error seeding data:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await seedData();
    await pool.end();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
