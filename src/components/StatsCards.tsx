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
    <div className="bg-[#262522] border border-[#3a3835] rounded-xl p-5">
      <div className="text-xs font-medium text-[#989795] uppercase tracking-wider mb-1">
        {title}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {subtitle && (
        <div className="text-xs text-[#706e6b] mt-1">{subtitle}</div>
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
  periodLabel?: string;
}

export default function StatsCards({
  totalGames,
  winRate,
  avgAccuracy,
  currentStreak,
  bestWinStreak,
  worstLossStreak,
  ratings,
  periodLabel = "Last 6 months",
}: Props) {
  const streakColor =
    currentStreak.type === "win"
      ? "text-[#81b64c]"
      : currentStreak.type === "loss"
      ? "text-[#e62929]"
      : "text-[#989795]";

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
        subtitle={periodLabel}
      />
      <StatCard
        title="Win Rate"
        value={`${winRate.toFixed(1)}%`}
        color={winRate >= 50 ? "text-[#81b64c]" : "text-[#e62929]"}
      />
      <StatCard
        title="Avg Accuracy"
        value={avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "N/A"}
        color="text-[#81b64c]"
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
