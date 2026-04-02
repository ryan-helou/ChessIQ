"use client";

import { useState, useEffect } from "react";
import StatsCards from "@/components/StatsCards";
import RatingChart from "@/components/RatingChart";
import { WinLossDrawChart, ResultBreakdownChart } from "@/components/ResultsChart";
import { AccuracyOverTime, AccuracyVsRating } from "@/components/AccuracyChart";
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

function SkeletonLoader() {
  return (
    <div className="animate-pulse">
      <div className="h-12 bg-slate-700/40 rounded-lg" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5 animate-pulse">
      <div className="h-3 bg-slate-700/40 rounded w-1/2 mb-3" />
      <div className="h-6 bg-slate-700/40 rounded w-3/4 mb-2" />
      <div className="h-2 bg-slate-700/40 rounded w-1/3" />
    </div>
  );
}

export default function Dashboard() {
  const [username, setUsername] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");

  const fetchData = async (user: string) => {
    if (!user.trim()) {
      setError("Please enter a username");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch(`/api/games/${user}`);
      if (!res.ok) {
        throw new Error("User not found or Chess.com API error");
      }
      const result = await res.json();

      // Convert date strings back to Date objects
      const processedGames = result.games.map((g: any) => ({
        ...g,
        date: typeof g.date === 'string' ? new Date(g.date) : g.date,
      }));

      setData({
        ...result,
        games: processedGames,
      });
      setUsername(user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch data"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(searchInput);
  };

  if (!data && !loading && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
              Chess Coach
            </h1>
            <p className="text-slate-400 text-lg">
              Analyze your Chess.com performance in depth
            </p>
          </div>

          <div className="flex justify-center mb-8">
            <form onSubmit={handleSearch} className="w-full max-w-md">
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter your Chess.com username..."
                  className="w-full px-6 py-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          <div className="text-center text-slate-500 text-sm">
            Enter a Chess.com username to explore comprehensive game analytics and performance insights
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex justify-center mb-12">
            <form onSubmit={handleSearch} className="w-full max-w-md">
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter your Chess.com username..."
                  className="w-full px-6 py-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md mx-auto">
            <h2 className="text-red-400 font-semibold mb-2">Error</h2>
            <p className="text-slate-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex justify-center mb-12">
            <form onSubmit={handleSearch} className="w-full max-w-md">
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter your Chess.com username..."
                  className="w-full px-6 py-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  disabled
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-slate-700 text-slate-400 rounded-lg font-medium opacity-50"
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          <div>
            <SkeletonLoader />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 mb-8">
              {[...Array(4)].map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6 h-96 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const totalGames = data.games.length;
  const wins = data.games.filter((g) => g.result === "win").length;
  const losses = data.games.filter((g) => g.result === "loss").length;
  const draws = data.games.filter((g) => g.result === "draw").length;
  const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
  const accuracies = data.games
    .map((g) => g.accuracy)
    .filter((a): a is number => a !== null);
  const avgAccuracy =
    accuracies.length > 0
      ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
      : null;

  const ratings = data.timeControlStats.map((tc) => ({
    timeClass: tc.timeClass,
    current: tc.currentRating,
    best: tc.bestRating,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header with Search */}
        <div className="mb-12">
          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search another player..."
                className="flex-1 px-6 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium whitespace-nowrap"
              >
                Search
              </button>
            </div>
          </form>

          {/* Player Profile Header */}
          <div className="flex items-center gap-6 mb-8">
            {data.profile.avatar && (
              <img
                src={data.profile.avatar}
                alt={data.profile.username}
                className="w-20 h-20 rounded-full border-2 border-slate-700/50"
              />
            )}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-1">
                {data.profile.name || data.profile.username}
              </h1>
              <p className="text-slate-400 text-lg">
                @{data.profile.username}
              </p>
              {data.profile.country && (
                <p className="text-slate-500 text-sm mt-1">
                  {data.profile.country}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-12">
          <StatsCards
            totalGames={totalGames}
            winRate={winRate}
            avgAccuracy={avgAccuracy}
            currentStreak={data.streaks.currentStreak}
            bestWinStreak={data.streaks.bestWinStreak}
            worstLossStreak={data.streaks.worstLossStreak}
            ratings={ratings}
          />
        </div>

        {/* Charts Grid - Section 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Rating History */}
          <div className="lg:col-span-2 bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-50">
                Rating Progression
              </h2>
              <select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700/50 text-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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

          {/* Win/Loss/Draw */}
          <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-slate-50 mb-4">
              Results
            </h2>
            <WinLossDrawChart
              wins={wins}
              losses={losses}
              draws={draws}
            />
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Games:</span>
                <span className="text-slate-50 font-semibold">{totalGames}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Win Rate:</span>
                <span className="text-emerald-400 font-semibold">
                  {winRate.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid - Section 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Result Breakdown */}
          <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-slate-50 mb-4">
              How Games End
            </h2>
            <ResultBreakdownChart data={data.resultBreakdown} />
          </div>

          {/* Accuracy Over Time */}
          <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm">
            <h2 className="text-lg font-semibold text-slate-50 mb-4">
              Accuracy Trend
            </h2>
            <AccuracyOverTime games={data.games} />
          </div>
        </div>

        {/* Accuracy vs Rating */}
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm mb-8">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">
            Accuracy vs Opponent Rating
          </h2>
          <AccuracyVsRating games={data.games} />
        </div>

        {/* Opening Statistics */}
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm mb-8">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">
            Opening Statistics
          </h2>
          <OpeningTable openings={data.openings} />
        </div>

        {/* Recent Games */}
        <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-6 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-slate-50 mb-4">
            Recent Games
          </h2>
          <GamesList games={data.games} />
        </div>
      </div>
    </div>
  );
}
