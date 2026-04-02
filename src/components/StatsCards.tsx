"use client";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
  icon?: string;
}

function StatCard({ title, value, subtitle, color = "text-white" }: StatCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
        {title}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && (
        <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
      )}
    </div>
  );
}

interface Props {
  totalGames: number;
  winRate: number;
  avgAccuracy: number | null;
  currentStreak: { type: string; count: number };
  bestWinStreak: number;
  worstLossStreak: number;
  ratings: { timeClass: string; current: number; best: number }[];
}

export default function StatsCards({
  totalGames,
  winRate,
  avgAccuracy,
  currentStreak,
  bestWinStreak,
  worstLossStreak,
  ratings,
}: Props) {
  const streakColor =
    currentStreak.type === "win"
      ? "text-emerald-400"
      : currentStreak.type === "loss"
      ? "text-red-400"
      : "text-slate-400";

  const streakLabel =
    currentStreak.type === "win"
      ? `${currentStreak.count}W`
      : currentStreak.type === "loss"
      ? `${currentStreak.count}L`
      : `${currentStreak.count}D`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        title="Games Analyzed"
        value={totalGames}
        subtitle="Last 6 months"
      />
      <StatCard
        title="Win Rate"
        value={`${winRate.toFixed(1)}%`}
        color={winRate >= 50 ? "text-emerald-400" : "text-red-400"}
      />
      <StatCard
        title="Avg Accuracy"
        value={avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "N/A"}
        color="text-blue-400"
      />
      <StatCard
        title="Current Streak"
        value={streakLabel}
        color={streakColor}
        subtitle={`Best: ${bestWinStreak}W | Worst: ${worstLossStreak}L`}
      />
      {ratings.map((r) => (
        <StatCard
          key={r.timeClass}
          title={`${r.timeClass.charAt(0).toUpperCase() + r.timeClass.slice(1)} Rating`}
          value={r.current}
          subtitle={`Peak: ${r.best}`}
          color="text-white"
        />
      ))}
    </div>
  );
}
