"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import type { TrainerPuzzle } from "@/lib/puzzle-api";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-[#3a3835]/40 rounded-lg animate-pulse" />
    ),
  }
);

type PuzzlePhase =
  | "loading"
  | "opponentSetup"
  | "playerTurn"
  | "correct"       // just made correct move, waiting for opponent
  | "wrong"         // just made wrong move
  | "solved"
  | "failed"
  | "showSolution"; // playing through solution

interface Props {
  puzzle: TrainerPuzzle;
  sessionSolved: number;
  sessionTotal: number;
  streak: number;
  puzzleIndex: number;
  totalPuzzles: number;
  onSolved: (attempts: number, timeSeconds: number) => void;
  onFailed: (attempts: number, timeSeconds: number) => void;
  onNext: () => void;
  onSkip: () => void;
}

export default function PuzzleBoard({
  puzzle,
  sessionSolved,
  sessionTotal,
  streak,
  puzzleIndex,
  totalPuzzles,
  onSolved,
  onFailed,
  onNext,
  onSkip,
}: Props) {
  const [game, setGame] = useState<Chess>(new Chess());
  const [phase, setPhase] = useState<PuzzlePhase>("loading");
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<string | null>(null);
  const [correctSquare, setCorrectSquare] = useState<string | null>(null);
  const startTimeRef = useRef(Date.now());
  const solutionIndexRef = useRef(0);
  const gameRef = useRef(game);

  gameRef.current = game;

  const orientation: "white" | "black" = (() => {
    try {
      const c = new Chess(puzzle.fen);
      if (puzzle.opponentMoves.length > 0) {
        return c.turn() === "w" ? "black" : "white";
      }
      return c.turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  })();

  const playerColor = orientation === "white" ? "w" : "b";

  // ─── Initialise puzzle ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const chess = new Chess(puzzle.fen);
    setGame(new Chess(puzzle.fen)); // immutable snapshot
    setSolutionIndex(0);
    solutionIndexRef.current = 0;
    setAttempts(0);
    setSelectedSquare(null);
    setLegalMoveSquares([]);
    setLastMove(null);
    setWrongSquare(null);
    setCorrectSquare(null);
    startTimeRef.current = Date.now();

    if (puzzle.opponentMoves.length > 0) {
      setPhase("opponentSetup");
      const t = setTimeout(() => {
        if (!cancelled) playOpponentMove(chess, 0, () => setPhase("playerTurn"));
      }, 500);
      return () => { cancelled = true; clearTimeout(t); };
    } else {
      setPhase("playerTurn");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);

  // ─── Helpers ────────────────────────────────────────────────
  const elapsed = () => Math.round((Date.now() - startTimeRef.current) / 1000);

  const applyUci = (chess: Chess, uci: string) => {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci[4] as "q" | "r" | "b" | "n") ?? "q" });
  };

  const playOpponentMove = (chess: Chess, oppIdx: number, onDone: () => void) => {
    const uci = puzzle.opponentMoves[oppIdx];
    if (!uci || uci.length < 4) { onDone(); return; }
    try {
      applyUci(chess, uci);
      const snap = new Chess(chess.fen());
      setGame(snap);
      setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      onDone();
    } catch {
      onDone();
    }
  };

  // ─── Move making ────────────────────────────────────────────
  const attemptMove = useCallback(
    (from: string, to: string) => {
      if (phase !== "playerTurn") return false;

      const expectedUci = puzzle.solutionMoves[solutionIndexRef.current];
      if (!expectedUci) return false;

      // Validate it's a legal move at all
      const gameCopy = new Chess(gameRef.current.fen());
      try {
        gameCopy.move({ from, to, promotion: "q" });
      } catch {
        return false;
      }

      setSelectedSquare(null);
      setLegalMoveSquares([]);

      const isCorrect = from === expectedUci.slice(0, 2) && to === expectedUci.slice(2, 4);

      if (isCorrect) {
        setGame(new Chess(gameCopy.fen()));
        setLastMove({ from, to });
        setCorrectSquare(to);
        setWrongSquare(null);

        const nextSolIdx = solutionIndexRef.current + 1;
        setSolutionIndex(nextSolIdx);
        solutionIndexRef.current = nextSolIdx;

        if (nextSolIdx >= puzzle.solutionMoves.length) {
          setPhase("solved");
          onSolved(attempts + 1, elapsed());
        } else {
          setPhase("correct");
          setTimeout(() => {
            setCorrectSquare(null);
            const oppIdx = nextSolIdx; // opponent moves align with solution index
            playOpponentMove(gameCopy, oppIdx, () => setPhase("playerTurn"));
          }, 600);
        }
        return true;
      } else {
        // Wrong move — don't apply it
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setWrongSquare(to);
        setCorrectSquare(null);
        setPhase("wrong");
        setTimeout(() => {
          setWrongSquare(null);
          setPhase("playerTurn");
        }, 700);

        if (newAttempts >= 3) {
          // Auto-fail after 3 wrong attempts
          setTimeout(() => {
            setPhase("failed");
            onFailed(newAttempts, elapsed());
          }, 750);
        }
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, puzzle, attempts, onSolved, onFailed]
  );

  // ─── Square click ────────────────────────────────────────────
  const handleSquareClick = useCallback(
    ({ square }: { piece: unknown; square: string }) => {
      if (phase !== "playerTurn") return;

      const piece = gameRef.current.get(square as Parameters<typeof gameRef.current.get>[0]);

      if (selectedSquare) {
        // Already have a piece selected
        if (legalMoveSquares.includes(square)) {
          attemptMove(selectedSquare, square);
          return;
        }
        if (piece && piece.color === playerColor) {
          // Re-select another own piece
          const moves = gameRef.current.moves({ square: square as Parameters<typeof gameRef.current.moves>[0]["square"], verbose: true });
          setSelectedSquare(square);
          setLegalMoveSquares(moves.map((m) => m.to));
          return;
        }
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        return;
      }

      if (piece && piece.color === playerColor) {
        const moves = gameRef.current.moves({ square: square as Parameters<typeof gameRef.current.moves>[0]["square"], verbose: true });
        setSelectedSquare(square);
        setLegalMoveSquares(moves.map((m) => m.to));
      }
    },
    [phase, selectedSquare, legalMoveSquares, playerColor, attemptMove]
  );

  // ─── Drag drop ───────────────────────────────────────────────
  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece: { pieceType: string; position: string; isSparePiece: boolean }; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!targetSquare) return false;
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return attemptMove(sourceSquare, targetSquare);
    },
    [attemptMove]
  );

  // ─── Hint ────────────────────────────────────────────────────
  const handleHint = useCallback(() => {
    if (phase !== "playerTurn") return;
    const expected = puzzle.solutionMoves[solutionIndexRef.current];
    if (!expected) return;
    const from = expected.slice(0, 2);
    const moves = gameRef.current.moves({ square: from as Parameters<typeof gameRef.current.moves>[0]["square"], verbose: true });
    setSelectedSquare(from);
    setLegalMoveSquares(moves.map((m) => m.to));
  }, [phase, puzzle]);

  // ─── View solution ───────────────────────────────────────────
  const handleViewSolution = useCallback(() => {
    setPhase("showSolution");
    setSelectedSquare(null);
    setLegalMoveSquares([]);
    setWrongSquare(null);
    setCorrectSquare(null);

    // Build a flat, ordered list of all remaining moves to play
    // (player move, then opponent response, then player move, ...)
    const movesToPlay: string[] = [];
    const startIdx = solutionIndexRef.current;
    for (let i = startIdx; i < puzzle.solutionMoves.length; i++) {
      movesToPlay.push(puzzle.solutionMoves[i]);
      const oppMove = puzzle.opponentMoves[i + 1];
      if (oppMove && i < puzzle.solutionMoves.length - 1) {
        movesToPlay.push(oppMove);
      }
    }

    if (movesToPlay.length === 0) return;

    // Snapshot current board position
    const chess = new Chess(gameRef.current.fen());

    const playNext = (idx: number) => {
      if (idx >= movesToPlay.length) return;
      setTimeout(() => {
        const uci = movesToPlay[idx];
        try {
          chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: (uci[4] as "q" | "r" | "b" | "n") ?? "q",
          });
          setGame(new Chess(chess.fen()));
          setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
        } catch (e) {
          console.error("[solution] failed to apply move", uci, chess.fen(), e);
        }
        playNext(idx + 1);
      }, 700);
    };

    playNext(0);
  }, [puzzle]);

  // ─── Square styles ───────────────────────────────────────────
  const squareStyles: Record<string, React.CSSProperties> = {};

  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: "rgba(255, 255, 50, 0.28)" };
    squareStyles[lastMove.to] = { backgroundColor: "rgba(255, 255, 50, 0.28)" };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: "rgba(255, 255, 50, 0.5)" };
  }
  for (const sq of legalMoveSquares) {
    const isCapture = !!gameRef.current.get(sq as Parameters<typeof gameRef.current.get>[0]);
    squareStyles[sq] = isCapture
      ? { background: "radial-gradient(circle, rgba(0,0,0,0) 58%, rgba(0,0,0,0.22) 60%)", borderRadius: "50%" }
      : { background: "radial-gradient(circle, rgba(0,0,0,0.22) 30%, transparent 30%)" };
  }
  if (wrongSquare) {
    squareStyles[wrongSquare] = { backgroundColor: "rgba(202, 52, 49, 0.55)" };
  }
  if (correctSquare) {
    squareStyles[correctSquare] = { backgroundColor: "rgba(150, 188, 75, 0.55)" };
  }

  // ─── Status message ──────────────────────────────────────────
  const colorName = orientation === "white" ? "White" : "Black";
  const statusMsg = (() => {
    if (phase === "loading" || phase === "opponentSetup") return { text: "Setting up position…", color: "text-[#989795]" };
    if (phase === "playerTurn") return { text: `Find the best move for ${colorName}`, color: "text-[#e8e6e1]" };
    if (phase === "correct") return { text: "Best move!", color: "text-[#96bc4b]" };
    if (phase === "wrong") return { text: attempts >= 3 ? "Puzzle failed" : "That's not it — try again", color: "text-[#ca3431]" };
    if (phase === "solved") return { text: "Puzzle complete!", color: "text-[#96bc4b]" };
    if (phase === "failed") return { text: "Puzzle failed", color: "text-[#ca3431]" };
    if (phase === "showSolution") return { text: "Showing solution…", color: "text-[#e8e6e1]" };
    return { text: "", color: "" };
  })();

  const mainTheme = puzzle.themes[0] ?? null;
  const themeLabel = mainTheme ? (THEME_LABELS[mainTheme] ?? mainTheme) : null;
  const themeColor = mainTheme ? (THEME_COLORS[mainTheme] ?? "#989795") : "#989795";

  const isDone = phase === "solved" || phase === "failed" || phase === "showSolution";

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Board column */}
      <div className="flex flex-col gap-0" style={{ width: "min(520px, calc(100vw - 32px))" }}>
        {/* Top bar: puzzle count + theme */}
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-xs text-[#706e6b] font-medium uppercase tracking-wide">
            Puzzle {puzzleIndex + 1} of {totalPuzzles}
          </span>
          {themeLabel && (
            <span
              className="text-xs font-bold text-white px-2 py-0.5 rounded-full"
              style={{ backgroundColor: themeColor }}
            >
              {themeLabel}
            </span>
          )}
        </div>

        {/* Board */}
        <div className="aspect-square w-full">
          <Chessboard
            options={{
              position: game.fen(),
              squareStyles,
              darkSquareStyle: { backgroundColor: "#779952" },
              lightSquareStyle: { backgroundColor: "#edeed1" },
              boardOrientation: orientation,
              allowDragging: phase === "playerTurn",
              animationDurationInMs: 180,
              onPieceDrop: handlePieceDrop,
              onSquareClick: handleSquareClick,
            }}
          />
        </div>

        {/* Status bar */}
        <div
          className={`flex items-center justify-between mt-2 px-0.5 min-h-[28px] transition-all ${
            phase === "solved" ? "bg-[#96bc4b]/10 rounded px-3 py-1.5" :
            phase === "failed" ? "bg-[#ca3431]/10 rounded px-3 py-1.5" : ""
          }`}
        >
          <span className={`text-sm font-semibold ${statusMsg.color}`}>
            {statusMsg.text}
          </span>
          <div className="flex items-center gap-2">
            {phase === "playerTurn" && (
              <button
                onClick={handleHint}
                className="text-xs text-[#706e6b] hover:text-[#989795] underline underline-offset-2 transition-colors"
              >
                Hint
              </button>
            )}
            {(phase === "playerTurn" || phase === "wrong") && (
              <button
                onClick={onSkip}
                className="text-xs text-[#706e6b] hover:text-[#989795] underline underline-offset-2 transition-colors"
              >
                Skip
              </button>
            )}
            {(phase === "failed") && (
              <button
                onClick={handleViewSolution}
                className="text-xs font-semibold text-white bg-[#4a4845] hover:bg-[#5a5855] px-3 py-1 rounded transition-colors"
              >
                View Solution
              </button>
            )}
            {isDone && (
              <button
                onClick={onNext}
                className="px-4 py-1.5 bg-[#81b64c] hover:bg-[#96bc4b] text-white text-sm font-bold rounded transition-colors"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="flex flex-col gap-3 lg:w-[220px] w-full">
        {/* Progress indicator */}
        <div className="bg-[#262522] rounded-xl p-4">
          <div className="text-xs text-[#706e6b] uppercase tracking-wider font-bold mb-3">Session</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#989795]">Solved</span>
              <span className="font-bold text-white">{sessionSolved} / {sessionTotal}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#989795]">Streak</span>
              <span className={`font-bold ${streak > 0 ? "text-[#96bc4b]" : "text-white"}`}>{streak}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#989795]">Accuracy</span>
              <span className="font-bold text-white">
                {sessionTotal > 0 ? `${Math.round((sessionSolved / sessionTotal) * 100)}%` : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* Puzzle info */}
        <div className="bg-[#262522] rounded-xl p-4">
          <div className="text-xs text-[#706e6b] uppercase tracking-wider font-bold mb-3">Puzzle</div>
          {puzzle.rating && (
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[#989795]">Rating</span>
              <span className="font-bold text-white">{puzzle.rating}</span>
            </div>
          )}
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[#989795]">Source</span>
            <span className="text-[#e8e6e1] text-xs">{puzzle.sourceLabel}</span>
          </div>
          {puzzle.themes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {puzzle.themes.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: THEME_COLORS[t] ?? "#4a4845" }}
                >
                  {THEME_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Attempts indicator */}
        {attempts > 0 && phase !== "solved" && (
          <div className="bg-[#262522] rounded-xl p-4">
            <div className="text-xs text-[#706e6b] uppercase tracking-wider font-bold mb-2">Attempts</div>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${i < attempts ? "bg-[#ca3431]" : "bg-[#3a3835]"}`}
                />
              ))}
            </div>
            {attempts >= 3 && (
              <p className="text-xs text-[#706e6b] mt-2">3 wrong — puzzle failed</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
