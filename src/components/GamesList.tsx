"use client";

import { useState } from "react";
import type { ParsedGame } from "@/lib/game-analysis";

interface Props {
  games: ParsedGame[];
  username?: string;
}

export default function GamesList({ games, username }: Props) {
  const [filter, setFilter] = useState<"all" | "win" | "loss" | "draw">("all");
  const [page, setPage] = useState(0);
  const perPage = 20;

  const filtered =
    filter === "all" ? games : games.filter((g) => g.result === filter);
  const reversed = [...filtered].reverse();
  const pageGames = reversed.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(reversed.length / perPage);

  const resultIcon = (result: string) => {
    if (result === "win") return "W";
    if (result === "loss") return "L";
    return "D";
  };

  const resultColor = (result: string) => {
    if (result === "win") return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (result === "loss") return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-slate-500/20 text-slate-400 border-slate-500/30";
  };

  const timeClassBadge = (tc: string) => {
    const colors: Record<string, string> = {
      bullet: "bg-red-500/15 text-red-400",
      blitz: "bg-amber-500/15 text-amber-400",
      rapid: "bg-blue-500/15 text-blue-400",
      daily: "bg-violet-500/15 text-violet-400",
    };
    return colors[tc] ?? "bg-slate-500/15 text-slate-400";
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(["all", "win", "loss", "draw"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setPage(0);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 text-xs opacity-70">
              {f === "all"
                ? games.length
                : games.filter((g) => g.result === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Games list */}
      <div className="space-y-2">
        {pageGames.map((g) => (
          <a
            key={g.id}
            href={username ? `/player/${username}/review/${g.id}` : g.url}
            target={username ? undefined : "_blank"}
            rel={username ? undefined : "noopener noreferrer"}
            className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:bg-slate-800/60 transition-colors group"
          >
            {/* Result badge */}
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm border ${resultColor(
                g.result
              )}`}
            >
              {resultIcon(g.result)}
            </div>

            {/* Game info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200 truncate">
                  vs {g.opponentName}
                </span>
                <span className="text-xs text-slate-500">({g.opponentRating})</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${timeClassBadge(
                    g.timeClass
                  )}`}
                >
                  {g.timeClass}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500">{g.opening}</span>
              </div>
            </div>

            {/* Right side */}
            <div className="text-right shrink-0">
              <div className="text-sm text-slate-300">{g.playerRating}</div>
              <div className="text-xs text-slate-500">
                {g.accuracy !== null ? `${g.accuracy.toFixed(1)}% acc` : ""}{" "}
                · {g.resultDetail}
              </div>
              <div className="text-xs text-slate-600">
                {g.date instanceof Date ? g.date.toLocaleDateString() : new Date(g.date).toLocaleDateString()}
              </div>
            </div>

            {/* External link indicator */}
            <div className="text-slate-600 group-hover:text-slate-400 transition-colors">
              ↗
            </div>
          </a>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded text-sm bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-slate-500">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded text-sm bg-slate-800 text-slate-400 disabled:opacity-30 hover:text-white transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
