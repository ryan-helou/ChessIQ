"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { RatingDataPoint } from "@/lib/game-analysis";

const TIME_CLASS_COLORS: Record<string, string> = {
  bullet: "#e62929",
  blitz: "#e6a117",
  rapid: "#81b64c",
  daily: "#8b5cf6",
};

const TIME_CLASS_LABELS: Record<string, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  daily: "Daily",
};

interface MiniChartProps {
  timeClass: string;
  data: RatingDataPoint[];
}

function MiniRatingChart({ timeClass, data }: MiniChartProps) {
  // Group by date and keep latest rating per date
  const grouped = new Map<string, number>();
  for (const d of data) {
    grouped.set(d.date, d.rating);
  }

  // Build chart data with carried-forward ratings
  const chartData = Array.from(grouped.entries()).map(([date, rating]) => ({
    date,
    rating,
  }));

  // Downsample if too many points
  const maxPoints = 100;
  const step = Math.max(1, Math.floor(chartData.length / maxPoints));
  const displayData =
    chartData.length > maxPoints
      ? chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1)
      : chartData;

  if (displayData.length === 0) {
    return (
      <div className="w-full h-[250px] bg-[#262522] border border-[#3a3835] rounded-lg flex items-center justify-center">
        <div className="text-[#706e6b] text-sm">No data for {TIME_CLASS_LABELS[timeClass]}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[250px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#989795", fontSize: 10 }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
            }}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            tick={{ fill: "#989795", fontSize: 10 }}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1916",
              border: "1px solid #3a3835",
              borderRadius: "8px",
              color: "#e8e6e1",
            }}
            labelFormatter={(label) => {
              const d = new Date(label);
              return d.toLocaleDateString();
            }}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke={TIME_CLASS_COLORS[timeClass] ?? "#989795"}
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {timeClasses.map((tc) => (
        <div key={tc} className="bg-[#262522] border border-[#3a3835] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">
            {TIME_CLASS_LABELS[tc]} Rating Trend
          </h3>
          <MiniRatingChart timeClass={tc} data={ratingHistoryByTimeClass[tc] ?? []} />
        </div>
      ))}
    </div>
  );
}
