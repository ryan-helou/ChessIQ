"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { ColorStats } from "@/lib/game-analysis";

const C = { bg: "#262522", border: "#454340" };

function winColor(rate: number) {
  return rate >= 50 ? "var(--win)" : rate >= 40 ? "var(--gold)" : "var(--loss)";
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{label}</span>
      <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 600, color: accent || "var(--text-1)" }}>{value}</span>
    </div>
  );
}

interface StatCardProps {
  color: "white" | "black";
  games: number;
  winRate: number;
  avgAccuracy: number | null;
  currentRating: number;
  bestRating: number;
}

function ColorStatCard({ color, games, winRate, avgAccuracy, currentRating, bestRating }: StatCardProps) {
  return (
    <div className="card" style={{ padding: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
        <span style={{ fontSize: "18px" }}>{color === "white" ? "⚪" : "⚫"}</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)", textTransform: "capitalize" }}>{color}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <StatRow label="Games" value={String(games)} />
        <StatRow label="Win Rate" value={`${winRate.toFixed(1)}%`} accent={winColor(winRate)} />
        <StatRow label="Accuracy" value={avgAccuracy ? `${avgAccuracy.toFixed(1)}%` : "—"} accent={avgAccuracy ? "var(--gold)" : undefined} />
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <StatRow label="Current" value={String(currentRating)} />
          <StatRow label="Best" value={String(bestRating)} accent="var(--gold)" />
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
    { name: "Black", value: blackStats?.games ?? 0, fill: "#4d4a47" },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
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
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-2)", marginBottom: "16px" }}>Game Distribution by Color</h3>
          <div style={{ height: "220px" }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  isAnimationActive={false}
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) =>
                    `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`
                  }
                  outerRadius={80}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
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
        </div>
      )}
    </div>
  );
}
