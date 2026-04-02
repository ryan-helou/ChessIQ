const BASE_URL = "https://api.chess.com/pub";

export interface ChessComProfile {
  username: string;
  name?: string;
  avatar?: string;
  country?: string;
  location?: string;
  joined: number;
  last_online: number;
  followers: number;
  status: string;
  league?: string;
}

export interface ChessComStats {
  chess_rapid?: RatingCategory;
  chess_blitz?: RatingCategory;
  chess_bullet?: RatingCategory;
  chess_daily?: RatingCategory;
}

export interface RatingCategory {
  last: { rating: number; date: number; rd: number };
  best: { rating: number; date: number; game: string };
  record: { win: number; loss: number; draw: number };
}

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  accuracies?: { white: number; black: number };
  uuid: string;
  fen: string;
  time_class: "rapid" | "blitz" | "bullet" | "daily";
  rules: string;
  white: GamePlayer;
  black: GamePlayer;
  eco?: string;
  initial_setup: string;
}

export interface GamePlayer {
  rating: number;
  result: string;
  username: string;
  uuid: string;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Chessify/1.0" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Chess.com API error: ${res.status}`);
  return res.json();
}

export async function getProfile(username: string): Promise<ChessComProfile> {
  return fetchJSON(`${BASE_URL}/player/${username}`);
}

export async function getStats(username: string): Promise<ChessComStats> {
  return fetchJSON(`${BASE_URL}/player/${username}/stats`);
}

export async function getArchives(username: string): Promise<string[]> {
  const data = await fetchJSON<{ archives: string[] }>(
    `${BASE_URL}/player/${username}/games/archives`
  );
  return data.archives;
}

export async function getGamesForMonth(archiveUrl: string): Promise<ChessComGame[]> {
  const data = await fetchJSON<{ games: ChessComGame[] }>(archiveUrl);
  return data.games.filter((g) => g.rules === "chess");
}

export async function getAllGames(
  username: string,
  monthsBack: number = 6
): Promise<ChessComGame[]> {
  const archives = await getArchives(username);
  const recentArchives = archives.slice(-monthsBack);

  const results = await Promise.all(
    recentArchives.map((url) => getGamesForMonth(url))
  );

  return results.flat().sort((a, b) => a.end_time - b.end_time);
}
