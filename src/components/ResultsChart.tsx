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

const C = { bg: "#262522", border: "#454340", text2: "#a0998c", text3: "#706e6b" };

const RESULT_COLORS: Record<string, string> = {
  Checkmate:                 "#81b64c",
  Resigned:                  "#ca3431",
  Timeout:                   "#f6c700",
  Checkmated:                "#a02828",
  Stalemate:                 "#9e9b98",
  "Draw Agreed":             "#706e6b",
  Repetition:                "#5d8fbb",
  Abandoned:                 "#f6c700",
  "Insufficient Material":   "#5d8fbb",
  "Timeout vs Insufficient": "#9e9b98",
  "50-Move Rule":            "#706e6b",
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
  const colors = ["#81b64c", "#ca3431", "#9e9b98"];

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
              color: "#e8e6e1",
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
              color: "#e8e6e1",
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
