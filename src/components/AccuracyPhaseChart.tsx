"use client";

import { useEffect, useState } from "react";

interface PhaseStats {
  avg: number;
  count: number;
}

interface PhaseAccuracyData {
  opening: PhaseStats | null;
  middlegame: PhaseStats | null;
  endgame: PhaseStats | null;
}

interface Props {
  username: string;
}

function phaseColor(avg: number): string {
  if (avg >= 85) return "var(--win)";
  if (avg >= 70) return "var(--gold)";
  return "var(--loss)";
}

function PhaseBar({ label, stats, maxAvg }: { label: string; stats: PhaseStats | null; maxAvg: number }) {
  if (!stats) return null;
  const color = phaseColor(stats.avg);
  const barPct = maxAvg > 0 ? (stats.avg / maxAvg) * 100 : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* Phase label */}
      <span style={{ width: 96, fontSize: 12, fontWeight: 600, color: "var(--text-2)", flexShrink: 0 }}>
        {label}
      </span>

      {/* Bar */}
      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ height: 10, background: "var(--border)", borderRadius: 5, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${barPct}%`,
            background: color,
            borderRadius: 5,
            transition: "width 0.7s ease",
          }} />
        </div>
      </div>

      {/* Accuracy value */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 60 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>
          {stats.avg}%
        </span>
        <span style={{ fontSize: 11, color: "var(--text-4)", marginLeft: 4 }}>
          ({stats.count.toLocaleString()} moves)
        </span>
      </div>
    </div>
  );
}

export function AccuracyByPhase({ username }: Props) {
  const [data, setData] = useState<PhaseAccuracyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/phase-accuracy/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-hidden>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="skeleton" style={{ width: 96, height: 12, borderRadius: 4 }} />
            <div className="skeleton" style={{ flex: 1, height: 10, borderRadius: 5 }} />
            <div className="skeleton" style={{ width: 60, height: 12, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    );
  }

  const hasData = data && (data.opening || data.middlegame || data.endgame);

  if (!hasData) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 8, color: "var(--text-3)", fontSize: 13, padding: "28px 0",
      }}>
        <span style={{ fontSize: 22 }}>♟</span>
        <span>No analysis data yet</span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>Analyze your games to see accuracy by phase</span>
      </div>
    );
  }

  // Compute max accuracy for bar scaling
  const avgs = [data.opening?.avg, data.middlegame?.avg, data.endgame?.avg].filter((v): v is number => v !== null);
  const maxAvg = Math.max(...avgs);

  // Weakness callout: endgame is 5%+ below the best phase
  const endgameWeaker = data.endgame && (maxAvg - data.endgame.avg >= 5);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: endgameWeaker ? 16 : 0 }}>
        <PhaseBar label="Opening (1–10)" stats={data.opening} maxAvg={maxAvg} />
        <PhaseBar label="Middlegame (11–25)" stats={data.middlegame} maxAvg={maxAvg} />
        <PhaseBar label="Endgame (26+)" stats={data.endgame} maxAvg={maxAvg} />
      </div>

      {endgameWeaker && data.endgame && (
        <div style={{
          background: "var(--loss-dim)",
          border: "1px solid rgba(202,52,49,0.22)",
          borderRadius: 10,
          padding: "11px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginTop: 14,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600, color: "var(--text-2)" }}>Endgame is your weakest phase</span>
            {" "}— your endgame accuracy ({data.endgame.avg}%) is{" "}
            {Math.round(maxAvg - data.endgame.avg)} points below your best phase ({maxAvg}%).
            Focus on endgame technique to convert more winning positions.
          </div>
        </div>
      )}
    </div>
  );
}
