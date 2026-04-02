"use client";

import { useState, useMemo } from "react";
import type { OpeningStats } from "@/lib/game-analysis";

interface Props {
  openings: OpeningStats[];
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

// Extract the parent opening family from a full opening name
// e.g. "Caro Kann Defense Advance Botvinnik Carls Defense 4.Nf3 Bg4" -> "Caro-Kann Defense"
function getOpeningFamily(name: string): string {
  // Common opening families to match against
  const FAMILIES = [
    // e4 openings
    "Sicilian Defense",
    "French Defense",
    "Caro Kann Defense",
    "Italian Game",
    "Ruy Lopez",
    "Scotch Game",
    "King's Gambit",
    "Vienna Game",
    "Bishop's Opening",
    "Petrov Defense",
    "Philidor Defense",
    "Pirc Defense",
    "Alekhine Defense",
    "Scandinavian Defense",
    "Modern Defense",
    "Owen Defense",
    "Nimzowitsch Defense",
    "Center Game",
    "Danish Gambit",
    "Four Knights Game",
    "Three Knights Opening",
    "Ponziani Opening",
    "Evans Gambit",
    "Giuoco Piano",
    "Two Knights Defense",
    "Smith Morra Gambit",
    // d4 openings
    "Queen's Gambit",
    "King's Indian",
    "Kings Indian Defense",
    "Queen's Indian",
    "Nimzo Indian",
    "Grunfeld Defense",
    "Dutch Defense",
    "Benoni Defense",
    "Benko Gambit",
    "Slav Defense",
    "Semi Slav Defense",
    "Tarrasch Defense",
    "Budapest Gambit",
    "Englund Gambit",
    "London System",
    "Trompowsky Attack",
    "Torre Attack",
    "Colle System",
    "Indian Game",
    // Flank openings
    "English Opening",
    "English Defense",
    "Reti Opening",
    "Catalan Opening",
    "Bird's Opening",
    "Birds Opening",
    "Hungarian Opening",
    "Zukertort Opening",
    "Polish Opening",
    "Grob Opening",
    // Broad families — must come after specific ones
    "Queens Pawn Opening",
    "Kings Pawn Opening",
  ];

  const lower = name.toLowerCase();

  for (const family of FAMILIES) {
    if (lower.startsWith(family.toLowerCase())) {
      return family;
    }
  }

  // Fallback: take everything before a move number pattern (e.g. "2.Nf3") or just the first 2-3 words
  const moveMatch = name.match(/^(.+?)\s+\d+\./);
  if (moveMatch) return moveMatch[1].trim();

  // Take everything before a specific variation marker
  const varMatch = name.match(/^(.+?)\s+(Variation|Attack|Defense|Gambit|System)\b/);
  if (varMatch) return `${varMatch[1]} ${varMatch[2]}`;

  // Broad groupings for generic names
  if (lower.includes("queens pawn")) return "Queen's Pawn Game";
  if (lower.includes("indian game")) return "Indian Game";
  if (lower.includes("kings pawn")) return "King's Pawn Game";

  return name;
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
    <div className="flex items-center gap-2">
      <div className="flex gap-1 items-center text-xs">
        <span className="text-emerald-400 font-medium">{wins}</span>
        <span className="text-slate-600">/</span>
        <span className="text-red-400 font-medium">{losses}</span>
        <span className="text-slate-600">/</span>
        <span className="text-slate-400">{draws}</span>
      </div>
      <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-slate-700/50 min-w-[60px]">
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

export default function OpeningTable({ openings }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("games");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [minGames, setMinGames] = useState(2);
  const [expanded, setExpanded] = useState<string | null>(null);

  const families = useMemo(() => groupOpenings(openings), [openings]);

  const filtered = families.filter((f) => f.games >= minGames);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "avgAccuracy")
      cmp = (a.avgAccuracy ?? 0) - (b.avgAccuracy ?? 0);
    else cmp = a[sortBy] - b[sortBy];
    return sortDir === "desc" ? -cmp : cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortBy !== col) return <span className="text-slate-600 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  const toggleExpand = (name: string) => {
    setExpanded((prev) => (prev === name ? null : name));
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
        <span className="text-xs text-slate-500 ml-auto">
          {filtered.length} opening families
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700/50">
              <th className="w-8 py-2 px-2" />
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
                  className="text-left py-2 px-3 cursor-pointer hover:text-slate-200 transition-colors whitespace-nowrap"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              <th className="text-left py-2 px-3">W / L / D</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((family) => {
              const isExpanded = expanded === family.name;
              const hasLines = family.lines.length > 1;

              return (
                <Fragment key={family.name}>
                  {/* Family row */}
                  <tr
                    className={`border-b transition-colors ${
                      isExpanded
                        ? "bg-slate-800/40 border-slate-700/50"
                        : "border-slate-800/50 hover:bg-slate-800/20"
                    } ${hasLines ? "cursor-pointer" : ""}`}
                    onClick={() => hasLines && toggleExpand(family.name)}
                  >
                    <td className="py-3 px-2 text-center">
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
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-100">{family.name}</div>
                      <div className="text-xs text-slate-500">
                        {family.lines.length} variation{family.lines.length !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-200 font-medium">{family.games}</td>
                    <td className={`py-3 px-3 font-bold ${winRateColor(family.winRate)}`}>
                      {family.winRate.toFixed(1)}%
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {family.avgAccuracy ? `${family.avgAccuracy.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-3 px-3 min-w-[160px]">
                      <WinRateBar
                        wins={family.wins}
                        losses={family.losses}
                        draws={family.draws}
                        games={family.games}
                      />
                    </td>
                  </tr>

                  {/* Expanded lines */}
                  {isExpanded &&
                    family.lines.map((line) => (
                      <tr
                        key={line.name}
                        className="border-b border-slate-800/30 bg-slate-800/20"
                      >
                        <td className="py-2 px-2" />
                        <td className="py-2 px-3 pl-8">
                          <div className="text-slate-300 text-xs">
                            <span className="text-slate-600 mr-1.5">└</span>
                            {line.name}
                          </div>
                          <div className="text-xs text-slate-600 pl-4">{line.eco}</div>
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-xs">{line.games}</td>
                        <td className={`py-2 px-3 text-xs font-semibold ${winRateColor(line.winRate)}`}>
                          {line.winRate.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-xs">
                          {line.avgAccuracy ? `${line.avgAccuracy.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2 px-3 min-w-[160px]">
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

// Need Fragment import
import { Fragment } from "react";
