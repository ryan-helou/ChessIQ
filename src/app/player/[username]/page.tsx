"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import ChessLoader from "@/components/ChessLoader";
import ErrorBoundary from "@/components/ErrorBoundary";
import SectionNav from "@/components/SectionNav";
import StatsCards from "@/components/StatsCards";
import RatingChart from "@/components/RatingChart";
import DateRangePicker from "@/components/DateRangePicker";
import AnalysisDialog from "@/components/AnalysisDialog";
import { WinLossDrawChart, ResultBreakdownChart } from "@/components/ResultsChart";
import { AccuracyOverTime, AccuracyVsRating } from "@/components/AccuracyChart";
import { AccuracyByPhase } from "@/components/AccuracyPhaseChart";
import OpeningTable from "@/components/OpeningTable";
import GamesList from "@/components/GamesList";
import ColorStatsPanel from "@/components/ColorStats";
import TimePressurePanel from "@/components/TimePressurePanel";
import ConversionRateCard from "@/components/ConversionRateCard";
import { getUserPuzzleRating } from "@/lib/puzzle-api";
import type {
  ParsedGame,
  OpeningStats,
  RatingDataPoint,
  ResultBreakdown,
  TimeControlStats,
  ColorStats,
} from "@/lib/game-analysis";
import type { ChessComProfile, ChessComStats } from "@/lib/chess-com-api";

interface DashboardData {
  profile: ChessComProfile;
  stats: ChessComStats;
  games: ParsedGame[];
  openings: OpeningStats[];
  ratingHistory: RatingDataPoint[];
  resultBreakdown: ResultBreakdown[];
  timeControlStats: TimeControlStats[];
  colorStats: ColorStats[];
  streaks: {
    currentStreak: { type: "win" | "loss" | "draw"; count: number };
    bestWinStreak: number;
    worstLossStreak: number;
  };
  totalGames: number;
}

function StatCardSkeleton() {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 animate-pulse">
      <div className="h-3 bg-[var(--border)] rounded w-1/2 mb-3" />
      <div className="h-7 bg-[var(--border)] rounded w-3/4 mb-2" />
      <div className="h-2 bg-[var(--border)] rounded w-1/3" />
    </div>
  );
}

function ChartSkeleton({ height = "h-[350px]" }: { height?: string }) {
  return (
    <div className={`${height} bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 animate-pulse`}>
      <div className="h-4 bg-[var(--border)] rounded w-40 mb-6" />
      <div className="h-full bg-[var(--border)]/50 rounded-lg" />
    </div>
  );
}

const VALID_MONTHS = [0, 1, 3, 6, 12];
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheKey(username: string, months: number) {
  return `chessiq_${username}_${months}`;
}

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const username = params.username as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [months, setMonths] = useState<number>(() => {
    const m = parseInt(searchParams.get("months") ?? "6", 10);
    return VALID_MONTHS.includes(m) ? m : 6;
  });
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(() => searchParams.get("welcome") === "1");
  const [analysisStatus, setAnalysisStatus] = useState<{ pending: number; analyzing: number; complete: number; failed: number; total: number } | null>(null);
  const [showProgressBanner, setShowProgressBanner] = useState(true);
  const [puzzleRating, setPuzzleRating] = useState<number | null>(null);
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function processResult(result: any): DashboardData {
    return {
      ...result,
      games: result.games.map((g: ParsedGame & { date: string | Date }) => ({
        ...g,
        date: typeof g.date === "string" ? new Date(g.date) : g.date,
      })),
    };
  }

  const fetchData = useCallback(async (m: number, background = false) => {
    if (!background) {
      setLoading(true);
      setError("");
    } else {
      setBackgroundRefreshing(true);
    }

    try {
      const url = m === 0
        ? `/api/games/${username}?months=120`
        : `/api/games/${username}?months=${m}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Player not found or Chess.com API error");
      const result = await res.json();
      const processed = processResult(result);
      setData(processed);

      try {
        localStorage.setItem(cacheKey(username, m), JSON.stringify({ data: result, ts: Date.now() }));
      } catch {}
    } catch (err) {
      if (!background) setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      if (!background) setLoading(false);
      else setBackgroundRefreshing(false);
    }
  }, [username]);

  useEffect(() => {
    // Try localStorage cache first for instant render
    try {
      const raw = localStorage.getItem(cacheKey(username, months));
      if (raw) {
        const { data: cached, ts } = JSON.parse(raw);
        setData(processResult(cached));
        setLoading(false);
        // Skip background fetch if data is fresh
        if (Date.now() - ts < CACHE_TTL) return;
        // Otherwise refresh in background
        fetchData(months, true);
        return;
      }
    } catch {
      // Corrupt cache — clear it and do a fresh fetch
      try { localStorage.removeItem(cacheKey(username, months)); } catch {}
    }
    // No cache (or cleared) — full load
    fetchData(months);
  }, [fetchData, months]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMonthsChange = (m: number) => {
    setMonths(m);
    router.replace(`?months=${m}`, { scroll: false });
  };

  // Fetch analysis progress + poll while games are pending
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(username)}/analysis-status`);
        if (!res.ok) return;
        const status = await res.json();
        setAnalysisStatus(status);
        // Auto-dismiss when all done
        if (status.total > 0 && status.pending === 0 && status.analyzing === 0) {
          setShowProgressBanner(false);
        }
      } catch {}
    }

    fetchStatus();

    // Poll every 30s while there are pending/analyzing games
    progressPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(username)}/analysis-status`);
        if (!res.ok) return;
        const status = await res.json();
        setAnalysisStatus(status);
        if (status.total > 0 && status.pending === 0 && status.analyzing === 0) {
          clearInterval(progressPollRef.current!);
        }
      } catch {}
    }, 30_000);

    return () => { if (progressPollRef.current) clearInterval(progressPollRef.current); };
  }, [username]);

  // Fetch puzzle rating once
  useEffect(() => {
    getUserPuzzleRating(username).then((r) => {
      if (r > 1200) setPuzzleRating(r); // 1200 = default (never played puzzles)
    }).catch(() => {});
  }, [username]);

  // "You're improving!" — compare last 10 vs previous 10 accuracy
  const improvingTrend = useMemo(() => {
    const accs = (data?.games ?? [])
      .map((g) => g.accuracy)
      .filter((a): a is number => a !== null);
    if (accs.length < 20) return null;
    const recent = accs.slice(-10);
    const prev = accs.slice(-20, -10);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
    const delta = recentAvg - prevAvg;
    if (delta < 1) return null; // Only show if meaningfully better
    return { delta: parseFloat(delta.toFixed(1)), recentAvg: parseFloat(recentAvg.toFixed(1)) };
  }, [data]);

  // Memoized derived stats — only recompute when data changes
  const { totalGames, wins, losses, draws, winRate, avgAccuracy, ratings } = useMemo(() => {
    const games = data?.games ?? [];
    const total = games.length;
    const w = games.filter((g) => g.result === "win").length;
    const l = games.filter((g) => g.result === "loss").length;
    const d = games.filter((g) => g.result === "draw").length;
    const accs = games.map((g) => g.accuracy).filter((a): a is number => a !== null);
    const avg = accs.length > 0 ? accs.reduce((a, b) => a + b, 0) / accs.length : null;
    const r = (data?.timeControlStats ?? []).map((tc) => ({
      timeClass: tc.timeClass,
      current: tc.currentRating,
      best: tc.bestRating,
    }));
    return { totalGames: total, wins: w, losses: l, draws: d, winRate: total > 0 ? (w / total) * 100 : 0, avgAccuracy: avg, ratings: r };
  }, [data]);

  const rangeLabel = months === 0 ? "All time" : months === 1 ? "Last month" : `Last ${months} months`;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text-1)" }}>
      <Header username={username} />

      {/* Error state */}
      {error && !data && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div style={{ background: "var(--loss-dim)", border: "1px solid rgba(224,85,85,0.25)", borderRadius: "12px", padding: "32px", maxWidth: "420px", margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>♚</div>
            <h2 style={{ color: "var(--loss)", fontWeight: 600, marginBottom: "8px" }}>Player Not Found</h2>
            <p style={{ color: "var(--text-3)" }}>{error}</p>
          </div>
        </div>
      )}

      {loading && !data && <ChessLoader username={username} />}

      {data && (
        <>
          <SectionNav username={username} />

          {/* Analysis progress banner */}
          {showProgressBanner && analysisStatus && analysisStatus.total > 0 && (analysisStatus.pending + analysisStatus.analyzing) > 0 && (
            <div style={{
              background: "linear-gradient(90deg, rgba(93,143,187,0.10) 0%, rgba(93,143,187,0.06) 100%)",
              borderBottom: "1px solid rgba(93,143,187,0.2)",
              padding: "10px 0",
            }}>
              <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>⚙</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)" }}>
                        Analysing your games
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
                        {analysisStatus.complete} of {analysisStatus.total} complete
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden", maxWidth: "320px" }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.round((analysisStatus.complete / analysisStatus.total) * 100)}%`,
                        background: "#5d8fbb",
                        borderRadius: "2px",
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowProgressBanner(false)}
                  style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "18px", cursor: "pointer", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* First-login welcome banner */}
          {showWelcomeBanner && (
            <div style={{
              background: "linear-gradient(90deg, rgba(129,182,76,0.12) 0%, rgba(38,201,195,0.08) 100%)",
              borderBottom: "1px solid rgba(129,182,76,0.25)",
              padding: "12px 0",
            }}>
              <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "20px" }}>♟</span>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--text-1)", fontSize: "14px" }}>
                      Welcome to ChessIQ!{" "}
                    </span>
                    <span style={{ color: "var(--text-3)", fontSize: "13px" }}>
                      Your games are being synced and analysed in the background. Deep stats and loss patterns will appear as analysis completes — usually within 30 minutes.
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowWelcomeBanner(false);
                    router.replace(`/player/${username}`, { scroll: false });
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "18px", cursor: "pointer", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* "You're improving!" accuracy trend banner */}
          {improvingTrend && (
            <div style={{
              background: "linear-gradient(90deg, rgba(129,182,76,0.10) 0%, rgba(38,201,195,0.07) 100%)",
              borderBottom: "1px solid rgba(129,182,76,0.20)",
              padding: "10px 0",
            }}>
              <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "18px" }}>📈</span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--win)" }}>
                  You&apos;re improving!
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-3)" }}>
                  Your accuracy is up <strong style={{ color: "var(--text-2)" }}>+{improvingTrend.delta}%</strong> in your last 10 games (now averaging <strong style={{ color: "var(--text-2)" }}>{improvingTrend.recentAvg}%</strong>).
                </span>
              </div>
            </div>
          )}

          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

            {/* Profile Header */}
            <div
              id="overview"
              className="scroll-mt-28"
              style={{
                marginBottom: "28px",
                paddingBottom: "20px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                {/* Left: avatar + identity */}
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  {/* Avatar with online dot */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    {data.profile.avatar ? (
                      <img
                        src={data.profile.avatar}
                        alt={data.profile.username}
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "50%",
                          border: "2px solid var(--border-strong)",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "50%",
                        background: "var(--bg-card-hover)",
                        border: "2px solid var(--border-strong)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "22px",
                        color: "var(--text-3)",
                      }}>
                        ♟
                      </div>
                    )}
                    {/* Online indicator */}
                    <span style={{
                      position: "absolute",
                      bottom: "2px",
                      right: "2px",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      background: "var(--green)",
                      border: "2px solid var(--bg)",
                      boxShadow: "0 0 6px var(--green)",
                    }} />
                  </div>

                  {/* Username + league + name */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "2px" }}>
                      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                        {data.profile.username}
                      </h1>
                      {data.profile.league && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: "var(--green-dim)",
                          color: "var(--green)",
                          border: "1px solid var(--green-line)",
                        }}>
                          {data.profile.league}
                        </span>
                      )}
                    </div>
                    {data.profile.name && data.profile.name !== data.profile.username && (
                      <p style={{ fontSize: "12px", color: "var(--text-3)" }}>{data.profile.name}</p>
                    )}
                    <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
                      Chess.com
                    </p>
                  </div>
                </div>

                {/* Right: controls */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {backgroundRefreshing && (
                    <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)", animation: "pulse 1.5s ease-in-out infinite" }}>
                      refreshing…
                    </span>
                  )}
                  <DateRangePicker value={months} onChange={handleMonthsChange} loading={loading} />
                  <button
                    onClick={() => setShowAnalysisDialog(true)}
                    disabled={loading}
                    className="btn-gold"
                    style={{
                      padding: "8px 18px",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 700,
                      border: "none",
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Analyze Games
                  </button>
                </div>
              </div>
            </div>

            {/* Empty state: no games in this period */}
            {totalGames === 0 && !loading && (
              <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "12px", padding: "32px 24px", textAlign: "center",
                marginBottom: "24px", maxWidth: "480px",
              }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>♟</div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-1)", marginBottom: "8px" }}>
                  No games in this period
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-3)", lineHeight: 1.6, marginBottom: "16px" }}>
                  {months > 0
                    ? `No games found in the last ${months} month${months !== 1 ? "s" : ""}. Try extending the date range.`
                    : "No games found for this player."}
                </p>
                {months > 0 && months < 12 && (
                  <button
                    onClick={() => handleMonthsChange(12)}
                    style={{ background: "var(--green)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Show last 12 months
                  </button>
                )}
              </div>
            )}

            {/* Stats Cards */}
            <div style={{ marginBottom: "36px" }}>
              <StatsCards
                totalGames={totalGames}
                winRate={winRate}
                avgAccuracy={avgAccuracy}
                currentStreak={data.streaks.currentStreak}
                bestWinStreak={data.streaks.bestWinStreak}
                worstLossStreak={data.streaks.worstLossStreak}
                ratings={ratings}
                periodLabel={rangeLabel}
                puzzleRating={puzzleRating ?? undefined}
              />
            </div>

            {/* Rating + Results */}
            <div id="ratings" className="scroll-mt-28" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: "12px", flexWrap: "wrap" }}>
                <div className="card" style={{ padding: "22px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
                    <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase" }}>Rating Progression</h2>
                    <select
                      value={ratingFilter}
                      onChange={(e) => setRatingFilter(e.target.value)}
                      style={{ padding: "5px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-2)", borderRadius: "6px", fontSize: "12px", fontFamily: "var(--font-mono)", cursor: "pointer", outline: "none" }}
                    >
                      <option value="all">All formats</option>
                      <option value="bullet">Bullet</option>
                      <option value="blitz">Blitz</option>
                      <option value="rapid">Rapid</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                  <ErrorBoundary>
                    <RatingChart data={data.ratingHistory} filter={ratingFilter} />
                  </ErrorBoundary>
                </div>

                <div id="results" className="scroll-mt-28 card" style={{ padding: "22px" }}>
                  <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Results</h2>
                  <ErrorBoundary>
                    <WinLossDrawChart wins={wins} losses={losses} draws={draws} />
                  </ErrorBoundary>
                  <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[
                      { label: "Total Games", value: totalGames.toLocaleString(), accent: undefined },
                      { label: "Win Rate", value: `${winRate.toFixed(1)}%`, accent: winRate >= 50 ? "var(--win)" : "var(--loss)" },
                      { label: "Period", value: rangeLabel, accent: "var(--text-3)" },
                    ].map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>{row.label}</span>
                        <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: row.accent || "var(--text-1)", fontWeight: 600 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* How Games End + Accuracy Trend */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", marginBottom: "12px" }}>
              <div className="card" style={{ padding: "22px" }}>
                <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>How Games End</h2>
                <ErrorBoundary>
                  <ResultBreakdownChart data={data.resultBreakdown} />
                </ErrorBoundary>
              </div>
              <div id="accuracy" className="scroll-mt-28 card" style={{ padding: "22px" }}>
                <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Accuracy Trend</h2>
                <ErrorBoundary>
                  <AccuracyOverTime games={data.games} />
                </ErrorBoundary>
              </div>
            </div>

            {/* Accuracy vs Rating */}
            <div className="card" style={{ padding: "22px", marginBottom: "12px" }}>
              <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Accuracy vs Opponent Rating</h2>
              <ErrorBoundary>
                <AccuracyVsRating games={data.games} />
              </ErrorBoundary>
            </div>

            {/* Accuracy by Phase */}
            <div className="card" style={{ padding: "22px", marginBottom: "12px" }}>
              <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Accuracy by Game Phase</h2>
              <ErrorBoundary>
                <AccuracyByPhase />
              </ErrorBoundary>
            </div>

            {/* White vs Black */}
            {data.colorStats?.length > 0 && (
              <div className="card" style={{ padding: "22px", marginBottom: "12px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>White vs Black</h2>
                <ErrorBoundary>
                  <ColorStatsPanel colorStats={data.colorStats} />
                </ErrorBoundary>
              </div>
            )}

            {/* Time Pressure + Conversion Rate */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", marginBottom: "12px" }}>
              <div className="card" style={{ padding: "22px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Time Pressure Analysis</h2>
                <ErrorBoundary>
                  <TimePressurePanel username={username} />
                </ErrorBoundary>
              </div>
              <div className="card" style={{ padding: "22px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Winning Position Conversion</h2>
                <ErrorBoundary>
                  <ConversionRateCard username={username} />
                </ErrorBoundary>
              </div>
            </div>

            {/* Openings */}
            <div id="openings" className="scroll-mt-28 card" style={{ padding: "22px", marginBottom: "12px" }}>
              <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Opening Statistics</h2>
              <ErrorBoundary>
                <OpeningTable openings={data.openings} games={data.games} />
              </ErrorBoundary>
            </div>

            {/* Games */}
            <div id="games" className="scroll-mt-28 card" style={{ padding: "22px", marginBottom: "48px" }}>
              <h2 className="" style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-2)", textTransform: "uppercase", marginBottom: "16px" }}>Game History</h2>
              <ErrorBoundary>
                <GamesList games={data.games} username={username} />
              </ErrorBoundary>
            </div>
          </div>

          <AnalysisDialog
            username={username}
            months={months}
            onClose={(analysisRan?: boolean) => {
              setShowAnalysisDialog(false);
              if (analysisRan) {
                // Bust cache so next render fetches fresh data with updated accuracy
                try {
                  for (const m of VALID_MONTHS) {
                    localStorage.removeItem(cacheKey(username, m));
                  }
                } catch {}
                fetchData(months);
              }
            }}
            isOpen={showAnalysisDialog}
          />
        </>
      )}
    </div>
  );
}
