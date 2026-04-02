"use client";

import { useState } from "react";
import type { OpeningStats } from "@/lib/game-analysis";

interface Props {
  openings: OpeningStats[];
}

type SortKey = "games" | "winRate" | "avgAccuracy" | "name";

export default function OpeningTable({ openings }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("games");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minGames, setMinGames] = useState(3);

  const filtered = openings.filter((o) => o.games >= minGames);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "avgAccuracy")
      cmp = (a.avgAccuracy ?? 0) - (b.avgAccuracy ?? 0);
    else cmp = a[sortBy] - b[sortBy];
    return sortDir === "desc" ? -cmp : cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <span className="text-slate-600 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  const winRateColor = (rate: number) => {
    if (rate >= 60) return "text-emerald-400";
    if (rate >= 50) return "text-blue-400";
    if (rate >= 40) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-slate-400">Min games:</label>
        <input
          type="range"
          min={1}
          max={20}
          value={minGames}
          onChange={(e) => setMinGames(parseInt(e.target.value))}
          className="w-24 accent-blue-500"
        />
        <span className="text-sm text-slate-300 w-6">{minGames}</span>
        <span className="text-xs text-slate-500 ml-auto">
          {filtered.length} openings
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700/50">
              {(
                [
                  ["name", "Opening"],
                  ["games", "Games"],
                  ["winRate", "Win Rate"],
                  ["avgAccuracy", "Avg Accuracy"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="text-left py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              <th className="text-left py-2 px-3">W / L / D</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 30).map((o) => (
              <tr
                key={o.name}
                className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
              >
                <td className="py-2.5 px-3">
                  <div className="font-medium text-slate-200">{o.name}</div>
                  <div className="text-xs text-slate-500">{o.eco}</div>
                </td>
                <td className="py-2.5 px-3 text-slate-300">{o.games}</td>
                <td className={`py-2.5 px-3 font-semibold ${winRateColor(o.winRate)}`}>
                  {o.winRate.toFixed(1)}%
                </td>
                <td className="py-2.5 px-3 text-slate-300">
                  {o.avgAccuracy ? `${o.avgAccuracy.toFixed(1)}%` : "—"}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex gap-1 items-center">
                    <span className="text-emerald-400">{o.wins}</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-red-400">{o.losses}</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-slate-400">{o.draws}</span>
                  </div>
                  {/* Win rate bar */}
                  <div className="flex h-1.5 mt-1 rounded-full overflow-hidden bg-slate-700/50">
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${(o.wins / o.games) * 100}%` }}
                    />
                    <div
                      className="bg-slate-500"
                      style={{ width: `${(o.draws / o.games) * 100}%` }}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: `${(o.losses / o.games) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
