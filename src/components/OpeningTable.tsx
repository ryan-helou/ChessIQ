"use client";

import { Fragment, useState, useMemo } from "react";
import type { OpeningStats, ParsedGame } from "@/lib/game-analysis";

interface Props {
  openings: OpeningStats[];
  games?: ParsedGame[];
}

interface OpeningFamily {
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgAccuracy: number | null;
  lines: OpeningStats[];
}

function getOpeningFamily(name: string): string {
  const FAMILIES = [
    "Sicilian Defense", "French Defense", "Caro Kann Defense", "Italian Game",
    "Ruy Lopez", "Scotch Game", "King's Gambit", "Vienna Game", "Bishop's Opening",
    "Petrov Defense", "Philidor Defense", "Pirc Defense", "Alekhine Defense",
    "Scandinavian Defense", "Modern Defense", "Owen Defense", "Nimzowitsch Defense",
    "Center Game", "Danish Gambit", "Four Knights Game", "Three Knights Opening",
    "Ponziani Opening", "Evans Gambit", "Giuoco Piano", "Two Knights Defense",
    "Smith Morra Gambit",
    "Queen's Gambit", "King's Indian", "Kings Indian Defense", "Queen's Indian",
    "Nimzo Indian", "Grunfeld Defense", "Dutch Defense", "Benoni Defense",
    "Benko Gambit", "Slav Defense", "Semi Slav Defense", "Tarrasch Defense",
    "Budapest Gambit", "Englund Gambit", "London System", "Trompowsky Attack",
    "Torre Attack", "Colle System", "Indian Game",
    "English Opening", "English Defense", "Reti Opening", "Catalan Opening",
    "Bird's Opening", "Birds Opening", "Hungarian Opening", "Zukertort Opening",
    "Polish Opening", "Grob Opening",
    "Queens Pawn Opening", "Kings Pawn Opening",
  ];

  const lower = name.toLowerCase();
  for (const family of FAMILIES) {
    if (lower.startsWith(family.toLowerCase())) return family;
  }

  const moveMatch = name.match(/^(.+?)\s+\d+\./);
  if (moveMatch) return moveMatch[1].trim();

  const varMatch = name.match(/^(.+?)\s+(Variation|Attack|Defense|Gambit|System)\b/);
  if (varMatch) return `${varMatch[1]} ${varMatch[2]}`;

  if (lower.includes("queens pawn")) return "Queen's Pawn Game";
  if (lower.includes("indian game")) return "Indian Game";
  if (lower.includes("kings pawn")) return "King's Pawn Game";

  return name;
}

function buildOpeningStatsFromGames(games: ParsedGame[]): OpeningStats[] {
  const map = new Map<string, ParsedGame[]>();
  for (const g of games) {
    const key = g.opening;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(g);
  }

  return Array.from(map.entries())
    .map(([name, openingGames]) => {
      const wins = openingGames.filter((g) => g.result === "win").length;
      const losses = openingGames.filter((g) => g.result === "loss").length;
      const draws = openingGames.filter((g) => g.result === "draw").length;
      const accuracies = openingGames.map((g) => g.accuracy).filter((a): a is number => a !== null);

      return {
        name,
        eco: openingGames[0].eco,
        games: openingGames.length,
        wins,
        losses,
        draws,
        winRate: (wins / openingGames.length) * 100,
        avgAccuracy: accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : null,
        avgOpponentRating: openingGames.reduce((s, g) => s + g.opponentRating, 0) / openingGames.length,
      };
    })
    .sort((a, b) => b.games - a.games);
}

function groupOpenings(openings: OpeningStats[]): OpeningFamily[] {
  const familyMap = new Map<string, OpeningStats[]>();

  for (const o of openings) {
    const family = getOpeningFamily(o.name);
    if (!familyMap.has(family)) familyMap.set(family, []);
    familyMap.get(family)!.push(o);
  }

  return Array.from(familyMap.entries())
    .map(([name, lines]) => {
      const games = lines.reduce((s, l) => s + l.games, 0);
      const wins = lines.reduce((s, l) => s + l.wins, 0);
      const losses = lines.reduce((s, l) => s + l.losses, 0);
      const draws = lines.reduce((s, l) => s + l.draws, 0);
      const accLines = lines.filter((l) => l.avgAccuracy !== null);
      const avgAccuracy =
        accLines.length > 0
          ? accLines.reduce((s, l) => s + l.avgAccuracy! * l.games, 0) /
            accLines.reduce((s, l) => s + l.games, 0)
          : null;

      return {
        name,
        games,
        wins,
        losses,
        draws,
        winRate: (wins / games) * 100,
        avgAccuracy,
        lines: lines.sort((a, b) => b.games - a.games),
      };
    })
    .sort((a, b) => b.games - a.games);
}

type SortKey = "games" | "winRate" | "avgAccuracy" | "name";

function WinRateBar({ wins, losses, draws, games }: { wins: number; losses: number; draws: number; games: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex gap-1 items-center">
        <span className="text-emerald-400 font-semibold">{wins}</span>
        <span className="text-slate-600">/</span>
        <span className="text-red-400 font-semibold">{losses}</span>
        <span className="text-slate-600">/</span>
        <span className="text-slate-400">{draws}</span>
      </div>
      <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-slate-700/50 min-w-[60px]">
        <div className="bg-emerald-500" style={{ width: `${(wins / games) * 100}%` }} />
        <div className="bg-slate-500" style={{ width: `${(draws / games) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(losses / games) * 100}%` }} />
      </div>
    </div>
  );
}

function winRateColor(rate: number) {
  if (rate >= 60) return "text-emerald-400";
  if (rate >= 50) return "text-blue-400";
  if (rate >= 40) return "text-yellow-400";
  return "text-red-400";
}

function OpeningFamilyTable({
  families,
  label,
}: {
  families: OpeningFamily[];
  label: string;
}) {
  const [sortBy, setSortBy] = useState<SortKey>("games");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minGames, setMinGames] = useState(2);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = families.filter((f) => f.games >= minGames);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "avgAccuracy") cmp = (a.avgAccuracy ?? 0) - (b.avgAccuracy ?? 0);
    else cmp = a[sortBy] - b[sortBy];
    return sortDir === "desc" ? -cmp : cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <span className="text-slate-600 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label className="text-sm text-slate-400">Min games:</label>
        <input
          type="range"
          min={1}
          max={20}
          value={minGames}
          onChange={(e) => setMinGames(parseInt(e.target.value))}
          className="w-24 accent-blue-500"
        />
        <span className="text-sm text-slate-300 w-6">{minGames}</span>
        <span className="text-sm text-slate-500 ml-auto">
          {filtered.length} openings
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-slate-400 text-sm border-b border-slate-700/50">
              <th className="w-8 py-3 px-2" />
              {(
                [
                  ["name", "Opening"],
                  ["games", "Games"],
                  ["winRate", "Win Rate"],
                  ["avgAccuracy", "Accuracy"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="text-left py-3 px-3 cursor-pointer hover:text-slate-200 transition-colors whitespace-nowrap"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              <th className="text-left py-3 px-3">W / L / D</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((family) => {
              const isExpanded = expanded === family.name;
              const hasLines = family.lines.length > 1;

              return (
                <Fragment key={family.name}>
                  <tr
                    className={`border-b transition-colors ${
                      isExpanded
                        ? "bg-slate-800/40 border-slate-700/50"
                        : "border-slate-800/50 hover:bg-slate-800/20"
                    } ${hasLines ? "cursor-pointer" : ""}`}
                    onClick={() => hasLines && setExpanded(isExpanded ? null : family.name)}
                  >
                    <td className="py-3.5 px-2 text-center">
                      {hasLines && (
                        <span
                          className={`inline-block text-slate-500 text-xs transition-transform duration-200 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        >
                          ▶
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="font-semibold text-slate-100 text-base">{family.name}</div>
                      <div className="text-sm text-slate-500 mt-0.5">
                        {family.lines.length} variation{family.lines.length !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-slate-200 font-semibold text-base">{family.games}</td>
                    <td className={`py-3.5 px-3 font-bold text-base ${winRateColor(family.winRate)}`}>
                      {family.winRate.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-3 text-slate-300 text-base">
                      {family.avgAccuracy ? `${family.avgAccuracy.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-3.5 px-3 min-w-[180px]">
                      <WinRateBar
                        wins={family.wins}
                        losses={family.losses}
                        draws={family.draws}
                        games={family.games}
                      />
                    </td>
                  </tr>

                  {isExpanded &&
                    family.lines.map((line) => (
                      <tr
                        key={line.name}
                        className="border-b border-slate-800/30 bg-slate-800/20"
                      >
                        <td className="py-2.5 px-2" />
                        <td className="py-2.5 px-3 pl-8">
                          <div className="text-slate-300 text-sm">
                            <span className="text-slate-600 mr-1.5">└</span>
                            {line.name}
                          </div>
                          <div className="text-xs text-slate-600 pl-4 mt-0.5">{line.eco}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-sm">{line.games}</td>
                        <td className={`py-2.5 px-3 text-sm font-semibold ${winRateColor(line.winRate)}`}>
                          {line.winRate.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-sm">
                          {line.avgAccuracy ? `${line.avgAccuracy.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2.5 px-3 min-w-[180px]">
                          <WinRateBar
                            wins={line.wins}
                            losses={line.losses}
                            draws={line.draws}
                            games={line.games}
                          />
                        </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OpeningTable({ openings, games }: Props) {
  const [colorTab, setColorTab] = useState<"all" | "white" | "black">("all");

  const { allFamilies, whiteFamilies, blackFamilies } = useMemo(() => {
    const allFamilies = groupOpenings(openings);

    if (!games) return { allFamilies, whiteFamilies: [], blackFamilies: [] };

    const whiteGames = games.filter((g) => g.playerColor === "white");
    const blackGames = games.filter((g) => g.playerColor === "black");

    const whiteOpenings = buildOpeningStatsFromGames(whiteGames);
    const blackOpenings = buildOpeningStatsFromGames(blackGames);

    return {
      allFamilies,
      whiteFamilies: groupOpenings(whiteOpenings),
      blackFamilies: groupOpenings(blackOpenings),
    };
  }, [openings, games]);

  const activeFamilies =
    colorTab === "white" ? whiteFamilies : colorTab === "black" ? blackFamilies : allFamilies;

  const whiteCount = games?.filter((g) => g.playerColor === "white").length ?? 0;
  const blackCount = games?.filter((g) => g.playerColor === "black").length ?? 0;

  return (
    <div>
      {/* Color tabs */}
      {games && (
        <div className="flex gap-2 mb-6">
          {([
            { key: "all" as const, label: "All", count: games.length },
            { key: "white" as const, label: "White", count: whiteCount },
            { key: "black" as const, label: "Black", count: blackCount },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setColorTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                colorTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {tab.key === "white" && (
                <span className="w-3 h-3 rounded-sm bg-white border border-slate-400 inline-block" />
              )}
              {tab.key === "black" && (
                <span className="w-3 h-3 rounded-sm bg-slate-900 border border-slate-500 inline-block" />
              )}
              {tab.label}
              <span className="text-xs opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      <OpeningFamilyTable families={activeFamilies} label={colorTab} />
    </div>
  );
}
