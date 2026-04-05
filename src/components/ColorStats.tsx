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
  const iconColor = color === "white" ? "bg-white/10 text-white" : "bg-[#3a3835] text-[#989795]";
  const borderColor =
    color === "white" ? "border-[#3a3835]" : "border-[#3a3835]";
  const winRateColor =
    winRate >= 50 ? "text-[#81b64c]" : winRate >= 40 ? "text-[#e6a117]" : "text-[#e62929]";

  return (
    <div
      className={`bg-[#262522] border ${borderColor} rounded-xl p-5`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${iconColor}`}
        >
          {color === "white" ? "⚪" : "⚫"}
        </div>
        <div className="text-sm font-semibold text-white capitalize">{color}</div>
      </div>

      <div className="space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#989795]">Games</span>
          <span className="text-sm font-semibold text-white">{games}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-[#989795]">Win Rate</span>
          <span className={`text-sm font-semibold ${winRateColor}`}>{winRate.toFixed(1)}%</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-[#989795]">Accuracy</span>
          <span className="text-sm font-semibold text-[#81b64c]">
            {avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"}
          </span>
        </div>

        <div className="pt-1 border-t border-[#3a3835]">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-[#989795]">Current</span>
            <span className="text-sm font-semibold text-white">{currentRating}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#989795]">Best</span>
            <span className="text-sm font-semibold text-[#81b64c]">{bestRating}</span>
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
    { name: "White", value: whiteStats?.games ?? 0, fill: "#e8e6e1" },
    { name: "Black", value: blackStats?.games ?? 0, fill: "#3a3835" },
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
        <div className="bg-[#262522] border border-[#3a3835] rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Game Distribution by Color</h3>
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
                    backgroundColor: "#1a1916",
                    border: "1px solid #3a3835",
                    borderRadius: "8px",
                    color: "#e8e6e1",
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
