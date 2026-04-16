"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { RatingDataPoint } from "@/lib/game-analysis";

// Recharts takes raw SVG stroke/fill values, so we mirror globals.css hex here.
// Keep in sync with --bg, --border, --text-2, --text-3, --loss, --gold, --win, --blue.
const C = { bg: "#262522", border: "#454340", text1: "#e8e6e1", text2: "#a0998c", text3: "#706e6b" };

const TIME_CLASS_COLORS: Record<string, string> = {
  bullet: "#ca3431", // --loss
  blitz:  "#f6c700", // --gold
  rapid:  "#81b64c", // --win
  daily:  "#5d8fbb", // --blue
};

interface Props {
  data: RatingDataPoint[];
  filter: string;
}

export default function RatingChart({ data, filter }: Props) {
  const filtered = filter === "all" ? data : data.filter((d) => d.timeClass === filter);

  const grouped = new Map<string, Record<string, number>>();
  for (const d of filtered) {
    if (!grouped.has(d.date)) grouped.set(d.date, {});
    grouped.get(d.date)![d.timeClass] = d.rating;
  }

  const timeClasses = [...new Set(filtered.map((d) => d.timeClass))];
  const lastKnown: Record<string, number> = {};
  const chartData = Array.from(grouped.entries()).map(([date, ratings]) => {
    for (const tc of timeClasses) {
      if (ratings[tc] !== undefined) lastKnown[tc] = ratings[tc];
    }
    return {
      date,
      ...Object.fromEntries(
        timeClasses.map((tc) => [tc, ratings[tc] ?? lastKnown[tc] ?? null])
      ),
    };
  });

  const maxPoints = 200;
  const step = Math.max(1, Math.floor(chartData.length / maxPoints));
  const displayData =
    chartData.length > maxPoints
      ? chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1)
      : chartData;

  return (
    <div className="w-full h-[350px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="date"
            tick={{ fill: C.text3, fontSize: 11 }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
            }}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis tick={{ fill: C.text3, fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              color: C.text1,
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: C.text2, fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                {value}
              </span>
            )}
          />
          {timeClasses.map((tc) => (
            <Line
              key={tc}
              type="monotone"
              dataKey={tc}
              stroke={TIME_CLASS_COLORS[tc] ?? C.text2}
              dot={false}
              strokeWidth={2}
              name={tc.charAt(0).toUpperCase() + tc.slice(1)}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
