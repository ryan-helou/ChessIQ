"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
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
      <div className="w-full aspect-square bg-slate-800/40 rounded-lg animate-pulse" />
    ),
  }
);

// ─── Classification config (matches Chess.com ordering & colors) ───

interface ClassInfo {
  label: string;
  color: string; // text color class
  bg: string; // circle bg color (hex)
  icon: string;
}

const CLASSIFICATIONS: { key: MoveClassification; info: ClassInfo }[] = [
  { key: "brilliant", info: { label: "Brilliant", color: "text-cyan-400", bg: "#26c9c3", icon: "!!" } },
  { key: "great", info: { label: "Great", color: "text-blue-400", bg: "#5c8bb0", icon: "!" } },
  { key: "book", info: { label: "Book", color: "text-[#c9a967]", bg: "#c9a967", icon: "📖" } },
  { key: "best", info: { label: "Best", color: "text-emerald-400", bg: "#96bc4b", icon: "★" } },
  { key: "excellent", info: { label: "Excellent", color: "text-emerald-300", bg: "#96bc4b", icon: "" } },
  { key: "good", info: { label: "Good", color: "text-[#a0a0a0]", bg: "#a0a0a0", icon: "" } },
  { key: "inaccuracy", info: { label: "Inaccuracy", color: "text-yellow-400", bg: "#e6b028", icon: "?!" } },
  { key: "mistake", info: { label: "Mistake", color: "text-orange-400", bg: "#e08a20", icon: "?" } },
  { key: "miss", info: { label: "Miss", color: "text-amber-400", bg: "#d4a82a", icon: "⊘" } },
  { key: "blunder", info: { label: "Blunder", color: "text-red-400", bg: "#ca3431", icon: "??" } },
  { key: "forced", info: { label: "Forced", color: "text-slate-400", bg: "#888888", icon: "→" } },
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
  if (acc === null) return { icon: "-", color: "text-slate-600" };
  if (acc >= 90) return { icon: "👍", color: "text-green-400" };
  if (acc >= 70) return { icon: "✓", color: "text-green-500" };
  if (acc >= 50) return { icon: "~", color: "text-yellow-400" };
  return { icon: "✗", color: "text-red-400" };
}

// ─── Classification Circle Icon ───

function ClassCircle({ bg, icon, small }: { bg: string; icon: string; small?: boolean }) {
  const size = small ? "w-4 h-4 text-[8px]" : "w-5 h-5 text-[10px]";
  if (icon === "📖") {
    return <span className={`${small ? "text-xs" : "text-sm"}`}>📖</span>;
  }
  return (
    <span
      className={`${size} rounded-full inline-flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: bg }}
    >
      {icon}
    </span>
  );
}

// ─── Game Review Summary Panel (Chess.com style) ───

function GameReviewPanel({
  analysis,
  gameInfo,
  onStartReview,
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
}) {
  // Count classifications for each side
  const whiteMoves = analysis.moves.filter((m) => m.color === "white");
  const blackMoves = analysis.moves.filter((m) => m.color === "black");

  const whiteCounts: Record<MoveClassification, number> = {} as any;
  const blackCounts: Record<MoveClassification, number> = {} as any;

  for (const c of CLASSIFICATIONS) {
    whiteCounts[c.key] = whiteMoves.filter((m) => m.classification === c.key).length;
    blackCounts[c.key] = blackMoves.filter((m) => m.classification === c.key).length;
  }

  // Game phases
  const whiteOpening = getGamePhaseRating(analysis.moves, "white", "opening");
  const blackOpening = getGamePhaseRating(analysis.moves, "black", "opening");
  const whiteMiddle = getGamePhaseRating(analysis.moves, "white", "middlegame");
  const blackMiddle = getGamePhaseRating(analysis.moves, "black", "middlegame");
  const whiteEnd = getGamePhaseRating(analysis.moves, "white", "endgame");
  const blackEnd = getGamePhaseRating(analysis.moves, "black", "endgame");

  return (
    <div className="bg-[#262522] rounded-xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-lg font-bold text-white">Game Review</h2>
      </div>

      {/* Mini eval graph */}
      <div className="px-5 pb-2">
        <div className="h-[60px] bg-[#1a1916] rounded-lg overflow-hidden">
          <EvalGraph
            data={analysis.moves.map((m, i) => ({
              move: i + 1,
              eval: m.engineEval,
              mate: m.mate ?? null,
            }))}
            currentMove={0}
            onMoveClick={() => {}}
            mini
          />
        </div>
      </div>

      {/* Players + Accuracy */}
      <div className="px-5 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* White player */}
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-1.5 rounded bg-slate-700 flex items-center justify-center text-lg">
              ♔
            </div>
            <div className="text-sm font-semibold text-white truncate">{gameInfo.white}</div>
          </div>

          {/* Label column */}
          <div className="text-center">
            <div className="h-12 mb-1.5" />
            <div className="text-xs text-slate-500">Players</div>
          </div>

          {/* Black player */}
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-1.5 rounded bg-slate-700 flex items-center justify-center text-lg">
              ♚
            </div>
            <div className="text-sm font-semibold text-white truncate">{gameInfo.black}</div>
          </div>
        </div>

        {/* Accuracy row */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mt-3">
          <div className="text-center">
            <span
              className="inline-block px-3 py-1 rounded-md font-bold text-lg"
              style={{
                backgroundColor: getAccuracyColor(analysis.whiteAccuracy),
                color: "#fff",
              }}
            >
              {analysis.whiteAccuracy.toFixed(1)}
            </span>
          </div>
          <div className="text-xs text-slate-500 text-center">Accuracy</div>
          <div className="text-center">
            <span
              className="inline-block px-3 py-1 rounded-md font-bold text-lg"
              style={{
                backgroundColor: getAccuracyColor(analysis.blackAccuracy),
                color: "#fff",
              }}
            >
              {analysis.blackAccuracy.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[#3a3835] mx-5" />

      {/* Classification breakdown table */}
      <div className="px-5 py-3 flex-1 overflow-y-auto">
        <div className="space-y-1.5">
          {CLASSIFICATIONS.map(({ key, info }) => (
            <div
              key={key}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4"
            >
              {/* White count */}
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-sm text-white font-medium w-6 text-right">
                  {whiteCounts[key]}
                </span>
                <ClassCircle bg={info.bg} icon={info.icon} small />
              </div>

              {/* Label */}
              <div className="text-xs text-slate-400 w-20 text-center">{info.label}</div>

              {/* Black count */}
              <div className="flex items-center justify-center gap-1.5">
                <ClassCircle bg={info.bg} icon={info.icon} small />
                <span className="text-sm text-white font-medium w-6 text-left">
                  {blackCounts[key]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[#3a3835] mx-5" />

      {/* Game Phase section */}
      <div className="px-5 py-3">
        <div className="space-y-2">
          {/* Game Rating row */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-center">
              <span className="inline-block px-2.5 py-0.5 rounded bg-white text-black font-bold text-sm">
                {gameInfo.whiteElo}
              </span>
            </div>
            <div className="text-xs text-slate-400 w-20 text-center">Game Rating</div>
            <div className="text-center">
              <span className="inline-block px-2.5 py-0.5 rounded bg-slate-600 text-white font-bold text-sm">
                {gameInfo.blackElo}
              </span>
            </div>
          </div>

          {/* Opening */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-center text-lg">
              {phaseIcon(whiteOpening?.accuracy ?? null).icon === "👍" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm">👍</span>
              ) : phaseIcon(whiteOpening?.accuracy ?? null).icon === "✓" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm font-bold">✓</span>
              ) : (
                <span className="text-slate-600">{phaseIcon(whiteOpening?.accuracy ?? null).icon}</span>
              )}
            </div>
            <div className="text-xs text-slate-400 w-20 text-center">Opening</div>
            <div className="text-center text-lg">
              {phaseIcon(blackOpening?.accuracy ?? null).icon === "👍" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm">👍</span>
              ) : phaseIcon(blackOpening?.accuracy ?? null).icon === "✓" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm font-bold">✓</span>
              ) : (
                <span className="text-slate-600">{phaseIcon(blackOpening?.accuracy ?? null).icon}</span>
              )}
            </div>
          </div>

          {/* Middlegame */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-center text-lg">
              {phaseIcon(whiteMiddle?.accuracy ?? null).icon === "👍" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm">👍</span>
              ) : phaseIcon(whiteMiddle?.accuracy ?? null).icon === "✓" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm font-bold">✓</span>
              ) : (
                <span className="text-slate-600">{phaseIcon(whiteMiddle?.accuracy ?? null).icon}</span>
              )}
            </div>
            <div className="text-xs text-slate-400 w-20 text-center">Middlegame</div>
            <div className="text-center text-lg">
              {phaseIcon(blackMiddle?.accuracy ?? null).icon === "👍" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm">👍</span>
              ) : phaseIcon(blackMiddle?.accuracy ?? null).icon === "✓" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm font-bold">✓</span>
              ) : (
                <span className="text-slate-600">{phaseIcon(blackMiddle?.accuracy ?? null).icon}</span>
              )}
            </div>
          </div>

          {/* Endgame */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="text-center text-lg">
              {phaseIcon(whiteEnd?.accuracy ?? null).icon === "👍" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm">👍</span>
              ) : phaseIcon(whiteEnd?.accuracy ?? null).icon === "✓" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm font-bold">✓</span>
              ) : (
                <span className="text-slate-600">{phaseIcon(whiteEnd?.accuracy ?? null).icon}</span>
              )}
            </div>
            <div className="text-xs text-slate-400 w-20 text-center">Endgame</div>
            <div className="text-center text-lg">
              {phaseIcon(blackEnd?.accuracy ?? null).icon === "👍" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm">👍</span>
              ) : phaseIcon(blackEnd?.accuracy ?? null).icon === "✓" ? (
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#769656] text-white text-sm font-bold">✓</span>
              ) : (
                <span className="text-slate-600">{phaseIcon(blackEnd?.accuracy ?? null).icon}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Start Review button */}
      <div className="px-5 pb-5 pt-2">
        <button
          onClick={onStartReview}
          className="w-full py-3 rounded-lg bg-[#81b64c] hover:bg-[#6fa33e] text-white font-bold text-lg transition-colors"
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
}) {
  const displayMoves = analysis.moves;
  const currentMove = currentMoveIndex >= 0 ? displayMoves[currentMoveIndex] : null;

  return (
    <div className="bg-[#262522] rounded-xl overflow-hidden flex flex-col h-full">
      {/* Current move info */}
      <div className="px-4 pt-4 pb-3">
        {currentMove ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClassCircle
                bg={CLASSIFICATION_LABELS[currentMove.classification].bg}
                icon={CLASSIFICATION_LABELS[currentMove.classification].icon}
              />
              <span className="text-lg font-bold text-white font-mono">
                {currentMove.san}
              </span>
              <span
                className={`text-sm font-semibold ${CLASSIFICATION_LABELS[currentMove.classification].color}`}
              >
                {CLASSIFICATION_LABELS[currentMove.classification].label}
              </span>
            </div>
            {["blunder", "mistake", "inaccuracy", "miss"].includes(currentMove.classification) &&
              currentMove.bestMoveSan && (
                <div className="text-sm text-slate-400 mt-1 pl-7">
                  Best was{" "}
                  <span className="text-emerald-400 font-semibold font-mono">
                    {currentMove.bestMoveSan}
                  </span>
                  <span className="text-slate-600 ml-2">
                    ({currentMove.evalDrop > 0 ? "+" : ""}
                    {(currentMove.evalDrop / 100).toFixed(1)})
                  </span>
                </div>
              )}
            <div className="text-xs text-slate-500 mt-1 pl-7">
              Accuracy: {currentMove.accuracy.toFixed(0)}%
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            Starting position — press → or click a move
          </div>
        )}
      </div>

      {/* Eval graph */}
      <div className="px-4 pb-2">
        <div className="h-[80px] bg-[#1a1916] rounded-lg overflow-hidden">
          <EvalGraph
            data={displayMoves.map((m, i) => ({
              move: i + 1,
              eval: m.engineEval,
              mate: m.mate ?? null,
            }))}
            currentMove={currentMoveIndex + 1}
            onMoveClick={(move) => setCurrentMoveIndex(move - 1)}
          />
        </div>
      </div>

      {/* Move navigation buttons */}
      <div className="px-4 pb-2 flex gap-1">
        <button
          onClick={() => setCurrentMoveIndex(-1)}
          className="flex-1 py-1.5 text-sm bg-[#3a3835] text-slate-300 rounded hover:bg-[#4a4845] transition-colors font-bold"
        >
          ⟨⟨
        </button>
        <button
          onClick={() => setCurrentMoveIndex((prev: number) => Math.max(-1, prev - 1))}
          className="flex-1 py-1.5 text-sm bg-[#3a3835] text-slate-300 rounded hover:bg-[#4a4845] transition-colors font-bold"
        >
          ⟨
        </button>
        <button
          onClick={() =>
            setCurrentMoveIndex((prev: number) => Math.min(displayMoves.length - 1, prev + 1))
          }
          className="flex-1 py-1.5 text-sm bg-[#3a3835] text-slate-300 rounded hover:bg-[#4a4845] transition-colors font-bold"
        >
          ⟩
        </button>
        <button
          onClick={() => setCurrentMoveIndex(displayMoves.length - 1)}
          className="flex-1 py-1.5 text-sm bg-[#3a3835] text-slate-300 rounded hover:bg-[#4a4845] transition-colors font-bold"
        >
          ⟩⟩
        </button>
      </div>

      {/* Move list */}
      <div className="px-4 pb-4 flex-1 overflow-hidden">
        <MoveList
          moves={displayMoves}
          currentMoveIndex={currentMoveIndex}
          onMoveClick={setCurrentMoveIndex}
        />
      </div>

      {/* Accuracy footer */}
      <div className="border-t border-[#3a3835] px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">♔</span>
            <span className="text-sm text-white font-semibold">{gameInfo.white}</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-bold"
              style={{ backgroundColor: getAccuracyColor(analysis.whiteAccuracy), color: "#fff" }}
            >
              {analysis.whiteAccuracy.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs px-1.5 py-0.5 rounded font-bold"
              style={{ backgroundColor: getAccuracyColor(analysis.blackAccuracy), color: "#fff" }}
            >
              {analysis.blackAccuracy.toFixed(1)}
            </span>
            <span className="text-sm text-white font-semibold">{gameInfo.black}</span>
            <span className="text-xs text-slate-500">♚</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Accuracy color helper ───

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "#56a333";
  if (accuracy >= 75) return "#81b64c";
  if (accuracy >= 60) return "#c9a967";
  if (accuracy >= 40) return "#e08a20";
  return "#ca3431";
}

// ─── Analysis Progress ───

function AnalysisProgress() {
  return (
    <div className="bg-[#262522] rounded-xl p-6 flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="text-4xl mb-4 animate-pulse">♟</div>
      <h3 className="text-lg font-bold text-white mb-2">Analyzing with Stockfish...</h3>
      <div className="w-48 h-1.5 bg-[#3a3835] rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-[#81b64c] rounded-full animate-pulse"
          style={{ width: "100%" }}
        />
      </div>
      <p className="text-xs text-slate-500 text-center">
        Deep analysis of every move. This typically takes 1-3 minutes.
      </p>
    </div>
  );
}

// ─── Main Page ───

export default function GameReviewPage() {
  const params = useParams();
  const username = params.username as string;
  const gameId = params.gameId as string;

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

  // Step 1: Fetch game data from Chess.com API
  useEffect(() => {
    async function fetchGame() {
      try {
        const res = await fetch(`/api/games/${username}?months=12`);
        if (!res.ok) throw new Error("Failed to fetch games");
        const data = await res.json();

        const game = data.games.find((g: { id: string }) => g.id === gameId);
        if (!game) throw new Error("Game not found");

        setGameInfo({
          white: game.playerColor === "white" ? username : game.opponentName,
          black: game.playerColor === "black" ? username : game.opponentName,
          whiteElo:
            game.playerColor === "white"
              ? String(game.playerRating)
              : String(game.opponentRating),
          blackElo:
            game.playerColor === "black"
              ? String(game.playerRating)
              : String(game.opponentRating),
          result:
            game.result === "win"
              ? game.playerColor === "white"
                ? "1-0"
                : "0-1"
              : game.result === "loss"
              ? game.playerColor === "white"
                ? "0-1"
                : "1-0"
              : "½-½",
          date:
            typeof game.date === "string"
              ? new Date(game.date).toLocaleDateString()
              : game.date.toLocaleDateString(),
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

    setAnalyzing(true);

    analyzeGame(gameInfo.pgn)
      .then((result) => {
        setAnalysis(result);
        setAnalyzing(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Analysis failed");
        setAnalyzing(false);
      });
  }, [gameInfo?.pgn, analyzing, analysis]);

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

  // Loading game data
  if (loading) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-slate-50">
        <Header username={username} />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-slate-500 text-lg">Loading game...</div>
        </div>
      </div>
    );
  }

  // Error
  if (error && !analysis) {
    return (
      <div className="min-h-screen bg-[#312e2b] text-slate-50">
        <Header username={username} />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8">
            <div className="text-4xl mb-4">♟</div>
            <h2 className="text-red-400 font-semibold text-lg mb-2">Analysis Failed</h2>
            <p className="text-slate-400">{error}</p>
            <a
              href={`/player/${username}`}
              className="inline-block mt-4 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#312e2b] text-slate-50">
      <Header username={username} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Game info header */}
        {gameInfo && (
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-0.5">
              <h1 className="text-lg font-bold text-white">
                {gameInfo.white} ({gameInfo.whiteElo}) vs {gameInfo.black} ({gameInfo.blackElo})
              </h1>
              <span className="text-slate-500">{gameInfo.result}</span>
            </div>
            <p className="text-sm text-slate-500">
              {gameInfo.opening} &middot; {gameInfo.date}
            </p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Left: Board + Eval */}
          <div className="flex gap-2 shrink-0">
            {/* Eval bar */}
            <div className="w-8 self-stretch">
              <EvalBar eval_={currentEval} mate={currentMove?.mate ?? null} />
            </div>

            {/* Board */}
            <div style={{ width: "min(520px, calc(80vw - 44px))" }}>
              <Chessboard
                options={{
                  position: getCurrentFen(),
                  squareStyles: customSquareStyles,
                  darkSquareStyle: { backgroundColor: "#779952" },
                  lightSquareStyle: { backgroundColor: "#edeed1" },
                  boardOrientation: gameInfo?.playerColor ?? "white",
                  allowDragging: false,
                  animationDurationInMs: 200,
                }}
              />
            </div>
          </div>

          {/* Right: Analysis panel */}
          <div className="flex-1 min-w-0 lg:max-w-[340px]">
            {analyzing && !analysis && <AnalysisProgress />}

            {analysis && gameInfo && !reviewStarted && (
              <GameReviewPanel
                analysis={analysis}
                gameInfo={gameInfo}
                onStartReview={() => {
                  setReviewStarted(true);
                  setCurrentMoveIndex(0);
                }}
              />
            )}

            {analysis && gameInfo && reviewStarted && (
              <ReviewPanel
                analysis={analysis}
                currentMoveIndex={currentMoveIndex}
                setCurrentMoveIndex={setCurrentMoveIndex}
                gameInfo={gameInfo}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
