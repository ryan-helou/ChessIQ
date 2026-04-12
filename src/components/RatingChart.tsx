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

// Match design tokens from globals.css
const C = { bg: "#09090f", border: "#222136", text2: "#9896b4", text3: "#524f68" };

const TIME_CLASS_COLORS: Record<string, string> = {
  bullet: "#e05555",
  blitz:  "#d4a84b",
  rapid:  "#52c07a",
  daily:  "#5b9cf6",
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
              color: "#f0ede4",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
            }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: C.text2, fontSize: "11px", fontFamily: "monospace" }}>
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
