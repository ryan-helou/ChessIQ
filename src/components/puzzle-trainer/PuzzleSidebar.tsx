"use client";

import type { TrainerPuzzle, PuzzleStats } from "@/lib/puzzle-api";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

interface Props {
  puzzle: TrainerPuzzle | null;
  puzzleIndex: number;
  totalPuzzles: number;
  sessionSolved: number;
  sessionTotal: number;
  streak: number;
  stats: PuzzleStats | null;
  onHint: () => void;
  onSkip: () => void;
}

export default function PuzzleSidebar({
  puzzle,
  puzzleIndex,
  totalPuzzles,
  sessionSolved,
  sessionTotal,
  streak,
  stats,
  onHint,
  onSkip,
}: Props) {
  const mainTheme = puzzle?.themes[0] ?? null;
  const themeLabel = mainTheme ? THEME_LABELS[mainTheme] ?? mainTheme : "—";
  const themeColor = mainTheme ? THEME_COLORS[mainTheme] ?? "var(--text-3)" : "var(--text-3)";

  return (
    <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Puzzle {puzzleIndex + 1} of {totalPuzzles}
          </span>
          {puzzle?.rating && (
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
              Rated <span style={{ color: "var(--green)", fontWeight: 700 }}>{puzzle.rating}</span>
            </span>
          )}
        </div>

        {mainTheme && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 10px",
              borderRadius: "100px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              color: "#fff",
              background: themeColor,
              letterSpacing: "0.04em",
            }}>
              {themeLabel}
            </span>
            {puzzle?.themes.slice(1, 3).map((t) => (
              <span key={t} style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-3)",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                padding: "2px 8px",
                borderRadius: "100px",
              }}>
                {THEME_LABELS[t] ?? t}
              </span>
            ))}
          </div>
        )}

        <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: "8px" }}>{puzzle?.sourceLabel ?? "—"}</div>
      </div>

      {/* Actions */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px" }}>
        <button
          onClick={onHint}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text-2)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--green-line)"; e.currentTarget.style.color = "var(--green)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)"; }}
        >
          Hint
        </button>
        <button
          onClick={onSkip}
          style={{
            flex: 1,
            padding: "8px 12px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text-3)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; }}
        >
          Skip
        </button>
      </div>

      {/* Session stats */}
      <div style={{ padding: "16px 20px", flex: 1 }}>
        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "12px" }}>Session</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "Solved", value: `${sessionSolved} / ${sessionTotal}`, accent: undefined },
            { label: "Streak", value: String(streak), accent: streak > 0 ? "var(--green)" : undefined },
            { label: "Accuracy", value: sessionTotal > 0 ? `${Math.round((sessionSolved / sessionTotal) * 100)}%` : "—", accent: undefined },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{row.label}</span>
              <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: row.accent || "var(--text-1)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* All-time stats */}
      {stats && stats.totalAttempted > 0 && (
        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: "12px" }}>All Time</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Solved</span>
              <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-1)" }}>{stats.totalSolved} / {stats.totalAttempted}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Solve Rate</span>
              <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--win)" }}>{stats.solveRate}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
