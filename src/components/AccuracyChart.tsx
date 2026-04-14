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

const C = { bg: "#262522", border: "#454340", text2: "#a0998c", text3: "#706e6b" };

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

  const windowSize = 20;
  const rollingData = withAccuracy.map((d, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const window = withAccuracy.slice(start, i + 1);
    const avg = window.reduce((s, w) => s + w.accuracy, 0) / window.length;
    return { ...d, rollingAvg: avg };
  });

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rollingData}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="date"
            tick={{ fill: C.text3, fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={60}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
            }}
          />
          <YAxis tick={{ fill: C.text3, fontSize: 11 }} domain={[40, 100]} />
          <Tooltip
            contentStyle={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              color: "#e8e6e1",
              fontSize: "12px",
              fontFamily: "monospace",
            }}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)}%`,
              name === "rollingAvg" ? "Rolling Avg" : "Accuracy",
            ]}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: C.text2, fontSize: "11px", fontFamily: "monospace" }}>
                {value}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="accuracy"
            stroke="rgba(129,182,76,0.25)"
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

  const ratings = raw.map((d) => d.opponentRating);

  if (ratings.length === 0) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center text-sm" style={{ color: C.text2 }}>
        No games with accuracy data
      </div>
    );
  }

  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const std = Math.sqrt(ratings.reduce((s, r) => s + (r - mean) ** 2, 0) / ratings.length);
  const data = std === 0 ? raw : raw.filter((d) => Math.abs(d.opponentRating - mean) <= 2 * std);

  const wins   = data.filter((d) => d.result === "win");
  const losses = data.filter((d) => d.result === "loss");
  const draws  = data.filter((d) => d.result === "draw");

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ScatterChart margin={{ bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="opponentRating"
            type="number"
            tick={{ fill: C.text3, fontSize: 11 }}
            name="Opponent Rating"
            domain={["auto", "auto"]}
          />
          <YAxis
            dataKey="accuracy"
            tick={{ fill: C.text3, fontSize: 11 }}
            name="Accuracy"
            domain={[40, 100]}
            label={{ value: "Accuracy %", angle: -90, position: "insideLeft", fill: C.text3, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              color: "#e8e6e1",
              fontSize: "12px",
              fontFamily: "monospace",
            }}
            formatter={(value, name) => [
              name === "accuracy" ? `${Number(value).toFixed(1)}%` : value,
              name === "accuracy" ? "Accuracy" : "Opp Rating",
            ]}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: C.text2, fontSize: "11px", fontFamily: "monospace" }}>{value}</span>
            )}
          />
          <Scatter name="Wins"   data={wins}   fill="#81b64c" opacity={0.55} />
          <Scatter name="Losses" data={losses} fill="#ca3431" opacity={0.55} />
          <Scatter name="Draws"  data={draws}  fill="#9e9b98" opacity={0.55} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
