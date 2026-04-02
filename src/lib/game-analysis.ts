import { Chess } from "chess.js";
import type { ChessComGame } from "./chess-com-api";

export interface ParsedGame {
  id: string;
  url: string;
  date: Date;
  timeClass: string;
  timeControl: string;
  playerColor: "white" | "black";
  playerRating: number;
  opponentName: string;
  opponentRating: number;
  result: "win" | "loss" | "draw";
  resultDetail: string;
  opening: string;
  openingUrl: string;
  eco: string;
  moves: string[];
  moveCount: number;
  accuracy: number | null;
  opponentAccuracy: number | null;
  pgn: string;
}

export interface OpeningStats {
  name: string;
  eco: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgAccuracy: number | null;
  avgOpponentRating: number;
}

export interface TimeControlStats {
  timeClass: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgAccuracy: number | null;
  currentRating: number;
  bestRating: number;
}

export interface RatingDataPoint {
  date: string;
  rating: number;
  timeClass: string;
}

export interface ResultBreakdown {
  type: string;
  count: number;
}

const RESULT_MAP: Record<string, "win" | "loss" | "draw"> = {
  win: "win",
  checkmated: "loss",
  resigned: "loss",
  timeout: "loss",
  abandoned: "loss",
  lose: "loss",
  insufficient: "draw",
  stalemate: "draw",
  "50move": "draw",
  repetition: "draw",
  agreed: "draw",
  timevsinsufficient: "draw",
};

const RESULT_DETAIL_LABELS: Record<string, string> = {
  win: "Checkmate",
  checkmated: "Checkmated",
  resigned: "Resigned",
  timeout: "Timeout",
  abandoned: "Abandoned",
  insufficient: "Insufficient Material",
  stalemate: "Stalemate",
  "50move": "50-Move Rule",
  repetition: "Repetition",
  agreed: "Draw Agreed",
  timevsinsufficient: "Timeout vs Insufficient",
};

function extractOpeningFromPGN(pgn: string): { name: string; eco: string } {
  const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/);
  const ecoUrlMatch = pgn.match(/\[ECOUrl\s+"([^"]+)"\]/);

  let name = "Unknown Opening";
  const eco = ecoMatch?.[1] ?? "?";

  if (ecoUrlMatch) {
    const urlParts = ecoUrlMatch[1].split("/openings/");
    if (urlParts[1]) {
      name = urlParts[1]
        .split("?")[0]
        .replace(/-/g, " ")
        .replace(/\.\.\./g, "")
        .trim();
    }
  }

  return { name, eco };
}

function extractMoves(pgn: string): string[] {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history();
  } catch {
    return [];
  }
}

export function parseGame(
  game: ChessComGame,
  username: string
): ParsedGame {
  const isWhite =
    game.white.username.toLowerCase() === username.toLowerCase();
  const player = isWhite ? game.white : game.black;
  const opponent = isWhite ? game.black : game.white;

  const playerResult = RESULT_MAP[player.result] ?? "loss";

  const { name: opening, eco } = extractOpeningFromPGN(game.pgn);
  const moves = extractMoves(game.pgn);

  return {
    id: game.uuid,
    url: game.url,
    date: new Date(game.end_time * 1000),
    timeClass: game.time_class,
    timeControl: game.time_control,
    playerColor: isWhite ? "white" : "black",
    playerRating: player.rating,
    opponentName: opponent.username,
    opponentRating: opponent.rating,
    result: playerResult,
    resultDetail: RESULT_DETAIL_LABELS[player.result] ?? player.result,
    opening,
    openingUrl: game.eco ?? "",
    eco,
    moves,
    moveCount: Math.ceil(moves.length / 2),
    accuracy: game.accuracies
      ? isWhite
        ? game.accuracies.white
        : game.accuracies.black
      : null,
    opponentAccuracy: game.accuracies
      ? isWhite
        ? game.accuracies.black
        : game.accuracies.white
      : null,
    pgn: game.pgn,
  };
}

export function parseAllGames(
  games: ChessComGame[],
  username: string
): ParsedGame[] {
  return games
    .map((g) => parseGame(g, username))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getOpeningStats(games: ParsedGame[]): OpeningStats[] {
  const map = new Map<string, ParsedGame[]>();

  for (const g of games) {
    const key = g.opening;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(g);
  }

  return Array.from(map.entries())
    .map(([name, openingGames]) => {
      const wins = openingGames.filter((g) => g.result === "win").length;
      const losses = openingGames.filter((g) => g.result === "loss").length;
      const draws = openingGames.filter((g) => g.result === "draw").length;
      const accuracies = openingGames
        .map((g) => g.accuracy)
        .filter((a): a is number => a !== null);

      return {
        name,
        eco: openingGames[0].eco,
        games: openingGames.length,
        wins,
        losses,
        draws,
        winRate: (wins / openingGames.length) * 100,
        avgAccuracy:
          accuracies.length > 0
            ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
            : null,
        avgOpponentRating:
          openingGames.reduce((sum, g) => sum + g.opponentRating, 0) /
          openingGames.length,
      };
    })
    .sort((a, b) => b.games - a.games);
}

export function getRatingHistory(games: ParsedGame[]): RatingDataPoint[] {
  return games.map((g) => ({
    date: g.date.toISOString().split("T")[0],
    rating: g.playerRating,
    timeClass: g.timeClass,
  }));
}

export function getResultBreakdown(
  games: ParsedGame[],
  side: "player" | "opponent" = "player"
): ResultBreakdown[] {
  const map = new Map<string, number>();

  for (const g of games) {
    const detail = g.resultDetail;
    map.set(detail, (map.get(detail) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export function getTimeControlStats(
  games: ParsedGame[]
): TimeControlStats[] {
  const map = new Map<string, ParsedGame[]>();

  for (const g of games) {
    if (!map.has(g.timeClass)) map.set(g.timeClass, []);
    map.get(g.timeClass)!.push(g);
  }

  return Array.from(map.entries()).map(([timeClass, tcGames]) => {
    const wins = tcGames.filter((g) => g.result === "win").length;
    const losses = tcGames.filter((g) => g.result === "loss").length;
    const draws = tcGames.filter((g) => g.result === "draw").length;
    const accuracies = tcGames
      .map((g) => g.accuracy)
      .filter((a): a is number => a !== null);
    const ratings = tcGames.map((g) => g.playerRating);

    return {
      timeClass,
      games: tcGames.length,
      wins,
      losses,
      draws,
      winRate: (wins / tcGames.length) * 100,
      avgAccuracy:
        accuracies.length > 0
          ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
          : null,
      currentRating: ratings[ratings.length - 1] ?? 0,
      bestRating: Math.max(...ratings),
    };
  });
}

export function getStreaks(games: ParsedGame[]): {
  currentStreak: { type: "win" | "loss" | "draw"; count: number };
  bestWinStreak: number;
  worstLossStreak: number;
} {
  let bestWin = 0;
  let worstLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const g of games) {
    if (g.result === "win") {
      currentWin++;
      currentLoss = 0;
      bestWin = Math.max(bestWin, currentWin);
    } else if (g.result === "loss") {
      currentLoss++;
      currentWin = 0;
      worstLoss = Math.max(worstLoss, currentLoss);
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
  }

  const lastGame = games[games.length - 1];
  let streakType: "win" | "loss" | "draw" = "draw";
  let streakCount = 0;

  if (lastGame) {
    streakType = lastGame.result;
    for (let i = games.length - 1; i >= 0; i--) {
      if (games[i].result === streakType) streakCount++;
      else break;
    }
  }

  return {
    currentStreak: { type: streakType, count: streakCount },
    bestWinStreak: bestWin,
    worstLossStreak: worstLoss,
  };
}

export function getAccuracyByPhase(games: ParsedGame[]): {
  opening: number | null;
  overall: number | null;
} {
  const accuracies = games
    .map((g) => g.accuracy)
    .filter((a): a is number => a !== null);

  return {
    opening: null, // Would need deeper analysis
    overall:
      accuracies.length > 0
        ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
        : null,
  };
}
