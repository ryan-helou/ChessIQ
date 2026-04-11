"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import PuzzleBoard from "@/components/puzzle-trainer/PuzzleBoard";
import {
  getPuzzleRecommendations,
  recordPuzzleAttempt,
  lichessPuzzleToTrainer,
  blunderPuzzleToTrainer,
  type PuzzleRecommendation,
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
  const [sourceFilter, setSourceFilter] = useState<"all" | "blunders" | "lichess">("all");

  const seenIds = useRef(new Set<string>());
  const isFetching = useRef(false);
  const activeThemeRef = useRef<string | null>(null);
  const sourceFilterRef = useRef<"all" | "blunders" | "lichess">("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPuzzleRecommendations(username);
        setRecommendation(data);
        buildQueue(data, null, "all");
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
    source: "all" | "blunders" | "lichess" = "all",
  ) => {
    seenIds.current.clear();
    const queue: TrainerPuzzle[] = [];
    if (source !== "lichess") {
      for (const bp of data.ownBlunderPuzzles) {
        if (themeFilter && bp.theme !== themeFilter) continue;
        const tp = blunderPuzzleToTrainer(bp);
        queue.push(tp);
        seenIds.current.add(tp.id);
      }
    }
    if (source !== "blunders") {
      for (const p of data.puzzles) {
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
    if (isFetching.current) return;
    isFetching.current = true;
    try {
      const data = await getPuzzleRecommendations(username);
      const theme = activeThemeRef.current;
      const newPuzzles: TrainerPuzzle[] = [];
      for (const p of data.puzzles) {
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
    if (recommendation) buildQueue(recommendation, theme, sourceFilterRef.current);
  }, [recommendation, buildQueue]);

  const handleSourceFilter = useCallback((source: "all" | "blunders" | "lichess") => {
    sourceFilterRef.current = source;
    setSourceFilter(source);
    if (recommendation) buildQueue(recommendation, activeThemeRef.current, source);
  }, [recommendation, buildQueue]);

  const currentPuzzle = puzzleQueue[currentIndex] ?? null;

  const handleSolved = useCallback((attempts: number, timeSeconds: number) => {
    setSessionSolved((s) => s + 1);
    setSessionTotal((s) => s + 1);
    setStreak((s) => s + 1);
    if (currentPuzzle) {
      const id = currentPuzzle.id.replace(/^(lichess-|blunder-)/, "");
      recordPuzzleAttempt(id, username, true, attempts, timeSeconds).catch(() => {});
    }
  }, [currentPuzzle, username]);

  const handleFailed = useCallback((attempts: number, timeSeconds: number) => {
    setSessionTotal((s) => s + 1);
    setStreak(0);
    if (currentPuzzle) {
      const id = currentPuzzle.id.replace(/^(lichess-|blunder-)/, "");
      recordPuzzleAttempt(id, username, false, attempts, timeSeconds).catch(() => {});
    }
  }, [currentPuzzle, username]);

  const handleNext = useCallback(() => {
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

  return (
    <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
      <Header username={username} />
      <div className="max-w-5xl mx-auto px-4 py-4">
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
            sourceFilter={sourceFilter}
            onSourceFilter={handleSourceFilter}
            hasBlunderPuzzles={(recommendation?.ownBlunderPuzzles?.length ?? 0) > 0}
            username={username}
          />
        )}
      </div>
    </div>
  );
}
