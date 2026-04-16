"use client";

import { type WeaknessProfile, type PuzzleStats, THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

// ─────────────────────────────────────────────────────────────
// Theme icons
// ─────────────────────────────────────────────────────────────

const THEME_ICONS: Record<string, string> = {
  fork: "\u2694\uFE0F",
  pin: "\uD83D\uDCCC",
  skewer: "\uD83D\uDDE1\uFE0F",
  hangingPiece: "\uD83C\uDFAF",
  backRankMate: "\u265B",
  discoveredAttack: "\uD83D\uDCA5",
  doubleAttack: "\u26A1",
  sacrifice: "\uD83D\uDD25",
  doubleCheck: "\u26A1",
  trappedPiece: "\uD83E\uDEE4",
  promotion: "\uD83D\uDC51",
  mate: "\u265A",
  materialGain: "\uD83D\uDCB0",
  deflection: "\u21AA\uFE0F",
  decoy: "\uD83C\uDFA3",
  exposedKing: "\uD83D\uDEE1\uFE0F",
  weakKingSafety: "\uD83D\uDEE1\uFE0F",
  pawnStructure: "\u265F\uFE0F",
  poorPawnStructure: "\u265F\uFE0F",
  overextension: "\uD83E\uDDB6",
};

const DEFAULT_ICON = "\u265F\uFE0F";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatThemeName(theme: string): string {
  if (THEME_LABELS[theme]) return THEME_LABELS[theme];
  // camelCase → Title Case
  return theme
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface RecommendationCardsProps {
  weaknesses: WeaknessProfile[];
  stats: PuzzleStats;
  onSelectTheme: (theme: string) => void;
}

export default function RecommendationCards({
  weaknesses,
  stats,
  onSelectTheme,
}: RecommendationCardsProps) {
  if (!weaknesses || weaknesses.length === 0) {
    return (
      <div
        style={{
          background: "var(--surface-2)",
          borderRadius: "16px",
          padding: "48px 24px",
          textAlign: "center",
          border: "1px solid var(--surface-3)",
        }}
      >
        <div style={{ fontSize: "40px", marginBottom: "16px", opacity: 0.6 }}>{"\u265F\uFE0F"}</div>
        <h3
          style={{
            color: "var(--text-1)",
            fontSize: "18px",
            fontWeight: 700,
            margin: "0 0 8px 0",
          }}
        >
          No weaknesses detected yet
        </h3>
        <p
          style={{
            color: "var(--text-2)",
            fontSize: "14px",
            margin: 0,
            maxWidth: "380px",
            marginInline: "auto",
            lineHeight: 1.5,
          }}
        >
          Analyze more games to discover your tactical blind spots. Once patterns emerge, we will
          recommend targeted puzzles here.
        </p>
      </div>
    );
  }

  const maxPercentage = Math.max(...weaknesses.map((w) => w.percentage), 1);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ color: "var(--text-1)", fontSize: "18px", fontWeight: 800, margin: 0 }}>
          Your Weak Spots
        </h2>
        {stats.totalAttempted > 0 && (
          <span style={{ color: "var(--text-2)", fontSize: "12px" }}>
            {stats.totalSolved}/{stats.totalAttempted} solved ({Math.round(stats.solveRate * 100)}%)
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "12px",
        }}
      >
        {weaknesses.map((w) => {
          const icon = THEME_ICONS[w.theme] ?? DEFAULT_ICON;
          const color = THEME_COLORS[w.theme] ?? "#9e9b98";
          const name = formatThemeName(w.theme);
          const barWidth = Math.max((w.percentage / maxPercentage) * 100, 8);

          return (
            <div
              key={w.theme}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--surface-3)",
                borderRadius: "14px",
                padding: "20px",
                cursor: "pointer",
                transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = color;
                el.style.transform = "translateY(-2px)";
                el.style.boxShadow = `0 4px 20px ${color}22`;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "var(--surface-3)";
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "none";
              }}
              onClick={() => onSelectTheme(w.theme)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTheme(w.theme);
                }
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: `${color}1A`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--text-1)",
                      fontSize: "15px",
                      fontWeight: 700,
                      lineHeight: 1.2,
                    }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      color: "var(--text-2)",
                      fontSize: "12px",
                      marginTop: "2px",
                      lineHeight: 1.3,
                    }}
                  >
                    You missed {w.count} {name.toLowerCase()}{w.count === 1 ? "" : "s"} in recent games
                  </div>
                </div>
                <div
                  style={{
                    color,
                    fontSize: "20px",
                    fontWeight: 900,
                    flexShrink: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {w.percentage}%
                </div>
              </div>

              {/* Percentage bar */}
              <div
                style={{
                  height: "6px",
                  borderRadius: "3px",
                  background: "var(--surface-3)",
                  overflow: "hidden",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${barWidth}%`,
                    borderRadius: "3px",
                    background: color,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>

              {/* Train button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTheme(w.theme);
                }}
                style={{
                  width: "100%",
                  padding: "8px 0",
                  borderRadius: "8px",
                  border: `1px solid ${color}44`,
                  background: `${color}15`,
                  color,
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                  letterSpacing: "0.01em",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${color}2A`;
                  e.currentTarget.style.borderColor = `${color}66`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `${color}15`;
                  e.currentTarget.style.borderColor = `${color}44`;
                }}
              >
                Train {name}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
