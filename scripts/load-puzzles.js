#!/usr/bin/env node

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Sample puzzles using Lichess format:
//   - FEN is the position before opponent's setup move (opponent = side to move in FEN)
//   - moves[0]: opponent's setup move (UCI)
//   - moves[1]: player's solution move (UCI)
//   - moves[2]: opponent's response (UCI, optional)
//   - moves[3]: player's next solution move (UCI, optional)
//   - All moves in UCI format ("e2e4"), NOT SAN ("e4")
//   - Themes use camelCase to match app's THEME_LABELS map
const samplePuzzles = [
  {
    // Italian game: Ng5 attacks f7 (fork on rook + pawn)
    // Black plays d6, white finds Ng5
    id: "00001",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    moves: "d7d6 f3g5",
    rating: 1400,
    themes: ["fork"],
  },
  {
    // Skewer: Rook on d1 skewers king on d7, then wins rook on d8
    // Black king moves to d7, white Rd1+ forces king off d-file, wins back-rank rook
    id: "00002",
    fen: "3rk3/8/8/8/8/8/8/R3K3 b - - 0 1",
    moves: "e8d7 a1d1 d7c7 d1d8",
    rating: 1600,
    themes: ["skewer"],
  },
  {
    // Pin: Bg5 pins Nf6 to the queen on d8
    // Black plays Be7 (development), white responds Bg5 exploiting pin
    id: "00003",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 5",
    moves: "f8e7 c1g5",
    rating: 1500,
    themes: ["pin"],
  },
  {
    // Hanging piece: black Nxe4 grabs pawn, white Qf3 attacks the undefended knight
    // Black plays Nxe4, white Qf3 wins it back with tempo
    id: "00004",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    moves: "f6e4 d1f3",
    rating: 1200,
    themes: ["hangingPiece"],
  },
  {
    // Discovered attack: after pawn trades on d4-d5, Nc6-d4 discovers attack on Nf3
    // Black plays d5, white exd5, black Nc6-d4 (fork/discovered), white Nxd4, black exd4
    id: "00005",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    moves: "d7d5 e4d5 c6d4 f3d4 e5d4",
    rating: 1300,
    themes: ["discoveredAttack"],
  },
];

async function insertPuzzles() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const puzzle of samplePuzzles) {
      await client.query(
        `
        INSERT INTO puzzles (id, fen, moves, rating, themes, move_count)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          puzzle.id,
          puzzle.fen,
          puzzle.moves,
          puzzle.rating,
          puzzle.themes,
          puzzle.moves.split(" ").length,
        ]
      );
      inserted++;
    }
    console.log(`Inserted ${inserted} sample puzzles`);
  } catch (error) {
    console.error("Error inserting puzzles:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    console.log("Loading sample puzzles...");
    await insertPuzzles();
    await pool.end();
    console.log("Done!");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
