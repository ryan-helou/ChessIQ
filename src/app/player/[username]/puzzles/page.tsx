"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
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
        const defaultMode: PuzzleMode = data.ownBlunderPuzzles.length > 0 ? "blunders" : "random";
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
    const queue: TrainerPuzzle[] = [];
    if (puzzleMode === "blunders") {
      for (const bp of data.ownBlunderPuzzles) {
        if (themeFilter && bp.theme !== themeFilter) continue;
        const tp = blunderPuzzleToTrainer(bp);
        queue.push(tp);
        seenIds.current.add(tp.id);
      }
    } else if (puzzleMode === "weakness") {
      for (const p of data.puzzles) {
        if (themeFilter && !p.themes.includes(themeFilter)) continue;
        const tp = lichessPuzzleToTrainer(p);
        queue.push(tp);
        seenIds.current.add(tp.id);
      }
    } else {
      for (const p of data.randomPuzzles ?? []) {
        if (themeFilter && !p.themes.includes(themeFilter)) continue;
        const tp = lichessPuzzleToTrainer(p);
        queue.push(tp);
        seenIds.current.add(tp.id);
      }
    }
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
      recordPuzzleAttempt(id, username, true, attempts, timeSeconds, mode !== "blunders" ? currentPuzzle.rating : null)
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
      recordPuzzleAttempt(id, username, false, attempts, timeSeconds, mode !== "blunders" ? currentPuzzle.rating : null)
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
      <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#81b64c] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#989795]">Loading your puzzle recommendations…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <p className="text-[#ca3431]">{error}</p>
        </div>
      </div>
    );
  }

  if (puzzleQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <p className="text-[#989795] text-lg mb-1">No puzzles available yet</p>
            <p className="text-sm text-[#706e6b]">Analyze some games first to generate personalized puzzles.</p>
          </div>
        </div>
      </div>
    );
  }

  const hasBlunders = (recommendation?.ownBlunderPuzzles?.length ?? 0) > 0;

  if (!modeSelected) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh] px-4">
          <div className="w-full max-w-2xl">
            <h1 className="text-2xl font-black text-white text-center mb-2">Puzzle Training</h1>
            <p className="text-[#706e6b] text-center text-sm mb-10">Choose how you want to train</p>
            <div className="grid grid-cols-1 gap-4">

              {/* Random */}
              <button
                onClick={() => handleSelectMode("random")}
                className="group text-left bg-[#262522] hover:bg-[#2e2b28] border border-[#3a3835] hover:border-[#81b64c] rounded-2xl p-6 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#81b64c]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#81b64c]/30 transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#81b64c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold text-white">Random Puzzles</h2>
                      <span className="text-[10px] font-bold text-[#81b64c] bg-[#81b64c]/15 px-2 py-0.5 rounded-full uppercase tracking-wide">Rated</span>
                    </div>
                    <p className="text-sm text-[#706e6b]">Classic puzzle training. Solve random positions and build your rating.</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-black text-white">{playerRating.toLocaleString()}</div>
                    <div className="text-[11px] text-[#706e6b]">your rating</div>
                  </div>
                </div>
              </button>

              {/* Weak Spots */}
              <button
                onClick={() => handleSelectMode("weakness")}
                className="group text-left bg-[#262522] hover:bg-[#2e2b28] border border-[#3a3835] hover:border-[#e28c28] rounded-2xl p-6 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#e28c28]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#e28c28]/30 transition-colors">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e28c28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-bold text-white">Weak Spots</h2>
                      <span className="text-[10px] font-bold text-[#e28c28] bg-[#e28c28]/15 px-2 py-0.5 rounded-full uppercase tracking-wide">Rated</span>
                    </div>
                    <p className="text-sm text-[#706e6b]">Puzzles matched to the tactical patterns you miss most in your games.</p>
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
                  className="group text-left bg-[#262522] hover:bg-[#2e2b28] border border-[#3a3835] hover:border-[#ca3431] rounded-2xl p-6 transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#ca3431]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[#ca3431]/30 transition-colors">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ca3431" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-bold text-white">My Blunders</h2>
                        <span className="text-[10px] font-bold text-[#706e6b] bg-[#2a2826] px-2 py-0.5 rounded-full uppercase tracking-wide">Unrated</span>
                      </div>
                      <p className="text-sm text-[#706e6b]">Replay the exact positions from your own games where you made a mistake. No rating impact.</p>
                      <p className="text-xs text-[#ca3431] mt-1.5">{recommendation?.ownBlunderPuzzles?.length} positions from your games</p>
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
    <div className="h-dvh flex flex-col bg-[#312e2b] text-[#e8e6e1] overflow-hidden">
      <Header username={username} />
      <div className="flex-1 min-h-0 max-w-5xl w-full mx-auto px-4 py-4 flex flex-col">
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
