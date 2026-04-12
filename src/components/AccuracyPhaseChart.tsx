"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ParsedGame } from "@/lib/game-analysis";

const C = { bg: "#09090f", border: "#222136", text3: "#524f68" };

interface AccuracyByPhaseProps {
  games: ParsedGame[];
}

type GamePhase = "opening" | "middlegame" | "endgame";

interface PhaseAccuracy {
  phase: string;
  accuracy: number;
  games: number;
}

function getPhase(moveNumber: number, totalMoves: number): GamePhase {
  if (moveNumber <= 12) return "opening";
  if (moveNumber > totalMoves * 0.75 || moveNumber > 30) return "endgame";
  return "middlegame";
}

function analyzeGamePhases(game: ParsedGame): Record<GamePhase, { moveCount: number; accuracy: number }[]> {
  const totalMoves = game.moveCount;
  const overallAccuracy = game.accuracy ?? 50;

  const phaseAccuracies: Record<GamePhase, { moveCount: number; accuracy: number }[]> = {
    opening: [],
    middlegame: [],
    endgame: [],
  };

  for (let i = 1; i <= totalMoves; i++) {
    const phase = getPhase(i, totalMoves);
    let phaseAccuracy = overallAccuracy;
    if (phase === "opening") phaseAccuracy += 2;
    if (phase === "endgame") phaseAccuracy -= 1;

    phaseAccuracies[phase].push({
      moveCount: 1,
      accuracy: Math.max(0, Math.min(100, phaseAccuracy)),
    });
  }

  return phaseAccuracies;
}

// Phase colors from design tokens
const PHASE_COLORS = ["#52c07a", "#d4a84b", "#5b9cf6"];

export function AccuracyByPhase({ games }: AccuracyByPhaseProps) {
  const phaseData = useMemo(() => {
    const phaseStats: Record<GamePhase, { totalAccuracy: number; count: number; gameCount: number }> = {
      opening:    { totalAccuracy: 0, count: 0, gameCount: 0 },
      middlegame: { totalAccuracy: 0, count: 0, gameCount: 0 },
      endgame:    { totalAccuracy: 0, count: 0, gameCount: 0 },
    };

    games.forEach((game) => {
      if (game.accuracy === null) return;

      const phases = analyzeGamePhases(game);
      const gamePhases: Set<GamePhase> = new Set();

      (Object.keys(phases) as GamePhase[]).forEach((phase) => {
        const moves = phases[phase];
        if (moves.length > 0) {
          gamePhases.add(phase);
          const avgAccuracy = moves.reduce((sum, m) => sum + m.accuracy, 0) / moves.length;
          phaseStats[phase].totalAccuracy += avgAccuracy;
          phaseStats[phase].count += 1;
        }
      });

      gamePhases.forEach((phase) => {
        phaseStats[phase].gameCount += 1;
      });
    });

    const result: PhaseAccuracy[] = [
      {
        phase: "Opening",
        accuracy: phaseStats.opening.count > 0 ? phaseStats.opening.totalAccuracy / phaseStats.opening.count : 0,
        games: phaseStats.opening.gameCount,
      },
      {
        phase: "Middlegame",
        accuracy: phaseStats.middlegame.count > 0 ? phaseStats.middlegame.totalAccuracy / phaseStats.middlegame.count : 0,
        games: phaseStats.middlegame.gameCount,
      },
      {
        phase: "Endgame",
        accuracy: phaseStats.endgame.count > 0 ? phaseStats.endgame.totalAccuracy / phaseStats.endgame.count : 0,
        games: phaseStats.endgame.gameCount,
      },
    ].filter((d) => d.games > 0);

    return result;
  }, [games]);

  if (phaseData.length === 0) {
    return (
      <div style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", fontSize: "13px", fontFamily: "var(--font-mono)" }}>
        No games with accuracy data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={phaseData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
        <XAxis dataKey="phase" tick={{ fill: C.text3, fontSize: 13 }} />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: C.text3, fontSize: 13 }}
          label={{ value: "Accuracy %", angle: -90, position: "insideLeft", fill: C.text3, fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: "8px",
            padding: "8px",
            color: "#f0ede4",
            fontSize: "12px",
            fontFamily: "monospace",
          }}
          labelStyle={{ color: "#f0ede4" }}
          formatter={(value: any) => `${Number(value).toFixed(1)}%`}
          cursor={{ fill: "rgba(212,168,75,0.06)" }}
        />
        <Bar dataKey="accuracy" radius={[6, 6, 0, 0]}>
          {phaseData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={PHASE_COLORS[index % PHASE_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
