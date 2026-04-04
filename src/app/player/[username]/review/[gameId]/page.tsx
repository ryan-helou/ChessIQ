"use client";

import { useState, useEffect, useCallback } from "react";
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

const CLASSIFICATION_LABELS: Record<
  MoveClassification,
  { label: string; color: string }
> = {
  brilliant: { label: "Brilliant", color: "text-cyan-400" },
  great: { label: "Great Move", color: "text-blue-400" },
  best: { label: "Best Move", color: "text-emerald-400" },
  excellent: { label: "Excellent", color: "text-emerald-300" },
  good: { label: "Good", color: "text-slate-300" },
  inaccuracy: { label: "Inaccuracy", color: "text-yellow-400" },
  mistake: { label: "Mistake", color: "text-orange-400" },
  blunder: { label: "Blunder", color: "text-red-400" },
  book: { label: "Book Move", color: "text-violet-400" },
};

function AnalysisSummary({
  analysis,
  playerColor,
}: {
  analysis: GameAnalysisResult;
  playerColor: "white" | "black";
}) {
  const isWhite = playerColor === "white";
  const accuracy = isWhite ? analysis.whiteAccuracy : analysis.blackAccuracy;
  const blunders = isWhite
    ? analysis.blunderCounts.white
    : analysis.blunderCounts.black;
  const mistakes = isWhite
    ? analysis.mistakeCounts.white
    : analysis.mistakeCounts.black;
  const inaccuracies = isWhite
    ? analysis.inaccuracyCounts.white
    : analysis.inaccuracyCounts.black;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-slate-800/40 rounded-lg p-3 col-span-2">
        <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">
          Your Accuracy
        </div>
        <div className="text-2xl font-bold text-blue-400">
          {accuracy.toFixed(1)}%
        </div>
      </div>
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
        <div className="text-xs text-slate-500 mb-1">Blunders</div>
        <div className="text-lg font-bold text-red-400">{blunders}</div>
      </div>
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
        <div className="text-xs text-slate-500 mb-1">Mistakes</div>
        <div className="text-lg font-bold text-orange-400">{mistakes}</div>
      </div>
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 col-span-2">
        <div className="text-xs text-slate-500 mb-1">Inaccuracies</div>
        <div className="text-lg font-bold text-yellow-400">{inaccuracies}</div>
      </div>
    </div>
  );
}

function AnalysisProgress() {
  return (
    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">
          Analyzing with Stockfish...
        </h3>
      </div>
      <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full animate-pulse"
          style={{ width: "100%" }}
        />
      </div>
      <p className="text-xs text-slate-500">
        Deep analysis of every move. This typically takes 1-3 minutes.
      </p>
    </div>
  );
}

export default function GameReviewPage() {
  const params = useParams();
  const username = params.username as string;
  const gameId = params.gameId as string;

  const [analysis, setAnalysis] = useState<GameAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
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
          white:
            game.playerColor === "white" ? username : game.opponentName,
          black:
            game.playerColor === "black" ? username : game.opponentName,
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
        setError(
          err instanceof Error ? err.message : "Failed to fetch game"
        );
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
      if (!moves?.length) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentMoveIndex((prev) => Math.max(-1, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentMoveIndex((prev) =>
          Math.min(moves.length - 1, prev + 1)
        );
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
  }, [analysis]);

  const displayMoves = analysis?.moves ?? [];
  const currentMove =
    currentMoveIndex >= 0 ? displayMoves[currentMoveIndex] : null;
  const currentEval = currentMove?.engineEval ?? 0;

  // Highlight squares
  const customSquareStyles: Record<string, React.CSSProperties> = {};
  if (currentMove) {
    const from = currentMove.move.slice(0, 2);
    const to = currentMove.move.slice(2, 4);

    const moveColor =
      currentMove.classification === "blunder"
        ? "rgba(239, 68, 68, 0.4)"
        : currentMove.classification === "mistake"
        ? "rgba(249, 115, 22, 0.4)"
        : currentMove.classification === "inaccuracy"
        ? "rgba(234, 179, 8, 0.3)"
        : "rgba(59, 130, 246, 0.3)";

    customSquareStyles[from] = { backgroundColor: moveColor };
    customSquareStyles[to] = { backgroundColor: moveColor };

    if (
      currentMove.bestMove &&
      currentMove.bestMove !== currentMove.move &&
      ["blunder", "mistake", "inaccuracy"].includes(
        currentMove.classification
      )
    ) {
      const bestTo = currentMove.bestMove.slice(2, 4);
      customSquareStyles[bestTo] = {
        backgroundColor: "rgba(16, 185, 129, 0.35)",
        borderRadius: "50%",
      };
    }
  }

  // Loading game data
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50">
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
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <Header username={username} />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8">
            <div className="text-4xl mb-4">&#9812;</div>
            <h2 className="text-red-400 font-semibold text-lg mb-2">
              Analysis Failed
            </h2>
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
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <Header username={username} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Game info header */}
        {gameInfo && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold">
                {gameInfo.white} ({gameInfo.whiteElo}) vs {gameInfo.black} (
                {gameInfo.blackElo})
              </h1>
              <span className="text-slate-500">{gameInfo.result}</span>
            </div>
            <p className="text-sm text-slate-500">
              {gameInfo.opening} &middot; {gameInfo.date}
            </p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Board + Eval */}
          <div className="flex gap-3 shrink-0">
            {/* Eval bar */}
            <div className="w-8" style={{ height: "min(520px, 80vw)" }}>
              <EvalBar eval_={currentEval} mate={null} />
            </div>

            {/* Board */}
            <div style={{ width: "min(520px, calc(80vw - 44px))", aspectRatio: "1" }}>
              <Chessboard
                options={{
                  position: getCurrentFen(),
                  squareStyles: customSquareStyles,
                  darkSquareStyle: { backgroundColor: "#779952" },
                  lightSquareStyle: { backgroundColor: "#edeed1" },
                  boardOrientation: gameInfo?.playerColor ?? "white",
                  allowDragging: false,
                  animationDurationInMs: 200,
                  boardStyle: {
                    width: "100%",
                    height: "100%",
                  },
                }}
              />
            </div>
          </div>

          {/* Right: Analysis panel */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Analysis progress */}
            {analyzing && !analysis && <AnalysisProgress />}

            {/* Current move info */}
            {currentMove && (
              <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono">
                      {currentMove.san}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        CLASSIFICATION_LABELS[currentMove.classification]
                          .color
                      }`}
                    >
                      {
                        CLASSIFICATION_LABELS[currentMove.classification]
                          .label
                      }
                    </span>
                  </div>
                  <span className="text-sm text-slate-500">
                    Accuracy: {currentMove.accuracy.toFixed(0)}%
                  </span>
                </div>
                {["blunder", "mistake", "inaccuracy"].includes(
                  currentMove.classification
                ) &&
                  currentMove.bestMoveSan && (
                    <div className="text-sm text-slate-400">
                      Best was{" "}
                      <span className="text-emerald-400 font-semibold font-mono">
                        {currentMove.bestMoveSan}
                      </span>
                      <span className="text-slate-600 ml-2">
                        (
                        {currentMove.evalDrop > 0 ? "+" : ""}
                        {(currentMove.evalDrop / 100).toFixed(1)} pawns)
                      </span>
                    </div>
                  )}
              </div>
            )}

            {/* Eval graph */}
            {displayMoves.length > 0 && (
              <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
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
            )}

            {/* Summary */}
            {analysis && gameInfo && (
              <AnalysisSummary
                analysis={analysis}
                playerColor={gameInfo.playerColor}
              />
            )}

            {/* Move list */}
            {displayMoves.length > 0 && (
              <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-400">
                    Moves
                  </h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCurrentMoveIndex(-1)}
                      className="px-2 py-1 text-xs bg-slate-700/50 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                    >
                      ⟨⟨
                    </button>
                    <button
                      onClick={() =>
                        setCurrentMoveIndex((prev) =>
                          Math.max(-1, prev - 1)
                        )
                      }
                      className="px-2 py-1 text-xs bg-slate-700/50 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                    >
                      ⟨
                    </button>
                    <button
                      onClick={() =>
                        setCurrentMoveIndex((prev) =>
                          Math.min(displayMoves.length - 1, prev + 1)
                        )
                      }
                      className="px-2 py-1 text-xs bg-slate-700/50 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                    >
                      ⟩
                    </button>
                    <button
                      onClick={() =>
                        setCurrentMoveIndex(displayMoves.length - 1)
                      }
                      className="px-2 py-1 text-xs bg-slate-700/50 text-slate-400 rounded hover:bg-slate-700 transition-colors"
                    >
                      ⟩⟩
                    </button>
                  </div>
                </div>
                <MoveList
                  moves={displayMoves}
                  currentMoveIndex={currentMoveIndex}
                  onMoveClick={setCurrentMoveIndex}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
