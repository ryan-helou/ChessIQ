"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import Header from "@/components/Header";
import SectionNav from "@/components/SectionNav";
import ChessLoader from "@/components/ChessLoader";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";
import type { WeaknessProfile } from "@/lib/puzzle-api";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface CategoryBreakdown {
  category: string;
  key: string;
  count: number;
  percentage: number;
  description: string;
}

interface OpeningLossEntry {
  name: string;
  losses: number;
  avgFirstBlunderMove: number | null;
}

interface LossPatternData {
  totalLosses: number;
  byCategory: CategoryBreakdown[];
  avgFirstBlunderMove: number | null;
  byOpening: OpeningLossEntry[];
  recentTrend: "improving" | "declining" | "stable";
}

interface WeaknessData {
  weaknesses: WeaknessProfile[];
  totalBlunders: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const DEFAULT_COLOR = "#706e6b";

function getThemeLabel(theme: string) {
  return THEME_LABELS[theme] ?? theme.replace(/([A-Z])/g, " $1").trim();
}

function getThemeColor(theme: string) {
  return THEME_COLORS[theme] ?? DEFAULT_COLOR;
}

function severityLabel(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 25) return { label: "Critical", color: "#ca3431", bg: "rgba(202,52,49,0.12)" };
  if (pct >= 15) return { label: "High",     color: "#e28c28", bg: "rgba(226,140,40,0.12)" };
  if (pct >= 8)  return { label: "Medium",   color: "#f6c700", bg: "rgba(246,199,0,0.12)" };
  return             { label: "Low",     color: "#81b64c", bg: "rgba(129,182,76,0.12)" };
}

const CATEGORY_COLORS: Record<string, string> = {
  tactical:   "#ca3431",
  opening:    "#e28c28",
  positional: "#f6c700",
  outplayed:  "#706e6b",
};

const TREND_CONFIG = {
  improving: { label: "Improving",  color: "#81b64c", icon: "↑" },
  declining: { label: "Declining",  color: "#ca3431", icon: "↓" },
  stable:    { label: "Stable",     color: "#706e6b", icon: "→" },
};

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: WeaknessProfile }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-strong)",
      borderRadius: "8px",
      padding: "10px 14px",
      fontSize: "13px",
    }}>
      <div style={{ fontWeight: 600, color: getThemeColor(d.theme), marginBottom: "4px" }}>
        {getThemeLabel(d.theme)}
      </div>
      <div style={{ color: "var(--text-2)" }}>{d.count} blunder{d.count !== 1 ? "s" : ""}</div>
      <div style={{ color: "var(--text-3)", fontSize: "11px" }}>{d.percentage}% of total</div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function LossesPage() {
  const params = useParams();
  const username = params.username as string;

  const [patterns, setPatterns] = useState<LossPatternData | null>(null);
  const [weaknessData, setWeaknessData] = useState<WeaknessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/loss-patterns/${encodeURIComponent(username)}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load loss patterns");
        return r.json();
      }),
      fetch(`/api/puzzles/recommendations/${encodeURIComponent(username)}?limit=1`).then((r) => {
        if (!r.ok) throw new Error("Failed to load weakness data");
        return r.json();
      }),
    ])
      .then(([lp, wd]) => {
        setPatterns(lp);
        setWeaknessData({ weaknesses: wd.weaknesses ?? [], totalBlunders: wd.totalBlunders ?? 0 });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [username]);

  const hasPatterns = (patterns?.byCategory?.length ?? 0) > 0;
  const hasWeaknesses = (weaknessData?.weaknesses?.length ?? 0) > 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-1)" }}>
      <Header username={username} />
      <SectionNav username={username} />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page title */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", marginBottom: "6px" }}>
            Loss Patterns
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-3)" }}>
            Why you lose — tactical errors, opening mistakes, and recurring weaknesses
          </p>
        </div>

        {loading && <ChessLoader username={username} />}

        {error && (
          <div style={{
            background: "var(--loss-dim)", border: "1px solid rgba(224,85,85,0.25)",
            borderRadius: "12px", padding: "24px", maxWidth: "420px",
            color: "var(--loss)", fontSize: "14px",
          }}>
            {error}
          </div>
        )}

        {!loading && !error && !hasPatterns && !hasWeaknesses && (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "16px", padding: "48px 32px", textAlign: "center", maxWidth: "480px",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>♜</div>
            <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", color: "var(--text-1)" }}>
              No losses analysed yet
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-3)", marginBottom: "24px", lineHeight: 1.6 }}>
              Once your games are analysed, we'll detect recurring patterns in your losses and show them here.
              Analysis runs automatically in the background.
            </p>
            <Link
              href={`/player/${encodeURIComponent(username)}`}
              style={{
                display: "inline-block", background: "var(--green)", color: "#fff",
                fontWeight: 600, padding: "10px 20px", borderRadius: "8px",
                textDecoration: "none", fontSize: "14px",
              }}
            >
              Back to dashboard
            </Link>
          </div>
        )}

        {!loading && !error && (hasPatterns || hasWeaknesses) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* ── Loss Category Breakdown ── */}
            {hasPatterns && patterns && (
              <div>
                {/* Summary row */}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
                  <div style={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                      Total Losses
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: 700, color: "#ca3431" }}>
                      {patterns.totalLosses}
                    </div>
                  </div>

                  {patterns.avgFirstBlunderMove != null && (
                    <div style={{
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
                    }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                        Avg First Blunder
                      </div>
                      <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--text-1)" }}>
                        Move {patterns.avgFirstBlunderMove}
                      </div>
                    </div>
                  )}

                  {patterns.recentTrend !== "stable" && (
                    <div style={{
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
                    }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                        Recent Trend
                      </div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: TREND_CONFIG[patterns.recentTrend].color, display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{TREND_CONFIG[patterns.recentTrend].icon}</span>
                        <span>{TREND_CONFIG[patterns.recentTrend].label}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Category cards */}
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)", marginBottom: "12px" }}>
                  Why You Lost
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "24px" }}>
                  {patterns.byCategory.map((cat) => {
                    const color = CATEGORY_COLORS[cat.key] ?? "#706e6b";
                    return (
                      <div
                        key={cat.key}
                        style={{
                          background: "var(--bg-card)", border: "1px solid var(--border)",
                          borderRadius: "12px", padding: "14px 18px",
                          display: "flex", alignItems: "center", gap: "14px",
                        }}
                      >
                        {/* Category */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "14px", color, marginBottom: "3px" }}>
                            {cat.category}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                            {cat.description}
                          </div>
                          {/* Progress bar */}
                          <div style={{ height: "3px", background: "var(--border)", borderRadius: "2px", overflow: "hidden", marginTop: "6px" }}>
                            <div style={{
                              height: "100%",
                              width: `${cat.percentage}%`,
                              background: color,
                              borderRadius: "2px",
                              transition: "width 0.6s ease",
                            }} />
                          </div>
                        </div>

                        {/* Count + pct */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)" }}>
                            {cat.count}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                            {cat.percentage}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* By opening */}
                {patterns.byOpening.length > 0 && (
                  <div style={{ marginBottom: "24px" }}>
                    <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)", marginBottom: "12px" }}>
                      Losses by Opening
                    </h2>
                    <div style={{
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      borderRadius: "12px", overflow: "hidden",
                    }}>
                      {patterns.byOpening.map((op, i) => (
                        <div
                          key={op.name}
                          style={{
                            display: "flex", alignItems: "center", gap: "12px",
                            padding: "10px 16px",
                            borderBottom: i < patterns.byOpening.length - 1 ? "1px solid var(--border)" : "none",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {op.name}
                            </div>
                            {op.avgFirstBlunderMove != null && (
                              <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                                First blunder around move {op.avgFirstBlunderMove}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#ca3431", flexShrink: 0 }}>
                            {op.losses}L
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tactical Weakness Breakdown (existing) ── */}
            {hasWeaknesses && weaknessData && (
              <div>
                <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "14px", color: "var(--text-1)" }}>
                  Tactical Weaknesses
                </h2>

                {/* Summary row */}
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
                  <div style={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                      Total Blunders
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--loss)" }}>
                      {weaknessData.totalBlunders}
                    </div>
                  </div>
                  <div style={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                      Weakness Categories
                    </div>
                    <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--text-1)" }}>
                      {weaknessData.weaknesses.length}
                    </div>
                  </div>
                  <div style={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                      Biggest Weakness
                    </div>
                    <div style={{ fontSize: "17px", fontWeight: 700, color: getThemeColor(weaknessData.weaknesses[0].theme) }}>
                      {getThemeLabel(weaknessData.weaknesses[0].theme)}
                    </div>
                  </div>
                </div>

                {/* Bar chart */}
                <div style={{
                  background: "var(--bg-card)", border: "1px solid var(--border)",
                  borderRadius: "16px", padding: "20px 20px 10px", marginBottom: "14px",
                }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={weaknessData.weaknesses}
                      margin={{ top: 4, right: 16, left: -8, bottom: 4 }}
                      barSize={28}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="theme"
                        tickFormatter={getThemeLabel}
                        tick={{ fill: "var(--text-3)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "var(--text-3)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {weaknessData.weaknesses.map((w) => (
                          <Cell key={w.theme} fill={getThemeColor(w.theme)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Weakness cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {weaknessData.weaknesses.map((w, i) => {
                    const sev = severityLabel(w.percentage);
                    return (
                      <div
                        key={w.theme}
                        style={{
                          background: "var(--bg-card)", border: "1px solid var(--border)",
                          borderRadius: "12px", padding: "14px 20px",
                          display: "flex", alignItems: "center", gap: "16px",
                        }}
                      >
                        <div style={{
                          width: "28px", height: "28px", borderRadius: "50%",
                          background: "var(--bg)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "12px", fontWeight: 700, color: "var(--text-3)",
                          flexShrink: 0,
                        }}>
                          {i + 1}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "14px", color: getThemeColor(w.theme), marginBottom: "4px" }}>
                            {getThemeLabel(w.theme)}
                          </div>
                          <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${Math.min(100, w.percentage * 3)}%`,
                              background: getThemeColor(w.theme),
                              borderRadius: "2px",
                              transition: "width 0.6s ease",
                            }} />
                          </div>
                        </div>

                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
                            {w.count}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                            {w.percentage}%
                          </div>
                        </div>

                        <div style={{
                          padding: "3px 10px", borderRadius: "20px",
                          background: sev.bg, color: sev.color,
                          fontSize: "11px", fontWeight: 600, flexShrink: 0,
                        }}>
                          {sev.label}
                        </div>

                        <Link
                          href={`/player/${encodeURIComponent(username)}?filter=loss#games`}
                          style={{
                            flexShrink: 0, padding: "6px 12px", borderRadius: "8px",
                            background: "none", border: "1px solid var(--border)",
                            color: "var(--text-3)", fontSize: "12px", fontWeight: 600,
                            textDecoration: "none", whiteSpace: "nowrap",
                          }}
                        >
                          See games →
                        </Link>

                        <Link
                          href={`/player/${encodeURIComponent(username)}/puzzles`}
                          style={{
                            flexShrink: 0, padding: "6px 14px", borderRadius: "8px",
                            background: "var(--green)", color: "#fff",
                            fontSize: "12px", fontWeight: 600, textDecoration: "none",
                          }}
                        >
                          Practice
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "16px", padding: "24px 28px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: "16px",
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
                  Ready to fix these weaknesses?
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
                  Personalised puzzles targeting your top weaknesses are waiting.
                </div>
              </div>
              <Link
                href={`/player/${encodeURIComponent(username)}/puzzles`}
                style={{
                  display: "inline-block", background: "var(--green)", color: "#fff",
                  fontWeight: 700, padding: "10px 22px", borderRadius: "8px",
                  textDecoration: "none", fontSize: "14px", whiteSpace: "nowrap",
                }}
              >
                Start Training →
              </Link>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
