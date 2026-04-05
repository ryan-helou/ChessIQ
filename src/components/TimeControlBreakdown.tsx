"use client";

import type { TimeControlStats } from "@/lib/game-analysis";

const TIME_CLASS_COLORS: Record<string, string> = {
  bullet: "text-[#e62929]",
  blitz: "text-[#e6a117]",
  rapid: "text-[#81b64c]",
  daily: "text-[#8b5cf6]",
};

const TIME_CLASS_BORDERS: Record<string, string> = {
  bullet: "border-[#e62929]/20 bg-[#e62929]/5",
  blitz: "border-[#e6a117]/20 bg-[#e6a117]/5",
  rapid: "border-[#81b64c]/20 bg-[#81b64c]/5",
  daily: "border-[#8b5cf6]/20 bg-[#8b5cf6]/5",
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
    winRate >= 50 ? "text-[#81b64c]" : winRate >= 40 ? "text-[#e6a117]" : "text-[#e62929]";

  return (
    <div
      className={`bg-[#262522] border border-[#3a3835] rounded-xl p-5 transition-all hover:border-[#3a3835] ${TIME_CLASS_BORDERS[timeClass] || ""}`}
    >
      <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${TIME_CLASS_COLORS[timeClass] || "text-white"}`}>
        {timeClass.charAt(0).toUpperCase() + timeClass.slice(1)}
      </div>

      <div className="space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#989795]">Games</span>
          <span className="text-sm font-semibold text-white">{games}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-[#989795]">Win Rate</span>
          <span className={`text-sm font-semibold ${winRateColor}`}>{winRate.toFixed(1)}%</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-[#989795]">Accuracy</span>
          <span className="text-sm font-semibold text-[#81b64c]">
            {avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"}
          </span>
        </div>

        <div className="pt-1 border-t border-[#3a3835]">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-[#989795]">Current</span>
            <span className="text-sm font-semibold text-white">{currentRating}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#989795]">Best</span>
            <span className="text-sm font-semibold text-[#81b64c]">{bestRating}</span>
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
