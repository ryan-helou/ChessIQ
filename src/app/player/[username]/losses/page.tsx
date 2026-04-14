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

interface LossData {
  weaknesses: WeaknessProfile[];
  totalBlunders: number;
}

const DEFAULT_COLOR = "#706e6b";

function getThemeLabel(theme: string) {
  return THEME_LABELS[theme] ?? theme.replace(/([A-Z])/g, " $1").trim();
}

function getThemeColor(theme: string) {
  return THEME_COLORS[theme] ?? DEFAULT_COLOR;
}

// Severity badge colours — mapped from weakness percentage
function severityLabel(pct: number): { label: string; color: string; bg: string } {
  if (pct >= 25) return { label: "Critical", color: "#ca3431", bg: "rgba(202,52,49,0.12)" };
  if (pct >= 15) return { label: "High", color: "#e28c28", bg: "rgba(226,140,40,0.12)" };
  if (pct >= 8)  return { label: "Medium", color: "#f6c700", bg: "rgba(246,199,0,0.12)" };
  return           { label: "Low",    color: "#81b64c", bg: "rgba(129,182,76,0.12)" };
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: WeaknessProfile }>;
  label?: string;
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

export default function LossesPage() {
  const params = useParams();
  const username = params.username as string;

  const [data, setData] = useState<LossData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/puzzles/recommendations/${encodeURIComponent(username)}?limit=1`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load data");
        return r.json();
      })
      .then((d) => setData({ weaknesses: d.weaknesses ?? [], totalBlunders: d.totalBlunders ?? 0 }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [username]);

  const hasData = (data?.weaknesses.length ?? 0) > 0;

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
            Tactical mistakes identified across your analysed games
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

        {!loading && !error && !hasData && (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border)",
            borderRadius: "16px", padding: "48px 32px", textAlign: "center", maxWidth: "480px",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>♜</div>
            <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "8px", color: "var(--text-1)" }}>
              No blunders analysed yet
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-3)", marginBottom: "24px", lineHeight: 1.6 }}>
              Once your games are analysed, we'll detect recurring tactical mistakes and show them here.
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

        {!loading && !error && hasData && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            {/* Summary row */}
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "12px", padding: "16px 24px", flex: "0 0 auto",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "6px" }}>
                  Total Blunders Detected
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--loss)" }}>
                  {data!.totalBlunders}
                </div>
              </div>
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "12px", padding: "16px 24px", flex: "0 0 auto",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "6px" }}>
                  Weakness Categories
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-1)" }}>
                  {data!.weaknesses.length}
                </div>
              </div>
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "12px", padding: "16px 24px", flex: "0 0 auto",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "6px" }}>
                  Biggest Weakness
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: getThemeColor(data!.weaknesses[0].theme) }}>
                  {getThemeLabel(data!.weaknesses[0].theme)}
                </div>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "16px", padding: "24px",
            }}>
              <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "20px", color: "var(--text-1)" }}>
                Blunders by Tactical Theme
              </h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={data!.weaknesses}
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
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data!.weaknesses.map((w) => (
                      <Cell key={w.theme} fill={getThemeColor(w.theme)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weakness cards */}
            <div>
              <h2 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "16px", color: "var(--text-1)" }}>
                Weakness Breakdown
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {data!.weaknesses.map((w, i) => {
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
                      {/* Rank */}
                      <div style={{
                        width: "28px", height: "28px", borderRadius: "50%",
                        background: "var(--bg)", border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: 700, color: "var(--text-3)",
                        flexShrink: 0,
                      }}>
                        {i + 1}
                      </div>

                      {/* Theme */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: getThemeColor(w.theme), marginBottom: "4px" }}>
                          {getThemeLabel(w.theme)}
                        </div>
                        {/* Progress bar */}
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

                      {/* Count */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-1)" }}>
                          {w.count}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-3)" }}>
                          {w.percentage}%
                        </div>
                      </div>

                      {/* Severity badge */}
                      <div style={{
                        padding: "3px 10px", borderRadius: "20px",
                        background: sev.bg, color: sev.color,
                        fontSize: "11px", fontWeight: 600, flexShrink: 0,
                      }}>
                        {sev.label}
                      </div>

                      {/* Practice link */}
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
                  Personalised puzzles targeting your top {data!.weaknesses.length} weakness{data!.weaknesses.length !== 1 ? "es" : ""} are waiting.
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
