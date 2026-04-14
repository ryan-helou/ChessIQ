"use client";

const TC_ICON: Record<string, string> = {
  bullet: "⚡",
  blitz:  "⏱",
  rapid:  "🐢",
  daily:  "📅",
};

const TC_COLOR: Record<string, string> = {
  bullet: "#ca3431",
  blitz:  "#f6c700",
  rapid:  "#81b64c",
  daily:  "#5d8fbb",
};

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  delay?: number;
}

function StatCard({ label, value, sub, accent, delay = 0 }: StatCardProps) {
  return (
    <div
      className="animate-fade-up"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "16px 18px",
        animationDelay: `${delay}s`,
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-3)",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          lineHeight: 1,
          color: accent || "var(--text-1)",
          marginBottom: sub ? "5px" : 0,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

interface RatingCardProps {
  timeClass: string;
  current: number;
  best: number;
  delay?: number;
}

function RatingCard({ timeClass, current, best, delay = 0 }: RatingCardProps) {
  const color = TC_COLOR[timeClass] || "var(--text-2)";
  const icon = TC_ICON[timeClass] || "♟";
  const label = timeClass.charAt(0).toUpperCase() + timeClass.slice(1);

  return (
    <div
      className="animate-fade-up"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "16px 18px",
        animationDelay: `${delay}s`,
        borderTop: `2px solid ${color}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        <span style={{ fontSize: "14px" }}>{icon}</span>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: "30px", fontWeight: 700, lineHeight: 1, color: "var(--text-1)", marginBottom: "4px" }}>
        {current}
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
        Peak {best}
      </div>
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
  puzzleRating?: number;
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
  puzzleRating,
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "8px" }}>
      <StatCard
        label="Games Played"
        value={totalGames.toLocaleString()}
        sub={periodLabel}
        delay={0}
      />
      <StatCard
        label="Win Rate"
        value={`${winRate.toFixed(1)}%`}
        accent={winAccent}
        delay={0.04}
      />
      <StatCard
        label="Avg Accuracy"
        value={avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"}
        accent={avgAccuracy ? "var(--gold)" : undefined}
        delay={0.08}
      />
      <StatCard
        label="Current Streak"
        value={streakLabel}
        sub={`Best ${bestWinStreak}W · Worst ${worstLossStreak}L`}
        accent={streakAccent}
        delay={0.12}
      />
      {ratings.map((r, i) => (
        <RatingCard
          key={r.timeClass}
          timeClass={r.timeClass}
          current={r.current}
          best={r.best}
          delay={0.16 + i * 0.04}
        />
      ))}
      {puzzleRating != null && (
        <StatCard
          label="Puzzle Rating"
          value={puzzleRating.toLocaleString()}
          sub="Tactics"
          accent="#26c9c3"
          delay={0.16 + ratings.length * 0.04}
        />
      )}
    </div>
  );
}
