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
  Checkmate: "#10b981",
  Resigned: "#ef4444",
  Timeout: "#f59e0b",
  Checkmated: "#dc2626",
  Stalemate: "#64748b",
  "Draw Agreed": "#6b7280",
  Repetition: "#8b5cf6",
  Abandoned: "#f97316",
  "Insufficient Material": "#6366f1",
  "Timeout vs Insufficient": "#a78bfa",
  "50-Move Rule": "#94a3b8",
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
  const colors = ["#10b981", "#ef4444", "#64748b"];

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
              `${name} ${(percent * 100).toFixed(0)}%`
            }
            labelLine={{ stroke: "#475569" }}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: "8px",
              color: "#e2e8f0",
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
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <YAxis
            dataKey="type"
            type="category"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            width={150}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: "8px",
              color: "#e2e8f0",
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={RESULT_COLORS[entry.type] ?? "#64748b"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
