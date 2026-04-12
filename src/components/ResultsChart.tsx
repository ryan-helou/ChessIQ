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

const C = { bg: "#09090f", border: "#222136", text2: "#9896b4", text3: "#524f68" };

const RESULT_COLORS: Record<string, string> = {
  Checkmate:                 "#52c07a",
  Resigned:                  "#e05555",
  Timeout:                   "#d4a84b",
  Checkmated:                "#c03434",
  Stalemate:                 "#8b8aae",
  "Draw Agreed":             "#524f68",
  Repetition:                "#5b9cf6",
  Abandoned:                 "#d4a84b",
  "Insufficient Material":   "#5b9cf6",
  "Timeout vs Insufficient": "#8b8aae",
  "50-Move Rule":            "#524f68",
};

interface WinLossDrawProps {
  wins: number;
  losses: number;
  draws: number;
}

export function WinLossDrawChart({ wins, losses, draws }: WinLossDrawProps) {
  const data = [
    { name: "Wins",   value: wins },
    { name: "Losses", value: losses },
    { name: "Draws",  value: draws },
  ];
  const colors = ["#52c07a", "#e05555", "#8b8aae"];

  return (
    <div className="w-full h-[250px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
            labelLine={{ stroke: C.text3 }}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              color: "#f0ede4",
              fontSize: "12px",
              fontFamily: "monospace",
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
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis type="number" tick={{ fill: C.text3, fontSize: 11 }} />
          <YAxis
            dataKey="type"
            type="category"
            tick={{ fill: C.text3, fontSize: 11 }}
            width={150}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px",
              color: "#f0ede4",
              fontSize: "12px",
              fontFamily: "monospace",
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={RESULT_COLORS[entry.type] ?? C.text2}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
