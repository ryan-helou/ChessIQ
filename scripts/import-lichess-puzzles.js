#!/usr/bin/env node
/**
 * Lichess Puzzle Importer
 *
 * Imports puzzles from the Lichess puzzle CSV database into the local DB.
 *
 * Usage:
 *   node scripts/import-lichess-puzzles.js [options]
 *
 * Options:
 *   --file <path>     Path to Lichess CSV file (decompressed). Default: lichess_db_puzzle.csv
 *   --count <n>       Max puzzles to import. Default: 50000
 *   --min-rating <n>  Min puzzle rating. Default: 800
 *   --max-rating <n>  Max puzzle rating. Default: 2500
 *   --batch <n>       DB batch insert size. Default: 500
 *
 * Getting the Lichess puzzle database:
 *   1. Download: https://database.lichess.org/lichess_db_puzzle.csv.zst
 *   2. Decompress: zstd -d lichess_db_puzzle.csv.zst
 *      (or: brew install zstd && zstd -d lichess_db_puzzle.csv.zst)
 *   3. Run: DATABASE_URL=your_url node scripts/import-lichess-puzzles.js --file lichess_db_puzzle.csv
 *
 * CSV format:
 *   PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
 *
 * Themes are space-separated. Lichess uses camelCase (fork, pin, backRankMate, discoveredAttack, etc.)
 * This script also handles snake_case variants for robustness.
 */

const fs = require("fs");
const readline = require("readline");
const { Pool } = require("pg");

// ──────────────────────────────────────────────
// Theme normalisation: snake_case → camelCase
// (Lichess CSV themes are actually camelCase,
//  but some older exports use snake_case)
// ──────────────────────────────────────────────
const SNAKE_TO_CAMEL = {
  back_rank_mate: "backRankMate",
  discovered_attack: "discoveredAttack",
  hanging_piece: "hangingPiece",
  trapped_piece: "trappedPiece",
  double_check: "doubleCheck",
  quiet_move: "quietMove",
  mate_in_1: "mate",
  mate_in_2: "mate",
  mate_in_3: "mate",
  mate_in_4: "mate",
  mate_in_5: "mate",
  short_combination: "materialGain",
  long_combination: "materialGain",
};

// Themes our app cares about — used to filter out noise
const RELEVANT_THEMES = new Set([
  "fork", "pin", "skewer", "backRankMate", "discoveredAttack",
  "hangingPiece", "trappedPiece", "doubleCheck", "sacrifice",
  "promotion", "mate", "deflection", "decoy", "interference",
  "attraction", "quietMove", "zugzwang", "endgame", "middlegame",
  "materialGain",
]);

function normaliseTheme(raw) {
  if (SNAKE_TO_CAMEL[raw]) return SNAKE_TO_CAMEL[raw];
  // Convert snake_case to camelCase if not in map
  if (raw.includes("_")) {
    const camel = raw.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return camel;
  }
  return raw;
}

function parseThemes(themesField) {
  if (!themesField) return [];
  return themesField
    .split(" ")
    .map((t) => normaliseTheme(t.trim()))
    .filter((t) => t.length > 0 && RELEVANT_THEMES.has(t));
}

// ──────────────────────────────────────────────
// CLI args
// ──────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    file: "lichess_db_puzzle.csv",
    count: 50000,
    minRating: 800,
    maxRating: 2500,
    batch: 500,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) opts.file = args[++i];
    else if (args[i] === "--count" && args[i + 1]) opts.count = parseInt(args[++i], 10);
    else if (args[i] === "--min-rating" && args[i + 1]) opts.minRating = parseInt(args[++i], 10);
    else if (args[i] === "--max-rating" && args[i + 1]) opts.maxRating = parseInt(args[++i], 10);
    else if (args[i] === "--batch" && args[i + 1]) opts.batch = parseInt(args[++i], 10);
  }

  return opts;
}

// ──────────────────────────────────────────────
// DB batch insert
// ──────────────────────────────────────────────
async function insertBatch(client, rows) {
  if (rows.length === 0) return 0;

  // Build multi-row INSERT with ON CONFLICT DO NOTHING
  const valuePlaceholders = rows.map((_, i) => {
    const base = i * 9;
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9})`;
  });

  const params = rows.flatMap((r) => [
    r.id,
    r.fen,
    r.moves,
    r.rating,
    r.ratingDeviation,
    r.popularity,
    r.nbPlays,
    r.themes,
    r.moveCount,
  ]);

  const sql = `
    INSERT INTO puzzles (id, fen, moves, rating, rating_deviation, popularity, nb_plays, themes, move_count)
    VALUES ${valuePlaceholders.join(",")}
    ON CONFLICT (id) DO NOTHING
  `;

  const result = await client.query(sql, params);
  return result.rowCount;
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const useStdin = opts.file === "-";

  if (!useStdin && !fs.existsSync(opts.file)) {
    console.error(`Error: CSV file not found: ${opts.file}`);
    console.error("");
    console.error("To stream directly without saving the full file:");
    console.error("  curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -d | node scripts/import-lichess-puzzles.js --file -");
    console.error("");
    console.error("Or download first:");
    console.error("  1. curl -O https://database.lichess.org/lichess_db_puzzle.csv.zst");
    console.error("  2. zstd -d lichess_db_puzzle.csv.zst");
    console.error(`  3. node scripts/import-lichess-puzzles.js --file lichess_db_puzzle.csv`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  console.log(`Connected to database`);
  console.log(`Importing from: ${useStdin ? "stdin (streamed)" : opts.file}`);
  console.log(`Max puzzles: ${opts.count}, rating: ${opts.minRating}–${opts.maxRating}`);
  console.log("");

  const inputStream = useStdin ? process.stdin : fs.createReadStream(opts.file);
  const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

  let lineNum = 0;
  let imported = 0;
  let skipped = 0;
  let batch = [];
  let headerParsed = false;
  let colIndex = {}; // column name → index

  const startTime = Date.now();

  outer: for await (const line of rl) {
    lineNum++;

    if (!headerParsed) {
      // Parse header row: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
      const headers = line.split(",").map((h) => h.trim());
      headers.forEach((h, i) => { colIndex[h.toLowerCase()] = i; });
      headerParsed = true;
      continue;
    }

    if (imported >= opts.count) break outer;

    // Parse CSV row (simple split — Lichess CSV doesn't have quoted commas)
    const cols = line.split(",");
    if (cols.length < 8) continue;

    const id = cols[colIndex["puzzleid"] ?? 0]?.trim();
    const fen = cols[colIndex["fen"] ?? 1]?.trim();
    const moves = cols[colIndex["moves"] ?? 2]?.trim();
    const ratingRaw = parseInt(cols[colIndex["rating"] ?? 3], 10);
    const ratingDeviation = parseInt(cols[colIndex["ratingdeviation"] ?? 4], 10) || null;
    const popularity = parseInt(cols[colIndex["popularity"] ?? 5], 10) || null;
    const nbPlays = parseInt(cols[colIndex["nbplays"] ?? 6], 10) || null;
    const themesRaw = cols[colIndex["themes"] ?? 7]?.trim() ?? "";
    const openingTagsRaw = cols[colIndex["openingtags"] ?? 9]?.trim() ?? "";

    // Validate essentials
    if (!id || !fen || !moves || isNaN(ratingRaw)) {
      skipped++;
      continue;
    }

    // Rating filter
    if (ratingRaw < opts.minRating || ratingRaw > opts.maxRating) {
      skipped++;
      continue;
    }

    // Parse and filter themes — skip puzzles with no relevant themes
    const themes = parseThemes(themesRaw);
    if (themes.length === 0) {
      skipped++;
      continue;
    }

    const moveCount = moves.split(" ").length;

    batch.push({
      id,
      fen,
      moves,
      rating: ratingRaw,
      ratingDeviation: isNaN(ratingDeviation) ? null : ratingDeviation,
      popularity,
      nbPlays,
      themes,
      moveCount,
    });

    if (batch.length >= opts.batch) {
      const inserted = await insertBatch(client, batch);
      imported += inserted;
      batch = [];

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r  Imported: ${imported} | Skipped: ${skipped} | Lines: ${lineNum} | ${elapsed}s`);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const inserted = await insertBatch(client, batch);
    imported += inserted;
  }

  client.release();
  await pool.end();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\nDone in ${elapsed}s`);
  console.log(`  Imported: ${imported} puzzles`);
  console.log(`  Skipped:  ${skipped} rows (rating filter, no relevant themes, or duplicates)`);
  console.log(`  Total lines read: ${lineNum}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
