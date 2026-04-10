"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import type { TrainerPuzzle, WeaknessProfile } from "@/lib/puzzle-api";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div className="w-full aspect-square bg-[#3a3835]/40 animate-pulse rounded" /> }
);

type Phase =
  | "init"       // auto-playing setup move
  | "idle"       // waiting for player
  | "wrong"      // brief flash after wrong move
  | "animating"  // playing opponent response
  | "solved"
  | "failed"
  | "solution"   // playing through solution
  | "done";      // solution finished

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
  weaknesses?: WeaknessProfile[];
  activeTheme?: string | null;
  onThemeClick?: (theme: string | null) => void;
}

// Apply UCI move — only adds promotion if actually needed
function applyUci(chess: Chess, uci: string) {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const piece = chess.get(from as Parameters<typeof chess.get>[0]);
  const isPromotion = piece?.type === "p" && (to[1] === "8" || to[1] === "1");
  return chess.move({
    from,
    to,
    ...(isPromotion ? { promotion: (uci[4] as "q" | "r" | "b" | "n") ?? "q" } : {}),
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
  weaknesses,
  activeTheme,
  onThemeClick,
}: Props) {
  const chessRef = useRef(new Chess(puzzle.fen));
  const [fen, setFen] = useState(puzzle.fen);
  const [phase, setPhase] = useState<Phase>("init");
  const moveIdxRef = useRef(0);
  const attemptsRef = useRef(0);
  const [attempts, setAttempts] = useState(0);
  const startTimeRef = useRef(Date.now());

  const [selectedSq, setSelectedSq] = useState<string | null>(null);
  const [legalSqs, setLegalSqs] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [flashSq, setFlashSq] = useState<{ sq: string; color: "green" | "red" } | null>(null);
  const [hintUsed, setHintUsed] = useState(false);

  // ── Board orientation ─────────────────────────────────────────────
  const orientation = useMemo<"white" | "black">(() => {
    try {
      const c = new Chess(puzzle.fen);
      // If opponent goes first (Lichess setup move), player is the other color
      return puzzle.opponentMoves.length > 0
        ? (c.turn() === "w" ? "black" : "white")
        : (c.turn() === "w" ? "white" : "black");
    } catch { return "white"; }
  }, [puzzle]);

  const playerColor = orientation === "white" ? "w" : "b";

  // ── Apply move to board ───────────────────────────────────────────
  const doMove = useCallback((uci: string) => {
    try {
      applyUci(chessRef.current, uci);
      const newFen = chessRef.current.fen();
      setFen(newFen);
      setLastMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      return true;
    } catch (e) {
      console.error("[puzzle] move failed:", uci, chessRef.current.fen(), e);
      return false;
    }
  }, []);

  // ── Opponent response ─────────────────────────────────────────────
  const playOpponent = useCallback((solIdx: number, onDone: () => void) => {
    const uci = puzzle.opponentMoves[solIdx + 1]; // +1 because opponentMoves[0] is setup
    if (!uci) { onDone(); return; }
    setPhase("animating");
    setTimeout(() => {
      doMove(uci);
      onDone();
    }, 500);
  }, [puzzle, doMove]);

  // ── Init puzzle ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const chess = new Chess(puzzle.fen);
    chessRef.current = chess;
    setFen(puzzle.fen);
    moveIdxRef.current = 0;
    attemptsRef.current = 0;
    setAttempts(0);
    setSelectedSq(null);
    setLegalSqs([]);
    setLastMove(null);
    setFlashSq(null);
    setHintUsed(false);
    startTimeRef.current = Date.now();

    if (puzzle.opponentMoves[0]) {
      setPhase("init");
      setTimeout(() => {
        if (cancelled) return;
        doMove(puzzle.opponentMoves[0]);
        setPhase("idle");
      }, 600);
    } else {
      setPhase("idle");
    }
    return () => { cancelled = true; };
  }, [puzzle, doMove]);

  const elapsed = () => Math.round((Date.now() - startTimeRef.current) / 1000);

  // ── Attempt a move ────────────────────────────────────────────────
  const tryMove = useCallback((from: string, to: string): boolean => {
    if (phase !== "idle") return false;
    setSelectedSq(null);
    setLegalSqs([]);

    // Check legal first (temp chess)
    const temp = new Chess(chessRef.current.fen());
    try { temp.move({ from, to, promotion: "q" }); }
    catch { return false; }

    const expected = puzzle.solutionMoves[moveIdxRef.current];
    const correct = expected && from === expected.slice(0, 2) && to === expected.slice(2, 4);

    if (correct) {
      doMove(expected);
      setFlashSq({ sq: to, color: "green" });

      const nextIdx = moveIdxRef.current + 1;
      moveIdxRef.current = nextIdx;

      if (nextIdx >= puzzle.solutionMoves.length) {
        setTimeout(() => { setFlashSq(null); setPhase("solved"); }, 400);
        onSolved(attemptsRef.current + 1, elapsed());
      } else {
        playOpponent(nextIdx - 1, () => {
          if (!cancelled.current) setPhase("idle");
        });
        setTimeout(() => setFlashSq(null), 600);
      }
      return true;
    } else {
      // Wrong — flash red but don't move the piece
      const newAttempts = attemptsRef.current + 1;
      attemptsRef.current = newAttempts;
      setAttempts(newAttempts);
      setFlashSq({ sq: to, color: "red" });
      setPhase("wrong");
      setTimeout(() => {
        setFlashSq(null);
        setPhase("idle");
      }, 600);
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, puzzle, doMove, playOpponent, onSolved, onFailed]);

  // Ref to prevent state updates after component unmount/puzzle change
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; };
  }, [puzzle]);

  // ── Square click ──────────────────────────────────────────────────
  const handleSquareClick = useCallback(({ square }: { piece: unknown; square: string }) => {
    if (phase !== "idle") return;
    const piece = chessRef.current.get(square as Parameters<typeof chessRef.current.get>[0]);

    if (selectedSq) {
      if (legalSqs.includes(square)) { tryMove(selectedSq, square); return; }
      if (piece?.color === playerColor) {
        const moves = chessRef.current.moves({ square: square as Parameters<typeof chessRef.current.moves>[0]["square"], verbose: true });
        setSelectedSq(square);
        setLegalSqs(moves.map(m => m.to));
        return;
      }
      setSelectedSq(null); setLegalSqs([]); return;
    }
    if (piece?.color === playerColor) {
      const moves = chessRef.current.moves({ square: square as Parameters<typeof chessRef.current.moves>[0]["square"], verbose: true });
      setSelectedSq(square);
      setLegalSqs(moves.map(m => m.to));
    }
  }, [phase, selectedSq, legalSqs, playerColor, tryMove]);

  // ── Drag drop ─────────────────────────────────────────────────────
  const handleDrop = useCallback(({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!targetSquare) return false;
    setSelectedSq(null); setLegalSqs([]);
    return tryMove(sourceSquare, targetSquare);
  }, [tryMove]);

  // ── Hint ──────────────────────────────────────────────────────────
  const handleHint = useCallback(() => {
    if (phase !== "idle") return;
    const expected = puzzle.solutionMoves[moveIdxRef.current];
    if (!expected) return;
    const from = expected.slice(0, 2);
    const moves = chessRef.current.moves({ square: from as Parameters<typeof chessRef.current.moves>[0]["square"], verbose: true });
    setSelectedSq(from);
    setLegalSqs(moves.map(m => m.to));
    setHintUsed(true);
  }, [phase, puzzle]);

  // ── Show solution ─────────────────────────────────────────────────
  const showSolution = useCallback((recordFail: boolean) => {
    if (recordFail) onFailed(attemptsRef.current, elapsed());
    setPhase("solution");
    setSelectedSq(null); setLegalSqs([]); setFlashSq(null);

    // Build remaining moves: [playerMove, opponentResponse, playerMove, ...]
    const startIdx = moveIdxRef.current;
    const toPlay: string[] = [];
    for (let i = startIdx; i < puzzle.solutionMoves.length; i++) {
      toPlay.push(puzzle.solutionMoves[i]);
      const opp = puzzle.opponentMoves[i + 1];
      if (opp && i < puzzle.solutionMoves.length - 1) toPlay.push(opp);
    }

    const step = (i: number) => {
      if (i >= toPlay.length) { setPhase("done"); return; }
      setTimeout(() => {
        doMove(toPlay[i]);
        step(i + 1);
      }, 700);
    };
    step(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, doMove, onFailed]);

  // ── Square styles ─────────────────────────────────────────────────
  const squareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
    const s: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      s[lastMove.from] = { backgroundColor: "rgba(255,255,50,0.3)" };
      s[lastMove.to] = { backgroundColor: "rgba(255,255,50,0.3)" };
    }
    if (selectedSq) s[selectedSq] = { backgroundColor: "rgba(255,255,50,0.5)" };
    if (legalSqs.length > 0) {
      for (const sq of legalSqs) {
        const isCapture = !!chessRef.current.get(sq as Parameters<typeof chessRef.current.get>[0]);
        s[sq] = isCapture
          ? { background: "radial-gradient(circle, rgba(0,0,0,0) 58%, rgba(0,0,0,0.25) 61%)", borderRadius: "0" }
          : { background: "radial-gradient(circle, rgba(0,0,0,0.25) 28%, transparent 30%)" };
      }
    }
    if (flashSq) {
      s[flashSq.sq] = {
        backgroundColor: flashSq.color === "green" ? "rgba(96,198,89,0.6)" : "rgba(220,50,50,0.55)",
        transition: "background-color 0.1s",
      };
    }
    return s;
  }, [lastMove, selectedSq, legalSqs, flashSq]);

  // ── UI helpers ────────────────────────────────────────────────────
  const colorName = orientation === "white" ? "White" : "Black";
  const revealed = phase === "solved" || phase === "failed" || phase === "solution" || phase === "done";

  const statusBar = (() => {
    if (phase === "init" || phase === "animating") return { text: "…", bg: "bg-[#1e1c1a]", textColor: "text-[#989795]" };
    if (phase === "idle" || phase === "wrong") return { text: `Find the best move for ${colorName}`, bg: "bg-[#1e1c1a]", textColor: "text-[#e8e6e1]" };
    if (phase === "solved") return { text: "Best move! Puzzle solved.", bg: "bg-[#3d6b2c]", textColor: "text-white" };
    if (phase === "failed") return { text: "Puzzle failed.", bg: "bg-[#6b2828]", textColor: "text-white" };
    if (phase === "solution") return { text: "Best continuation…", bg: "bg-[#1e1c1a]", textColor: "text-[#989795]" };
    if (phase === "done") return { text: "Solution complete.", bg: "bg-[#1e1c1a]", textColor: "text-[#e8e6e1]" };
    return { text: "", bg: "bg-[#1e1c1a]", textColor: "text-[#e8e6e1]" };
  })();

  const mainTheme = puzzle.themes[0] ?? null;
  const themeLabel = mainTheme ? (THEME_LABELS[mainTheme] ?? mainTheme) : null;
  const themeColor = mainTheme ? (THEME_COLORS[mainTheme] ?? "#706e6b") : "#706e6b";

  const canInteract = phase === "idle";
  const isDone = phase === "solved" || phase === "failed" || phase === "done";

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start w-full">

      {/* ── Board column ── */}
      <div className="flex flex-col" style={{ width: "min(560px, calc(100vw - 32px))" }}>

        {/* Player-to-move bar */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-4 h-4 rounded-sm border border-[#555] ${orientation === "white" ? "bg-white" : "bg-[#312e2b]"}`} />
          <span className="text-sm font-semibold text-[#e8e6e1]">{colorName} to move</span>
          <div className="flex-1" />
          <span className="text-xs text-[#706e6b]">Puzzle {puzzleIndex + 1} / {totalPuzzles}</span>
        </div>

        {/* Board */}
        <div className="w-full aspect-square">
          <Chessboard
            options={{
              position: fen,
              squareStyles,
              darkSquareStyle: { backgroundColor: "#779952" },
              lightSquareStyle: { backgroundColor: "#edeed1" },
              boardOrientation: orientation,
              allowDragging: canInteract,
              animationDurationInMs: 200,
              onPieceDrop: handleDrop,
              onSquareClick: handleSquareClick,
            }}
          />
        </div>

        {/* Status bar */}
        <div className={`flex items-center justify-between px-4 py-2.5 mt-1 rounded-b-lg ${statusBar.bg} transition-colors duration-300 min-h-[44px]`}>
          <span className={`text-sm font-semibold ${statusBar.textColor}`}>
            {statusBar.text}
          </span>
          <div className="flex items-center gap-2">
            {canInteract && (
              <>
                <button onClick={handleHint} className="text-xs text-[#706e6b] hover:text-[#989795] transition-colors underline underline-offset-2">Hint</button>
                <span className="text-[#3a3835]">·</span>
                <button
                  onClick={() => hintUsed && showSolution(true)}
                  className={`text-xs underline underline-offset-2 transition-colors ${hintUsed ? "text-[#706e6b] hover:text-[#989795] cursor-pointer" : "text-[#3a3835] cursor-not-allowed"}`}
                >
                  Solution
                </button>
                <span className="text-[#3a3835]">·</span>
                <button onClick={onSkip} className="text-xs text-[#706e6b] hover:text-[#989795] transition-colors underline underline-offset-2">Skip</button>
              </>
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

        {/* Attempts */}
        {attempts > 0 && !revealed && (
          <div className="flex items-center gap-1.5 mt-2 px-1">
            <span className="text-xs text-[#706e6b]">Attempts:</span>
            {[0, 1, 2].map(i => (
              <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < attempts ? "bg-[#ca3431]" : "bg-[#3a3835]"}`} />
            ))}
          </div>
        )}
      </div>

      {/* ── Sidebar ── */}
      <div className="lg:w-[220px] w-full flex flex-col gap-3">

        {/* Theme filter */}
        {weaknesses && weaknesses.length > 0 && onThemeClick && (
          <div className="bg-[#262522] rounded-xl p-4">
            <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-2">Filter by theme</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onThemeClick(null)}
                className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                  !activeTheme ? "bg-[#81b64c] text-white" : "bg-[#3a3835] text-[#989795] hover:text-white"
                }`}
              >
                All
              </button>
              {weaknesses.map((w) => (
                <button
                  key={w.theme}
                  onClick={() => onThemeClick(w.theme)}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                    activeTheme === w.theme ? "text-white" : "bg-[#3a3835] text-[#989795] hover:text-white"
                  }`}
                  style={activeTheme === w.theme ? { backgroundColor: THEME_COLORS[w.theme] ?? "#706e6b" } : {}}
                >
                  {THEME_LABELS[w.theme] ?? w.theme}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Session stats */}
        <div className="bg-[#262522] rounded-xl p-4">
          <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-3">Session</p>
          <div className="space-y-2">
            {[
              ["Solved", `${sessionSolved} / ${sessionTotal}`],
              ["Streak", streak],
              ["Accuracy", sessionTotal > 0 ? `${Math.round((sessionSolved / sessionTotal) * 100)}%` : "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between text-sm">
                <span className="text-[#989795]">{label}</span>
                <span className={`font-bold ${label === "Streak" && (value as number) > 0 ? "text-[#96bc4b]" : "text-white"}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Puzzle info */}
        <div className="bg-[#262522] rounded-xl p-4">
          <p className="text-xs font-bold text-[#706e6b] uppercase tracking-wider mb-3">Puzzle</p>
          {puzzle.rating && (
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[#989795]">Rating</span>
              <span className="font-bold text-white">{puzzle.rating}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-[#989795]">Source</span>
            <span className="text-[#e8e6e1] text-xs truncate ml-2">{puzzle.sourceLabel}</span>
          </div>
          {/* Theme revealed after solving */}
          {revealed && themeLabel && (
            <div className="mt-3">
              <span
                className="inline-block text-xs font-bold text-white px-2.5 py-1 rounded-full"
                style={{ backgroundColor: themeColor }}
              >
                {themeLabel}
              </span>
            </div>
          )}
          {!revealed && (
            <div className="mt-3">
              <span className="text-xs text-[#4a4845] italic">Theme hidden until solved</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
