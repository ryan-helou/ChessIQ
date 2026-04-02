"use client";

import { useState, useEffect } from "react";

const TIPS = [
  "Analyzing openings...",
  "Calculating accuracy...",
  "Reviewing endgames...",
  "Finding blunders...",
  "Evaluating positions...",
  "Crunching the numbers...",
  "Studying your sacrifices...",
  "Judging your pawn structure...",
];

// Chess piece SVGs (simplified, clean)
function Knight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 45 45" className={className} fill="currentColor">
      <g>
        <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" style={{fill:"currentColor",stroke:"currentColor"}} />
        <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" style={{fill:"currentColor",stroke:"currentColor"}} />
        <circle cx="12" cy="14" r="1.2" style={{fill:"#0f172a"}} />
      </g>
    </svg>
  );
}

// Animated board squares
function MiniBoard() {
  const [highlightedSquare, setHighlightedSquare] = useState(-1);
  const [trail, setTrail] = useState<number[]>([]);

  useEffect(() => {
    // Simulate a knight tour-like pattern
    const knightMoves = [0, 10, 25, 19, 4, 14, 31, 21, 6, 16, 33, 27, 12, 2, 17, 35, 20, 5, 15, 30, 44, 29, 39, 24, 9, 3, 18, 28, 43, 37, 22, 32, 47, 41, 26, 36, 51, 45, 34, 40, 55, 49, 38, 48, 63, 53, 42, 52];
    let step = 0;

    const interval = setInterval(() => {
      const idx = knightMoves[step % knightMoves.length];
      setHighlightedSquare(idx);
      setTrail((prev) => [...prev.slice(-6), idx]);
      step++;
    }, 350);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-8 w-48 sm:w-56 aspect-square rounded-lg overflow-hidden shadow-2xl shadow-black/40 border border-slate-700/50">
      {Array.from({ length: 64 }).map((_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isLight = (row + col) % 2 === 0;
        const isActive = i === highlightedSquare;
        const isTrail = trail.includes(i) && !isActive;

        return (
          <div
            key={i}
            className={`relative flex items-center justify-center aspect-square transition-colors duration-300 ${
              isActive
                ? "bg-blue-500"
                : isTrail
                ? isLight
                  ? "bg-blue-300/30"
                  : "bg-blue-400/20"
                : isLight
                ? "bg-slate-600/50"
                : "bg-slate-800/80"
            }`}
          >
            {isActive && (
              <Knight className="w-4 h-4 sm:w-5 sm:h-5 text-white drop-shadow-lg animate-[scaleIn_0.3s_ease-out]" />
            )}
            {isTrail && (
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400/40 animate-[fadeIn_0.3s_ease-out]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Floating chess pieces background
function FloatingPieces() {
  const pieces = ["♔", "♕", "♖", "♗", "♘", "♙"];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((piece, i) => (
        <div
          key={i}
          className="absolute text-slate-800/20 animate-[float_ease-in-out_infinite]"
          style={{
            fontSize: `${24 + i * 8}px`,
            left: `${10 + i * 15}%`,
            top: `${20 + (i % 3) * 25}%`,
            animationDuration: `${4 + i * 1.5}s`,
            animationDelay: `${i * 0.7}s`,
          }}
        >
          {piece}
        </div>
      ))}
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
    const tipInterval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 2500);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev + 0.2;
        if (prev >= 70) return prev + 0.5;
        return prev + 2;
      });
    }, 150);

    return () => {
      clearInterval(tipInterval);
      clearInterval(progressInterval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] relative">
      <FloatingPieces />

      <div className="relative z-10 flex flex-col items-center">
        {/* Animated board */}
        <div className="mb-10">
          <MiniBoard />
        </div>

        {/* Username */}
        <p className="text-slate-300 text-lg font-medium mb-2">
          Loading <span className="text-blue-400 font-semibold">{username}</span>&apos;s games
        </p>

        {/* Rotating tip */}
        <p
          key={tipIndex}
          className="text-slate-500 text-sm mb-8 h-5 animate-[fadeIn_0.4s_ease-out]"
        >
          {TIPS[tipIndex]}
        </p>

        {/* Progress bar */}
        <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.min(progress, 95)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
