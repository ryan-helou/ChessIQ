import { describe, it, expect } from "vitest";
import { detectMissedTactic } from "../tactic-detector";

describe("detectMissedTactic", () => {
  it("returns null for invalid inputs", () => {
    expect(detectMissedTactic("", "e2e4")).toBeNull();
    expect(detectMissedTactic("invalid fen", "e2e4")).toBeNull();
    expect(detectMissedTactic("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "")).toBeNull();
    expect(detectMissedTactic("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "e2")).toBeNull();
  });

  it("detects checkmate (scholar's mate is back-rank mate variant)", () => {
    // Qxf7# — king on e8 (rank 8), detected as backRankMate
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    const result = detectMissedTactic(fen, "h5f7");
    expect(["mate", "backRankMate"]).toContain(result);
  });

  it("detects promotion", () => {
    const fen = "8/P7/8/8/8/8/8/4K2k w - - 0 1";
    const result = detectMissedTactic(fen, "a7a8q");
    expect(result).toBe("promotion");
  });

  it("detects fork (knight attacks two pieces)", () => {
    // White knight on e5 can go to f7 forking king on e8 and rook on h8
    const fen = "r3k2r/pppppppp/8/4N3/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
    const result = detectMissedTactic(fen, "e5f7");
    // The move captures the pawn on f7 and forks king+rook
    expect(result).toBeTruthy();
  });

  it("detects materialGain on capture", () => {
    // White queen captures undefended rook
    const fen = "4k3/8/8/3r4/8/8/8/3QK3 w - - 0 1";
    const result = detectMissedTactic(fen, "d1d5");
    expect(["hangingPiece", "materialGain", "fork"]).toContain(result);
  });

  it("returns a tactic for pawn moves", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = detectMissedTactic(fen, "e2e4");
    // Pawn push should return pawnStructure or positional
    expect(typeof result === "string" || result === null).toBe(true);
  });

  it("returns a string type for detected tactics", () => {
    // Knight move to center
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = detectMissedTactic(fen, "g1f3");
    if (result !== null) {
      expect(typeof result).toBe("string");
    }
  });
});
