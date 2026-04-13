"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import ChessLoader from "@/components/ChessLoader";
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

// ─── Game Review Summary Panel (Chess.com style) ───

function GameReviewPanel({
  analysis,
  gameInfo,
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

  return (
    <div className="flex flex-col h-full bg-[var(--bg-card)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-sm font-bold text-white tracking-wide">⭐ Game Review</h2>
      </div>

      {/* Eval graph */}
      <div className="h-[52px] bg-[var(--bg-surface)] border-b border-[var(--border)]">
        <EvalGraph
          data={analysis.moves.map((m, i) => ({ move: i + 1, eval: m.engineEval, mate: m.mate ?? null }))}
          currentMove={0}
          onMoveClick={(move) => onMoveClick(move - 1)}
          mini
        />
      </div>

      {/* Players + Accuracy — Chess.com row style */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        {/* Player names */}
        <div className="grid grid-cols-[1fr_80px_1fr] text-xs text-[var(--text-2)] mb-2">
          <span className="truncate font-medium text-white">{gameInfo.white}</span>
          <span className="text-center">Players</span>
          <span className="truncate font-medium text-white text-right">{gameInfo.black}</span>
        </div>
        {/* Accuracy */}
        <div className="grid grid-cols-[1fr_80px_1fr] items-center">
          <span
            className="text-base font-bold"
            style={{ color: getAccuracyColor(analysis.whiteAccuracy) }}
          >
            {analysis.whiteAccuracy.toFixed(1)}
          </span>
          <span className="text-xs text-[var(--text-3)] text-center">Accuracy</span>
          <span
            className="text-base font-bold text-right"
            style={{ color: getAccuracyColor(analysis.blackAccuracy) }}
          >
            {analysis.blackAccuracy.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Classification table — Chess.com format: label | white | icon | black */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {CLASSIFICATIONS.map(({ key, info }) => (
          <div key={key} className="grid grid-cols-[80px_28px_20px_28px] items-center py-[3px] gap-1">
            <span className="text-xs text-[var(--text-2)]">{info.label}</span>
            <span className={`text-sm font-semibold text-right ${whiteCounts[key] > 0 ? "text-white" : "text-[var(--text-4)]"}`}>
              {whiteCounts[key]}
            </span>
            <ClassCircle bg={info.bg} icon={info.icon} img={info.img} small />
            <span className={`text-sm font-semibold text-left pl-1 ${blackCounts[key] > 0 ? "text-white" : "text-[var(--text-4)]"}`}>
              {blackCounts[key]}
            </span>
          </div>
        ))}
      </div>

      {/* Phase + Ratings section */}
      <div className="px-4 py-3 border-t border-[var(--border)] space-y-1.5">
        {/* Ratings */}
        <div className="grid grid-cols-[1fr_80px_1fr] items-center">
          <span className="text-sm font-bold text-white">{gameInfo.whiteElo}</span>
          <span className="text-xs text-[var(--text-3)] text-center">Ratings</span>
          <span className="text-sm font-bold text-white text-right">{gameInfo.blackElo}</span>
        </div>
        {/* Opening */}
        <div className="grid grid-cols-[1fr_80px_1fr] items-center">
          <PhaseIcon acc={whiteOpening?.accuracy ?? null} />
          <span className="text-xs text-[var(--text-3)] text-center">Opening</span>
          <div className="flex justify-end"><PhaseIcon acc={blackOpening?.accuracy ?? null} /></div>
        </div>
        {/* Middlegame */}
        <div className="grid grid-cols-[1fr_80px_1fr] items-center">
          <PhaseIcon acc={whiteMiddle?.accuracy ?? null} />
          <span className="text-xs text-[var(--text-3)] text-center">Middlegame</span>
          <div className="flex justify-end"><PhaseIcon acc={blackMiddle?.accuracy ?? null} /></div>
        </div>
        {/* Endgame */}
        <div className="grid grid-cols-[1fr_80px_1fr] items-center">
          <PhaseIcon acc={whiteEnd?.accuracy ?? null} />
          <span className="text-xs text-[var(--text-3)] text-center">Endgame</span>
          <div className="flex justify-end"><PhaseIcon acc={blackEnd?.accuracy ?? null} /></div>
        </div>
      </div>

      {/* Start Review */}
      <div className="px-4 pb-4 pt-2">
        <button
          onClick={onStartReview}
          className="w-full py-2.5 rounded-lg btn-gold font-bold text-sm transition-colors"
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

// ─── Accuracy color helper ───

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "#81b64c";
  if (accuracy >= 75) return "#f6c700";
  if (accuracy >= 60) return "#f6c700";
  if (accuracy >= 40) return "#e28c28";
  return "#ca3431";
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
        <Header username={username} />
        <ChessLoader username={username} variant="review" />
      </div>
    );
  }

  // Error
  if (error && !analysis) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <Header username={username} />
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

  // Board size: fill available height, constrained by width on narrow viewports
  // 64px = header(56) + padding(8), 340px = panel(300) + evalbar(20) + gaps(12) + padding(8)
  const boardSizeCSS = "min(calc(100vh - 64px), calc(100vw - 340px))";

  return (
    <div className="h-screen bg-[var(--bg)] text-[var(--text-1)] flex flex-col overflow-hidden">
      <Header username={username} />

      {/* Prev / Next game navigation */}
      {(prevId || nextId) && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", padding: "4px 8px", borderBottom: "1px solid var(--border)" }}>
          <button
            disabled={!prevId}
            onClick={() => prevId && router.push(`/player/${encodeURIComponent(username)}/review/${encodeURIComponent(prevId)}`)}
            style={{
              padding: "4px 14px",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              background: prevId ? "var(--bg-card)" : "transparent",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: prevId ? "var(--text-2)" : "var(--text-3)",
              cursor: prevId ? "pointer" : "not-allowed",
              opacity: prevId ? 1 : 0.4,
            }}
          >
            ← Prev
          </button>
          <a
            href={`/player/${encodeURIComponent(username)}`}
            style={{ padding: "4px 14px", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-3)", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "6px", textDecoration: "none" }}
          >
            All Games
          </a>
          <button
            disabled={!nextId}
            onClick={() => nextId && router.push(`/player/${encodeURIComponent(username)}/review/${encodeURIComponent(nextId)}`)}
            style={{
              padding: "4px 14px",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              background: nextId ? "var(--bg-card)" : "transparent",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: nextId ? "var(--text-2)" : "var(--text-3)",
              cursor: nextId ? "pointer" : "not-allowed",
              opacity: nextId ? 1 : 0.4,
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* Board + panel centered together as one unit */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ padding: "4px" }}>
        {/* Eval bar */}
        <div style={{ width: 20, height: boardSizeCSS, marginRight: 4 }}>
          <EvalBar eval_={currentEval} mate={currentMove?.mate ?? null} />
        </div>
        {/* Board */}
        <div style={{ width: boardSizeCSS, height: boardSizeCSS }}>
          <Chessboard
            options={{
              position: getCurrentFen(),
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
        {/* Panel — adjacent to the board, fixed width */}
        <div className="w-[300px] shrink-0 self-stretch border-l border-[var(--border)] flex flex-col overflow-hidden">
          {analyzing && !analysis && <AnalysisProgress />}

          {analysis && gameInfo && !reviewStarted && (
            <GameReviewPanel
              analysis={analysis}
              gameInfo={gameInfo}
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
