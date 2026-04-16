"use client";

import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Recharts needs raw hex values — mirror globals.css tokens.
const C = {
  bg: "#262522",
  border: "#454340",
  text1: "#e8e6e1",
  text2: "#a0998c",
  text3: "#706e6b",
  accent: "#81b64c",
  blue: "#5d8fbb",
  gold: "#e8ac3e",
  red: "#e05555",
  teal: "#26c9c3",
  purple: "#b080d4",
  orange: "#e89040",
};

const THEME_COLORS = [C.blue, C.gold, C.red, C.teal, C.purple, C.orange];

interface AccuracyPoint {
  gameId: string;
  playedAt: string;
  avgAccuracy: number;
}

interface BlunderPoint {
  gameId: string;
  playedAt: string;
  blunderCount: number;
}

interface PuzzleRatingPoint {
  rating: number;
  recordedAt: string;
}

interface ThemePoint {
  theme: string;
  playedAt: string;
  count: number;
}

interface ProgressData {
  accuracy: AccuracyPoint[];
  blunders: BlunderPoint[];
  puzzleRating: PuzzleRatingPoint[];
  themeProgress: ThemePoint[];
}

type TabKey = "accuracy" | "blunders" | "puzzles" | "tactics";

const TABS: { key: TabKey; label: string }[] = [
  { key: "accuracy", label: "Accuracy" },
  { key: "blunders", label: "Blunders" },
  { key: "puzzles", label: "Puzzles" },
  { key: "tactics", label: "Tactics" },
];

function rollingAverage(
  values: { date: string; value: number }[],
  window: number
): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v.value, 0) / slice.length;
    result.push({ date: values[i].date, value: parseFloat(avg.toFixed(1)) });
  }
  return result;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "200px",
        color: C.text3,
        fontSize: "13px",
        textAlign: "center",
        gap: "8px",
      }}
    >
      <span style={{ fontSize: "28px" }}>♟</span>
      <span>Analyze more games to see progress trends</span>
    </div>
  );
}

export default function ProgressTimeline({ username }: { username: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("accuracy");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/progress/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => console.warn("[progress] fetch failed:", err.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Rolling 10-game accuracy average
  const accuracyData = useMemo(() => {
    if (!data?.accuracy?.length) return [];
    const raw = data.accuracy.map((p) => ({
      date: p.playedAt,
      value: p.avgAccuracy,
    }));
    return rollingAverage(raw, 10);
  }, [data]);

  // Rolling 10-game blunder average
  const blunderData = useMemo(() => {
    if (!data?.blunders?.length) return [];
    const raw = data.blunders.map((p) => ({
      date: p.playedAt,
      value: p.blunderCount,
    }));
    return rollingAverage(raw, 10);
  }, [data]);

  // Puzzle rating over time (no rolling needed)
  const puzzleData = useMemo(() => {
    if (!data?.puzzleRating?.length) return [];
    return data.puzzleRating.map((p) => ({
      date: p.recordedAt,
      value: p.rating,
    }));
  }, [data]);

  // Per-theme miss counts over time -- top 3 themes, bucketed by date
  const { themeChartData, themeNames } = useMemo(() => {
    if (!data?.themeProgress?.length) return { themeChartData: [], themeNames: [] as string[] };

    // Find top 3 themes by total count
    const totals = new Map<string, number>();
    for (const p of data.themeProgress) {
      totals.set(p.theme, (totals.get(p.theme) ?? 0) + p.count);
    }
    const top3 = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    // Bucket by date
    const dateMap = new Map<string, Record<string, number>>();
    for (const p of data.themeProgress) {
      if (!top3.includes(p.theme)) continue;
      const dateKey = new Date(p.playedAt).toISOString().split("T")[0];
      if (!dateMap.has(dateKey)) dateMap.set(dateKey, {});
      const entry = dateMap.get(dateKey)!;
      entry[p.theme] = (entry[p.theme] ?? 0) + p.count;
    }

    const sorted = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, themes]) => ({ date, ...themes }));

    return { themeChartData: sorted, themeNames: top3 };
  }, [data]);

  if (loading) {
    return (
      <div
        style={{
          height: "300px",
          background: "var(--bg-card)",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        className="animate-pulse"
      >
        <span style={{ color: C.text3, fontSize: "13px" }}>Loading progress data...</span>
      </div>
    );
  }

  const hasAnyData =
    (data?.accuracy?.length ?? 0) > 0 ||
    (data?.blunders?.length ?? 0) > 0 ||
    (data?.puzzleRating?.length ?? 0) > 0 ||
    (data?.themeProgress?.length ?? 0) > 0;

  if (!hasAnyData) {
    return <EmptyState />;
  }

  return (
    <div>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "20px",
          background: "var(--surface-2)",
          borderRadius: "8px",
          padding: "3px",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "7px 12px",
              fontSize: "12px",
              fontWeight: 600,
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background:
                activeTab === tab.key ? "var(--surface-3)" : "transparent",
              color:
                activeTab === tab.key ? "var(--accent)" : "var(--text-1)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div style={{ width: "100%", height: 260 }}>
        {activeTab === "accuracy" &&
          (accuracyData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyData}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(v) => {
                    const d = new Date(String(v));
                    return d.toLocaleDateString();
                  }}
                  formatter={(v) => [`${v}%`, "Accuracy (10-game avg)"]}
                />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="value"
                  stroke={C.accent}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: C.accent }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          ))}

        {activeTab === "blunders" &&
          (blunderData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={blunderData}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(v) => {
                    const d = new Date(String(v));
                    return d.toLocaleDateString();
                  }}
                  formatter={(v) => [v, "Blunders (10-game avg)"]}
                />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="value"
                  stroke={C.red}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: C.red }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          ))}

        {activeTab === "puzzles" &&
          (puzzleData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={puzzleData}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                  width={44}
                  domain={["dataMin - 50", "dataMax + 50"]}
                />
                <Tooltip
                  contentStyle={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(v) => {
                    const d = new Date(String(v));
                    return d.toLocaleDateString();
                  }}
                  formatter={(v) => [v, "Puzzle Rating"]}
                />
                <Line
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="value"
                  stroke={C.gold}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: C.gold }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          ))}

        {activeTab === "tactics" &&
          (themeChartData.length > 1 && themeNames.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={themeChartData}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: C.text3, fontSize: 11 }}
                  stroke={C.border}
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(v) => {
                    const d = new Date(String(v));
                    return d.toLocaleDateString();
                  }}
                />
                {themeNames.map((theme, i) => (
                  <Line
                    isAnimationActive={false}
                    key={theme}
                    type="monotone"
                    dataKey={theme}
                    name={theme}
                    stroke={THEME_COLORS[i % THEME_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    activeDot={{
                      r: 4,
                      fill: THEME_COLORS[i % THEME_COLORS.length],
                    }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          ))}
      </div>

      {/* Legend for tactics tab */}
      {activeTab === "tactics" && themeNames.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "16px",
            justifyContent: "center",
            marginTop: "12px",
            flexWrap: "wrap",
          }}
        >
          {themeNames.map((theme, i) => (
            <div
              key={theme}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                color: C.text2,
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "2px",
                  background: THEME_COLORS[i % THEME_COLORS.length],
                  flexShrink: 0,
                }}
              />
              {theme}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
