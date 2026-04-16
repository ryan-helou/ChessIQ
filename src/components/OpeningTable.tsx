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
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "flex", gap: "4px", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
        <span style={{ color: "var(--win)", fontWeight: 600 }}>{wins}</span>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--loss)", fontWeight: 600 }}>{losses}</span>
        <span style={{ color: "var(--text-3)" }}>/</span>
        <span style={{ color: "var(--draw)" }}>{draws}</span>
      </div>
      <div style={{ flex: 1, display: "flex", height: "6px", borderRadius: "3px", overflow: "hidden", background: "var(--border)", minWidth: "60px" }}>
        <div style={{ background: "var(--win)", width: `${(wins / games) * 100}%` }} />
        <div style={{ background: "var(--draw)", width: `${(draws / games) * 100}%` }} />
        <div style={{ background: "var(--loss)", width: `${(losses / games) * 100}%` }} />
      </div>
    </div>
  );
}

function winRateColor(rate: number): string {
  if (rate >= 60) return "var(--win)";
  if (rate >= 50) return "var(--text-1)";
  if (rate >= 40) return "var(--gold)";
  return "var(--loss)";
}

function OpeningFamilyTable({ families }: { families: OpeningFamily[] }) {
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>Min games:</span>
        <input
          type="range"
          min={1}
          max={20}
          value={minGames}
          onChange={(e) => setMinGames(parseInt(e.target.value))}
          style={{ width: "80px", accentColor: "var(--green)" }}
        />
        <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)", width: "18px" }}>{minGames}</span>
        <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)", marginLeft: "auto" }}>
          {filtered.length} openings
        </span>
      </div>

      {sorted.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "48px 16px",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          color: "var(--text-3)",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.6 }}>♞</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>
            No openings with {minGames}+ game{minGames !== 1 ? "s" : ""}
          </div>
          <div style={{ fontSize: 12, marginBottom: 12 }}>
            Try lowering the minimum, or play more rated games.
          </div>
          {minGames > 1 && (
            <button
              type="button"
              onClick={() => setMinGames(1)}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "5px 14px",
                fontSize: 12,
                color: "var(--text-2)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Show all openings
            </button>
          )}
        </div>
      ) : (
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ width: "28px", padding: "10px 8px" }} />
              {(
                [
                  ["name", "Opening"],
                  ["games", "Games"],
                  ["winRate", "Win %"],
                  ["avgAccuracy", "Accuracy"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  role="columnheader"
                  aria-sort={sortBy === key ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(key); } }}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.08em",
                    color: sortBy === key ? "var(--green)" : "var(--text-3)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                    transition: "color 0.15s",
                  }}
                  onClick={() => toggleSort(key)}
                  onMouseEnter={(e) => { if (sortBy !== key) e.currentTarget.style.color = "var(--text-2)"; }}
                  onMouseLeave={(e) => { if (sortBy !== key) e.currentTarget.style.color = "var(--text-3)"; }}
                >
                  {label} {sortBy === key ? (sortDir === "desc" ? "↓" : "↑") : <span style={{ opacity: 0.3 }}>↕</span>}
                </th>
              ))}
              <th style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", color: "var(--text-3)" }}>W / L / D</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((family) => {
              const isExpanded = expanded === family.name;
              const hasLines = family.lines.length > 1;

              return (
                <Fragment key={family.name}>
                  <tr
                    aria-expanded={hasLines ? isExpanded : undefined}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      background: isExpanded ? "var(--bg-card)" : "transparent",
                      cursor: hasLines ? "pointer" : "default",
                      transition: "background 0.15s",
                    }}
                    onClick={() => hasLines && setExpanded(isExpanded ? null : family.name)}
                    onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "var(--bg-card)"; }}
                    onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {hasLines && (
                        <span style={{
                          display: "inline-block",
                          color: "var(--text-3)",
                          fontSize: "9px",
                          transition: "transform 0.2s",
                          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        }}>▶</span>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontWeight: 500, color: "var(--text-1)", fontSize: "13.5px" }}>{family.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                        {family.lines.length} variation{family.lines.length !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td style={{ padding: "12px", fontFamily: "var(--font-mono)", color: "var(--text-2)", fontWeight: 600 }}>{family.games}</td>
                    <td style={{ padding: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: winRateColor(family.winRate) }}>
                      {family.winRate.toFixed(1)}%
                    </td>
                    <td style={{ padding: "12px", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
                      {family.avgAccuracy ? `${family.avgAccuracy.toFixed(1)}%` : "—"}
                    </td>
                    <td style={{ padding: "12px", minWidth: "180px" }}>
                      <WinRateBar wins={family.wins} losses={family.losses} draws={family.draws} games={family.games} />
                    </td>
                  </tr>

                  {isExpanded && family.lines.map((line) => (
                    <tr key={line.name} style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
                      <td style={{ padding: "10px 8px" }} />
                      <td style={{ padding: "10px 12px", paddingLeft: "28px" }}>
                        <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
                          <span style={{ color: "var(--text-4)", marginRight: "6px" }}>└</span>
                          {line.name}
                        </div>
                        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-4)", marginTop: "2px", paddingLeft: "14px" }}>{line.eco}</div>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: "12px" }}>{line.games}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: winRateColor(line.winRate) }}>
                        {line.winRate.toFixed(1)}%
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: "12px" }}>
                        {line.avgAccuracy ? `${line.avgAccuracy.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: "180px" }}>
                        <WinRateBar wins={line.wins} losses={line.losses} draws={line.draws} games={line.games} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
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

    return {
      allFamilies,
      whiteFamilies: groupOpenings(buildOpeningStatsFromGames(whiteGames)),
      blackFamilies: groupOpenings(buildOpeningStatsFromGames(blackGames)),
    };
  }, [openings, games]);

  const activeFamilies =
    colorTab === "white" ? whiteFamilies : colorTab === "black" ? blackFamilies : allFamilies;

  const whiteCount = games?.filter((g) => g.playerColor === "white").length ?? 0;
  const blackCount = games?.filter((g) => g.playerColor === "black").length ?? 0;

  return (
    <div>
      {games && (
        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          {([
            { key: "all" as const, label: "All", count: games.length },
            { key: "white" as const, label: "White", count: whiteCount },
            { key: "black" as const, label: "Black", count: blackCount },
          ]).map((tab) => {
            const isActive = colorTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setColorTab(tab.key)}
                aria-pressed={isActive}
                aria-label={`Show ${tab.label.toLowerCase()} opening stats (${tab.count} games)`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  border: `1px solid ${isActive ? "var(--green-line)" : "var(--border)"}`,
                  background: isActive ? "var(--green-dim)" : "var(--bg-card)",
                  color: isActive ? "var(--green)" : "var(--text-3)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {tab.key === "white" && (
                  <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#e8e6e1", border: "1px solid var(--border)", display: "inline-block" }} />
                )}
                {tab.key === "black" && (
                  <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--bg)", border: "1px solid var(--border-strong)", display: "inline-block" }} />
                )}
                {tab.label}
                <span style={{ opacity: 0.6 }}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <OpeningFamilyTable families={activeFamilies} />
    </div>
  );
}
