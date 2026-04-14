"use client";

import type { ParsedGame } from "@/lib/game-analysis";

interface OpeningProfile {
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgAccuracy: number | null;
}

interface RecommendationCard {
  color: "white" | "black";
  type: "keep" | "reconsider";
  opening: OpeningProfile;
}

const MIN_GAMES = 5;

function computeOpenings(games: ParsedGame[]): OpeningProfile[] {
  const map = new Map<string, ParsedGame[]>();
  for (const g of games) {
    if (!map.has(g.opening)) map.set(g.opening, []);
    map.get(g.opening)!.push(g);
  }
  return Array.from(map.entries())
    .filter(([, gs]) => gs.length >= MIN_GAMES)
    .map(([name, gs]) => {
      const wins = gs.filter((g) => g.result === "win").length;
      const losses = gs.filter((g) => g.result === "loss").length;
      const draws = gs.filter((g) => g.result === "draw").length;
      const accs = gs.map((g) => g.accuracy).filter((a): a is number => a !== null);
      return {
        name,
        games: gs.length,
        wins,
        losses,
        draws,
        winRate: (wins / gs.length) * 100,
        avgAccuracy: accs.length > 0 ? accs.reduce((a, b) => a + b, 0) / accs.length : null,
      };
    })
    .sort((a, b) => b.games - a.games);
}

function ColorPip({ color }: { color: "white" | "black" }) {
  return (
    <span style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: "50%",
      background: color === "white" ? "#f0d9b5" : "#b58863",
      border: "1px solid rgba(255,255,255,0.15)",
      flexShrink: 0,
    }} />
  );
}

interface CardProps {
  card: RecommendationCard;
}

function RecCard({ card }: CardProps) {
  const { color, type, opening } = card;
  const isKeep = type === "keep";

  const accentColor = isKeep ? "#81b64c" : "#e28c28";
  const bgColor = isKeep ? "rgba(129,182,76,0.06)" : "rgba(226,140,40,0.06)";
  const borderColor = isKeep ? "rgba(129,182,76,0.18)" : "rgba(226,140,40,0.18)";
  const icon = isKeep ? "✓" : "⚠";

  const label = isKeep
    ? `Best as ${color === "white" ? "White" : "Black"}`
    : `Consider switching as ${color === "white" ? "White" : "Black"}`;

  const insight = isKeep
    ? `${Math.round(opening.winRate)}% win rate over ${opening.games} games — keep playing it`
    : `Only ${Math.round(opening.winRate)}% win rate over ${opening.games} games — consider an alternative`;

  return (
    <div style={{
      flex: "1 1 220px",
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: "14px 16px",
    }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <ColorPip color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </span>
      </div>

      {/* Opening name */}
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 6, lineHeight: 1.3 }}>
        {opening.name}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: accentColor, lineHeight: 1 }}>
          {Math.round(opening.winRate)}%
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
          {opening.wins}W / {opening.draws}D / {opening.losses}L
        </span>
      </div>

      {/* Insight */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <span style={{ fontSize: 13, color: accentColor, flexShrink: 0, marginTop: 1 }}>{icon}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{insight}</span>
      </div>

      {/* Accuracy badge */}
      {opening.avgAccuracy !== null && (
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-4)" }}>
          Avg accuracy: {opening.avgAccuracy.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

interface Props {
  games: ParsedGame[];
}

export default function OpeningRecommendations({ games }: Props) {
  const whiteGames = games.filter((g) => g.playerColor === "white");
  const blackGames = games.filter((g) => g.playerColor === "black");

  const whiteOpenings = computeOpenings(whiteGames);
  const blackOpenings = computeOpenings(blackGames);

  const cards: RecommendationCard[] = [];

  if (whiteOpenings.length > 0) {
    const best = whiteOpenings.reduce((a, b) => (b.winRate > a.winRate ? b : a));
    const worst = whiteOpenings.reduce((a, b) => (b.winRate < a.winRate ? b : a));
    cards.push({ color: "white", type: "keep", opening: best });
    // Only add "reconsider" if it's a different opening and win rate is below 50%
    if (worst.name !== best.name && worst.winRate < 50) {
      cards.push({ color: "white", type: "reconsider", opening: worst });
    }
  }

  if (blackOpenings.length > 0) {
    const best = blackOpenings.reduce((a, b) => (b.winRate > a.winRate ? b : a));
    const worst = blackOpenings.reduce((a, b) => (b.winRate < a.winRate ? b : a));
    cards.push({ color: "black", type: "keep", opening: best });
    if (worst.name !== best.name && worst.winRate < 50) {
      cards.push({ color: "black", type: "reconsider", opening: worst });
    }
  }

  if (cards.length < 2) {
    return (
      <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
        Play at least {MIN_GAMES} games with the same opening to see personalized recommendations.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {cards.map((card, i) => (
        <RecCard key={i} card={card} />
      ))}
    </div>
  );
}
