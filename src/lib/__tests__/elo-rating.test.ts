import { describe, it, expect } from "vitest";

// Inline the Elo function to test (same logic as in the API route)
function calcEloChange(playerRating: number, puzzleRating: number, solved: boolean, attempts: number): number {
  const K = solved && attempts === 1 ? 32 : 16;
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
  const score = solved ? 1 : 0;
  return Math.round(K * (score - expected));
}

describe("calcEloChange (Elo puzzle rating)", () => {
  it("gives positive rating for solving equal-rated puzzle", () => {
    const change = calcEloChange(1200, 1200, true, 1);
    expect(change).toBeGreaterThan(0);
    expect(change).toBe(16); // K=32, expected=0.5, score=1 → 32*(1-0.5)=16
  });

  it("gives negative rating for failing equal-rated puzzle", () => {
    const change = calcEloChange(1200, 1200, false, 1);
    expect(change).toBeLessThan(0);
    expect(change).toBe(-8); // K=16 (failed), expected=0.5 → 16*(0-0.5)=-8
  });

  it("gives more points for solving harder puzzles", () => {
    const easyWin = calcEloChange(1200, 1000, true, 1);
    const hardWin = calcEloChange(1200, 1400, true, 1);
    expect(hardWin).toBeGreaterThan(easyWin);
  });

  it("loses fewer points for failing harder puzzles", () => {
    const easyFail = calcEloChange(1200, 1000, false, 1);
    const hardFail = calcEloChange(1200, 1400, false, 1);
    expect(Math.abs(hardFail)).toBeLessThan(Math.abs(easyFail));
  });

  it("uses K=16 for multi-attempt solves", () => {
    const firstTry = calcEloChange(1200, 1200, true, 1);
    const multiTry = calcEloChange(1200, 1200, true, 3);
    expect(firstTry).toBe(16); // K=32
    expect(multiTry).toBe(8);  // K=16
  });

  it("handles extreme rating differences", () => {
    const result = calcEloChange(800, 2000, true, 1);
    expect(result).toBeGreaterThan(25); // Almost maximum K
  });

  it("rating change is bounded by K factor", () => {
    const maxGain = calcEloChange(400, 2800, true, 1);
    expect(maxGain).toBeLessThanOrEqual(32);
    const maxLoss = calcEloChange(2800, 400, false, 1);
    expect(Math.abs(maxLoss)).toBeLessThanOrEqual(16);
  });
});
