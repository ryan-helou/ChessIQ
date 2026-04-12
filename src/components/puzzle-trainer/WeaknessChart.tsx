"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { WeaknessProfile } from "@/lib/puzzle-api";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

interface Props {
  weaknesses: WeaknessProfile[];
  activeTheme: string | null;
  onThemeClick: (theme: string | null) => void;
}

export default function WeaknessChart({ weaknesses, activeTheme, onThemeClick }: Props) {
  if (weaknesses.length === 0) {
    return (
      <div className="bg-[#13121c] rounded-xl p-6 text-center">
        <p className="text-[#9896b4] text-sm">
          No weakness data yet. Analyze some games first to see your tactical patterns.
        </p>
      </div>
    );
  }

  const data = weaknesses.slice(0, 8).map((w) => ({
    theme: w.theme,
    label: THEME_LABELS[w.theme] ?? w.theme,
    count: w.count,
    percentage: w.percentage,
    color: THEME_COLORS[w.theme] ?? "#9896b4",
  }));

  return (
    <div className="bg-[#13121c] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-[#f0ede4] uppercase tracking-wider">
          Your Tactical Weaknesses
        </h2>
        {activeTheme && (
          <button
            onClick={() => onThemeClick(null)}
            className="text-xs text-[#9896b4] hover:text-[#f0ede4] transition-colors"
          >
            Show all
          </button>
        )}
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
            <XAxis
              type="number"
              tick={{ fill: "#524f68", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fill: "#f0ede4", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              contentStyle={{
                backgroundColor: "#09090f",
                border: "1px solid #222136",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#f0ede4" }}
              formatter={(value: any, _name: any, entry: any) => [
                `${value} (${entry.payload.percentage}%)`,
                "Blunders",
              ]}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(entry: any) => onThemeClick(entry.theme)}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.theme}
                  fill={entry.color}
                  opacity={activeTheme && activeTheme !== entry.theme ? 0.3 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Theme pills */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {data.map((d) => (
          <button
            key={d.theme}
            onClick={() => onThemeClick(activeTheme === d.theme ? null : d.theme)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
              activeTheme === d.theme
                ? "text-white ring-1 ring-white/30"
                : "text-[#9896b4] hover:text-white"
            }`}
            style={{
              backgroundColor: activeTheme === d.theme ? d.color : `${d.color}20`,
            }}
          >
            {d.label} ({d.percentage}%)
          </button>
        ))}
      </div>
    </div>
  );
}
