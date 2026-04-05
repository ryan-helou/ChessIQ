"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { ResultBreakdown } from "@/lib/game-analysis";

const RESULT_COLORS: Record<string, string> = {
  Checkmate: "#81b64c",
  Resigned: "#e62929",
  Timeout: "#e6a117",
  Checkmated: "#c92a2a",
  Stalemate: "#989795",
  "Draw Agreed": "#706e6b",
  Repetition: "#8b5cf6",
  Abandoned: "#e67e22",
  "Insufficient Material": "#6366f1",
  "Timeout vs Insufficient": "#a78bfa",
  "50-Move Rule": "#989795",
};

interface WinLossDrawProps {
  wins: number;
  losses: number;
  draws: number;
}

export function WinLossDrawChart({ wins, losses, draws }: WinLossDrawProps) {
  const data = [
    { name: "Wins", value: wins },
    { name: "Losses", value: losses },
    { name: "Draws", value: draws },
  ];
  const colors = ["#81b64c", "#e62929", "#989795"];

  return (
    <div className="w-full h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
            label={({ name, percent }) =>
              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
            labelLine={{ stroke: "#706e6b" }}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1916",
              border: "1px solid #3a3835",
              borderRadius: "8px",
              color: "#e8e6e1",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Props {
  data: ResultBreakdown[];
}

export function ResultBreakdownChart({ data }: Props) {
  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3835" />
          <XAxis type="number" tick={{ fill: "#989795", fontSize: 11 }} />
          <YAxis
            dataKey="type"
            type="category"
            tick={{ fill: "#989795", fontSize: 11 }}
            width={150}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1916",
              border: "1px solid #3a3835",
              borderRadius: "8px",
              color: "#e8e6e1",
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={RESULT_COLORS[entry.type] ?? "#989795"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
