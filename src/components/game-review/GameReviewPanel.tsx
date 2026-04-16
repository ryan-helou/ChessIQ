"use client";

import React from "react";
import type { GameAnalysisResult, MoveClassification } from "@/lib/backend-api";
import { CLASSIFICATIONS, CLASSIFICATION_LABELS } from "./constants";
import { estimatedRating, getGamePhaseRating, type PlayerProfile } from "./utils";
import { ClassCircle, PhaseIcon } from "./ClassCircle";
import { PanelAvatar } from "./PanelAvatar";
import EvalGraph from "./EvalGraph";

// Layout constants matching Chess.com proportions (panel = 340px, padding = 16px each side)
// Content width = 308px -> label(110) + white(85) + icon(28) + black(85)
const LABEL = 110;
const ICON_COL = 34;

const labelStyle: React.CSSProperties = {
  width: LABEL,
  fontSize: 17,
  color: "var(--text-2)",
  flexShrink: 0,
  fontWeight: 500,
};

// Chess.com shows these 10 classifications (not "forced")
const TABLE_KEYS: MoveClassification[] = [
  "brilliant", "great", "book", "best", "excellent",
  "good", "inaccuracy", "mistake", "miss", "blunder",
];

function WhiteBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 5, padding: "4px 10px", minWidth: 62, textAlign: "center" }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: "#1a1a1a", fontFamily: "var(--font-mono)", lineHeight: 1.1 }}>
          {children}
        </span>
      </div>
    </div>
  );
}

export interface GameReviewPanelProps {
  analysis: GameAnalysisResult;
  gameInfo: {
    white: string;
    black: string;
    whiteElo: string;
    blackElo: string;
    playerColor: "white" | "black";
  };
  playerProfiles: { white: PlayerProfile | null; black: PlayerProfile | null };
  onStartReview: () => void;
  onMoveClick: (moveIndex: number) => void;
  onJumpToWorst?: () => void;
}

export const GameReviewPanel = React.memo(function GameReviewPanel({
  analysis,
  gameInfo,
  playerProfiles,
  onStartReview,
  onMoveClick,
  onJumpToWorst,
}: GameReviewPanelProps) {
  const whiteMoves = analysis.moves.filter((m) => m.color === "white");
  const blackMoves = analysis.moves.filter((m) => m.color === "black");
  const whiteCounts: Record<MoveClassification, number> = {} as any;
  const blackCounts: Record<MoveClassification, number> = {} as any;
  for (const c of CLASSIFICATIONS) {
    whiteCounts[c.key] = whiteMoves.filter((m) => m.classification === c.key).length;
    blackCounts[c.key] = blackMoves.filter((m) => m.classification === c.key).length;
  }
  const whiteOpening = getGamePhaseRating(analysis.moves, "white", "opening");
  const blackOpening = getGamePhaseRating(analysis.moves, "black", "opening");
  const whiteMiddle  = getGamePhaseRating(analysis.moves, "white", "middlegame");
  const blackMiddle  = getGamePhaseRating(analysis.moves, "black", "middlegame");
  const whiteEnd     = getGamePhaseRating(analysis.moves, "white", "endgame");
  const blackEnd     = getGamePhaseRating(analysis.moves, "black", "endgame");

  const whitePerf = estimatedRating(analysis.whiteAccuracy);
  const blackPerf = estimatedRating(analysis.blackAccuracy);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-card)" }}>

      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          <span style={{ fontSize: 15 }}>⭐</span> Game Review
        </h2>
      </div>

      {/* Eval graph */}
      <div style={{ height: 64, background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <EvalGraph
          data={analysis.moves.map((m, i) => ({ move: i + 1, eval: m.engineEval, mate: m.mate ?? null }))}
          currentMove={0}
          onMoveClick={(move) => onMoveClick(move - 1)}
          mini
        />
      </div>

      {/* Players + Accuracy */}
      <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>

        {/* Usernames */}
        <div style={{ display: "flex", marginBottom: 6 }}>
          <div style={{ width: LABEL, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
            {gameInfo.white}
          </span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
            {gameInfo.black}
          </span>
        </div>

        {/* Players row */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <span style={labelStyle}>Players</span>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <PanelAvatar profile={playerProfiles.white} username={gameInfo.white} />
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <PanelAvatar profile={playerProfiles.black} username={gameInfo.black} />
          </div>
        </div>

        {/* Accuracy row */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={labelStyle}>Accuracy</span>
          <WhiteBox>{analysis.whiteAccuracy.toFixed(1)}</WhiteBox>
          <WhiteBox>{analysis.blackAccuracy.toFixed(1)}</WhiteBox>
        </div>
      </div>

      {/* Classification table */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
        {TABLE_KEYS.map((key) => {
          const info = CLASSIFICATION_LABELS[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", height: 44, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ width: LABEL, fontSize: 17, color: "var(--text-2)", flexShrink: 0 }}>{info.label}</span>
              <span style={{
                flex: 1, textAlign: "right", paddingRight: 6,
                fontSize: 17, fontWeight: 700,
                color: whiteCounts[key] > 0 ? info.bg : "var(--text-4)",
              }}>
                {whiteCounts[key]}
              </span>
              <div style={{ width: ICON_COL, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                <ClassCircle bg={info.bg} icon={info.icon} img={info.img} />
              </div>
              <span style={{
                flex: 1, textAlign: "left", paddingLeft: 6,
                fontSize: 17, fontWeight: 700,
                color: blackCounts[key] > 0 ? info.bg : "var(--text-4)",
              }}>
                {blackCounts[key]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Game Rating + phases */}
      <div style={{ padding: "10px 16px 8px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        {/* Game Rating */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ ...labelStyle, color: "var(--text-2)" }}>Game Rating</span>
          <WhiteBox>{whitePerf}</WhiteBox>
          <WhiteBox>{blackPerf}</WhiteBox>
        </div>

        {/* Phase rows */}
        {[
          { label: "Opening",     white: whiteOpening, black: blackOpening },
          { label: "Middlegame",  white: whiteMiddle,  black: blackMiddle  },
          { label: "Endgame",     white: whiteEnd,     black: blackEnd     },
        ].map(({ label, white: w, black: b }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", height: 30 }}>
            <span style={{ ...labelStyle, color: "var(--text-2)" }}>{label}</span>
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <PhaseIcon acc={w?.accuracy ?? null} />
            </div>
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <PhaseIcon acc={b?.accuracy ?? null} />
            </div>
          </div>
        ))}
      </div>

      {/* Start Review button */}
      <div style={{ padding: "8px 12px 12px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={onStartReview}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 6,
            background: "#5d9e3a", border: "none", color: "#fff",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.01em",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#4e8830"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#5d9e3a"; }}
        >
          Start Review
        </button>
        {onJumpToWorst && (
          <button
            onClick={onJumpToWorst}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 6,
              background: "none", border: "1px solid rgba(202,52,49,0.4)", color: "#ca3431",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(202,52,49,0.08)"; e.currentTarget.style.borderColor = "#ca3431"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "rgba(202,52,49,0.4)"; }}
          >
            ⚡ Jump to Worst Move
          </button>
        )}
      </div>
    </div>
  );
});
