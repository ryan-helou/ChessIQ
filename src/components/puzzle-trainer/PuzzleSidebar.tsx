"use client";

import type { TrainerPuzzle, PuzzleStats } from "@/lib/puzzle-api";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

interface Props {
  puzzle: TrainerPuzzle | null;
  puzzleIndex: number;
  totalPuzzles: number;
  sessionSolved: number;
  sessionTotal: number;
  streak: number;
  stats: PuzzleStats | null;
  onHint: () => void;
  onSkip: () => void;
}

export default function PuzzleSidebar({
  puzzle,
  puzzleIndex,
  totalPuzzles,
  sessionSolved,
  sessionTotal,
  streak,
  stats,
  onHint,
  onSkip,
}: Props) {
  const mainTheme = puzzle?.themes[0] ?? null;
  const themeLabel = mainTheme ? THEME_LABELS[mainTheme] ?? mainTheme : "—";
  const themeColor = mainTheme ? THEME_COLORS[mainTheme] ?? "#989795" : "#989795";

  return (
    <div className="bg-[#262522] rounded-xl overflow-hidden flex flex-col h-full">
      {/* Puzzle info header */}
      <div className="px-5 py-4 border-b border-[#3a3835]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[#989795] uppercase tracking-wider font-bold">
            Puzzle {puzzleIndex + 1} of {totalPuzzles}
          </span>
          {puzzle?.rating && (
            <span className="text-xs text-[#989795]">
              Rating: <span className="text-white font-bold">{puzzle.rating}</span>
            </span>
          )}
        </div>

        {/* Theme badge */}
        {mainTheme && (
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: themeColor }}
            >
              {themeLabel}
            </span>
            {puzzle?.themes.slice(1, 3).map((t) => (
              <span
                key={t}
                className="text-xs text-[#989795] bg-[#3a3835] px-2 py-0.5 rounded-full"
              >
                {THEME_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        )}

        {/* Source */}
        <div className="text-xs text-[#706e6b]">{puzzle?.sourceLabel ?? "—"}</div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex gap-2 border-b border-[#3a3835]">
        <button
          onClick={onHint}
          className="flex-1 px-3 py-2 bg-[#3a3835] hover:bg-[#4a4845] text-[#e8e6e1] text-sm rounded-lg transition-colors"
        >
          Hint
        </button>
        <button
          onClick={onSkip}
          className="flex-1 px-3 py-2 bg-[#3a3835] hover:bg-[#4a4845] text-[#989795] text-sm rounded-lg transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Session stats */}
      <div className="px-5 py-4 flex-1">
        <h3 className="text-xs text-[#989795] uppercase tracking-wider font-bold mb-3">
          Session
        </h3>
        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#989795]">Solved</span>
            <span className="text-sm font-bold text-white">
              {sessionSolved} / {sessionTotal}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#989795]">Streak</span>
            <span className={`text-sm font-bold ${streak > 0 ? "text-[#96bc4b]" : "text-white"}`}>
              {streak}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#989795]">Accuracy</span>
            <span className="text-sm font-bold text-white">
              {sessionTotal > 0 ? `${Math.round((sessionSolved / sessionTotal) * 100)}%` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Overall stats */}
      {stats && stats.totalAttempted > 0 && (
        <div className="px-5 py-4 border-t border-[#3a3835]">
          <h3 className="text-xs text-[#989795] uppercase tracking-wider font-bold mb-3">
            All Time
          </h3>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#989795]">Puzzles Solved</span>
              <span className="text-sm font-bold text-white">
                {stats.totalSolved} / {stats.totalAttempted}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#989795]">Solve Rate</span>
              <span className="text-sm font-bold text-[#96bc4b]">
                {stats.solveRate}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
