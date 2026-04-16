"use client";

import React from "react";
import type { GameAnalysisResult } from "@/lib/backend-api";
import { CLASSIFICATION_LABELS } from "./constants";
import { ClassCircle } from "./ClassCircle";
import MoveList from "./MoveList";
import EvalGraph from "./EvalGraph";
import { annotateMove } from "@/lib/move-annotator";

export interface ReviewPanelProps {
  analysis: GameAnalysisResult;
  currentMoveIndex: number;
  setCurrentMoveIndex: (idx: number | ((prev: number) => number)) => void;
  gameInfo: {
    white: string;
    black: string;
    whiteElo: string;
    blackElo: string;
    playerColor: "white" | "black";
  };
  onBackToSummary: () => void;
  onJumpToWorst?: () => void;
  tablebase?: { category: "win" | "draw" | "loss" | null; dtz: number | null; bestMove: string | null };
  enginePanel?: React.ReactNode;
}

export const ReviewPanel = React.memo(function ReviewPanel({
  analysis,
  currentMoveIndex,
  setCurrentMoveIndex,
  gameInfo,
  onBackToSummary,
  onJumpToWorst,
  tablebase,
  enginePanel,
}: ReviewPanelProps) {
  const displayMoves = analysis.moves;
  const currentMove = currentMoveIndex >= 0 ? displayMoves[currentMoveIndex] : null;
  const info = currentMove ? CLASSIFICATION_LABELS[currentMove.classification] : null;
  const isBad = currentMove
    ? ["blunder", "mistake", "inaccuracy", "miss"].includes(currentMove.classification)
    : false;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-card)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <button
          onClick={onBackToSummary}
          className="text-[var(--text-3)] hover:text-white transition-colors text-base leading-none"
          title="Back to summary"
        >
          &larr;
        </button>
        <span className="text-sm font-bold text-white tracking-wide">Game Review</span>
      </div>

      {/* Move annotation card */}
      <div className="px-4 py-3 border-b border-[var(--border)] min-h-[72px] flex flex-col justify-center">
        {currentMove && info ? (
          <>
            <div className="flex items-center gap-2">
              <ClassCircle bg={info.bg} icon={info.icon} img={info.img} />
              <span className="font-bold text-white font-mono text-base">{currentMove.san}</span>
              <span className={`text-sm font-semibold ${info.color}`}>{info.label}</span>
              {currentMove.engineEval !== 0 && (
                <span className="ml-auto text-xs text-[var(--text-3)] font-mono">
                  {currentMove.engineEval > 0 ? "+" : ""}{(currentMove.engineEval / 100).toFixed(2)}
                </span>
              )}
            </div>
            {isBad && currentMove.bestMoveSan && (
              <div className="text-xs text-[var(--text-2)] mt-1.5 pl-7">
                Best: <span className="text-[var(--green)] font-semibold font-mono">{currentMove.bestMoveSan}</span>
                <span className="text-[var(--text-3)] ml-1.5">
                  ({currentMove.evalDrop > 0 ? "+" : ""}{(currentMove.evalDrop / 100).toFixed(1)})
                </span>
              </div>
            )}
            {(() => {
              const annotation = annotateMove(currentMove);
              if (!annotation) return null;
              const isPositive = ["brilliant", "great", "best", "excellent", "forced"].includes(currentMove.classification);
              return (
                <div
                  className="text-xs mt-1.5 pl-7 leading-relaxed"
                  style={{
                    color: isPositive ? "var(--text-2)" : "var(--text-3)",
                    fontStyle: isPositive ? "normal" : "italic",
                  }}
                >
                  {annotation}
                </div>
              );
            })()}
            {tablebase?.category && tablebase.bestMove && (
              <div className="text-xs mt-1.5 pl-7 flex items-center gap-1.5">
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 5px",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    ...(tablebase.category === "win"
                      ? { background: "rgba(82,192,122,0.15)", color: "#52c07a" }
                      : tablebase.category === "loss"
                      ? { background: "rgba(202,52,49,0.15)", color: "#ca3431" }
                      : { background: "rgba(255,255,255,0.08)", color: "var(--text-3)" }),
                  }}
                >
                  TB
                </span>
                <span className="text-[var(--text-3)]">Best:</span>
                <span className="font-mono font-semibold text-[var(--text-1)]">{tablebase.bestMove}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-[var(--text-3)]">Use &larr; &rarr; to navigate moves</p>
        )}
      </div>

      {/* Engine lines (Multi-PV) */}
      {enginePanel}

      {/* Critical Moments */}
      {analysis.criticalMoments && analysis.criticalMoments.length > 0 && (
        <div
          className="px-3 py-2 border-b border-[var(--border)]"
          style={{ flexShrink: 0 }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: 2,
              scrollbarWidth: "thin",
            }}
          >
            {analysis.criticalMoments.map((moment, idx) => {
              const dotColor =
                moment.type === "decisive_blunder"
                  ? "#ca3431"
                  : moment.type === "turning_point"
                  ? "#f6c700"
                  : moment.type === "brilliant_find"
                  ? "#52c07a"
                  : "#e28c28"; // missed_win
              const swingStr =
                (moment.evalSwing >= 0 ? "+" : "") +
                (moment.evalSwing / 100).toFixed(2);
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentMoveIndex(moment.moveIndex)}
                  title={moment.description}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background:
                      currentMoveIndex === moment.moveIndex
                        ? "rgba(255,255,255,0.08)"
                        : "transparent",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: dotColor,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-1)",
                      fontFamily: "var(--font-mono)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    M{moment.moveNumber}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-3)",
                      fontFamily: "var(--font-mono)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {swingStr}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Move list */}
      <div className="flex-1 overflow-hidden px-3 py-2">
        <MoveList
          moves={displayMoves}
          currentMoveIndex={currentMoveIndex}
          onMoveClick={setCurrentMoveIndex}
        />
      </div>

      {/* Eval graph */}
      <div className="h-[52px] bg-[var(--bg-surface)] border-t border-[var(--border)]">
        <EvalGraph
          data={displayMoves.map((m, i) => ({ move: i + 1, eval: m.engineEval, mate: m.mate ?? null }))}
          currentMove={currentMoveIndex + 1}
          onMoveClick={(move) => setCurrentMoveIndex(move - 1)}
          mini
        />
      </div>

      {/* Navigation buttons */}
      <div className={`grid border-t border-[var(--border)]`} style={{ gridTemplateColumns: onJumpToWorst ? "repeat(5, 1fr)" : "repeat(4, 1fr)" }}>
        {[
          { label: "\u27E8\u27E8", action: () => setCurrentMoveIndex(-1), title: "Start" },
          { label: "\u27E8",  action: () => setCurrentMoveIndex((p: number) => Math.max(-1, p - 1)), title: "Previous" },
          { label: "\u27E9",  action: () => setCurrentMoveIndex((p: number) => Math.min(displayMoves.length - 1, p + 1)), title: "Next" },
          { label: "\u27E9\u27E9", action: () => setCurrentMoveIndex(displayMoves.length - 1), title: "End" },
          ...(onJumpToWorst ? [{ label: "\u26A1", action: onJumpToWorst, title: "Jump to worst move (J)" }] : []),
        ].map(({ label, action, title }) => (
          <button
            key={title}
            onClick={action}
            title={title}
            className="py-3 text-[var(--text-2)] hover:text-white hover:bg-[#2a2825] transition-colors text-sm font-bold border-r border-[var(--border)] last:border-r-0"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
});
