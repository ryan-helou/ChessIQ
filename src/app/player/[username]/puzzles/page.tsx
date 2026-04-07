"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import PuzzleBoard from "@/components/puzzle-trainer/PuzzleBoard";
import PuzzleSidebar from "@/components/puzzle-trainer/PuzzleSidebar";
import WeaknessChart from "@/components/puzzle-trainer/WeaknessChart";
import {
  getPuzzleRecommendations,
  recordPuzzleAttempt,
  lichessPuzzleToTrainer,
  blunderPuzzleToTrainer,
  type PuzzleRecommendation,
  type TrainerPuzzle,
  type PuzzleStats,
} from "@/lib/puzzle-api";

export default function PuzzlesPage() {
  const params = useParams();
  const username = params.username as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<PuzzleRecommendation | null>(null);

  // Puzzle trainer state
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [puzzleQueue, setPuzzleQueue] = useState<TrainerPuzzle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionSolved, setSessionSolved] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [streak, setStreak] = useState(0);

  // Fetch recommendations
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPuzzleRecommendations(username);
        setRecommendation(data);
        buildQueue(data, null);
      } catch (err: any) {
        setError(err.message || "Failed to load puzzles");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  const buildQueue = useCallback(
    (data: PuzzleRecommendation, themeFilter: string | null) => {
      const trainerPuzzles: TrainerPuzzle[] = [];

      // Add own-blunder puzzles first (most personalized)
      for (const bp of data.ownBlunderPuzzles) {
        if (themeFilter && bp.theme !== themeFilter) continue;
        trainerPuzzles.push(blunderPuzzleToTrainer(bp));
      }

      // Add Lichess puzzles
      for (const p of data.puzzles) {
        if (themeFilter && !p.themes.includes(themeFilter)) continue;
        trainerPuzzles.push(lichessPuzzleToTrainer(p));
      }

      setPuzzleQueue(trainerPuzzles);
      setCurrentIndex(0);
      setSessionSolved(0);
      setSessionTotal(0);
      setStreak(0);
    },
    []
  );

  const handleThemeFilter = useCallback(
    (theme: string | null) => {
      setActiveTheme(theme);
      if (recommendation) {
        buildQueue(recommendation, theme);
      }
    },
    [recommendation, buildQueue]
  );

  const currentPuzzle = puzzleQueue[currentIndex] ?? null;

  const handleSolved = useCallback(
    (attempts: number, timeSeconds: number) => {
      setSessionSolved((s) => s + 1);
      setSessionTotal((s) => s + 1);
      setStreak((s) => s + 1);

      // Record attempt in backend
      if (currentPuzzle) {
        const puzzleId = currentPuzzle.id.replace(/^(lichess-|blunder-)/, "");
        recordPuzzleAttempt(puzzleId, username, true, attempts, timeSeconds).catch(() => {});
      }
    },
    [currentPuzzle, username]
  );

  const handleFailed = useCallback(
    (attempts: number, timeSeconds: number) => {
      setSessionTotal((s) => s + 1);
      setStreak(0);

      if (currentPuzzle) {
        const puzzleId = currentPuzzle.id.replace(/^(lichess-|blunder-)/, "");
        recordPuzzleAttempt(puzzleId, username, false, attempts, timeSeconds).catch(() => {});
      }
    },
    [currentPuzzle, username]
  );

  const handleNext = useCallback(() => {
    if (currentIndex < puzzleQueue.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, puzzleQueue.length]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleHint = useCallback(() => {
    // Hint is handled inside PuzzleBoard — this is a placeholder
    // for future enhancement (e.g., show theme info)
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#81b64c] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[#989795]">Loading your puzzle recommendations...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <p className="text-[#ca3431] mb-2">Failed to load puzzles</p>
            <p className="text-sm text-[#989795]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No puzzles available
  if (puzzleQueue.length === 0) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
        <Header username={username} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {recommendation && recommendation.weaknesses.length > 0 && (
            <WeaknessChart
              weaknesses={recommendation.weaknesses}
              activeTheme={activeTheme}
              onThemeClick={handleThemeFilter}
            />
          )}
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <p className="text-[#989795] text-lg mb-2">No puzzles available yet</p>
              <p className="text-sm text-[#706e6b]">
                Analyze some games first to generate personalized puzzles based on your blunders.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#312e2b] text-[#e8e6e1]">
      <Header username={username} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Page header */}
        <div className="mb-4">
          <h1 className="text-lg font-bold text-white">Puzzle Trainer</h1>
          <p className="text-sm text-[#989795]">
            Puzzles based on your tactical weaknesses
            {recommendation && recommendation.totalBlunders > 0 && (
              <> &middot; {recommendation.totalBlunders} blunders analyzed</>
            )}
          </p>
        </div>

        {/* Weakness chart */}
        {recommendation && recommendation.weaknesses.length > 0 && (
          <div className="mb-4">
            <WeaknessChart
              weaknesses={recommendation.weaknesses}
              activeTheme={activeTheme}
              onThemeClick={handleThemeFilter}
            />
          </div>
        )}

        {/* Puzzle trainer area */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          {/* Board */}
          <div className="shrink-0">
            {currentPuzzle && (
              <PuzzleBoard
                key={currentPuzzle.id}
                puzzle={currentPuzzle}
                onSolved={handleSolved}
                onFailed={handleFailed}
                onNext={handleNext}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="flex-1 min-w-0 lg:max-w-[300px]">
            <PuzzleSidebar
              puzzle={currentPuzzle}
              puzzleIndex={currentIndex}
              totalPuzzles={puzzleQueue.length}
              sessionSolved={sessionSolved}
              sessionTotal={sessionTotal}
              streak={streak}
              stats={recommendation?.stats ?? null}
              onHint={handleHint}
              onSkip={handleSkip}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
