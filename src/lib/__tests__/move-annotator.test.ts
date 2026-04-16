import { describe, it, expect } from "vitest";
import { annotateMove } from "../move-annotator";
import type { AnalyzedMove } from "@/lib/backend-api";

function makeMove(overrides: Partial<AnalyzedMove> = {}): AnalyzedMove {
  return {
    moveNumber: 10,
    move: "e2e4",
    san: "e4",
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    isBlunder: false,
    isMistake: false,
    isInaccuracy: false,
    engineEval: 30,
    mate: null,
    accuracy: 95,
    bestMove: "e2e4",
    bestMoveSan: "e4",
    tacticalThemes: [],
    classification: "best",
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    evalBefore: 20,
    evalDrop: 0,
    color: "white",
    ...overrides,
  };
}

describe("annotateMove", () => {
  describe("positive classifications", () => {
    it("returns annotation for brilliant moves", () => {
      const result = annotateMove(makeMove({ classification: "brilliant" }));
      expect(result).toContain("brilliant");
    });

    it("mentions SAN when brilliant matches best move", () => {
      const result = annotateMove(
        makeMove({ classification: "brilliant", san: "Nxf7", bestMoveSan: "Nxf7" })
      );
      expect(result).toContain("Nxf7");
    });

    it("returns annotation for great moves", () => {
      const result = annotateMove(makeMove({ classification: "great" }));
      expect(result).toContain("excellent");
    });

    it("returns annotation for best moves", () => {
      const result = annotateMove(makeMove({ classification: "best" }));
      expect(result).toContain("engine's top choice");
    });

    it("returns annotation for excellent moves", () => {
      const result = annotateMove(makeMove({ classification: "excellent" }));
      expect(result).toContain("strong move");
    });

    it("returns annotation for forced moves", () => {
      const result = annotateMove(makeMove({ classification: "forced" }));
      expect(result).toContain("only reasonable move");
    });

    it("returns null for good moves", () => {
      expect(annotateMove(makeMove({ classification: "good" }))).toBeNull();
    });

    it("returns null for book moves", () => {
      expect(annotateMove(makeMove({ classification: "book" }))).toBeNull();
    });
  });

  describe("negative classifications", () => {
    it("returns annotation for blunders with eval drop", () => {
      const result = annotateMove(
        makeMove({
          classification: "blunder",
          isBlunder: true,
          evalDrop: -350,
          bestMoveSan: "Nf3",
        })
      );
      expect(result).toBeTruthy();
      expect(result).toContain("Nf3");
    });

    it("includes severity prefix for large eval drops", () => {
      const result = annotateMove(
        makeMove({
          classification: "blunder",
          isBlunder: true,
          evalDrop: -550,
        })
      );
      expect(result).toContain("serious blunder");
    });

    it("returns annotation for mistakes", () => {
      const result = annotateMove(
        makeMove({
          classification: "mistake",
          isMistake: true,
          evalDrop: -200,
        })
      );
      expect(result).toBeTruthy();
    });

    it("returns annotation for inaccuracies", () => {
      const result = annotateMove(
        makeMove({
          classification: "inaccuracy",
          isInaccuracy: true,
          evalDrop: -80,
        })
      );
      expect(result).toContain("inaccurate");
    });

    it("returns annotation for missed opportunities", () => {
      const result = annotateMove(
        makeMove({
          classification: "miss",
          evalDrop: -150,
        })
      );
      expect(result).toContain("Missed opportunity");
    });
  });

  it("returns null for unknown classification", () => {
    expect(annotateMove(makeMove({ classification: "unknown" as any }))).toBeNull();
  });
});
