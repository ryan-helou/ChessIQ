"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import ChessLoader from "@/components/ChessLoader";
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
import type {
  ParsedGame,
  OpeningStats,
  RatingDataPoint,
  ResultBreakdown,
  TimeControlStats,
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
  streaks: {
    currentStreak: { type: "win" | "loss" | "draw"; count: number };
    bestWinStreak: number;
    worstLossStreak: number;
  };
  totalGames: number;
}

function StatCardSkeleton() {
  return (
    <div className="bg-[#262522] border border-[#3a3835] rounded-xl p-5 animate-pulse">
      <div className="h-3 bg-[#3a3835] rounded w-1/2 mb-3" />
      <div className="h-7 bg-[#3a3835] rounded w-3/4 mb-2" />
      <div className="h-2 bg-[#3a3835] rounded w-1/3" />
    </div>
  );
}

function ChartSkeleton({ height = "h-[350px]" }: { height?: string }) {
  return (
    <div className={`${height} bg-[#262522] border border-[#3a3835] rounded-xl p-6 animate-pulse`}>
      <div className="h-4 bg-[#3a3835] rounded w-40 mb-6" />
      <div className="h-full bg-[#3a3835]/50 rounded-lg" />
    </div>
  );
}

export default function PlayerPage() {
  const params = useParams();
  const username = params.username as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [months, setMonths] = useState(6);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);

  const fetchData = useCallback(async (m: number) => {
    setLoading(true);
    setError("");

    try {
      const url = m === 0
        ? `/api/games/${username}?months=120`
        : `/api/games/${username}?months=${m}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Player not found or Chess.com API error");
      const result = await res.json();

      const processedGames = result.games.map((g: ParsedGame & { date: string | Date }) => ({
        ...g,
        date: typeof g.date === "string" ? new Date(g.date) : g.date,
      }));

      setData({ ...result, games: processedGames });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchData(months);
  }, [fetchData, months]);

  const handleMonthsChange = (m: number) => {
    setMonths(m);
  };

  const handleAnalyzeGames = useCallback(
    async (gameCount: 10 | 20 | 50 | "all") => {
      const res = await fetch(`/api/games/${username}/analyze-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, gameCount, depth: 14 }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to analyse games");
      }

      return res.json();
    },
    [username, months]
  );

  // Compute stats
  const totalGames = data?.games.length ?? 0;
  const wins = data?.games.filter((g) => g.result === "win").length ?? 0;
  const losses = data?.games.filter((g) => g.result === "loss").length ?? 0;
  const draws = data?.games.filter((g) => g.result === "draw").length ?? 0;
  const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
  const accuracies = (data?.games ?? [])
    .map((g) => g.accuracy)
    .filter((a): a is number => a !== null);
  const avgAccuracy =
    accuracies.length > 0
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : null;
  const ratings = (data?.timeControlStats ?? []).map((tc) => ({
    timeClass: tc.timeClass,
    current: tc.currentRating,
    best: tc.bestRating,
  }));

  const rangeLabel = months === 0 ? "All time" : months === 1 ? "Last month" : `Last ${months} months`;

  return (
    <div className="min-h-screen bg-[#302e2b] text-[#e8e6e1]">
      <Header username={username} />

      {/* Error state */}
      {error && !data && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="bg-[#e62929]/10 border border-[#e62929]/30 rounded-xl p-8 max-w-md mx-auto text-center">
            <div className="text-4xl mb-4">&#9812;</div>
            <h2 className="text-[#e62929] font-semibold text-lg mb-2">Player Not Found</h2>
            <p className="text-[#989795]">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && <ChessLoader username={username} />}

      {/* Dashboard */}
      {data && (
        <>
          <SectionNav username={username} />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Profile Header + Date Range */}
            <div id="overview" className="scroll-mt-28 mb-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                <div className="flex items-center gap-5">
                  {data.profile.avatar && (
                    <img
                      src={data.profile.avatar}
                      alt={data.profile.username}
                      className="w-20 h-20 rounded-full border-2 border-[#3a3835] shadow-lg shadow-black/30"
                    />
                  )}
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                      {data.profile.name || data.profile.username}
                    </h1>
                    <p className="text-[#989795]">@{data.profile.username}</p>
                    {data.profile.league && (
                      <span className="inline-block mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#e6a117]/15 text-[#e6a117] border border-[#e6a117]/20">
                        {data.profile.league}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:items-end">
                  <DateRangePicker value={months} onChange={handleMonthsChange} loading={loading} />
                  <button
                    onClick={() => setShowAnalysisDialog(true)}
                    disabled={loading}
                    className="px-4 py-2 bg-[#81b64c] hover:bg-[#96bc4b] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-sm whitespace-nowrap"
                  >
                    ⚙️ Analyze Games
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className={`mb-10 transition-opacity duration-300 ${loading ? "opacity-50" : "opacity-100"}`}>
              <StatsCards
                totalGames={totalGames}
                winRate={winRate}
                avgAccuracy={avgAccuracy}
                currentStreak={data.streaks.currentStreak}
                bestWinStreak={data.streaks.bestWinStreak}
                worstLossStreak={data.streaks.worstLossStreak}
                ratings={ratings}
                periodLabel={rangeLabel}
              />
            </div>

            {/* Rating Chart + WLD */}
            <div id="ratings" className="scroll-mt-28 grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2 bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold">Rating Progression</h2>
                  <select
                    value={ratingFilter}
                    onChange={(e) => setRatingFilter(e.target.value)}
                    className="px-3 py-1.5 bg-[#3a3835] border border-[#3a3835] text-[#989795] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#81b64c]/40 w-full sm:w-auto"
                  >
                    <option value="all">All Time Classes</option>
                    <option value="bullet">Bullet</option>
                    <option value="blitz">Blitz</option>
                    <option value="rapid">Rapid</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <RatingChart data={data.ratingHistory} filter={ratingFilter} />
              </div>

              <div id="results" className="scroll-mt-28 bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6">
                <h2 className="text-lg font-semibold mb-4">Results</h2>
                <WinLossDrawChart wins={wins} losses={losses} draws={draws} />
                <div className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#989795]">Total Games</span>
                    <span className="font-semibold">{totalGames}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#989795]">Win Rate</span>
                    <span className={`font-semibold ${winRate >= 50 ? "text-[#81b64c]" : "text-[#e62929]"}`}>
                      {winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#989795]">Period</span>
                    <span className="text-[#989795] text-xs">{rangeLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* How Games End + Accuracy Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6">
                <h2 className="text-lg font-semibold mb-4">How Games End</h2>
                <ResultBreakdownChart data={data.resultBreakdown} />
              </div>

              <div id="accuracy" className="scroll-mt-28 bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6">
                <h2 className="text-lg font-semibold mb-4">Accuracy Trend</h2>
                <AccuracyOverTime games={data.games} />
              </div>
            </div>

            {/* Accuracy vs Rating */}
            <div className="bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Accuracy vs Opponent Rating</h2>
              <AccuracyVsRating games={data.games} />
            </div>

            {/* Accuracy by Game Phase */}
            <div className="bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Accuracy by Game Phase</h2>
              <AccuracyByPhase games={data.games} />
            </div>

            {/* Openings */}
            <div id="openings" className="scroll-mt-28 bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Opening Statistics</h2>
              <OpeningTable openings={data.openings} games={data.games} />
            </div>

            {/* Recent Games */}
            <div id="games" className="scroll-mt-28 bg-[#262522] border border-[#3a3835] rounded-xl p-5 sm:p-6 mb-16">
              <h2 className="text-lg font-semibold mb-4">Game History</h2>
              <GamesList games={data.games} username={username} />
            </div>
          </div>

          {/* Analysis Dialog */}
          <AnalysisDialog
            username={username}
            months={months}
            onAnalyze={handleAnalyzeGames}
            onClose={() => setShowAnalysisDialog(false)}
            isOpen={showAnalysisDialog}
          />
        </>
      )}
    </div>
  );
}
