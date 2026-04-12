"use client";

import type { TimeControlStats } from "@/lib/game-analysis";

const TC_ACCENT: Record<string, string> = {
  bullet: "var(--loss)",
  blitz:  "var(--gold)",
  rapid:  "var(--win)",
  daily:  "var(--blue)",
};

function winColor(rate: number) {
  return rate >= 50 ? "var(--win)" : rate >= 40 ? "var(--gold)" : "var(--loss)";
}

interface TimeControlCardProps {
  timeClass: string;
  games: number;
  winRate: number;
  avgAccuracy: number | null;
  currentRating: number;
  bestRating: number;
}

function TimeControlCard({ timeClass, games, winRate, avgAccuracy, currentRating, bestRating }: TimeControlCardProps) {
  const accent = TC_ACCENT[timeClass] || "var(--text-2)";

  return (
    <div className="card" style={{ padding: "18px", borderLeft: `2px solid ${accent}` }}>
      <div style={{
        fontSize: "10px",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: accent,
        fontWeight: 700,
        marginBottom: "12px",
      }}>
        {timeClass}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Games</span>
          <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-1)" }}>{games}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Win Rate</span>
          <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: winColor(winRate) }}>{winRate.toFixed(1)}%</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Accuracy</span>
          <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 600, color: avgAccuracy ? "var(--gold)" : "var(--text-3)" }}>
            {avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"}
          </span>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Current</span>
            <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-1)" }}>{currentRating}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Best</span>
            <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--gold)" }}>{bestRating}</span>
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
  const sorted = [...timeControlStats].sort(
    (a, b) => ordered.indexOf(a.timeClass) - ordered.indexOf(b.timeClass)
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
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
