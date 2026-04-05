"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  LineChart,
  Legend,
} from "recharts";
import type { ParsedGame } from "@/lib/game-analysis";

interface Props {
  games: ParsedGame[];
}

export function AccuracyOverTime({ games }: Props) {
  const withAccuracy = games
    .filter((g) => g.accuracy !== null)
    .map((g, i) => ({
      index: i,
      date: g.date instanceof Date ? g.date.toISOString().split("T")[0] : g.date,
      accuracy: g.accuracy!,
      result: g.result,
      opponent: g.opponentName,
      opening: g.opening,
    }));

  // Rolling average (20-game window)
  const windowSize = 20;
  const rollingData = withAccuracy.map((d, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const window = withAccuracy.slice(start, i + 1);
    const avg = window.reduce((s, w) => s + w.accuracy, 0) / window.length;
    return { ...d, rollingAvg: avg };
  });

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rollingData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#989795", fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={60}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
            }}
          />
          <YAxis
            tick={{ fill: "#989795", fontSize: 11 }}
            domain={[40, 100]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1916",
              border: "1px solid #3a3835",
              borderRadius: "8px",
              color: "#e8e6e1",
            }}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)}%`,
              name === "rollingAvg" ? "Rolling Avg" : "Accuracy",
            ]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke="rgba(129, 182, 76, 0.4)"
            dot={false}
            strokeWidth={1}
            name="Game Accuracy"
          />
          <Line
            type="monotone"
            dataKey="rollingAvg"
            stroke="#81b64c"
            dot={false}
            strokeWidth={2.5}
            name="20-Game Rolling Avg"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AccuracyVsRating({ games }: Props) {
  const raw = games
    .filter((g) => g.accuracy !== null)
    .map((g) => ({
      opponentRating: g.opponentRating,
      accuracy: g.accuracy!,
      result: g.result,
    }));

  // Remove outliers: filter to within 2 standard deviations of mean opponent rating
  const ratings = raw.map((d) => d.opponentRating);
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const std = Math.sqrt(ratings.reduce((s, r) => s + (r - mean) ** 2, 0) / ratings.length);
  const data = raw.filter((d) => Math.abs(d.opponentRating - mean) <= 2 * std);

  const wins = data.filter((d) => d.result === "win");
  const losses = data.filter((d) => d.result === "loss");
  const draws = data.filter((d) => d.result === "draw");

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" />
          <XAxis
            dataKey="opponentRating"
            type="number"
            tick={{ fill: "#989795", fontSize: 11 }}
            name="Opponent Rating"
            domain={["auto", "auto"]}
          />
          <YAxis
            dataKey="accuracy"
            tick={{ fill: "#989795", fontSize: 11 }}
            name="Accuracy"
            domain={[40, 100]}
            label={{
              value: "Accuracy %",
              angle: -90,
              position: "insideLeft",
              fill: "#706e6b",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1916",
              border: "1px solid #3a3835",
              borderRadius: "8px",
              color: "#e8e6e1",
            }}
            formatter={(value, name) => [
              name === "accuracy" ? `${Number(value).toFixed(1)}%` : value,
              name === "accuracy" ? "Accuracy" : "Opp Rating",
            ]}
          />
          <Legend />
          <Scatter name="Wins" data={wins} fill="#81b64c" opacity={0.6} />
          <Scatter name="Losses" data={losses} fill="#e62929" opacity={0.6} />
          <Scatter name="Draws" data={draws} fill="#989795" opacity={0.6} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
