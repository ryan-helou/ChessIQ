"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
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
  | "opponentSetup"
  | "playerTurn"
  | "correct"
  | "wrong"
  | "solved"
  | "failed"
  | "showSolution";

interface LineEntry { fen: string; from: string; to: string }

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

function uciMove(chess: Chess, uci: string) {
  return chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: (uci[4] as "q" | "r" | "b" | "n") ?? "q",
  });
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
  const [fen, setFen] = useState(puzzle.fen);
  const [phase, setPhase] = useState<PuzzlePhase>("opponentSetup");
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [wrongSquare, setWrongSquare] = useState<string | null>(null);
  const [correctSquare, setCorrectSquare] = useState<string | null>(null);

  const startTimeRef = useRef(Date.now());
  const solIdxRef = useRef(0);
  const attemptsRef = useRef(0);

  // ─── Pre-compute full solution line at load time ──────────────
  // solutionLine[0] = puzzle start (after setup move if any)
  // solutionLine[1] = after player move 0
  // solutionLine[2] = after opponent response 0
  // solutionLine[3] = after player move 1, etc.
  const solutionLine = useMemo<LineEntry[]>(() => {
    const chess = new Chess(puzzle.fen);
    const line: LineEntry[] = [];

    // Apply setup move (opponentMoves[0])
    if (puzzle.opponentMoves[0]) {
      try {
        uciMove(chess, puzzle.opponentMoves[0]);
        line.push({ fen: chess.fen(), from: puzzle.opponentMoves[0].slice(0, 2), to: puzzle.opponentMoves[0].slice(2, 4) });
      } catch (e) {
        console.error("[puzzle] setup move failed:", puzzle.opponentMoves[0], e);
        return [];
      }
    } else {
      line.push({ fen: chess.fen(), from: "", to: "" });
    }

    // Apply solution + opponent responses
    for (let i = 0; i < puzzle.solutionMoves.length; i++) {
      const sol = puzzle.solutionMoves[i];
      try {
        uciMove(chess, sol);
        line.push({ fen: chess.fen(), from: sol.slice(0, 2), to: sol.slice(2, 4) });
      } catch (e) {
        console.error("[puzzle] solution move failed:", sol, chess.fen(), e);
        break;
      }
      const opp = puzzle.opponentMoves[i + 1];
      if (opp && i < puzzle.solutionMoves.length - 1) {
        try {
          uciMove(chess, opp);
          line.push({ fen: chess.fen(), from: opp.slice(0, 2), to: opp.slice(2, 4) });
        } catch (e) {
          console.error("[puzzle] opponent move failed:", opp, chess.fen(), e);
          break;
        }
      }
    }

    return line;
  }, [puzzle]);

  // ─── Board orientation ────────────────────────────────────────
  const orientation: "white" | "black" = useMemo(() => {
    try {
      const c = new Chess(puzzle.fen);
      return puzzle.opponentMoves.length > 0
        ? (c.turn() === "w" ? "black" : "white")
        : (c.turn() === "w" ? "white" : "black");
    } catch { return "white"; }
  }, [puzzle]);

  const playerColor = orientation === "white" ? "w" : "b";

  // ─── Reset + init on puzzle change ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setAttempts(0);
    attemptsRef.current = 0;
    setSolutionIndex(0);
    solIdxRef.current = 0;
    setSelectedSquare(null);
    setLegalMoveSquares([]);
    setLastMove(null);
    setWrongSquare(null);
    setCorrectSquare(null);
    startTimeRef.current = Date.now();

    if (solutionLine.length === 0) {
      // Pre-computation failed — skip
      setFen(puzzle.fen);
      setPhase("failed");
      return;
    }

    if (puzzle.opponentMoves.length > 0) {
      setFen(puzzle.fen);
      setPhase("opponentSetup");
      const t = setTimeout(() => {
        if (cancelled) return;
        setFen(solutionLine[0].fen);
        setLastMove({ from: solutionLine[0].from, to: solutionLine[0].to });
        setPhase("playerTurn");
      }, 500);
      return () => { cancelled = true; clearTimeout(t); };
    } else {
      setFen(solutionLine[0].fen);
      setPhase("playerTurn");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, solutionLine]);

  const elapsed = () => Math.round((Date.now() - startTimeRef.current) / 1000);

  // lineIdx for the current puzzle-start position: solutionIndex * 2
  // (each player+opponent pair = 2 entries; puzzle start = index 0)
  const currentLineIdx = useMemo(() => solIdxRef.current * 2, [solutionIndex]);

  // ─── Attempt move ─────────────────────────────────────────────
  const attemptMove = useCallback(
    (from: string, to: string): boolean => {
      if (phase !== "playerTurn") return false;

      const expectedUci = puzzle.solutionMoves[solIdxRef.current];
      if (!expectedUci) return false;

      // Validate it's legal first (using a temp chess instance)
      const tempChess = new Chess(fen);
      try { tempChess.move({ from, to, promotion: "q" }); }
      catch { return false; } // not a legal move at all

      setSelectedSquare(null);
      setLegalMoveSquares([]);

      const isCorrect = from === expectedUci.slice(0, 2) && to === expectedUci.slice(2, 4);

      if (isCorrect) {
        const nextSolIdx = solIdxRef.current + 1;
        const playerLineIdx = currentLineIdx + 1; // position after this player move

        if (playerLineIdx < solutionLine.length) {
          setFen(solutionLine[playerLineIdx].fen);
          setLastMove({ from, to });
        }
        setCorrectSquare(to);
        setWrongSquare(null);
        setSolutionIndex(nextSolIdx);
        solIdxRef.current = nextSolIdx;

        if (nextSolIdx >= puzzle.solutionMoves.length) {
          setPhase("solved");
          onSolved(attemptsRef.current + 1, elapsed());
        } else {
          setPhase("correct");
          const oppLineIdx = playerLineIdx + 1; // position after opponent response
          setTimeout(() => {
            setCorrectSquare(null);
            if (oppLineIdx < solutionLine.length) {
              setFen(solutionLine[oppLineIdx].fen);
              setLastMove({ from: solutionLine[oppLineIdx].from, to: solutionLine[oppLineIdx].to });
            }
            setPhase("playerTurn");
          }, 600);
        }
        return true;
      } else {
        const newAttempts = attemptsRef.current + 1;
        attemptsRef.current = newAttempts;
        setAttempts(newAttempts);
        setWrongSquare(to);
        setCorrectSquare(null);
        setPhase("wrong");

        setTimeout(() => {
          setWrongSquare(null);
          if (newAttempts >= 3) {
            setPhase("failed");
            onFailed(newAttempts, elapsed());
          } else {
            setPhase("playerTurn");
          }
        }, 700);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, fen, puzzle, solutionLine, currentLineIdx, onSolved, onFailed]
  );

  // ─── View solution — step through pre-computed FENs ──────────
  const handleViewSolution = useCallback(() => {
    setPhase("showSolution");
    setSelectedSquare(null);
    setLegalMoveSquares([]);
    setWrongSquare(null);
    setCorrectSquare(null);

    // Remaining entries start right after current position
    const startFrom = currentLineIdx + 1;
    const remaining = solutionLine.slice(startFrom);

    if (remaining.length === 0) return;

    const playNext = (idx: number) => {
      if (idx >= remaining.length) return;
      setTimeout(() => {
        const entry = remaining[idx];
        setFen(entry.fen);
        setLastMove({ from: entry.from, to: entry.to });
        playNext(idx + 1);
      }, 700);
    };

    playNext(0);
  }, [solutionLine, currentLineIdx]);

  // ─── Square click ─────────────────────────────────────────────
  const handleSquareClick = useCallback(
    ({ square }: { piece: unknown; square: string }) => {
      if (phase !== "playerTurn") return;
      const chess = new Chess(fen);
      const piece = chess.get(square as Parameters<typeof chess.get>[0]);

      if (selectedSquare) {
        if (legalMoveSquares.includes(square)) {
          attemptMove(selectedSquare, square);
          return;
        }
        if (piece && piece.color === playerColor) {
          const moves = chess.moves({ square: square as Parameters<typeof chess.moves>[0]["square"], verbose: true });
          setSelectedSquare(square);
          setLegalMoveSquares(moves.map((m) => m.to));
          return;
        }
        setSelectedSquare(null);
        setLegalMoveSquares([]);
        return;
      }

      if (piece && piece.color === playerColor) {
        const moves = chess.moves({ square: square as Parameters<typeof chess.moves>[0]["square"], verbose: true });
        setSelectedSquare(square);
        setLegalMoveSquares(moves.map((m) => m.to));
      }
    },
    [phase, fen, selectedSquare, legalMoveSquares, playerColor, attemptMove]
  );

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!targetSquare) return false;
      setSelectedSquare(null);
      setLegalMoveSquares([]);
      return attemptMove(sourceSquare, targetSquare);
    },
    [attemptMove]
  );

  const handleHint = useCallback(() => {
    if (phase !== "playerTurn") return;
    const expected = puzzle.solutionMoves[solIdxRef.current];
    if (!expected) return;
    const from = expected.slice(0, 2);
    const chess = new Chess(fen);
    const moves = chess.moves({ square: from as Parameters<typeof chess.moves>[0]["square"], verbose: true });
    setSelectedSquare(from);
    setLegalMoveSquares(moves.map((m) => m.to));
  }, [phase, fen, puzzle]);

  // ─── Square styles ────────────────────────────────────────────
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: "rgba(255,255,50,0.28)" };
    squareStyles[lastMove.to] = { backgroundColor: "rgba(255,255,50,0.28)" };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: "rgba(255,255,50,0.5)" };
  }
  for (const sq of legalMoveSquares) {
    const chess = new Chess(fen);
    const isCapture = !!chess.get(sq as Parameters<typeof chess.get>[0]);
    squareStyles[sq] = isCapture
      ? { background: "radial-gradient(circle, rgba(0,0,0,0) 58%, rgba(0,0,0,0.22) 60%)" }
      : { background: "radial-gradient(circle, rgba(0,0,0,0.22) 30%, transparent 30%)" };
  }
  if (wrongSquare) squareStyles[wrongSquare] = { backgroundColor: "rgba(202,52,49,0.55)" };
  if (correctSquare) squareStyles[correctSquare] = { backgroundColor: "rgba(150,188,75,0.55)" };

  // ─── Status ───────────────────────────────────────────────────
  const colorName = orientation === "white" ? "White" : "Black";
  const statusMsg = {
    opponentSetup: { text: "Setting up position…", color: "text-[#989795]" },
    playerTurn: { text: `Find the best move for ${colorName}`, color: "text-[#e8e6e1]" },
    correct: { text: "Best move!", color: "text-[#96bc4b]" },
    wrong: { text: attempts >= 3 ? "Puzzle failed" : "Not quite — try again", color: "text-[#ca3431]" },
    solved: { text: "Puzzle complete!", color: "text-[#96bc4b]" },
    failed: { text: "Puzzle failed", color: "text-[#ca3431]" },
    showSolution: { text: "Showing solution…", color: "text-[#e8e6e1]" },
  }[phase];

  const mainTheme = puzzle.themes[0] ?? null;
  const themeLabel = mainTheme ? (THEME_LABELS[mainTheme] ?? mainTheme) : null;
  const themeColor = mainTheme ? (THEME_COLORS[mainTheme] ?? "#989795") : "#989795";
  const isDone = phase === "solved" || phase === "failed" || phase === "showSolution";

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Board column */}
      <div className="flex flex-col gap-0" style={{ width: "min(520px, calc(100vw - 32px))" }}>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-xs text-[#706e6b] font-medium uppercase tracking-wide">
            Puzzle {puzzleIndex + 1} of {totalPuzzles}
          </span>
          {themeLabel && (
            <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: themeColor }}>
              {themeLabel}
            </span>
          )}
        </div>

        <div className="aspect-square w-full">
          <Chessboard
            options={{
              position: fen,
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

        <div className={`flex items-center justify-between mt-2 px-0.5 min-h-[32px] ${
          phase === "solved" ? "bg-[#96bc4b]/10 rounded px-3 py-1.5" :
          phase === "failed" ? "bg-[#ca3431]/10 rounded px-3 py-1.5" : ""
        }`}>
          <span className={`text-sm font-semibold ${statusMsg.color}`}>{statusMsg.text}</span>
          <div className="flex items-center gap-2">
            {phase === "playerTurn" && (
              <>
                <button onClick={handleHint} className="text-xs text-[#706e6b] hover:text-[#989795] underline underline-offset-2">Hint</button>
                <button onClick={onSkip} className="text-xs text-[#706e6b] hover:text-[#989795] underline underline-offset-2">Skip</button>
              </>
            )}
            {phase === "failed" && (
              <button onClick={handleViewSolution} className="text-xs font-semibold text-white bg-[#4a4845] hover:bg-[#5a5855] px-3 py-1 rounded">
                View Solution
              </button>
            )}
            {isDone && (
              <button onClick={onNext} className="px-4 py-1.5 bg-[#81b64c] hover:bg-[#96bc4b] text-white text-sm font-bold rounded">
                Next →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="flex flex-col gap-3 lg:w-[220px] w-full">
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
                <span key={t} className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: THEME_COLORS[t] ?? "#4a4845" }}>
                  {THEME_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          )}
        </div>

        {attempts > 0 && phase !== "solved" && (
          <div className="bg-[#262522] rounded-xl p-4">
            <div className="text-xs text-[#706e6b] uppercase tracking-wider font-bold mb-2">Attempts</div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`w-3 h-3 rounded-full ${i < attempts ? "bg-[#ca3431]" : "bg-[#3a3835]"}`} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
