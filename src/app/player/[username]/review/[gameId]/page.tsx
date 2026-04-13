"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import dynamic from "next/dynamic";
import ChessLoader from "@/components/ChessLoader";
import { neoPieces } from "@/lib/chess-pieces";
import EvalBar from "@/components/game-review/EvalBar";
import EvalGraph from "@/components/game-review/EvalGraph";
import MoveList from "@/components/game-review/MoveList";
import {
  analyzeGame,
  type GameAnalysisResult,
  type MoveClassification,
  type AnalyzedMove,
} from "@/lib/backend-api";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-[var(--border)]/40 rounded-lg animate-pulse" />
    ),
  }
);

// ─── Classification config (matches Chess.com ordering & colors) ───

interface ClassInfo {
  label: string;
  color: string; // text color class
  bg: string; // circle bg color (hex)
  icon: string; // fallback text
  img?: string; // path to image asset
}

const CLASSIFICATIONS: { key: MoveClassification; info: ClassInfo }[] = [
  { key: "brilliant",  info: { label: "Brilliant",  color: "text-[#26c9c3]", bg: "#26c9c3", icon: "!!", img: "/Chess Symbols/brilliant.gif" } },
  { key: "great",      info: { label: "Great",      color: "text-[#5b8bb4]", bg: "#5b8bb4", icon: "!",  img: "/Chess Symbols/great.png" } },
  { key: "best",       info: { label: "Best",       color: "text-[var(--win)]", bg: "#52c07a", icon: "★",  img: "/Chess Symbols/best.gif" } },
  { key: "excellent",  info: { label: "Excellent",  color: "text-[#5eba3a]", bg: "#5eba3a", icon: "👍", img: "/Chess Symbols/excellent.gif" } },
  { key: "good",       info: { label: "Good",       color: "text-[#88bf40]", bg: "#88bf40", icon: "✓",  img: "/Chess Symbols/good.gif" } },
  { key: "book",       info: { label: "Book",       color: "text-[#b09860]", bg: "#b09860", icon: "📖", img: "/Chess Symbols/book.jpeg" } },
  { key: "inaccuracy", info: { label: "Inaccuracy", color: "text-[#f6c700]", bg: "#f6c700", icon: "?!", img: "/Chess Symbols/inacuracy.png" } },
  { key: "mistake",    info: { label: "Mistake",    color: "text-[#e28c28]", bg: "#e28c28", icon: "?",  img: "/Chess Symbols/mistake.png" } },
  { key: "miss",       info: { label: "Miss",       color: "text-[#e26b50]", bg: "#e26b50", icon: "✕",  img: "/Chess Symbols/miss.png" } },
  { key: "blunder",    info: { label: "Blunder",    color: "text-[var(--loss)]", bg: "#ca3431", icon: "??", img: "/Chess Symbols/blunder.png" } },
  { key: "forced",     info: { label: "Forced",     color: "text-[var(--text-2)]", bg: "#888888", icon: "→" } },
];

const CLASSIFICATION_LABELS: Record<MoveClassification, ClassInfo> = Object.fromEntries(
  CLASSIFICATIONS.map((c) => [c.key, c.info])
) as Record<MoveClassification, ClassInfo>;

// ─── Helpers ───

function estimatedRating(accuracy: number): number {
  // Piecewise linear interpolation anchored to real Chess.com data points
  // MAE ≈ 49 rating points across balanced games (both players ~same accuracy)
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
      return Math.round(r1 + t * (r2 - r1));
    }
  }
  return 2850;
}

function getGamePhaseRating(
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

function phaseIcon(acc: number | null): { icon: string; color: string } {
  if (acc === null) return { icon: "-", color: "text-[var(--text-3)]" };
  if (acc >= 90) return { icon: "👍", color: "text-green-400" };
  if (acc >= 70) return { icon: "✓", color: "text-green-500" };
  if (acc >= 50) return { icon: "~", color: "text-yellow-400" };
  return { icon: "✗", color: "text-red-400" };
}

// ─── Classification Circle Icon ───

function ClassCircle({ bg, icon, img, small }: { bg: string; icon: string; img?: string; small?: boolean }) {
  const size = small ? "w-4 h-4" : "w-5 h-5";
  const fontSize = small ? "8px" : "10px";
  if (img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img} alt={icon} className={`${size} rounded-full object-cover shrink-0`} />
    );
  }
  return (
    <span
      className={`${size} rounded-full inline-flex items-center justify-center font-bold text-white shrink-0 leading-none`}
      style={{ backgroundColor: bg, fontSize }}
    >
      {icon}
    </span>
  );
}

// ─── Phase icon helper ───
function PhaseIcon({ acc }: { acc: number | null }) {
  const { icon, color } = phaseIcon(acc);
  if (icon === "-") return <span className="text-[var(--text-3)] text-sm">—</span>;
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
      style={{ backgroundColor: color === "text-green-400" ? "#81b64c" : color === "text-green-500" ? "#5eba3a" : color === "text-yellow-400" ? "#f6c700" : "#ca3431" }}
    >
      {icon === "👍" ? "✓" : icon}
    </span>
  );
}

// ─── Avatar for panel ───

function PanelAvatar({ profile, username }: { profile: PlayerProfile | null; username: string }) {
  const [err, setErr] = useState(false);
  return (
    <div style={{
      width: 64, height: 64, borderRadius: 6, overflow: "hidden",
      border: "2px solid var(--border-strong)", flexShrink: 0,
    }}>
      {profile?.avatar && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar} alt={username} onError={() => setErr(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{
          width: "100%", height: "100%", background: "var(--border-strong)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 700, color: "var(--text-2)",
        }}>
          {username[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}

// ─── Game Review Summary Panel (Chess.com style) ───

function GameReviewPanel({
  analysis,
  gameInfo,
  playerProfiles,
  onStartReview,
  onMoveClick,
}: {
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
}) {
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

  const whiteEloNum = parseInt(gameInfo.whiteElo) || 1200;
  const blackEloNum = parseInt(gameInfo.blackElo) || 1200;
  const whitePerf = estimatedRating(analysis.whiteAccuracy);
  const blackPerf = estimatedRating(analysis.blackAccuracy);

  const labelStyle: React.CSSProperties = { width: 82, fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 };
  const centerLabelStyle: React.CSSProperties = { width: 70, fontSize: 11, color: "var(--text-3)", textAlign: "center", flexShrink: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-card)" }}>

      {/* ── Header ── */}
      <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          ⭐ Game Review
        </h2>
      </div>

      {/* ── Eval graph ── */}
      <div style={{ height: 60, background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <EvalGraph
          data={analysis.moves.map((m, i) => ({ move: i + 1, eval: m.engineEval, mate: m.mate ?? null }))}
          currentMove={0}
          onMoveClick={(move) => onMoveClick(move - 1)}
          mini
        />
      </div>

      {/* ── Players section ── */}
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {/* Username row */}
        <div style={{ display: "flex", marginBottom: 10 }}>
          <div style={{ width: 82, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
            {gameInfo.white}
          </span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
            {gameInfo.black}
          </span>
        </div>

        {/* Players row: label + large avatars */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <span style={labelStyle}>Players</span>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <PanelAvatar profile={playerProfiles.white} username={gameInfo.white} />
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <PanelAvatar profile={playerProfiles.black} username={gameInfo.black} />
          </div>
        </div>

        {/* Accuracy row: label + white boxes */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={labelStyle}>Accuracy</span>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 6, padding: "5px 14px", minWidth: 58, textAlign: "center" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {analysis.whiteAccuracy.toFixed(1)}
              </span>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 6, padding: "5px 14px", minWidth: 58, textAlign: "center" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {analysis.blackAccuracy.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Classification table ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 16px 4px" }}>
        {CLASSIFICATIONS.map(({ key, info }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ width: 82, fontSize: 13, color: "var(--text-2)", flexShrink: 0 }}>{info.label}</span>
            <span style={{
              flex: 1, textAlign: "right", fontSize: 14, fontWeight: 700,
              color: whiteCounts[key] > 0 ? info.bg : "var(--text-4)",
            }}>
              {whiteCounts[key]}
            </span>
            <div style={{ width: 32, display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <ClassCircle bg={info.bg} icon={info.icon} img={info.img} small />
            </div>
            <span style={{
              flex: 1, textAlign: "left", fontSize: 14, fontWeight: 700,
              color: blackCounts[key] > 0 ? info.bg : "var(--text-4)",
            }}>
              {blackCounts[key]}
            </span>
          </div>
        ))}
      </div>

      {/* ── Ratings + game phases ── */}
      <div style={{ padding: "10px 16px 8px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        {/* Est. Rating */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: whitePerf >= whiteEloNum ? "#81b64c" : "#ca3431" }}>
              {whitePerf}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>
              ({whitePerf >= whiteEloNum ? "+" : ""}{whitePerf - whiteEloNum})
            </span>
          </div>
          <span style={centerLabelStyle}>Est. Rating</span>
          <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 4, justifyContent: "flex-end" }}>
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>
              ({blackPerf >= blackEloNum ? "+" : ""}{blackPerf - blackEloNum})
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: blackPerf >= blackEloNum ? "#81b64c" : "#ca3431" }}>
              {blackPerf}
            </span>
          </div>
        </div>
        {[
          { label: "Opening", white: whiteOpening, black: blackOpening },
          { label: "Middlegame", white: whiteMiddle, black: blackMiddle },
          { label: "Endgame", white: whiteEnd, black: blackEnd },
        ].map(({ label, white: w, black: b }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <div style={{ flex: 1 }}><PhaseIcon acc={w?.accuracy ?? null} /></div>
            <span style={centerLabelStyle}>{label}</span>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}><PhaseIcon acc={b?.accuracy ?? null} /></div>
          </div>
        ))}
      </div>

      {/* ── Start Review button ── */}
      <div style={{ padding: "8px 12px 12px", flexShrink: 0 }}>
        <button
          onClick={onStartReview}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 8,
            background: "#6aaa3c", border: "none", color: "#fff",
            fontSize: 16, fontWeight: 800, cursor: "pointer",
            letterSpacing: "0.01em",
            boxShadow: "0 2px 8px rgba(106,170,60,0.35)",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#5e9935"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6aaa3c"; }}
        >
          Start Review
        </button>
      </div>
    </div>
  );
}

// ─── Review Mode Panel (move-by-move navigation) ───

function ReviewPanel({
  analysis,
  currentMoveIndex,
  setCurrentMoveIndex,
  gameInfo,
  onBackToSummary,
}: {
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
}) {
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
          ←
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
          </>
        ) : (
          <p className="text-xs text-[var(--text-3)]">Use ← → to navigate moves</p>
        )}
      </div>

      {/* Move list — dominant element */}
      <div className="flex-1 overflow-hidden px-3 py-2">
        <MoveList
          moves={displayMoves}
          currentMoveIndex={currentMoveIndex}
          onMoveClick={setCurrentMoveIndex}
        />
      </div>

      {/* Eval graph — at bottom like Chess.com */}
      <div className="h-[52px] bg-[var(--bg-surface)] border-t border-[var(--border)]">
        <EvalGraph
          data={displayMoves.map((m, i) => ({ move: i + 1, eval: m.engineEval, mate: m.mate ?? null }))}
          currentMove={currentMoveIndex + 1}
          onMoveClick={(move) => setCurrentMoveIndex(move - 1)}
          mini
        />
      </div>

      {/* Navigation buttons — very bottom like Chess.com */}
      <div className="grid grid-cols-4 border-t border-[var(--border)]">
        {[
          { label: "⟨⟨", action: () => setCurrentMoveIndex(-1), title: "Start" },
          { label: "⟨",  action: () => setCurrentMoveIndex((p: number) => Math.max(-1, p - 1)), title: "Previous" },
          { label: "⟩",  action: () => setCurrentMoveIndex((p: number) => Math.min(displayMoves.length - 1, p + 1)), title: "Next" },
          { label: "⟩⟩", action: () => setCurrentMoveIndex(displayMoves.length - 1), title: "End" },
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
}

// ─── Player bar helpers ───

interface PlayerProfile {
  avatar?: string;
  flagEmoji?: string;
}

function countryCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  try {
    return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
  } catch { return ""; }
}

function parseTimeControl(pgn: string): { initial: number; increment: number } | null {
  const m = pgn.match(/\[TimeControl "([^"]+)"\]/);
  if (!m) return null;
  const tc = m[1];
  if (tc === "-" || tc === "") return null;
  const parts = tc.split("+");
  const initial = parseInt(parts[0], 10);
  const increment = parts[1] ? parseInt(parts[1], 10) : 0;
  return isNaN(initial) ? null : { initial, increment };
}

function parseMoveTimes(pgn: string): (number | null)[] {
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

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getPlayerTime(
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

// ─── Player Bar ───

function PlayerBar({
  username,
  rating,
  profile,
  time,
  result,
  playerColor,
}: {
  username: string;
  rating: string;
  profile: PlayerProfile | null;
  time: string;
  result: string;
  playerColor: "white" | "black";
}) {
  const [imgError, setImgError] = useState(false);
  const won = (playerColor === "white" && result === "1-0") || (playerColor === "black" && result === "0-1");
  const drew = result === "1/2-1/2";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 6px",
        height: 48,
        background: "var(--bg)",
        flexShrink: 0,
      }}
    >
      {/* Avatar */}
      {profile?.avatar && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar}
          alt={username}
          onError={() => setImgError(true)}
          style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 36, height: 36, borderRadius: 4, flexShrink: 0,
            background: "var(--border-strong)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 700, color: "var(--text-2)",
          }}
        >
          {username[0]?.toUpperCase()}
        </div>
      )}

      {/* Name + flag + rating */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {username}
          </span>
          {profile?.flagEmoji && (
            <span style={{ fontSize: 14, lineHeight: 1 }}>{profile.flagEmoji}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          ({rating})
        </span>
      </div>

      {/* Right side: result dot + clock */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span
          style={{
            width: 8, height: 8, borderRadius: "50%", display: "inline-block",
            background: won ? "var(--win)" : drew ? "var(--text-3)" : "var(--loss)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 16,
            fontWeight: 700,
            color: time === "--:--" ? "var(--text-3)" : "var(--text-1)",
            letterSpacing: "-0.02em",
          }}
        >
          {time}
        </span>
      </div>
    </div>
  );
}

// ─── Accuracy color helper ───

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "#81b64c";
  if (accuracy >= 75) return "#f6c700";
  if (accuracy >= 60) return "#f6c700";
  if (accuracy >= 40) return "#e28c28";
  return "#ca3431";
}

// ─── Slim review header (no search bar) ───

function ReviewHeader({ username }: { username: string }) {
  const { data: session } = useSession();
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
        backdropFilter: "blur(12px)",
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
      }}
    >
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="6" fill="var(--green)" opacity="0.9"/>
          <path d="M11 25V23.5C11 23.5 9 22 9 19C9 16 11 14 11 14L10 12H12L13 10H15L15.5 11.5C17 11 18 11 19 12C20 13 20 14 20 14L18 15L19 17C19 17 20 19 19 21C18 23 17 23.5 17 23.5V25H11Z" fill="white" opacity="0.95"/>
          <rect x="10" y="26" width="12" height="2" rx="1" fill="white" opacity="0.7"/>
        </svg>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
          Chess<span style={{ color: "var(--green)" }}>IQ</span>
        </span>
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", letterSpacing: "0.02em" }}>{username}</span>
        </div>
        {session && (
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", cursor: "pointer" }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}

// ─── Analysis Progress ───

function AnalysisProgress() {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl p-6 flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="text-4xl mb-4 animate-pulse">♟</div>
      <h3 className="text-lg font-bold text-white mb-2">Analyzing with Stockfish...</h3>
      <div className="w-48 h-1.5 bg-[var(--border)] rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-[var(--green)] rounded-full animate-pulse"
          style={{ width: "100%" }}
        />
      </div>
      <p className="text-xs text-[var(--text-1)]0 text-center">
        Deep analysis of every move. This typically takes 1-3 minutes.
      </p>
    </div>
  );
}

// ─── Main Page ───

export default function GameReviewPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const gameId = params.gameId as string;

  // Prev/next game navigation from sessionStorage game list
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("chessiq_game_list");
      if (!raw) return;
      const { username: listUsername, ids } = JSON.parse(raw) as { username: string; ids: string[] };
      if (listUsername !== username) return;
      const idx = ids.indexOf(gameId);
      if (idx === -1) return;
      setPrevId(idx > 0 ? ids[idx - 1] : null);
      setNextId(idx < ids.length - 1 ? ids[idx + 1] : null);
    } catch {}
  }, [username, gameId]);

  const [analysis, setAnalysis] = useState<GameAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [reviewStarted, setReviewStarted] = useState(false);
  const [playerProfiles, setPlayerProfiles] = useState<{ white: PlayerProfile | null; black: PlayerProfile | null }>({ white: null, black: null });
  const [moveTimes, setMoveTimes] = useState<(number | null)[]>([]);
  const [timeControl, setTimeControl] = useState<{ initial: number; increment: number } | null>(null);
  const [gameInfo, setGameInfo] = useState<{
    white: string;
    black: string;
    whiteElo: string;
    blackElo: string;
    result: string;
    date: string;
    opening: string;
    playerColor: "white" | "black";
    pgn: string;
  } | null>(null);

  // Step 1: Fetch game data — check sessionStorage first for instant loads
  useEffect(() => {
    async function fetchGame() {
      // Fast path: game data was cached when user clicked Review from the games list
      try {
        const cached = sessionStorage.getItem(`game_${gameId}`);
        if (cached) {
          setGameInfo(JSON.parse(cached));
          setLoading(false);
          return;
        }
      } catch {}

      // Slow path: single-game fetch from DB (direct URL, bookmark, etc.)
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(gameId)}`);
        if (!res.ok) throw new Error("Game not found");
        const game = await res.json();

        setGameInfo({
          white: game.white,
          black: game.black,
          whiteElo: game.whiteElo,
          blackElo: game.blackElo,
          result: game.result,
          date: game.date,
          opening: game.opening,
          playerColor: game.playerColor,
          pgn: game.pgn,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch game");
      } finally {
        setLoading(false);
      }
    }

    fetchGame();
  }, [username, gameId]);

  // Fetch Chess.com player profiles + parse PGN clock data
  useEffect(() => {
    if (!gameInfo) return;
    setTimeControl(parseTimeControl(gameInfo.pgn));
    setMoveTimes(parseMoveTimes(gameInfo.pgn));

    async function fetchProfiles() {
      const fetchOne = async (name: string): Promise<PlayerProfile | null> => {
        try {
          const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(name.toLowerCase())}`);
          if (!res.ok) return null;
          const data = await res.json();
          const countryCode = (data.country as string | undefined)?.split("/").pop() ?? "";
          return { avatar: data.avatar, flagEmoji: countryCodeToFlag(countryCode) };
        } catch { return null; }
      };
      const [white, black] = await Promise.all([fetchOne(gameInfo!.white), fetchOne(gameInfo!.black)]);
      setPlayerProfiles({ white, black });
    }
    fetchProfiles();
  }, [gameInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: Send PGN to backend for Stockfish analysis
  useEffect(() => {
    if (!gameInfo?.pgn || analyzing || analysis) return;

    const controller = new AbortController();
    setAnalyzing(true);

    analyzeGame(gameInfo.pgn, 14, gameId, controller.signal)
      .then((result) => {
        setAnalysis(result);
        setAnalyzing(false);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Analysis failed");
        setAnalyzing(false);
      });

    return () => controller.abort();
  }, [gameInfo?.pgn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Current position FEN
  const getCurrentFen = useCallback(() => {
    const moves = analysis?.moves;
    if (currentMoveIndex < 0 || !moves?.length) {
      return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    }
    return (
      moves[currentMoveIndex]?.fen ??
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );
  }, [currentMoveIndex, analysis]);

  // Keyboard navigation
  useEffect(() => {
    const moves = analysis?.moves;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!moves?.length || !reviewStarted) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentMoveIndex((prev) => Math.max(-1, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentMoveIndex((prev) => Math.min(moves.length - 1, prev + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setCurrentMoveIndex(-1);
      } else if (e.key === "End") {
        e.preventDefault();
        setCurrentMoveIndex(moves.length - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [analysis, reviewStarted]);


  const displayMoves = analysis?.moves ?? [];
  const currentMove = currentMoveIndex >= 0 ? displayMoves[currentMoveIndex] : null;
  const currentEval = currentMove?.engineEval ?? 0;

  // Highlight squares
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  const moveToSquare = currentMove ? currentMove.move.slice(2, 4) : null;
  const moveClassification = currentMove?.classification ?? null;

  if (currentMove) {
    const from = currentMove.move.slice(0, 2);
    const to = currentMove.move.slice(2, 4);

    const moveColor =
      currentMove.classification === "blunder"
        ? "rgba(202, 52, 49, 0.45)"
        : currentMove.classification === "mistake"
        ? "rgba(224, 138, 32, 0.45)"
        : currentMove.classification === "inaccuracy"
        ? "rgba(230, 176, 40, 0.35)"
        : currentMove.classification === "miss"
        ? "rgba(212, 168, 42, 0.35)"
        : currentMove.classification === "brilliant"
        ? "rgba(38, 201, 195, 0.4)"
        : currentMove.classification === "great"
        ? "rgba(92, 139, 176, 0.4)"
        : currentMove.classification === "best"
        ? "rgba(150, 188, 75, 0.4)"
        : "rgba(100, 100, 100, 0.2)";

    customSquareStyles[from] = { backgroundColor: moveColor };
    customSquareStyles[to] = { backgroundColor: moveColor };

    if (
      currentMove.bestMove &&
      currentMove.bestMove !== currentMove.move &&
      ["blunder", "mistake", "inaccuracy", "miss"].includes(currentMove.classification)
    ) {
      const bestTo = currentMove.bestMove.slice(2, 4);
      customSquareStyles[bestTo] = {
        backgroundColor: "rgba(150, 188, 75, 0.4)",
        borderRadius: "50%",
      };
    }
  }

  const squareRenderer = useMemo(() => {
    if (!moveToSquare || !moveClassification) return undefined;
    const info = CLASSIFICATION_LABELS[moveClassification];
    if (!info) return undefined;

    return ({ square, children }: { piece: any; square: string; children?: React.ReactNode }) => (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {children}
        {square === moveToSquare && (
          <div
            style={{
              position: "absolute",
              top: "-20%",
              right: "-20%",
              width: "45%",
              height: "45%",
              borderRadius: "50%",
              zIndex: 10,
              overflow: "hidden",
              boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
              border: "2px solid rgba(255,255,255,0.3)",
              ...(!info.img ? {
                backgroundColor: info.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              } : {}),
            }}
          >
            {info.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.img} alt={info.icon} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: "#fff", fontWeight: 800, fontSize: "60%", lineHeight: 1 }}>
                {info.icon}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }, [moveToSquare, moveClassification]);

  // Loading game data
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <ReviewHeader username={username} />
        <ChessLoader username={username} variant="review" />
      </div>
    );
  }

  // Error
  if (error && !analysis) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <ReviewHeader username={username} />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8">
            <div className="text-4xl mb-4">♟</div>
            <h2 className="text-red-400 font-semibold text-lg mb-2">Analysis Failed</h2>
            <p className="text-[var(--text-2)]">{error}</p>
            <a
              href={`/player/${username}`}
              className="inline-block mt-4 px-4 py-2 bg-[var(--border)] text-[var(--text-2)] rounded-lg hover:bg-[var(--border)] transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Board size: header(44) + player bars(96) + padding(12) + buffer(16) = 168px
  // Width constrained by panel(300) + evalbar(20) + gaps + padding
  const boardSizeCSS = "min(calc(100vh - 168px), calc(100vw - 344px))";
  const topColor = gameInfo?.playerColor === "white" ? "black" : "white";
  const bottomColor = (gameInfo?.playerColor ?? "white");
  const whiteTime = getPlayerTime(moveTimes, currentMoveIndex, "white", timeControl?.initial ?? null);
  const blackTime = getPlayerTime(moveTimes, currentMoveIndex, "black", timeControl?.initial ?? null);

  return (
    <div className="h-screen bg-[var(--bg)] text-[var(--text-1)] flex flex-col overflow-hidden">
      <ReviewHeader username={username} />


      {/* Board + panel centered together as one unit */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ padding: "4px" }}>
        {/* Eval bar + board column grouped so eval bar stretches to full board column height */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 4, marginRight: 4 }}>
          {/* Eval bar — height matches board column via alignItems: stretch */}
          <div style={{ width: 20 }}>
            <EvalBar eval_={currentEval} mate={currentMove?.mate ?? null} />
          </div>
          {/* Board column: top player bar + board + bottom player bar */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Top player (opponent from user's perspective) */}
            {gameInfo && (
              <PlayerBar
                username={topColor === "white" ? gameInfo.white : gameInfo.black}
                rating={topColor === "white" ? gameInfo.whiteElo : gameInfo.blackElo}
                profile={topColor === "white" ? playerProfiles.white : playerProfiles.black}
                time={topColor === "white" ? whiteTime : blackTime}
                result={gameInfo.result}
                playerColor={topColor}
              />
            )}
            {/* Board */}
            <div style={{ width: boardSizeCSS, height: boardSizeCSS }}>
              <Chessboard
                options={{
                  position: getCurrentFen(),
                  pieces: neoPieces,
                  squareStyles: customSquareStyles,
                  darkSquareStyle: { backgroundColor: "#779952" },
                  lightSquareStyle: { backgroundColor: "#edeed1" },
                  boardOrientation: gameInfo?.playerColor ?? "white",
                  allowDragging: false,
                  animationDurationInMs: 200,
                  squareRenderer,
                }}
              />
            </div>
            {/* Bottom player (user) */}
            {gameInfo && (
              <PlayerBar
                username={bottomColor === "white" ? gameInfo.white : gameInfo.black}
                rating={bottomColor === "white" ? gameInfo.whiteElo : gameInfo.blackElo}
                profile={bottomColor === "white" ? playerProfiles.white : playerProfiles.black}
                time={bottomColor === "white" ? whiteTime : blackTime}
                result={gameInfo.result}
                playerColor={bottomColor}
              />
            )}
          </div>
        </div>
        {/* Panel — adjacent to the board, fixed width */}
        <div className="w-[300px] shrink-0 self-stretch border-l border-[var(--border)] flex flex-col overflow-hidden">
          {analyzing && !analysis && <AnalysisProgress />}

          {analysis && gameInfo && !reviewStarted && (
            <GameReviewPanel
              analysis={analysis}
              gameInfo={gameInfo}
              playerProfiles={playerProfiles}
              onStartReview={() => {
                setReviewStarted(true);
                setCurrentMoveIndex(0);
              }}
              onMoveClick={(moveIndex) => {
                setReviewStarted(true);
                setCurrentMoveIndex(moveIndex);
              }}
            />
          )}

          {analysis && gameInfo && reviewStarted && (
            <ReviewPanel
              analysis={analysis}
              currentMoveIndex={currentMoveIndex}
              setCurrentMoveIndex={setCurrentMoveIndex}
              gameInfo={gameInfo}
              onBackToSummary={() => {
                setReviewStarted(false);
                setCurrentMoveIndex(-1);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
