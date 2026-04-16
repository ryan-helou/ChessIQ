import { query } from "@/lib/db";

export async function fetchLossGames(username: string) {
  const result = await query(
    `SELECT
       g.id         AS game_id,
       g.eco,
       g.opening,
       g.played_at,
       g.time_class,
       g.white_username,
       g.black_username,
       ARRAY_AGG(b.move_number    ORDER BY b.move_number) FILTER (WHERE b.move_number IS NOT NULL) AS blunder_moves,
       ARRAY_AGG(b.severity       ORDER BY b.move_number) FILTER (WHERE b.move_number IS NOT NULL) AS blunder_severities,
       ARRAY_AGG(b.missed_tactic  ORDER BY b.move_number) FILTER (WHERE b.move_number IS NOT NULL) AS missed_tactics
     FROM games g
     LEFT JOIN blunders b ON b.game_id = g.id
     WHERE (
       (g.white_username = $1 AND g.result = '0-1')
       OR
       (g.black_username = $1 AND g.result = '1-0')
     )
     GROUP BY g.id
     ORDER BY g.played_at DESC
     LIMIT 200`,
    [username]
  );
  return result.rows;
}
