"use client";

import type { TimeControlStats } from "@/lib/game-analysis";

const TIME_CLASS_COLORS: Record<string, string> = {
  bullet: "text-red-400",
  blitz: "text-amber-400",
  rapid: "text-blue-400",
  daily: "text-purple-400",
};

const TIME_CLASS_BORDERS: Record<string, string> = {
  bullet: "border-red-400/20 bg-red-400/5",
  blitz: "border-amber-400/20 bg-amber-400/5",
  rapid: "border-blue-400/20 bg-blue-400/5",
  daily: "border-purple-400/20 bg-purple-400/5",
};

interface TimeControlCardProps {
  timeClass: string;
  games: number;
  winRate: number;
  avgAccuracy: number | null;
  currentRating: number;
  bestRating: number;
}

function TimeControlCard({
  timeClass,
  games,
  winRate,
  avgAccuracy,
  currentRating,
  bestRating,
}: TimeControlCardProps) {
  const winRateColor =
    winRate >= 50 ? "text-emerald-400" : winRate >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <div
      className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm transition-all hover:border-slate-600/50 ${TIME_CLASS_BORDERS[timeClass] || ""}`}
    >
      <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${TIME_CLASS_COLORS[timeClass] || "text-white"}`}>
        {timeClass.charAt(0).toUpperCase() + timeClass.slice(1)}
      </div>

      <div className="space-y-2.5">
        {/* Games */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">Games</span>
          <span className="text-sm font-semibold text-slate-50">{games}</span>
        </div>

        {/* Win Rate */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">Win Rate</span>
          <span className={`text-sm font-semibold ${winRateColor}`}>{winRate.toFixed(1)}%</span>
        </div>

        {/* Accuracy */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">Accuracy</span>
          <span className="text-sm font-semibold text-blue-400">
            {avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"}
          </span>
        </div>

        {/* Rating */}
        <div className="pt-1 border-t border-slate-700/30">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-slate-400">Current</span>
            <span className="text-sm font-semibold text-white">{currentRating}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Best</span>
            <span className="text-sm font-semibold text-emerald-400">{bestRating}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  timeControlStats: TimeControlStats[];
}

export default function TimeControlBreakdown({ timeControlStats }: Props) {
  // Sort to ensure consistent order: bullet, blitz, rapid, daily
  const ordered = ["bullet", "blitz", "rapid", "daily"];
  const sorted = timeControlStats.sort(
    (a, b) => ordered.indexOf(a.timeClass) - ordered.indexOf(b.timeClass)
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {sorted.map((tc) => (
        <TimeControlCard
          key={tc.timeClass}
          timeClass={tc.timeClass}
          games={tc.games}
          winRate={tc.winRate}
          avgAccuracy={tc.avgAccuracy}
          currentRating={tc.currentRating}
          bestRating={tc.bestRating}
        />
      ))}
    </div>
  );
}
