"use client";

import { memo, useState, useCallback, useMemo } from "react";
import type { ParsedGame } from "@/lib/game-analysis";
import { useToast } from "@/components/Toast";

interface Props {
  games: ParsedGame[];
  username?: string;
}

const resultConfig = {
  win:  { letter: "W", color: "var(--win)",  bg: "var(--win-dim)" },
  loss: { letter: "L", color: "var(--loss)", bg: "var(--loss-dim)" },
  draw: { letter: "D", color: "var(--draw)", bg: "var(--draw-dim)" },
} as const;

const tcColor: Record<string, string> = {
  bullet: "var(--loss)",
  blitz:  "var(--gold)",
  rapid:  "var(--win)",
  daily:  "var(--blue)",
};

export default function GamesList({ games, username }: Props) {
  const [filter, setFilter] = useState<"all" | "win" | "loss" | "draw">("all");
  const [page, setPage] = useState(0);
  const [reanalyzeState, setReanalyzeState] = useState<Record<string, "idle" | "loading" | "queued" | "already">>({});
  const { toast } = useToast();

  const handleReanalyze = useCallback(async (e: React.MouseEvent, gameId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!username || reanalyzeState[gameId] === "loading") return;
    setReanalyzeState((s) => ({ ...s, [gameId]: "loading" }));
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(gameId)}/reanalyze`, { method: "POST" });
      const data = await res.json();
      if (data.status === "already_queued") {
        toast("Already in the analysis queue", "info");
        setReanalyzeState((s) => ({ ...s, [gameId]: "already" }));
      } else {
        toast("Game queued for analysis");
        setReanalyzeState((s) => ({ ...s, [gameId]: "queued" }));
      }
      setTimeout(() => setReanalyzeState((s) => ({ ...s, [gameId]: "idle" })), 2000);
    } catch {
      toast("Failed to queue analysis", "error");
      setReanalyzeState((s) => ({ ...s, [gameId]: "idle" }));
    }
  }, [username, reanalyzeState, toast]);
  const perPage = 20;

  const reversed = useMemo(() => {
    const f = filter === "all" ? games : games.filter((g) => g.result === filter);
    return [...f].reverse();
  }, [games, filter]);
  const pageGames = useMemo(
    () => reversed.slice(page * perPage, (page + 1) * perPage),
    [reversed, page],
  );
  const reversedIds = useMemo(() => reversed.map((x) => x.id), [reversed]);
  const totalPages = Math.ceil(reversed.length / perPage);

  const filterCounts = useMemo(() => ({
    all:  games.length,
    win:  games.filter((g) => g.result === "win").length,
    loss: games.filter((g) => g.result === "loss").length,
    draw: games.filter((g) => g.result === "draw").length,
  }), [games]);

  return (
    <div>
      {/* Filters */}
      <div role="toolbar" aria-label="Filter games by result" style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
        {(["all", "win", "loss", "draw"] as const).map((f) => {
          const isActive = filter === f;
          const accent = f === "all" ? "var(--green)" : resultConfig[f].color;
          const label = f === "all" ? "Show all games" : `Show ${f} games only`;
          return (
            <button
              key={f}
              type="button"
              onClick={() => { setFilter(f); setPage(0); }}
              aria-pressed={isActive}
              aria-label={`${label} (${filterCounts[f]})`}
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

      {/* Empty state */}
      {reversed.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "40px 16px",
          color: "var(--text-3)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>♟</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-2)", marginBottom: 6 }}>
            No {filter === "all" ? "" : filter + " "}games found
          </div>
          {filter !== "all" && (
            <button
              onClick={() => { setFilter("all"); setPage(0); }}
              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 14px", fontSize: 12, color: "var(--text-3)", cursor: "pointer", marginTop: 4 }}
            >
              Show all games
            </button>
          )}
        </div>
      )}

      {/* Games */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {pageGames.map((g, idx) => (
          <GameRow
            key={g.id}
            game={g}
            idx={idx}
            username={username}
            reversedIds={reversedIds}
            reanalyzeStatus={reanalyzeState[g.id]}
            onReanalyze={handleReanalyze}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav aria-label="Game list pagination" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous page of games"
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
          <span aria-live="polite" style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-3)", letterSpacing: "0.06em" }}>
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            aria-label="Next page of games"
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
        </nav>
      )}
    </div>
  );
}

type ReanalyzeStatus = "idle" | "loading" | "queued" | "already" | undefined;

interface GameRowProps {
  game: ParsedGame;
  idx: number;
  username?: string;
  reversedIds: string[];
  reanalyzeStatus: ReanalyzeStatus;
  onReanalyze: (e: React.MouseEvent, gameId: string) => void;
}

const GameRow = memo(function GameRow({
  game: g,
  idx,
  username,
  reversedIds,
  reanalyzeStatus,
  onReanalyze,
}: GameRowProps) {
  const rc = resultConfig[g.result as keyof typeof resultConfig] ?? resultConfig.draw;
  const dateObj = g.date instanceof Date ? g.date : new Date(g.date);
  const dateStr = isNaN(dateObj.getTime())
    ? "—"
    : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <a
      href={username ? `/player/${username}/review/${g.id}` : g.url}
      target={username ? undefined : "_blank"}
      rel={username ? undefined : "noopener noreferrer"}
      onClick={() => {
        if (username) {
          try {
            sessionStorage.setItem("chessiq_game_list", JSON.stringify({ username, ids: reversedIds }));
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
        transition: "all 0.15s ease",
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

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text-2)", fontWeight: 600 }}>
          {g.playerRating}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          {g.accuracy !== null ? `${g.accuracy.toFixed(1)}%` : "—"}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{dateStr}</div>
      </div>

      {username && (
        <button
          type="button"
          onClick={(e) => onReanalyze(e, g.id)}
          title="Re-analyze with Stockfish"
          aria-label="Re-analyze this game with Stockfish"
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            padding: "2px 4px",
            cursor: reanalyzeStatus === "loading" ? "wait" : "pointer",
            fontSize: "13px",
            color: reanalyzeStatus === "queued" ? "var(--win)"
                 : reanalyzeStatus === "already" ? "var(--text-3)"
                 : "var(--text-3)",
            lineHeight: 1,
            transition: "color 0.2s",
          }}
        >
          {reanalyzeStatus === "loading" ? "…"
           : reanalyzeStatus === "queued" ? "✓"
           : reanalyzeStatus === "already" ? "✓"
           : "↻"}
        </button>
      )}
      <div style={{ color: "var(--text-3)", fontSize: "12px", flexShrink: 0 }}>↗</div>
    </a>
  );
});
