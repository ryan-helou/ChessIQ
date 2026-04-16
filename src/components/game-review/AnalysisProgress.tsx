"use client";

import React from "react";

export interface AnalysisProgressProps {
  progress: { moveIndex: number; totalMoves: number } | null;
}

export const AnalysisProgress = React.memo(function AnalysisProgress({ progress }: AnalysisProgressProps) {
  const pct = progress ? Math.round(((progress.moveIndex + 1) / progress.totalMoves) * 100) : 0;
  const label = progress
    ? `Analyzing move ${progress.moveIndex + 1} of ${progress.totalMoves}...`
    : "Connecting to engine...";
  return (
    <div className="bg-[var(--bg-card)] rounded-xl p-6 flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="text-4xl mb-4 animate-pulse">&#9823;</div>
      <h3 className="text-lg font-bold text-white mb-2">{label}</h3>
      <div className="w-48 h-1.5 bg-[var(--border)] rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-[var(--green)] rounded-full transition-all duration-300"
          style={{ width: progress ? `${pct}%` : "0%" }}
        />
      </div>
      <p className="text-xs text-[var(--text-secondary)] text-center">
        {progress ? `${pct}% complete` : "Deep analysis of every move"}
      </p>
    </div>
  );
});
