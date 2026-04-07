/**
 * Lichess Puzzle Database Importer
 *
 * Downloads and imports a filtered subset of the Lichess puzzle database
 * into PostgreSQL for personalized puzzle recommendations.
 *
 * Usage:
 *   npx tsx scripts/import-puzzles.ts [path-to-csv]
 *
 * If no path is provided, downloads from Lichess automatically.
 * The CSV must be uncompressed (decompress .csv.zst with `zstd -d` first).
 *
 * CSV columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
 *
 * Filters applied:
 *   - Rating: 600-2400
 *   - Popularity: > 70
 *   - NbPlays: > 1000
 *   - Solution moves: 2-6 (1-3 player moves)
 */

import { Pool } from "pg";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Readable } from "stream";
import dotenv from "dotenv";

dotenv.config();

const LICHESS_PUZZLE_URL =
  "https://database.lichess.org/lichess_db_puzzle.csv.zst";

const MIN_RATING = 600;
const MAX_RATING = 2400;
const MIN_POPULARITY = 90;
const MIN_NB_PLAYS = 15000;
const MIN_MOVES = 2; // At least 1 opponent move + 1 player move
const MAX_MOVES = 6; // At most 3 player moves

const BATCH_SIZE = 1000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface PuzzleRow {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  gameUrl: string;
  openingTags: string[];
  moveCount: number;
}

function parseLine(line: string): PuzzleRow | null {
  // CSV format: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
  const parts = line.split(",");
  if (parts.length < 8) return null;

  const id = parts[0];
  const fen = parts[1];
  const moves = parts[2];
  const rating = parseInt(parts[3], 10);
  const ratingDeviation = parseInt(parts[4], 10);
  const popularity = parseInt(parts[5], 10);
  const nbPlays = parseInt(parts[6], 10);
  const themes = parts[7]?.split(" ").filter(Boolean) ?? [];
  const gameUrl = parts[8] ?? "";
  const openingTags = parts[9]?.split(" ").filter(Boolean) ?? [];

  if (isNaN(rating) || isNaN(popularity) || isNaN(nbPlays)) return null;

  const moveCount = moves.split(" ").length;

  // Apply filters
  if (rating < MIN_RATING || rating > MAX_RATING) return null;
  if (popularity < MIN_POPULARITY) return null;
  if (nbPlays < MIN_NB_PLAYS) return null;
  if (moveCount < MIN_MOVES || moveCount > MAX_MOVES) return null;
  if (themes.length === 0) return null;

  return {
    id,
    fen,
    moves,
    rating,
    ratingDeviation,
    popularity,
    nbPlays,
    themes,
    gameUrl,
    openingTags,
    moveCount,
  };
}

async function insertBatch(batch: PuzzleRow[]): Promise<void> {
  if (batch.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const p = batch[i];
    const base = i * 9;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`
    );
    values.push(
      p.id,
      p.fen,
      p.moves,
      p.rating,
      p.popularity,
      p.nbPlays,
      p.themes,
      p.openingTags,
      p.moveCount
    );
  }

  const query = `
    INSERT INTO puzzles (id, fen, moves, rating, popularity, nb_plays, themes, opening_tags, move_count)
    VALUES ${placeholders.join(",")}
    ON CONFLICT (id) DO NOTHING
  `;

  await pool.query(query, values);
}

async function importFromFile(filePath: string): Promise<void> {
  console.log(`Reading puzzles from: ${filePath}`);

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  let imported = 0;
  let skipped = 0;
  let batch: PuzzleRow[] = [];

  for await (const line of rl) {
    lineNumber++;

    // Skip header
    if (lineNumber === 1 && line.startsWith("PuzzleId")) continue;

    const puzzle = parseLine(line);
    if (!puzzle) {
      skipped++;
      continue;
    }

    batch.push(puzzle);

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch);
      imported += batch.length;
      batch = [];

      if (imported % 10000 === 0) {
        console.log(
          `  Progress: ${imported.toLocaleString()} imported, ${skipped.toLocaleString()} skipped (line ${lineNumber.toLocaleString()})`
        );
      }
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    await insertBatch(batch);
    imported += batch.length;
  }

  console.log(`\nDone!`);
  console.log(`  Total lines processed: ${lineNumber.toLocaleString()}`);
  console.log(`  Puzzles imported: ${imported.toLocaleString()}`);
  console.log(`  Puzzles skipped: ${skipped.toLocaleString()}`);
}

async function downloadAndImport(): Promise<void> {
  console.log("Downloading Lichess puzzle database...");
  console.log(
    "NOTE: The file is ~300MB compressed. Download the CSV manually and decompress with:"
  );
  console.log(`  curl -O ${LICHESS_PUZZLE_URL}`);
  console.log(`  zstd -d lichess_db_puzzle.csv.zst`);
  console.log(`  npx tsx scripts/import-puzzles.ts lichess_db_puzzle.csv`);
  process.exit(1);
}

async function main(): Promise<void> {
  const filePath = process.argv[2];

  if (!filePath) {
    await downloadAndImport();
    return;
  }

  // Create tables if they don't exist
  const migration = `
    CREATE TABLE IF NOT EXISTS puzzles (
      id VARCHAR(10) PRIMARY KEY,
      fen VARCHAR(200) NOT NULL,
      moves VARCHAR(500) NOT NULL,
      rating SMALLINT NOT NULL,
      rating_deviation SMALLINT,
      popularity SMALLINT,
      nb_plays INTEGER,
      themes TEXT[] NOT NULL,
      opening_tags TEXT[],
      move_count SMALLINT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_puzzles_themes ON puzzles USING GIN(themes);
    CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles(rating);
    CREATE INDEX IF NOT EXISTS idx_puzzles_popularity ON puzzles(popularity DESC);
  `;

  try {
    await pool.query(migration);
    console.log("Puzzle tables ready.");
  } catch (err) {
    console.error("Failed to create tables:", err);
    process.exit(1);
  }

  await importFromFile(filePath);
  await pool.end();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
