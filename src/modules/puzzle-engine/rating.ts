import { query } from "@/lib/db";

export function calcEloChange(playerRating: number, puzzleRating: number, solved: boolean, attempts: number): number {
  const K = solved && attempts === 1 ? 32 : 16;
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
  const score = solved ? 1 : 0;
  return Math.round(K * (score - expected));
}

export async function getUserRating(username: string): Promise<number> {
  const result = await query(
    `SELECT rating FROM user_puzzle_ratings WHERE username = $1`,
    [username]
  );
  return result.rows[0]?.rating ?? 1200;
}

export async function updateUserRating(username: string, newRating: number): Promise<void> {
  await query(`
    INSERT INTO user_puzzle_ratings (username, rating, games_played)
    VALUES ($1, $2, 1)
    ON CONFLICT (username) DO UPDATE SET
      rating = $2,
      games_played = user_puzzle_ratings.games_played + 1,
      updated_at = NOW()
  `, [username, newRating]);
}

export async function recordRatingHistory(username: string, rating: number): Promise<void> {
  await query(
    `INSERT INTO puzzle_rating_history (username, rating) VALUES ($1, $2)`,
    [username, rating]
  ).catch((err) => console.warn("[puzzle-engine] rating history insert failed:", err.message));
}
