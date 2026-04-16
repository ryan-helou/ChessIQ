"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Tooltip,
} from "recharts";
import Header from "@/components/Header";
import SectionNav from "@/components/SectionNav";
import ChessLoader from "@/components/ChessLoader";
import { THEME_LABELS, THEME_COLORS } from "@/lib/puzzle-api";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ThemeMiss {
  theme: string;
  missed: number;
}

interface PuzzleSolveRate {
  theme: string;
  attempted: number;
  solved: number;
}

interface TacticsData {
  themes: ThemeMiss[];
  puzzleSolveRates: PuzzleSolveRate[];
  totalGamesAnalyzed: number;
}

interface RadarPoint {
  theme: string;
  label: string;
  foundRate: number;
  missed: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getThemeLabel(theme: string): string {
  return THEME_LABELS[theme] ?? theme.replace(/([A-Z])/g, " $1").trim();
}

function getThemeColor(theme: string): string {
  return THEME_COLORS[theme] ?? "#706e6b";
}

function buildRadarData(themes: ThemeMiss[], totalGamesAnalyzed: number): RadarPoint[] {
  if (totalGamesAnalyzed === 0) return [];
  return themes.map((t) => ({
    theme: t.theme,
    label: getThemeLabel(t.theme),
    foundRate: Math.max(0, Math.round((1 - t.missed / totalGamesAnalyzed) * 100)),
    missed: t.missed,
  }));
}

interface RadarTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: RadarPoint }>;
}

function RadarTooltip({ active, payload }: RadarTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "var(--surface-2, var(--bg-card))",
      border: "1px solid var(--surface-3, var(--border-strong))",
      borderRadius: "8px",
      padding: "10px 14px",
      fontSize: "13px",
    }}>
      <div style={{ fontWeight: 600, color: getThemeColor(d.theme), marginBottom: "4px" }}>
        {d.label}
      </div>
      <div style={{ color: "var(--text-2)" }}>Found rate: {d.foundRate}%</div>
      <div style={{ color: "var(--text-3)", fontSize: "11px" }}>Missed {d.missed} time{d.missed !== 1 ? "s" : ""}</div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function TacticsPage() {
  const params = useParams();
  const username = params.username as string;

  const [data, setData] = useState<TacticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/tactics/${encodeURIComponent(username)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load tactical profile");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [username]);

  const hasData = (data?.themes?.length ?? 0) > 0;
  const radarData = data ? buildRadarData(data.themes, data.totalGamesAnalyzed) : [];

  // Build puzzle solve map for the table
  const puzzleMap = new Map<string, { attempted: number; solved: number }>();
  if (data) {
    for (const p of data.puzzleSolveRates) {
      puzzleMap.set(p.theme, { attempted: p.attempted, solved: p.solved });
    }
  }

  // Sort by found rate for strongest/weakest
  const sorted = [...radarData].sort((a, b) => a.foundRate - b.foundRate);
  const weakest = sorted.slice(0, 3);
  const strongest = [...sorted].reverse().slice(0, 3);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-1)" }}>
      <Header username={username} />
      <SectionNav username={username} />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page title */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", marginBottom: "6px" }}>
            Tactical Profile
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-3)" }}>
            Your tactical strengths and weaknesses across all analyzed games
          </p>
        </div>

        {loading && <ChessLoader username={username} />}

        {error && (
          <div style={{
            background: "var(--loss-dim, rgba(224,85,85,0.08))", border: "1px solid rgba(224,85,85,0.25)",
            borderRadius: "12px", padding: "24px", maxWidth: "420px",
            color: "var(--loss, #ca3431)", fontSize: "14px",
          }}>
            {error}
          </div>
        )}

        {!loading && !error && !hasData && (
          <div style={{
            background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
            borderRadius: "16px", padding: "48px 32px", textAlign: "center", maxWidth: "480px",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>&#9876;</div>
            <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", color: "var(--text-1)" }}>
              No tactical data yet
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-3)", marginBottom: "24px", lineHeight: 1.6 }}>
              Play and analyze more games to see your tactical profile.
              Analysis runs automatically in the background.
            </p>
            <Link
              href={`/player/${encodeURIComponent(username)}`}
              style={{
                display: "inline-block", background: "var(--accent, var(--green))", color: "#fff",
                fontWeight: 600, padding: "10px 20px", borderRadius: "8px",
                textDecoration: "none", fontSize: "14px",
              }}
            >
              Back to dashboard
            </Link>
          </div>
        )}

        {!loading && !error && hasData && data && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* ── Summary cards ── */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{
                background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
                borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                  Games Analyzed
                </div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--text-1)" }}>
                  {data.totalGamesAnalyzed}
                </div>
              </div>
              <div style={{
                background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
                borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                  Tactic Types Tracked
                </div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--text-1)" }}>
                  {data.themes.length}
                </div>
              </div>
              <div style={{
                background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
                borderRadius: "12px", padding: "14px 20px", flex: "0 0 auto",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "5px" }}>
                  Total Misses
                </div>
                <div style={{ fontSize: "26px", fontWeight: 700, color: "var(--danger, #ca3431)" }}>
                  {data.themes.reduce((s, t) => s + t.missed, 0)}
                </div>
              </div>
            </div>

            {/* ── Radar Chart ── */}
            {radarData.length >= 3 && (
              <div style={{
                background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
                borderRadius: "16px", padding: "24px 20px 16px",
              }}>
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)", marginBottom: "16px" }}>
                  Tactical Radar
                </h2>
                <ResponsiveContainer width="100%" height={340}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="var(--surface-3, var(--border))" />
                    <PolarAngleAxis
                      dataKey="label"
                      tick={{ fill: "var(--text-3)", fontSize: 11 }}
                    />
                    <Radar
                      name="Found Rate"
                      dataKey="foundRate"
                      stroke="#81b64c"
                      fill="#81b64c"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                    <Tooltip content={<RadarTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Strongest / Weakest cards ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {/* Strongest */}
              <div style={{
                background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
                borderRadius: "16px", padding: "20px",
              }}>
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#81b64c", marginBottom: "14px" }}>
                  Strongest Themes
                </h2>
                {strongest.length === 0 && (
                  <p style={{ fontSize: "13px", color: "var(--text-3)" }}>Not enough data</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {strongest.map((t, i) => (
                    <div key={t.theme} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 14px", borderRadius: "10px",
                      background: "rgba(129,182,76,0.08)",
                      border: "1px solid rgba(129,182,76,0.18)",
                    }}>
                      <div style={{
                        width: "24px", height: "24px", borderRadius: "50%",
                        background: "rgba(129,182,76,0.15)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 700, color: "#81b64c",
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>
                          {t.label}
                        </div>
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#81b64c" }}>
                        {t.foundRate}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weakest */}
              <div style={{
                background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
                borderRadius: "16px", padding: "20px",
              }}>
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#ca3431", marginBottom: "14px" }}>
                  Weakest Themes
                </h2>
                {weakest.length === 0 && (
                  <p style={{ fontSize: "13px", color: "var(--text-3)" }}>Not enough data</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {weakest.map((t, i) => (
                    <div key={t.theme} style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 14px", borderRadius: "10px",
                      background: "rgba(202,52,49,0.08)",
                      border: "1px solid rgba(202,52,49,0.18)",
                    }}>
                      <div style={{
                        width: "24px", height: "24px", borderRadius: "50%",
                        background: "rgba(202,52,49,0.15)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 700, color: "#ca3431",
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>
                          {t.label}
                        </div>
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#ca3431" }}>
                        {t.foundRate}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Theme Table ── */}
            <div style={{
              background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
              borderRadius: "16px", overflow: "hidden",
            }}>
              <div style={{ padding: "18px 20px 0" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)", marginBottom: "4px" }}>
                  All Tactical Themes
                </h2>
                <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "14px" }}>
                  Detailed breakdown of every tactic type detected in your games
                </p>
              </div>

              {/* Header row */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 90px 100px 100px",
                padding: "8px 20px", borderBottom: "1px solid var(--surface-3, var(--border))",
                fontSize: "11px", fontWeight: 600, color: "var(--text-3)",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                <div>Theme</div>
                <div style={{ textAlign: "right" }}>Missed</div>
                <div style={{ textAlign: "right" }}>Found %</div>
                <div style={{ textAlign: "right" }}>Puzzle Solve %</div>
              </div>

              {/* Data rows */}
              {radarData.map((t, i) => {
                const puzzle = puzzleMap.get(t.theme);
                const puzzlePct = puzzle && puzzle.attempted > 0
                  ? Math.round((puzzle.solved / puzzle.attempted) * 100)
                  : null;
                return (
                  <div
                    key={t.theme}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr 90px 100px 100px",
                      padding: "12px 20px", alignItems: "center",
                      borderBottom: i < radarData.length - 1
                        ? "1px solid var(--surface-3, var(--border))"
                        : "none",
                    }}
                  >
                    {/* Theme name + color dot */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "8px", height: "8px", borderRadius: "50%",
                        background: getThemeColor(t.theme), flexShrink: 0,
                      }} />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-1)" }}>
                        {t.label}
                      </span>
                    </div>

                    {/* Missed count */}
                    <div style={{ textAlign: "right", fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>
                      {t.missed}
                    </div>

                    {/* Found % with bar */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                        <div style={{
                          width: "48px", height: "4px", borderRadius: "2px",
                          background: "var(--surface-3, var(--border))", overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", width: `${t.foundRate}%`,
                            background: t.foundRate >= 70 ? "#81b64c" : t.foundRate >= 40 ? "#f6c700" : "#ca3431",
                            borderRadius: "2px", transition: "width 0.6s ease",
                          }} />
                        </div>
                        <span style={{
                          fontSize: "13px", fontWeight: 600, minWidth: "32px",
                          color: t.foundRate >= 70 ? "#81b64c" : t.foundRate >= 40 ? "#f6c700" : "#ca3431",
                        }}>
                          {t.foundRate}%
                        </span>
                      </div>
                    </div>

                    {/* Puzzle solve % */}
                    <div style={{ textAlign: "right" }}>
                      {puzzlePct != null ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                          <div style={{
                            width: "48px", height: "4px", borderRadius: "2px",
                            background: "var(--surface-3, var(--border))", overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%", width: `${puzzlePct}%`,
                              background: "#5d8fbb",
                              borderRadius: "2px", transition: "width 0.6s ease",
                            }} />
                          </div>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "#5d8fbb", minWidth: "32px" }}>
                            {puzzlePct}%
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--text-3)" }}>--</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── CTA ── */}
            <div style={{
              background: "var(--surface-1, var(--bg-card))", border: "1px solid var(--surface-3, var(--border))",
              borderRadius: "16px", padding: "24px 28px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: "16px",
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
                  Train your weakest tactics
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
                  Personalised puzzles targeting your weakest themes are ready.
                </div>
              </div>
              <Link
                href={`/player/${encodeURIComponent(username)}/puzzles`}
                style={{
                  display: "inline-block", background: "var(--accent, var(--green))", color: "#fff",
                  fontWeight: 700, padding: "10px 22px", borderRadius: "8px",
                  textDecoration: "none", fontSize: "14px", whiteSpace: "nowrap",
                }}
              >
                Start Training
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
