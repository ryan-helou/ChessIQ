"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { RatingDataPoint } from "@/lib/game-analysis";

const C = { bg: "#262522", border: "#454340", text3: "#706e6b" };

const TC_COLORS: Record<string, string> = {
  bullet: "#ca3431",
  blitz:  "#f6c700",
  rapid:  "#81b64c",
  daily:  "#5d8fbb",
};

const TC_LABELS: Record<string, string> = {
  bullet: "Bullet",
  blitz:  "Blitz",
  rapid:  "Rapid",
  daily:  "Daily",
};

interface MiniChartProps {
  timeClass: string;
  data: RatingDataPoint[];
}

function MiniRatingChart({ timeClass, data }: MiniChartProps) {
  const grouped = new Map<string, number>();
  for (const d of data) grouped.set(d.date, d.rating);

  const chartData = Array.from(grouped.entries()).map(([date, rating]) => ({ date, rating }));

  const maxPoints = 100;
  const step = Math.max(1, Math.floor(chartData.length / maxPoints));
  const displayData =
    chartData.length > maxPoints
      ? chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1)
      : chartData;

  if (displayData.length === 0) {
    return (
      <div className="card" style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "var(--font-mono)" }}>No data for {TC_LABELS[timeClass]}</span>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "220px" }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="date"
            tick={{ fill: C.text3, fontSize: 10 }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
            }}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis tick={{ fill: C.text3, fontSize: 10 }} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              color: "#f0ede4",
              fontSize: "12px",
              fontFamily: "monospace",
            }}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke={TC_COLORS[timeClass] ?? "#9e9b98"}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Props {
  ratingHistoryByTimeClass: Record<string, RatingDataPoint[]>;
}

export default function RatingTrendsByTimeClass({ ratingHistoryByTimeClass }: Props) {
  const timeClasses = ["bullet", "blitz", "rapid", "daily"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
      {timeClasses.map((tc) => (
        <div key={tc} className="card" style={{ padding: "20px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-2)", marginBottom: "14px" }}>
            <span style={{ color: TC_COLORS[tc], marginRight: "6px" }}>●</span>
            {TC_LABELS[tc]} Rating Trend
          </h3>
          <MiniRatingChart timeClass={tc} data={ratingHistoryByTimeClass[tc] ?? []} />
        </div>
      ))}
    </div>
  );
}
