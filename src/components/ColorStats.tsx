"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { ColorStats } from "@/lib/game-analysis";

interface StatCardProps {
  color: "white" | "black";
  games: number;
  winRate: number;
  avgAccuracy: number | null;
  currentRating: number;
  bestRating: number;
}

function ColorStatCard({
  color,
  games,
  winRate,
  avgAccuracy,
  currentRating,
  bestRating,
}: StatCardProps) {
  const iconColor = color === "white" ? "bg-white/10 text-white" : "bg-slate-700/30 text-slate-300";
  const borderColor =
    color === "white" ? "border-slate-400/30" : "border-slate-600/30";
  const winRateColor =
    winRate >= 50 ? "text-emerald-400" : winRate >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <div
      className={`bg-slate-800/50 border ${borderColor} rounded-xl p-5 backdrop-blur-sm`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${iconColor}`}
        >
          {color === "white" ? "⚪" : "⚫"}
        </div>
        <div className="text-sm font-semibold text-slate-50 capitalize">{color}</div>
      </div>

      <div className="space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">Games</span>
          <span className="text-sm font-semibold text-slate-50">{games}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">Win Rate</span>
          <span className={`text-sm font-semibold ${winRateColor}`}>{winRate.toFixed(1)}%</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">Accuracy</span>
          <span className="text-sm font-semibold text-blue-400">
            {avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"}
          </span>
        </div>

        <div className="pt-1 border-t border-slate-700/30">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-slate-400">Current</span>
            <span className="text-sm font-semibold text-white">{currentRating}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">Best</span>
            <span className="text-sm font-semibold text-emerald-400">{bestRating}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  colorStats: ColorStats[];
}

export default function ColorStats({ colorStats }: Props) {
  const whiteStats = colorStats.find((c) => c.color === "white");
  const blackStats = colorStats.find((c) => c.color === "black");

  const pieData = [
    { name: "White", value: whiteStats?.games ?? 0, fill: "#f1f5f9" },
    { name: "Black", value: blackStats?.games ?? 0, fill: "#1e293b" },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-6">
        {whiteStats && (
          <ColorStatCard
            color="white"
            games={whiteStats.games}
            winRate={whiteStats.winRate}
            avgAccuracy={whiteStats.avgAccuracy}
            currentRating={whiteStats.currentRating}
            bestRating={whiteStats.bestRating}
          />
        )}
        {blackStats && (
          <ColorStatCard
            color="black"
            games={blackStats.games}
            winRate={blackStats.winRate}
            avgAccuracy={blackStats.avgAccuracy}
            currentRating={blackStats.currentRating}
            bestRating={blackStats.bestRating}
          />
        )}
      </div>

      {pieData.length > 0 && (
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-slate-50 mb-4">Game Distribution by Color</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) =>
                    `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
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
        </div>
      )}
    </div>
  );
}
