import { describe, it, expect } from "vitest";
import { parseGame, getOpeningStats } from "../game-analysis";
import type { ChessComGame } from "../chess-com-api";

function makeGame(overrides: Partial<ChessComGame> = {}): ChessComGame {
  return {
    url: "https://www.chess.com/game/live/12345",
    pgn: `[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2024.01.15"]\n[White "player1"]\n[Black "player2"]\n[Result "1-0"]\n[ECO "B01"]\n[ECOUrl "https://www.chess.com/openings/Scandinavian-Defense"]\n[WhiteElo "1200"]\n[BlackElo "1150"]\n[TimeControl "600"]\n[Termination "player1 won by checkmate"]\n\n1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 1-0`,
    time_control: "600",
    end_time: 1705353600,
    rated: true,
    time_class: "rapid",
    rules: "chess",
    white: {
      rating: 1200,
      result: "win",
      username: "player1",
      uuid: "w-uuid",
    },
    black: {
      rating: 1150,
      result: "checkmated",
      username: "player2",
      uuid: "b-uuid",
    },
    uuid: "game-uuid-1",
    eco: "https://www.chess.com/openings/Scandinavian-Defense",
    ...overrides,
  } as ChessComGame;
}

describe("parseGame", () => {
  it("correctly identifies player color as white", () => {
    const result = parseGame(makeGame(), "player1");
    expect(result.playerColor).toBe("white");
    expect(result.playerRating).toBe(1200);
    expect(result.opponentName).toBe("player2");
  });

  it("correctly identifies player color as black", () => {
    const result = parseGame(makeGame(), "player2");
    expect(result.playerColor).toBe("black");
    expect(result.playerRating).toBe(1150);
    expect(result.opponentName).toBe("player1");
  });

  it("maps win result correctly", () => {
    const result = parseGame(makeGame(), "player1");
    expect(result.result).toBe("win");
  });

  it("maps loss result correctly", () => {
    const result = parseGame(makeGame(), "player2");
    expect(result.result).toBe("loss");
  });

  it("extracts opening from PGN", () => {
    const result = parseGame(makeGame(), "player1");
    expect(result.eco).toBe("B01");
    expect(result.opening).toContain("Scandinavian");
  });

  it("extracts moves from PGN", () => {
    const result = parseGame(makeGame(), "player1");
    expect(result.moves.length).toBeGreaterThan(0);
    expect(result.moves[0]).toBe("e4");
  });

  it("computes move count as half-moves divided by 2", () => {
    const result = parseGame(makeGame(), "player1");
    expect(result.moveCount).toBe(Math.ceil(result.moves.length / 2));
  });

  it("handles case-insensitive username", () => {
    const result = parseGame(makeGame(), "PLAYER1");
    expect(result.playerColor).toBe("white");
  });

  it("handles draw results", () => {
    const game = makeGame({
      white: { rating: 1200, result: "stalemate", username: "player1", uuid: "w" } as any,
      black: { rating: 1150, result: "stalemate", username: "player2", uuid: "b" } as any,
    });
    const result = parseGame(game, "player1");
    expect(result.result).toBe("draw");
  });
});

describe("getOpeningStats", () => {
  it("groups games by opening and computes stats", () => {
    const games = [
      parseGame(makeGame(), "player1"),
      parseGame(makeGame({ uuid: "game-2" }), "player1"),
    ];
    const stats = getOpeningStats(games);
    expect(stats.length).toBe(1);
    expect(stats[0].games).toBe(2);
    expect(stats[0].wins).toBe(2);
    expect(stats[0].winRate).toBe(100);
  });

  it("returns empty array for empty input", () => {
    expect(getOpeningStats([])).toEqual([]);
  });
});
