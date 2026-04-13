"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Chess } from "chess.js";
import Header from "@/components/Header";
import PuzzleBoard from "@/components/puzzle-trainer/PuzzleBoard";
import {
  getPuzzleRecommendations,
  getUserPuzzleRating,
  recordPuzzleAttempt,
  lichessPuzzleToTrainer,
  blunderPuzzleToTrainer,
  type PuzzleRecommendation,
  type PuzzleMode,
  type TrainerPuzzle,
} from "@/lib/puzzle-api";

const PREFETCH_THRESHOLD = 5; // fetch more when this many puzzles remain
const GOOD_MOVES_PREFETCH = 3; // warm cache for this many upcoming puzzles

/** Returns the FEN after the setup (opponent) move is applied — the position the player will face. */
function getPuzzleActiveFen(puzzle: TrainerPuzzle): string | null {
  try {
    if (puzzle.source === "own-blunder") return puzzle.fen; // no setup move
    const setupMove = puzzle.opponentMoves[0];
    if (!setupMove) return puzzle.fen;
    const chess = new Chess(puzzle.fen);
    const from = setupMove.slice(0, 2);
    const to = setupMove.slice(2, 4);
    const promo = setupMove[4] as "q" | "r" | "b" | "n" | undefined;
    chess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
    return chess.fen();
  } catch {
    return null;
  }
}

function warmGoodMovesCache(fen: string) {
  fetch("/api/puzzles/evaluate-move", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fen }),
  }).catch(() => {});
}

export default function PuzzlesPage() {
  const params = useParams();
  const username = params.username as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<PuzzleRecommendation | null>(null);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [puzzleQueue, setPuzzleQueue] = useState<TrainerPuzzle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionSolved, setSessionSolved] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [mode, setMode] = useState<PuzzleMode>("random");
  const [modeSelected, setModeSelected] = useState(false);
  const [playerRating, setPlayerRating] = useState(1200);
  const [ratingChange, setRatingChange] = useState<number | null>(null);

  const seenIds = useRef(new Set<string>());
  const isFetching = useRef(false);
  const activeThemeRef = useRef<string | null>(null);
  const modeRef = useRef<PuzzleMode>("random");

  // Pre-partitioned indexes: theme → TrainerPuzzle[] for O(1) filter lookups
  const themePartitions = useRef<Map<string, TrainerPuzzle[]>>(new Map());
  const allPuzzlesRef = useRef<{ weakness: TrainerPuzzle[]; random: TrainerPuzzle[]; blunders: TrainerPuzzle[] }>({
    weakness: [], random: [], blunders: [],
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [data, rating] = await Promise.all([
          getPuzzleRecommendations(username),
          getUserPuzzleRating(username),
        ]);
        setRecommendation(data);
        setPlayerRating(rating);

        // Pre-convert all puzzles once and partition by theme for O(1) filter
        const weaknessPuzzles = data.puzzles.map(lichessPuzzleToTrainer);
        const randomPuzzles = (data.randomPuzzles ?? []).map(lichessPuzzleToTrainer);
        const blunderPuzzles = data.ownBlunderPuzzles.map(blunderPuzzleToTrainer);

        allPuzzlesRef.current = { weakness: weaknessPuzzles, random: randomPuzzles, blunders: blunderPuzzles };

        // Build theme → puzzle index for weakness + random (most commonly filtered)
        const partitions = new Map<string, TrainerPuzzle[]>();
        for (const tp of [...weaknessPuzzles, ...randomPuzzles]) {
          for (const theme of tp.themes) {
            if (!partitions.has(theme)) partitions.set(theme, []);
            partitions.get(theme)!.push(tp);
          }
        }
        themePartitions.current = partitions;

        const defaultMode: PuzzleMode = blunderPuzzles.length > 0 ? "blunders" : "random";
        setMode(defaultMode);
        modeRef.current = defaultMode;
        buildQueue(data, null, defaultMode);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load puzzles");
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const buildQueue = useCallback((
    data: PuzzleRecommendation,
    themeFilter: string | null,
    puzzleMode: PuzzleMode,
  ) => {
    seenIds.current.clear();
    let queue: TrainerPuzzle[];

    if (puzzleMode === "blunders") {
      // Blunder puzzles are small — filter inline
      const all = allPuzzlesRef.current.blunders.length > 0
        ? allPuzzlesRef.current.blunders
        : data.ownBlunderPuzzles.map(blunderPuzzleToTrainer);
      queue = themeFilter
        ? all.filter((tp) => tp.themes.includes(themeFilter))
        : all;
    } else if (themeFilter) {
      // O(1) lookup from pre-partitioned index
      const modeSource = puzzleMode === "weakness" ? "weakness" : "random";
      const partitioned = themePartitions.current.get(themeFilter) ?? [];
      // Filter to only the correct mode's puzzles
      const modeIds = new Set(allPuzzlesRef.current[modeSource].map((tp) => tp.id));
      queue = partitioned.filter((tp) => modeIds.has(tp.id));
    } else {
      // No theme filter — use full pre-converted array
      const modeSource = puzzleMode === "weakness" ? "weakness" : "random";
      queue = allPuzzlesRef.current[modeSource].length > 0
        ? allPuzzlesRef.current[modeSource]
        : (puzzleMode === "weakness" ? data.puzzles : (data.randomPuzzles ?? [])).map(lichessPuzzleToTrainer);
    }

    for (const tp of queue) seenIds.current.add(tp.id);
    setPuzzleQueue(queue);
    setCurrentIndex(0);
    setSessionSolved(0);
    setSessionTotal(0);
    setStreak(0);
  }, []);

  const fetchMore = useCallback(async () => {
    if (isFetching.current || modeRef.current === "blunders") return;
    isFetching.current = true;
    try {
      const data = await getPuzzleRecommendations(username);
      const theme = activeThemeRef.current;
      const source = modeRef.current === "weakness" ? data.puzzles : (data.randomPuzzles ?? []);
      const newPuzzles: TrainerPuzzle[] = [];
      for (const p of source) {
        if (theme && !p.themes.includes(theme)) continue;
        const tp = lichessPuzzleToTrainer(p);
        if (!seenIds.current.has(tp.id)) {
          newPuzzles.push(tp);
          seenIds.current.add(tp.id);
        }
      }
      if (newPuzzles.length > 0) {
        setPuzzleQueue((q) => [...q, ...newPuzzles]);
      }
    } catch { /* silent */ } finally {
      isFetching.current = false;
    }
  }, [username]);

  // Trigger prefetch when approaching end of queue
  useEffect(() => {
    if (puzzleQueue.length > 0 && currentIndex >= puzzleQueue.length - PREFETCH_THRESHOLD) {
      fetchMore();
    }
  }, [currentIndex, puzzleQueue.length, fetchMore]);

  // Warm the good-moves cache for the next few puzzles in the background
  useEffect(() => {
    if (puzzleQueue.length === 0) return;
    for (let i = currentIndex + 1; i <= currentIndex + GOOD_MOVES_PREFETCH && i < puzzleQueue.length; i++) {
      const fen = getPuzzleActiveFen(puzzleQueue[i]);
      if (fen) warmGoodMovesCache(fen);
    }
  }, [currentIndex, puzzleQueue]);

  const handleThemeFilter = useCallback((theme: string | null) => {
    activeThemeRef.current = theme;
    setActiveTheme(theme);
    if (recommendation) buildQueue(recommendation, theme, modeRef.current);
  }, [recommendation, buildQueue]);

  const handleModeChange = useCallback((newMode: PuzzleMode) => {
    modeRef.current = newMode;
    setMode(newMode);
    activeThemeRef.current = null;
    setActiveTheme(null);
    setRatingChange(null);
    if (recommendation) buildQueue(recommendation, null, newMode);
  }, [recommendation, buildQueue]);

  const handleSelectMode = useCallback((newMode: PuzzleMode) => {
    handleModeChange(newMode);
    setModeSelected(true);
  }, [handleModeChange]);

  const currentPuzzle = puzzleQueue[currentIndex] ?? null;

  const handleSolved = useCallback((attempts: number, timeSeconds: number) => {
    setSessionSolved((s) => s + 1);
    setSessionTotal((s) => s + 1);
    setStreak((s) => s + 1);
    if (currentPuzzle) {
      const id = currentPuzzle.id.replace(/^(lichess-|blunder-)/, "");
      recordPuzzleAttempt(id, username, true, attempts, timeSeconds, currentPuzzle.rating)
        .then((result) => {
          if (result) {
            setPlayerRating(result.newRating);
            setRatingChange(result.ratingChange);
          }
        }).catch(() => {});
    }
  }, [currentPuzzle, username]);

  const handleFailed = useCallback((attempts: number, timeSeconds: number) => {
    setSessionTotal((s) => s + 1);
    setStreak(0);
    if (currentPuzzle) {
      const id = currentPuzzle.id.replace(/^(lichess-|blunder-)/, "");
      recordPuzzleAttempt(id, username, false, attempts, timeSeconds, currentPuzzle.rating)
        .then((result) => {
          if (result) {
            setPlayerRating(result.newRating);
            setRatingChange(result.ratingChange);
          }
        }).catch(() => {});
    }
  }, [currentPuzzle, username]);

  const handleNext = useCallback(() => {
    setRatingChange(null);
    setCurrentIndex((i) => Math.min(i + 1, puzzleQueue.length - 1));
  }, [puzzleQueue.length]);


  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[var(--text-2)]">Loading your puzzle recommendations…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <p className="text-[var(--loss)]">{error}</p>
        </div>
      </div>
    );
  }

  if (puzzleQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <p className="text-[var(--text-2)] text-lg mb-1">No puzzles available yet</p>
            <p className="text-sm text-[var(--text-3)]">Analyze some games first to generate personalized puzzles.</p>
          </div>
        </div>
      </div>
    );
  }

  const hasBlunders = (recommendation?.ownBlunderPuzzles?.length ?? 0) > 0;

  if (!modeSelected) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh] px-4">
          <div className="w-full max-w-2xl">
            <h1 className="text-2xl font-black text-white text-center mb-2">Puzzle Training</h1>
            <p className="text-[var(--text-3)] text-center text-sm mb-10">Choose how you want to train</p>
            <div className="grid grid-cols-1 gap-4">

              {/* Random */}
              <button
                onClick={() => handleSelectMode("random")}
                className="group text-left bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] hover:border-[var(--gold)] rounded-2xl p-6 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[var(--gold)]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--gold)]/30 transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f6c700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold text-white">Random Puzzles</h2>
                      <span className="text-[10px] font-bold text-[var(--gold)] bg-[var(--gold)]/15 px-2 py-0.5 rounded-full uppercase tracking-wide">Rated</span>
                    </div>
                    <p className="text-sm text-[var(--text-3)]">Classic puzzle training. Solve random positions and build your rating.</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-black text-white">{playerRating.toLocaleString()}</div>
                    <div className="text-[11px] text-[var(--text-3)]">your rating</div>
                  </div>
                </div>
              </button>

              {/* Weak Spots */}
              <button
                onClick={() => handleSelectMode("weakness")}
                className="group text-left bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] hover:border-[#e07a40] rounded-2xl p-6 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#e28c28]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#e28c28]/30 transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e07a40" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold text-white">Weak Spots</h2>
                      <span className="text-[10px] font-bold text-[#e28c28] bg-[#e28c28]/15 px-2 py-0.5 rounded-full uppercase tracking-wide">Rated</span>
                    </div>
                    <p className="text-sm text-[var(--text-3)]">Puzzles matched to the tactical patterns you miss most in your games.</p>
                    {recommendation?.weaknesses?.[0] && (
                      <p className="text-xs text-[#e28c28] mt-1.5">Top weakness: {recommendation.weaknesses[0].theme} ({recommendation.weaknesses[0].percentage}%)</p>
                    )}
                  </div>
                </div>
              </button>

              {/* Blunders */}
              {hasBlunders && (
                <button
                  onClick={() => handleSelectMode("blunders")}
                  className="group text-left bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] hover:border-[var(--loss)] rounded-2xl p-6 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[var(--loss)]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--loss)]/30 transition-colors">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ca3431" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-bold text-white">My Blunders</h2>
                        <span className="text-[10px] font-bold text-[var(--loss)] bg-[var(--loss)]/15 px-2 py-0.5 rounded-full uppercase tracking-wide">Rated</span>
                      </div>
                      <p className="text-sm text-[var(--text-3)]">Replay the exact positions from your own games where you made a mistake.</p>
                      <p className="text-xs text-[var(--loss)] mt-1.5">{recommendation?.ownBlunderPuzzles?.length} positions from your games</p>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-[var(--bg)] text-[var(--text-1)] overflow-hidden">
      <Header username={username} />
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        {currentPuzzle && (
          <PuzzleBoard
            key={currentPuzzle.id}
            puzzle={currentPuzzle}
            sessionSolved={sessionSolved}
            sessionTotal={sessionTotal}
            streak={streak}
            puzzleIndex={currentIndex}
            totalPuzzles={puzzleQueue.length}
            onSolved={handleSolved}
            onFailed={handleFailed}
            onNext={handleNext}
            onSkip={handleNext}
            weaknesses={recommendation?.weaknesses}
            activeTheme={activeTheme}
            onThemeClick={handleThemeFilter}
            mode={mode}
            onModeChange={() => setModeSelected(false)}
            hasBlunderPuzzles={(recommendation?.ownBlunderPuzzles?.length ?? 0) > 0}
            playerRating={playerRating}
            ratingChange={ratingChange}
            username={username}
          />
        )}
      </div>
    </div>
  );
}
