import type { AnalyzedMove } from "@/lib/backend-api";

export interface PlayerProfile {
  avatar?: string;
  flagEmoji?: string;
}

export function estimatedRating(accuracy: number): number {
  // Piecewise linear interpolation anchored to real Chess.com data points
  // MAE ~ 49 rating points across balanced games (both players ~same accuracy)
  const anchors: [number, number][] = [
    [0,    100],
    [50,   550],
    [54,   750],
    [63,   925],
    [72.7, 1325],
    [83.1, 1975],
    [87.1, 2125],
    [90,   2200],
    [95,   2450],
    [100,  2850],
  ];
  accuracy = Math.max(0, Math.min(100, accuracy));
  for (let i = 0; i < anchors.length - 1; i++) {
    const [a1, r1] = anchors[i];
    const [a2, r2] = anchors[i + 1];
    if (accuracy >= a1 && accuracy <= a2) {
      const t = (accuracy - a1) / (a2 - a1);
      return Math.round((r1 + t * (r2 - r1)) / 50) * 50;
    }
  }
  return 2850;
}

export function getGamePhaseRating(
  moves: AnalyzedMove[],
  color: "white" | "black",
  phase: "opening" | "middlegame" | "endgame"
): { accuracy: number; moves: number } | null {
  const playerMoves = moves.filter((m) => m.color === color);
  const total = playerMoves.length;
  if (total === 0) return null;

  // Rough phase split: opening first 10 moves, endgame last 30%, middle is the rest
  let phaseMoves: AnalyzedMove[];
  if (phase === "opening") {
    phaseMoves = playerMoves.filter((m) => m.moveNumber <= 10);
  } else if (phase === "endgame") {
    const endStart = Math.max(11, Math.floor(total * 0.7));
    phaseMoves = playerMoves.slice(endStart);
  } else {
    phaseMoves = playerMoves.filter(
      (m) => m.moveNumber > 10 && playerMoves.indexOf(m) < Math.floor(total * 0.7)
    );
  }

  if (phaseMoves.length === 0) return null;
  const avg = phaseMoves.reduce((s, m) => s + m.accuracy, 0) / phaseMoves.length;
  return { accuracy: avg, moves: phaseMoves.length };
}

export function phaseIcon(acc: number | null): { icon: string; color: string } {
  if (acc === null) return { icon: "-", color: "text-[var(--text-3)]" };
  if (acc >= 90) return { icon: "👍", color: "text-green-400" };
  if (acc >= 70) return { icon: "✓", color: "text-green-500" };
  if (acc >= 50) return { icon: "~", color: "text-yellow-400" };
  return { icon: "✗", color: "text-red-400" };
}

export function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  try {
    return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
  } catch { return ""; }
}

export function parseTimeControl(pgn: string): { initial: number; increment: number } | null {
  const m = pgn.match(/\[TimeControl "([^"]+)"\]/);
  if (!m) return null;
  const tc = m[1];
  if (tc === "-" || tc === "") return null;
  const parts = tc.split("+");
  const initial = parseInt(parts[0], 10);
  const increment = parts[1] ? parseInt(parts[1], 10) : 0;
  return isNaN(initial) ? null : { initial, increment };
}

export function parseMoveTimes(pgn: string): (number | null)[] {
  const times: (number | null)[] = [];
  const re = /\{[^}]*\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\][^}]*\}/g;
  let match;
  while ((match = re.exec(pgn)) !== null) {
    const h = parseInt(match[1], 10);
    const min = parseInt(match[2], 10);
    const sec = parseFloat(match[3]);
    times.push(h * 3600 + min * 60 + sec);
  }
  return times;
}

export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function getPlayerTime(
  moveTimes: (number | null)[],
  currentMoveIdx: number,
  color: "white" | "black",
  initialTime: number | null
): string {
  if (currentMoveIdx < 0 || moveTimes.length === 0) {
    return initialTime != null ? formatClock(initialTime) : "--:--";
  }
  const colorMod = color === "white" ? 0 : 1;
  let idx = currentMoveIdx;
  while (idx >= 0 && idx % 2 !== colorMod) idx--;
  if (idx < 0 || moveTimes[idx] == null) {
    return initialTime != null ? formatClock(initialTime) : "--:--";
  }
  return formatClock(moveTimes[idx]!);
}

export function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "#81b64c";
  if (accuracy >= 75) return "#f6c700";
  if (accuracy >= 60) return "#f6c700";
  if (accuracy >= 40) return "#e28c28";
  return "#ca3431";
}
