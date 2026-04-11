"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Chess } from "chess.js";
import type { TrainerPuzzle, WeaknessProfile, PuzzleMode } from "@/lib/puzzle-api";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

const THEME_DESCRIPTIONS: Record<string, string> = {
  fork: "Can you find the fork?",
  pin: "Can you pin a piece?",
  skewer: "Can you execute the skewer?",
  backRankMate: "Look for the back rank weakness",
  hangingPiece: "Find the hanging piece",
  mate: "Find the checkmate",
  discoveredAttack: "Find the discovered attack",
  promotion: "Can you promote a pawn?",
  sacrifice: "Find the winning sacrifice",
  deflection: "Can you deflect the defender?",
  trappedPiece: "The piece has nowhere to go",
  doubleCheck: "Can you give a double check?",
  materialGain: "Find the way to win material",
  exposedKing: "The king needs protection",
  weakKingSafety: "Improve your king's safety",
  inactivePieces: "Activate your pieces",
  pawnStructure: "Find the best pawn move",
  poorPawnStructure: "Avoid weakening your pawns",
  overextension: "Watch out for overextended pieces",
};

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false, loading: () => <div className="w-full aspect-square bg-[#3a3835]/40 animate-pulse rounded" /> }
);

type Phase =
  | "init"        // auto-playing setup move
  | "idle"        // waiting for player
  | "wrong"       // brief flash after wrong move
  | "evaluating"  // checking move quality with engine
  | "animating"   // playing opponent response
  | "solved"
  | "failed"
  | "solution"    // playing through solution
  | "done";       // solution finished

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
  mode?: PuzzleMode;
  onModeChange?: (mode: PuzzleMode) => void;
  hasBlunderPuzzles?: boolean;
  playerRating?: number;
  ratingChange?: number | null;
  username?: string;
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
  mode = "random",
  onModeChange,
  hasBlunderPuzzles = false,
  playerRating = 1200,
  ratingChange = null,
  username,
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

  // Precomputed good moves for the current puzzle position (instant lookup)
  const goodMovesRef = useRef<Set<string> | null>(null);
  const goodMovesReady = useRef(false);

  // Timer
  const [timerSecs, setTimerSecs] = useState(0);

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
    goodMovesRef.current = null;
    goodMovesReady.current = false;
    startTimeRef.current = Date.now();
    setTimerSecs(0);

    // Precompute all good moves from the puzzle position in background
    // Use the position AFTER the setup move (if any) — that's what the player sees
    const precomputeFen = puzzle.opponentMoves[0]
      ? (() => { const c = new Chess(puzzle.fen); c.move(puzzle.opponentMoves[0]); return c.fen(); })()
      : puzzle.fen;

    fetch("/api/puzzles/evaluate-move", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen: precomputeFen }),
    })
      .then((r) => r.json())
      .then(({ goodMoves }) => {
        if (!cancelled && Array.isArray(goodMoves)) {
          goodMovesRef.current = new Set(goodMoves);
          goodMovesReady.current = true;
        }
      })
      .catch(() => { /* silent — fall back to per-move eval */ });

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

  // ── Accept a move (shared logic) ─────────────────────────────────
  const acceptMove = useCallback((uci: string, to: string) => {
    doMove(uci);
    setFlashSq({ sq: to, color: "green" });
    const nextIdx = moveIdxRef.current + 1;
    moveIdxRef.current = nextIdx;
    if (nextIdx >= puzzle.solutionMoves.length) {
      setTimeout(() => { setFlashSq(null); setPhase("solved"); }, 400);
      onSolved(attemptsRef.current + 1, Math.round((Date.now() - startTimeRef.current) / 1000));
    } else {
      playOpponent(nextIdx - 1, () => { if (!cancelled.current) setPhase("idle"); });
      setTimeout(() => setFlashSq(null), 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, doMove, playOpponent, onSolved]);

  // ── Reject a move ─────────────────────────────────────────────────
  const rejectMove = useCallback((to: string) => {
    const newAttempts = attemptsRef.current + 1;
    attemptsRef.current = newAttempts;
    setAttempts(newAttempts);
    setFlashSq({ sq: to, color: "red" });
    setPhase("wrong");
    setTimeout(() => {
      if (!cancelled.current) { setFlashSq(null); setPhase("idle"); }
    }, 600);
  }, []);

  // ── Attempt a move ────────────────────────────────────────────────
  const tryMove = useCallback((from: string, to: string): boolean => {
    if (phase !== "idle") return false;
    setSelectedSq(null);
    setLegalSqs([]);

    const piece = chessRef.current.get(from as Parameters<typeof chessRef.current.get>[0]);
    const isPromotion = piece?.type === "p" && (to[1] === "8" || to[1] === "1");
    const uci = from + to + (isPromotion ? "q" : "");

    // Check legal first
    const temp = new Chess(chessRef.current.fen());
    try { temp.move({ from, to, ...(isPromotion ? { promotion: "q" } : {}) }); }
    catch { return false; }

    const expected = puzzle.solutionMoves[moveIdxRef.current];
    const isExact = expected && from === expected.slice(0, 2) && to === expected.slice(2, 4);

    if (isExact) {
      acceptMove(expected, to);
      return true;
    }

    // Check precomputed good moves list (instant if ready)
    if (goodMovesReady.current && goodMovesRef.current) {
      if (goodMovesRef.current.has(uci)) {
        acceptMove(uci, to);
        return true;
      } else {
        rejectMove(to);
        return false;
      }
    }

    // Good moves not ready yet — fall back to per-move evaluation
    setPhase("evaluating");
    fetch("/api/puzzles/evaluate-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen: chessRef.current.fen(), move: uci }),
    })
      .then((r) => r.json())
      .then(({ acceptable }) => {
        if (cancelled.current) return;
        if (acceptable) acceptMove(uci, to);
        else rejectMove(to);
      })
      .catch(() => { if (!cancelled.current) rejectMove(to); });

    return false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, puzzle, acceptMove, rejectMove]);

  // Timer tick
  useEffect(() => {
    const isDone = phase === "solved" || phase === "done" || phase === "failed";
    if (isDone) return;
    const id = setInterval(() => setTimerSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase, puzzle]);

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
      s[lastMove.from] = { backgroundColor: "rgba(205,210,106,0.7)" };
      s[lastMove.to] = { backgroundColor: "rgba(170,162,58,0.7)" };
    }
    if (selectedSq) s[selectedSq] = { backgroundColor: "rgba(20,85,30,0.5)" };
    if (legalSqs.length > 0) {
      for (const sq of legalSqs) {
        const isCapture = !!chessRef.current.get(sq as Parameters<typeof chessRef.current.get>[0]);
        s[sq] = isCapture
          ? { background: "radial-gradient(circle, rgba(0,0,0,0) 76%, rgba(0,0,0,0.18) 78%)", borderRadius: "0" }
          : { background: "radial-gradient(circle, rgba(0,0,0,0.15) 22%, transparent 24%)" };
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
  const mainTheme = puzzle.themes[0] ?? null;
  const themeLabel = mainTheme ? (THEME_LABELS[mainTheme] ?? mainTheme) : null;
  const themeColor = mainTheme ? (THEME_COLORS[mainTheme] ?? "#706e6b") : "#706e6b";
  const themeDesc = mainTheme ? (THEME_DESCRIPTIONS[mainTheme] ?? null) : null;
  const canInteract = phase === "idle" || phase === "wrong";
  const isDone = phase === "solved" || phase === "failed" || phase === "done";
  const timerDisplay = `${Math.floor(timerSecs / 60)}:${String(timerSecs % 60).padStart(2, "0")}`;

  // Status line shown in the bubble
  const statusLine = (() => {
    if (phase === "init" || phase === "animating") return { heading: `${colorName} to move`, sub: "…" };
    if (phase === "evaluating") return { heading: `${colorName} to move`, sub: "Checking…" };
    if (phase === "idle" || phase === "wrong") return { heading: `${colorName} to move`, sub: themeDesc ?? "Find the best move" };
    if (phase === "solved") return { heading: "Best move!", sub: revealed && themeLabel ? `It's a ${themeLabel}` : "Puzzle solved" };
    if (phase === "solution") return { heading: "Best continuation", sub: "Watching the solution…" };
    if (phase === "done") return { heading: "Solution complete", sub: revealed && themeLabel ? `It's a ${themeLabel}` : "" };
    return { heading: "", sub: "" };
  })();

  return (
    <div className="flex flex-col lg:flex-row w-full h-full lg:items-stretch rounded-xl overflow-hidden shadow-2xl">

      {/* ── Board ── */}
      <div className="flex-1 min-w-0 min-h-0 bg-[#312e2b] flex items-center justify-center">
        <div
          style={{
            height: "100%",
            maxHeight: "560px",
            aspectRatio: "1",
            maxWidth: "100%",
          }}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(() => {
            const boardOptions: any = {
              position: fen,
              squareStyles,
              darkSquareStyle: { backgroundColor: "#769656" },
              lightSquareStyle: { backgroundColor: "#eeeed2" },
              customNotationStyle: {
                color: "rgba(255,255,255,0.75)",
                fontSize: "11px",
                fontWeight: "600",
              },
              boardOrientation: orientation,
              allowDragging: canInteract,
              animationDurationInMs: 200,
              onPieceDrop: handleDrop,
              onSquareClick: handleSquareClick,
            };
            return <Chessboard options={boardOptions} />;
          })()}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="flex flex-col bg-[#1e1c1a] lg:w-[300px] w-full flex-shrink-0 h-full">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2a2826]">
          {username ? (
            <Link href={`/player/${username}`} className="text-[#706e6b] hover:text-[#989795] transition-colors flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </Link>
          ) : <div className="w-4" />}

          {/* Mode tabs */}
          {onModeChange ? (
            <div className="flex-1 flex bg-[#2a2826] rounded-lg p-0.5 gap-0.5">
              {([
                { m: "random" as PuzzleMode, label: "Random" },
                { m: "weakness" as PuzzleMode, label: "Weak Spots" },
                ...(hasBlunderPuzzles ? [{ m: "blunders" as PuzzleMode, label: "Blunders" }] : []),
              ]).map(({ m, label }) => (
                <button
                  key={m}
                  onClick={() => mode !== m && onModeChange(m)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                    mode === m
                      ? "bg-[#1e1c1a] text-white shadow-sm"
                      : "text-[#706e6b] hover:text-[#989795]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <span className="flex-1 text-sm font-bold text-white tracking-tight">Puzzles</span>
          )}

          <span className="text-xs text-[#4a4845] flex-shrink-0">{puzzleIndex + 1}/{totalPuzzles}</span>
        </div>

        {/* Content — scrollable if needed */}
        <div className="flex-1 flex flex-col px-5 pt-5 pb-3 gap-5 overflow-y-auto">

          {/* Status bubble */}
          <div className={`rounded-xl p-4 transition-colors duration-300 ${
            phase === "solved" ? "bg-[#1e3a12]" :
            phase === "done" ? "bg-[#1a2a10]" :
            "bg-[#262522]"
          }`}>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className={`w-4 h-4 rounded-sm border flex-shrink-0 ${
                orientation === "white" ? "bg-white border-[#aaa]" : "bg-[#1e1c1a] border-[#555]"
              }`} />
              <span className="text-base font-bold text-white">{statusLine.heading}</span>
            </div>
            {statusLine.sub && (
              <p className="text-sm text-[#989795] ml-6.5">{statusLine.sub}</p>
            )}
            {attempts > 0 && !revealed && (
              <div className="flex items-center gap-1.5 mt-2.5 ml-6.5">
                {Array.from({ length: attempts }).map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#ca3431]" />
                ))}
              </div>
            )}
          </div>

          {/* Puzzle info */}
          <div className="space-y-2">
            {puzzle.rating && (
              <div className="flex justify-between text-sm">
                <span className="text-[#706e6b]">Rating</span>
                <span className="font-bold text-white">{puzzle.rating}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-[#706e6b]">Source</span>
              <span className="text-[#e8e6e1] text-xs">{puzzle.sourceLabel}</span>
            </div>
            {themeLabel && (
              <div className="flex justify-between text-sm items-center">
                <span className="text-[#706e6b]">Theme</span>
                <span
                  className="text-xs font-bold text-white px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: themeColor }}
                >
                  {themeLabel}
                </span>
              </div>
            )}
          </div>

          {/* Rating */}
          <div className="border-t border-[#2a2826] pt-4">
            <p className="text-xs font-bold text-[#4a4845] uppercase tracking-wider mb-3">Puzzle Rating</p>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-black text-white tabular-nums leading-none">
                {playerRating.toLocaleString()}
              </span>
              {ratingChange !== null && (
                <span className={`text-sm font-bold pb-0.5 ${ratingChange >= 0 ? "text-[#81b64c]" : "text-[#ca3431]"}`}>
                  {ratingChange >= 0 ? `+${ratingChange}` : ratingChange}
                </span>
              )}
            </div>
            {/* Difficulty bar: puzzle rating vs player rating */}
            {puzzle.rating && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-[#706e6b] mb-1">
                  <span>Puzzle difficulty</span>
                  <span>{puzzle.rating}</span>
                </div>
                <div className="h-1.5 bg-[#2a2826] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(5, 50 + (puzzle.rating - playerRating) / 20))}%`,
                      backgroundColor: puzzle.rating > playerRating + 200 ? "#ca3431"
                        : puzzle.rating > playerRating ? "#dbac18"
                        : "#81b64c",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Session stats */}
          <div className="border-t border-[#2a2826] pt-4 space-y-2.5">
            <p className="text-xs font-bold text-[#4a4845] uppercase tracking-wider">Session</p>
            {[
              ["Solved", `${sessionSolved} / ${sessionTotal}`],
              ["Streak", streak > 0 ? `🔥 ${streak}` : "0"],
              ["Accuracy", sessionTotal > 0 ? `${Math.round((sessionSolved / sessionTotal) * 100)}%` : "—"],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between text-sm">
                <span className="text-[#706e6b]">{label}</span>
                <span className="font-bold text-white">{value}</span>
              </div>
            ))}
          </div>

          {/* Weaknesses breakdown + theme filter */}
          {weaknesses && weaknesses.length > 0 && onThemeClick && (
            <div className="border-t border-[#2a2826] pt-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-bold text-[#4a4845] uppercase tracking-wider">Your Weaknesses</p>
                {activeTheme && (
                  <button
                    onClick={() => onThemeClick(null)}
                    className="text-[10px] text-[#706e6b] hover:text-[#989795] transition-colors"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {weaknesses.map((w) => {
                  const isActive = activeTheme === w.theme;
                  const color = THEME_COLORS[w.theme] ?? "#706e6b";
                  const label = THEME_LABELS[w.theme] ?? w.theme;
                  return (
                    <button
                      key={w.theme}
                      onClick={() => onThemeClick(isActive ? null : w.theme)}
                      className={`w-full text-left group transition-opacity ${isActive ? "opacity-100" : activeTheme ? "opacity-50 hover:opacity-80" : "opacity-100"}`}
                    >
                      <div className="flex justify-between items-center mb-0.5">
                        <span className={`text-xs font-semibold ${isActive ? "text-white" : "text-[#989795] group-hover:text-white"} transition-colors`}>
                          {label}
                        </span>
                        <span className="text-[11px] text-[#706e6b] font-mono">{w.percentage}%</span>
                      </div>
                      <div className="h-1.5 bg-[#2a2826] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${w.percentage}%`, backgroundColor: isActive ? color : "#4a4845" }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timer */}
          <div className="flex items-center gap-2 text-[#706e6b] text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {timerDisplay}
          </div>
        </div>

        {/* Footer — action buttons always at bottom */}
        <div className="px-5 py-4 border-t border-[#2a2826] flex flex-col gap-2">
          {isDone ? (
            <button
              onClick={onNext}
              className="w-full py-3 bg-[#81b64c] hover:bg-[#96bc4b] text-white font-bold rounded-lg transition-colors text-sm"
            >
              Next Puzzle →
            </button>
          ) : (
            <>
              <button
                onClick={handleHint}
                className="w-full py-3 bg-[#2a2826] hover:bg-[#3a3835] text-[#e8e6e1] font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Hint
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => hintUsed && showSolution(true)}
                  disabled={!hintUsed}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    hintUsed
                      ? "bg-[#2a2826] hover:bg-[#3a3835] text-[#989795]"
                      : "bg-[#1e1c1a] text-[#3a3835] cursor-not-allowed"
                  }`}
                >
                  Solution
                </button>
                <button
                  onClick={onSkip}
                  className="flex-1 py-2.5 bg-[#2a2826] hover:bg-[#3a3835] text-[#706e6b] rounded-lg text-xs font-semibold transition-colors"
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
