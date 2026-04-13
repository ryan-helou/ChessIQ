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

  const filtered = filter === "all" ? games : games.filter((g) => g.result === filter);
  const reversed = [...filtered].reverse();
  const pageGames = reversed.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(reversed.length / perPage);

  const resultConfig = {
    win:  { letter: "W", color: "var(--win)",  bg: "var(--win-dim)" },
    loss: { letter: "L", color: "var(--loss)", bg: "var(--loss-dim)" },
    draw: { letter: "D", color: "var(--draw)", bg: "var(--draw-dim)" },
  };

  const tcColor: Record<string, string> = {
    bullet: "var(--loss)",
    blitz:  "var(--gold)",
    rapid:  "var(--win)",
    daily:  "var(--blue)",
  };

  const filterCounts = {
    all:  games.length,
    win:  games.filter((g) => g.result === "win").length,
    loss: games.filter((g) => g.result === "loss").length,
    draw: games.filter((g) => g.result === "draw").length,
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
        {(["all", "win", "loss", "draw"] as const).map((f) => {
          const isActive = filter === f;
          const accent = f === "all" ? "var(--green)" : resultConfig[f].color;
          return (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0); }}
              style={{
                padding: "5px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
                border: `1px solid ${isActive ? accent : "var(--border)"}`,
                background: isActive ? `${accent}18` : "var(--bg-card)",
                color: isActive ? accent : "var(--text-3)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {f.toUpperCase()}
              <span style={{ marginLeft: "6px", opacity: 0.6 }}>{filterCounts[f]}</span>
            </button>
          );
        })}
      </div>

      {/* Games */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {pageGames.map((g, idx) => {
          const rc = resultConfig[g.result as keyof typeof resultConfig] ?? resultConfig.draw;
          const dateStr = g.date instanceof Date
            ? g.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : new Date(g.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

          return (
            <a
              key={g.id}
              href={username ? `/player/${username}/review/${g.id}` : g.url}
              target={username ? undefined : "_blank"}
              rel={username ? undefined : "noopener noreferrer"}
              onClick={() => {
                if (username) {
                  try {
                    sessionStorage.setItem(`game_${g.id}`, JSON.stringify({
                      white: g.playerColor === "white" ? username : g.opponentName,
                      black: g.playerColor === "black" ? username : g.opponentName,
                      whiteElo: String(g.playerColor === "white" ? g.playerRating : g.opponentRating),
                      blackElo: String(g.playerColor === "black" ? g.playerRating : g.opponentRating),
                      result: g.result === "win"
                        ? g.playerColor === "white" ? "1-0" : "0-1"
                        : g.result === "loss"
                        ? g.playerColor === "white" ? "0-1" : "1-0"
                        : "½-½",
                      date: dateStr,
                      opening: g.opening,
                      playerColor: g.playerColor,
                      pgn: g.pgn,
                    }));
                  } catch {}
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                textDecoration: "none",
                color: "inherit",
                transition: "background 0.15s, border-color 0.15s",
                animation: "fadeIn 0.3s ease both",
                animationDelay: `${idx * 0.02}s`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-card-hover)";
                e.currentTarget.style.borderColor = "var(--border-strong)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg-card)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              {/* Result badge */}
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: rc.bg,
                border: `1px solid ${rc.color}40`,
                color: rc.color,
                fontSize: "12px",
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}>
                {rc.letter}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    vs {g.opponentName}
                  </span>
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
                    ({g.opponentRating})
                  </span>
                  <span style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.06em",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    background: `${tcColor[g.timeClass] ?? "var(--text-3)"}18`,
                    color: tcColor[g.timeClass] ?? "var(--text-3)",
                    border: `1px solid ${tcColor[g.timeClass] ?? "var(--text-3)"}30`,
                    textTransform: "uppercase",
                  }}>
                    {g.timeClass}
                  </span>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.opening}
                </div>
              </div>

              {/* Right */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text-2)", fontWeight: 600 }}>
                  {g.playerRating}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                  {g.accuracy !== null ? `${g.accuracy.toFixed(1)}%` : "—"}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{dateStr}</div>
              </div>

              <div style={{ color: "var(--text-3)", fontSize: "12px", flexShrink: 0 }}>↗</div>
            </a>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              padding: "5px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              cursor: page === 0 ? "not-allowed" : "pointer",
              opacity: page === 0 ? 0.3 : 1,
              transition: "all 0.15s",
            }}
          >
            ← prev
          </button>
          <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-3)", letterSpacing: "0.06em" }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{
              padding: "5px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
              opacity: page >= totalPages - 1 ? 0.3 : 1,
              transition: "all 0.15s",
            }}
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}
