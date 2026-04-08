#!/usr/bin/env node
/**
 * Database migration runner
 * Runs all SQL files in src/db/migrations/ in order (001_, 002_, ...).
 * Tracks which migrations have run in a migrations_log table.
 *
 * Usage:
 *   DATABASE_URL=your_url node scripts/migrate.js
 *   npm run db:migrate
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const MIGRATIONS_DIR = path.join(__dirname, "../src/db/migrations");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // Ensure migrations log table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const applied = await client.query("SELECT filename FROM migrations_log");
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    // Read migration files in order
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  skip  ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`  run   ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO migrations_log (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ERROR in ${file}:`, err.message);
        throw err;
      }
    }

    if (ran === 0) {
      console.log("All migrations already applied, nothing to do.");
    } else {
      console.log(`\nApplied ${ran} migration(s).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
