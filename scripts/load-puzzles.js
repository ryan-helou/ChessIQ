#!/usr/bin/env node

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Sample puzzles from Lichess (manually curated for testing)
const samplePuzzles = [
  {
    id: "00001",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1",
    moves: "Bxc6 dxc6 dxe5 Qxd8+ Kxd8",
    rating: 1400,
    themes: ["fork", "discovered-attack"],
  },
  {
    id: "00002",
    fen: "r1bqkb1r/pppppppp/2n2n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1",
    moves: "exf6 Bxf6 Nxe5 O-O Re1",
    rating: 1600,
    themes: ["pin", "skewer"],
  },
  {
    id: "00003",
    fen: "6k1/5p2/p1qNN2p/4P3/1p2P3/1Bn5/r4KP1/7R w - - 0 1",
    moves: "Nxf7+ Kg7 Nxh6+ Kh7 Nf7+ Kg7",
    rating: 1800,
    themes: ["fork", "check"],
  },
  {
    id: "00004",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 0 1",
    moves: "exf6 Bxf6 dxc6 O-O Qxd8",
    rating: 1500,
    themes: ["back-rank", "discovered-attack"],
  },
  {
    id: "00005",
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    moves: "c5 Nf3 d6 d4 cxd4 Nxd4",
    rating: 1200,
    themes: ["hanging-piece"],
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
          (puzzle.moves.split(" ") || []).length,
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
