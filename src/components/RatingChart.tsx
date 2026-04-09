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

const TIME_CLASS_COLORS: Record<string, string> = {
  bullet: "#e62929",
  blitz: "#e6a117",
  rapid: "#81b64c",
  daily: "#8b5cf6",
};

interface Props {
  data: RatingDataPoint[];
  filter: string;
}

export default function RatingChart({ data, filter }: Props) {
  const filtered = filter === "all" ? data : data.filter((d) => d.timeClass === filter);

  // Group by date and time class, keeping latest rating per date per class
  const grouped = new Map<string, Record<string, number>>();
  for (const d of filtered) {
    if (!grouped.has(d.date)) grouped.set(d.date, {});
    grouped.get(d.date)![d.timeClass] = d.rating;
  }

  // Build chart data with carried-forward ratings
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

  // Downsample if too many points
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
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#989795", fontSize: 11 }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
            }}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            tick={{ fill: "#989795", fontSize: 11 }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1916",
              border: "1px solid #3a3835",
              borderRadius: "8px",
              color: "#e8e6e1",
            }}
          />
          <Legend />
          {timeClasses.map((tc) => (
            <Line
              key={tc}
              type="monotone"
              dataKey={tc}
              stroke={TIME_CLASS_COLORS[tc] ?? "#989795"}
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
