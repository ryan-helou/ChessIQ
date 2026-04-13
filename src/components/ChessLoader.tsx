"use client";

import { useState, useEffect } from "react";

const TIPS = [
  "Analysing your openings…",
  "Calculating move accuracy…",
  "Reviewing endgame technique…",
  "Hunting blunders…",
  "Evaluating critical positions…",
  "Studying your pawn structure…",
  "Processing sacrifices…",
  "Mapping tactical patterns…",
];

function MiniBoard() {
  const [highlightedSquare, setHighlightedSquare] = useState(-1);
  const [trail, setTrail] = useState<number[]>([]);

  useEffect(() => {
    const knightMoves = [0,10,25,19,4,14,31,21,6,16,33,27,12,2,17,35,20,5,15,30,44,29,39,24,9,3,18,28,43,37,22,32,47,41,26,36,51,45,34,40,55,49,38,48,63,53,42,52];
    let step = 0;
    const iv = setInterval(() => {
      const idx = knightMoves[step % knightMoves.length];
      setHighlightedSquare(idx);
      setTrail((prev) => [...prev.slice(-5), idx]);
      step++;
    }, 380);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(8, 1fr)",
      width: "200px",
      height: "200px",
      borderRadius: "8px",
      overflow: "hidden",
      border: "1px solid var(--border)",
      boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 30px rgba(212,168,75,0.04)",
    }}>
      {Array.from({ length: 64 }).map((_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isLight = (row + col) % 2 === 0;
        const isActive = i === highlightedSquare;
        const isTrail = trail.includes(i) && !isActive;

        let bg = isLight ? "#1e1c2c" : "#141320";
        if (isActive) bg = "var(--green)";
        else if (isTrail) bg = isLight ? "rgba(212,168,75,0.18)" : "rgba(212,168,75,0.12)";

        return (
          <div key={i} style={{ background: bg, transition: "background 0.25s", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            {isActive && (
              <span style={{ fontSize: "13px", animation: "scaleIn 0.25s ease", userSelect: "none" }}>♞</span>
            )}
            {isTrail && !isActive && (
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "rgba(212,168,75,0.5)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  username: string;
}

export default function ChessLoader({ username }: Props) {
  const [tipIndex, setTipIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const tipIv = setInterval(() => setTipIndex((p) => (p + 1) % TIPS.length), 2400);
    const progIv = setInterval(() => {
      setProgress((p) => p >= 90 ? p + 0.15 : p >= 70 ? p + 0.4 : p + 1.8);
    }, 150);
    return () => { clearInterval(tipIv); clearInterval(progIv); };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: 0 }}>
      {/* Board */}
      <div style={{ marginBottom: "36px" }}>
        <MiniBoard />
      </div>

      {/* Username */}
      <p style={{ fontSize: "16px", color: "var(--text-2)", marginBottom: "8px", fontFamily: "var(--font-sans)" }}>
        Loading{" "}
        <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
          {username}
        </span>
      </p>

      {/* Rotating tip */}
      <p
        key={tipIndex}
        style={{
          fontSize: "12px",
          color: "var(--text-3)",
          marginBottom: "28px",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.04em",
          height: "16px",
          animation: "fadeIn 0.4s ease",
        }}
      >
        {TIPS[tipIndex]}
      </p>

      {/* Progress bar */}
      <div style={{ width: "200px", height: "1px", background: "var(--border)", borderRadius: "1px", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            background: "linear-gradient(to right, var(--green-muted), var(--green))",
            width: `${Math.min(progress, 95)}%`,
            transition: "width 0.3s ease-out",
          }}
        />
      </div>
    </div>
  );
}
