"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  mono?: boolean;
  delay?: number;
}

function StatCard({ label, value, sub, accent, mono, delay = 0 }: StatCardProps) {
  return (
    <div
      className="card animate-fade-up"
      style={{
        padding: "20px 22px",
        position: "relative",
        overflow: "hidden",
        animationDelay: `${delay}s`,
      }}
    >
      {/* Left accent bar */}
      <div
        style={{
          position: "absolute",
          left: 0, top: "20%", bottom: "20%",
          width: "2px",
          background: accent || "var(--border-strong)",
          borderRadius: "0 1px 1px 0",
          opacity: accent ? 0.7 : 0.3,
        }}
      />
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          fontFamily: "var(--font-mono)",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "26px",
          fontWeight: 700,
          lineHeight: 1,
          color: accent || "var(--text-1)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-display)",
          letterSpacing: mono ? "0.02em" : "-0.01em",
          marginBottom: sub ? "6px" : 0,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
          {sub}
        </div>
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
  const streakAccent =
    currentStreak.type === "win" ? "var(--win)" :
    currentStreak.type === "loss" ? "var(--loss)" :
    "var(--draw)";

  const streakLabel =
    currentStreak.type === "win" ? `${currentStreak.count}W` :
    currentStreak.type === "loss" ? `${currentStreak.count}L` :
    `${currentStreak.count}D`;

  const winAccent = winRate >= 50 ? "var(--win)" : "var(--loss)";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
      <StatCard
        label="Games"
        value={totalGames.toLocaleString()}
        sub={periodLabel}
        mono
        delay={0}
      />
      <StatCard
        label="Win Rate"
        value={`${winRate.toFixed(1)}%`}
        accent={winAccent}
        delay={0.05}
      />
      <StatCard
        label="Avg Accuracy"
        value={avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"}
        accent={avgAccuracy ? "var(--gold)" : undefined}
        delay={0.1}
      />
      <StatCard
        label="Streak"
        value={streakLabel}
        sub={`Best ${bestWinStreak}W · Worst ${worstLossStreak}L`}
        accent={streakAccent}
        delay={0.15}
      />
      {ratings.map((r, i) => (
        <StatCard
          key={r.timeClass}
          label={`${r.timeClass.charAt(0).toUpperCase() + r.timeClass.slice(1)}`}
          value={r.current}
          sub={`Peak ${r.best}`}
          mono
          delay={0.2 + i * 0.05}
        />
      ))}
    </div>
  );
}
