"use client";

import { useEffect, useState } from "react";

interface BucketRow {
  bucket: string;
  blunders: number;
  moves: number;
  blunderRate: number | null;
  pctOfBlunders: number;
}

interface TimePressureData {
  totalBlunders: number;
  timePressurePct: number;
  underPressureBlunders: number;
  breakdown: BucketRow[];
  hasClock: boolean;
}

const BUCKET_COLOR: Record<string, string> = {
  ">2m":    "#81b64c",
  "1–2m":   "#f6c700",
  "30–60s": "#e28c28",
  "<30s":   "#ca3431",
};

interface Props {
  username: string;
}

export default function TimePressurePanel({ username }: Props) {
  const [data, setData] = useState<TimePressureData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/time-pressure/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 40, background: "var(--border)", borderRadius: 6, opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  if (!data || !data.hasClock || data.totalBlunders === 0) {
    return (
      <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
        No clock data available yet — play games with time controls that record clock times.
      </div>
    );
  }

  const maxBlunderRate = Math.max(
    ...data.breakdown.map((b) => b.blunderRate ?? 0)
  );

  return (
    <div>
      {/* Headline callout */}
      <div style={{
        background: data.timePressurePct >= 40
          ? "rgba(202,52,49,0.08)"
          : "rgba(129,182,76,0.07)",
        border: `1px solid ${data.timePressurePct >= 40 ? "rgba(202,52,49,0.2)" : "rgba(129,182,76,0.2)"}`,
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 18,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>
          {data.timePressurePct >= 40 ? "⏱" : "✓"}
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>
            {data.timePressurePct >= 40
              ? `${data.timePressurePct}% of your blunders happen with <60s on the clock`
              : `Only ${data.timePressurePct}% of your blunders happen under time pressure`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            {data.timePressurePct >= 40
              ? "Time pressure is a significant weakness — practice faster decision-making."
              : "You handle time pressure well. Most mistakes happen earlier in the game."}
          </div>
        </div>
      </div>

      {/* Bucket rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.breakdown.map((row) => {
          const color = BUCKET_COLOR[row.bucket] ?? "var(--text-3)";
          const barWidth = maxBlunderRate > 0 && row.blunderRate != null
            ? (row.blunderRate / maxBlunderRate) * 100
            : 0;
          return (
            <div key={row.bucket} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Time label */}
              <span style={{
                width: 48,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                color,
                flexShrink: 0,
                textAlign: "right",
              }}>
                {row.bucket}
              </span>

              {/* Bar */}
              <div style={{ flex: 1, position: "relative" }}>
                <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${barWidth}%`,
                    background: color,
                    borderRadius: 4,
                    transition: "width 0.6s ease",
                  }} />
                </div>
              </div>

              {/* Stats */}
              <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", fontFamily: "var(--font-mono)" }}>
                  {row.blunderRate != null ? `${row.blunderRate}%` : "—"}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 6 }}>
                  blunder rate
                </span>
              </div>

              {/* Blunder count */}
              <span style={{ width: 28, textAlign: "right", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                {row.blunders}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-4)" }}>
        Based on {data.totalBlunders} blunders across analysed games. Blunder rate = blunders ÷ moves played in that time bucket.
      </div>
    </div>
  );
}
