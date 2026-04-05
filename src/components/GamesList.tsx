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
    if (result === "win") return "bg-[#81b64c]/20 text-[#81b64c] border-[#81b64c]/30";
    if (result === "loss") return "bg-[#e62929]/20 text-[#e62929] border-[#e62929]/30";
    return "bg-[#989795]/20 text-[#989795] border-[#989795]/30";
  };

  const timeClassBadge = (tc: string) => {
    const colors: Record<string, string> = {
      bullet: "bg-[#e62929]/15 text-[#e62929]",
      blitz: "bg-[#e6a117]/15 text-[#e6a117]",
      rapid: "bg-[#81b64c]/15 text-[#81b64c]",
      daily: "bg-[#8b5cf6]/15 text-[#8b5cf6]",
    };
    return colors[tc] ?? "bg-[#989795]/15 text-[#989795]";
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
                ? "bg-[#81b64c] text-white"
                : "bg-[#3a3835] text-[#989795] hover:text-white"
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
            className="flex items-center gap-3 p-3 rounded-lg bg-[#262522] border border-[#3a3835] hover:bg-[#3a3835] transition-colors group"
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
                <span className="text-sm font-medium text-white truncate">
                  vs {g.opponentName}
                </span>
                <span className="text-xs text-[#706e6b]">({g.opponentRating})</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${timeClassBadge(
                    g.timeClass
                  )}`}
                >
                  {g.timeClass}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-[#706e6b]">{g.opening}</span>
              </div>
            </div>

            {/* Right side */}
            <div className="text-right shrink-0">
              <div className="text-sm text-[#e8e6e1]">{g.playerRating}</div>
              <div className="text-xs text-[#706e6b]">
                {g.accuracy !== null ? `${g.accuracy.toFixed(1)}% acc` : ""}{" "}
                · {g.resultDetail}
              </div>
              <div className="text-xs text-[#706e6b]">
                {g.date instanceof Date ? g.date.toLocaleDateString() : new Date(g.date).toLocaleDateString()}
              </div>
            </div>

            {/* External link indicator */}
            <div className="text-[#706e6b] group-hover:text-[#989795] transition-colors">
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
            className="px-3 py-1.5 rounded text-sm bg-[#3a3835] text-[#989795] disabled:opacity-30 hover:text-white transition-colors"
          >
            Prev
          </button>
          <span className="text-sm text-[#706e6b]">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded text-sm bg-[#3a3835] text-[#989795] disabled:opacity-30 hover:text-white transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
