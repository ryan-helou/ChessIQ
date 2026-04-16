"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ChessLoader from "@/components/ChessLoader";
import { neoPieces } from "@/lib/chess-pieces";
import EvalBar from "@/components/game-review/EvalBar";
import { useTablebase } from "@/hooks/useTablebase";
import { useEngineStream } from "@/hooks/useEngineStream";
import EnginePanel from "@/components/game-review/EnginePanel";
import {
  analyzeGameStreaming,
  type GameAnalysisResult,
  type AnalysisProgressEvent,
} from "@/lib/backend-api";

import { CLASSIFICATION_LABELS } from "@/components/game-review/constants";
import {
  countryCodeToFlag,
  parseTimeControl,
  parseMoveTimes,
  getPlayerTime,
  type PlayerProfile,
} from "@/components/game-review/utils";
import { GameReviewPanel } from "@/components/game-review/GameReviewPanel";
import { ReviewPanel } from "@/components/game-review/ReviewPanel";
import { PlayerBar } from "@/components/game-review/PlayerBar";
import { ReviewHeader } from "@/components/game-review/ReviewHeader";
import { ShortcutsModal } from "@/components/game-review/ShortcutsModal";
import { AnalysisProgress } from "@/components/game-review/AnalysisProgress";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-square bg-[var(--border)]/40 rounded-lg animate-pulse" />
    ),
  }
);

// ─── Main Page ───

export default function GameReviewPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const gameId = params.gameId as string;

  // Prev/next game navigation from sessionStorage game list
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [engineEnabled, setEngineEnabled] = useState(false);

  const [analysis, setAnalysis] = useState<GameAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ moveIndex: number; totalMoves: number; evalGraph: { move: number; eval: number; mate: number | null }[] } | null>(null);
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

  // Step 2: Send PGN to backend for Stockfish analysis (streaming)
  useEffect(() => {
    if (!gameInfo?.pgn || analyzing || analysis) return;

    const controller = new AbortController();
    setAnalyzing(true);
    setAnalysisProgress(null);

    const progressGraph: { move: number; eval: number; mate: number | null }[] = [];

    analyzeGameStreaming(
      gameInfo.pgn,
      12,
      gameId,
      (event: AnalysisProgressEvent) => {
        progressGraph.push({ move: event.moveIndex + 1, eval: event.eval, mate: event.mate });
        setAnalysisProgress({
          moveIndex: event.moveIndex,
          totalMoves: event.totalMoves,
          evalGraph: [...progressGraph],
        });
      },
      controller.signal,
    )
      .then((result) => {
        setAnalysis(result);
        setAnalyzing(false);
        setAnalysisProgress(null);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Analysis failed");
        setAnalyzing(false);
        setAnalysisProgress(null);
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
      // ? toggles shortcuts panel regardless of review state
      if (e.key === "?") {
        setShowShortcuts((s) => !s);
        return;
      }
      if (e.key === "Escape") {
        setShowShortcuts(false);
        return;
      }
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
      } else if (e.key === "j" || e.key === "J") {
        // Jump to worst move (highest evalDrop blunder/mistake)
        const worstIdx = moves.reduce((best, m, i) => {
          if (!["blunder", "mistake"].includes(m.classification)) return best;
          if (best === -1) return i;
          return (m.evalDrop ?? 0) > (moves[best].evalDrop ?? 0) ? i : best;
        }, -1);
        if (worstIdx !== -1) setCurrentMoveIndex(worstIdx);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [analysis, reviewStarted]);


  const displayMoves = analysis?.moves ?? [];
  const currentMove = currentMoveIndex >= 0 ? displayMoves[currentMoveIndex] : null;
  const currentEval = currentMove?.engineEval ?? 0;

  // Endgame tablebase lookup
  const currentFen = getCurrentFen();
  const tablebase = useTablebase(currentFen, reviewStarted);

  // Multi-PV engine analysis
  const sideToMove = (currentFen.split(" ")[1] ?? "w") as "w" | "b";
  const engine = useEngineStream(currentFen, {
    enabled: engineEnabled && reviewStarted,
    maxDepth: 22,
    multiPv: 3,
  });

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
              border: "none",
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

  // Jump-to-worst helper (computed from analysis)
  const worstMoveIndex = useMemo(() => {
    if (!analysis?.moves) return -1;
    return analysis.moves.reduce((best, m, i) => {
      if (!["blunder", "mistake"].includes(m.classification)) return best;
      if (best === -1) return i;
      return (m.evalDrop ?? 0) > (analysis.moves[best].evalDrop ?? 0) ? i : best;
    }, -1);
  }, [analysis]);

  const jumpToWorst = useCallback(() => {
    if (worstMoveIndex !== -1) {
      setReviewStarted(true);
      setCurrentMoveIndex(worstMoveIndex);
    }
  }, [worstMoveIndex]);

  // Loading game data
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <ReviewHeader username={username} prevId={prevId} nextId={nextId} />
        <ChessLoader username={username} variant="review" />
      </div>
    );
  }

  // Stockfish analysis in progress
  if (analyzing && !analysis) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <ReviewHeader username={username} prevId={prevId} nextId={nextId} />
        <ChessLoader username={username} variant="review" />
      </div>
    );
  }

  // Error
  if (error && !analysis) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
        <ReviewHeader username={username} prevId={prevId} nextId={nextId} />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8">
            <div className="text-4xl mb-4">&#9823;</div>
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

  const topColor = gameInfo?.playerColor === "white" ? "black" : "white";
  const bottomColor = (gameInfo?.playerColor ?? "white");
  const whiteTime = getPlayerTime(moveTimes, currentMoveIndex, "white", timeControl?.initial ?? null);
  const blackTime = getPlayerTime(moveTimes, currentMoveIndex, "black", timeControl?.initial ?? null);

  const panelContent = (
    <>
      {analyzing && !analysis && <AnalysisProgress progress={analysisProgress} />}
      {analysis && gameInfo && !reviewStarted && (
        <GameReviewPanel
          analysis={analysis}
          gameInfo={gameInfo}
          playerProfiles={playerProfiles}
          onStartReview={() => { setReviewStarted(true); setCurrentMoveIndex(0); }}
          onMoveClick={(moveIndex) => { setReviewStarted(true); setCurrentMoveIndex(moveIndex); }}
          onJumpToWorst={worstMoveIndex !== -1 ? jumpToWorst : undefined}
        />
      )}
      {analysis && gameInfo && reviewStarted && (
        <ReviewPanel
          analysis={analysis}
          currentMoveIndex={currentMoveIndex}
          setCurrentMoveIndex={setCurrentMoveIndex}
          gameInfo={gameInfo}
          onBackToSummary={() => { setReviewStarted(false); setCurrentMoveIndex(-1); }}
          onJumpToWorst={worstMoveIndex !== -1 ? jumpToWorst : undefined}
          tablebase={tablebase}
          enginePanel={
            engineEnabled ? (
              <EnginePanel
                lines={engine.lines}
                depth={engine.depth}
                status={engine.status}
                sideToMove={sideToMove}
              />
            ) : undefined
          }
        />
      )}
    </>
  );

  const boardNode = (
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
  );

  // Mobile layout
  if (isMobile) {
    const mobileBoardSize = "100vw";
    return (
      <div style={{ height: "100dvh", background: "var(--bg)", color: "var(--text-1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
        <ReviewHeader username={username} prevId={prevId} nextId={nextId} pgn={gameInfo?.pgn} onShowShortcuts={() => setShowShortcuts(true)} engineEnabled={engineEnabled} onToggleEngine={() => setEngineEnabled((e) => !e)} />

        {/* Opponent bar */}
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

        {/* Full-width board */}
        <div style={{ width: mobileBoardSize, height: mobileBoardSize, flexShrink: 0 }}>
          {boardNode}
        </div>

        {/* User bar */}
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

        {/* Panel below board */}
        <div style={{ flex: 1, borderTop: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {panelContent}
        </div>
      </div>
    );
  }

  // Desktop layout
  const boardSizeCSS = "min(calc(100vh - 168px), calc(100vw - 384px))";

  return (
    <div className="h-screen bg-[var(--bg)] text-[var(--text-1)] flex flex-col overflow-hidden">
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      <ReviewHeader username={username} prevId={prevId} nextId={nextId} pgn={gameInfo?.pgn} onShowShortcuts={() => setShowShortcuts(true)} engineEnabled={engineEnabled} onToggleEngine={() => setEngineEnabled((e) => !e)} />

      {/* Board + panel centered together as one unit */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ padding: "4px" }}>
        {/* Eval bar + board column grouped so eval bar stretches to full board column height */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 4, marginRight: 4 }}>
          {/* Eval bar */}
          <div style={{ width: 20, position: "relative" }}>
            <EvalBar eval_={currentEval} mate={currentMove?.mate ?? null} />
            {tablebase.category && (
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  top: "50%",
                  transform: "translateY(-50%)",
                  whiteSpace: "nowrap",
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  zIndex: 10,
                  border: "1px solid",
                  background: "var(--bg-card)",
                  ...(tablebase.category === "win"
                    ? { color: "#52c07a", borderColor: "rgba(82,192,122,0.4)" }
                    : tablebase.category === "loss"
                    ? { color: "#ca3431", borderColor: "rgba(202,52,49,0.4)" }
                    : { color: "var(--text-3)", borderColor: "var(--border)" }),
                }}
              >
                {tablebase.category === "win"
                  ? `TB: Win${tablebase.dtz != null ? ` in ${Math.ceil(Math.abs(tablebase.dtz) / 2)}` : ""}`
                  : tablebase.category === "loss"
                  ? `TB: Loss${tablebase.dtz != null ? ` in ${Math.ceil(Math.abs(tablebase.dtz) / 2)}` : ""}`
                  : "TB: Draw"}
              </div>
            )}
          </div>
          {/* Board column: top player bar + board + bottom player bar */}
          <div style={{ display: "flex", flexDirection: "column" }}>
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
            <div style={{ width: boardSizeCSS, height: boardSizeCSS }}>
              {boardNode}
            </div>
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
        {/* Panel */}
        <div className="w-[340px] shrink-0 self-stretch border-l border-[var(--border)] flex flex-col overflow-hidden">
          {panelContent}
        </div>
      </div>
    </div>
  );
}
