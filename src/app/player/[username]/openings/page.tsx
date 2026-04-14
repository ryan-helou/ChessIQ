"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { neoPieces } from "@/lib/chess-pieces";
import EvalBar from "@/components/game-review/EvalBar";
import EvalGraph from "@/components/game-review/EvalGraph";
import MoveList from "@/components/game-review/MoveList";
import { analyzeGame, type GameAnalysisResult } from "@/lib/backend-api";
import { getOpeningStats, type ParsedGame, type OpeningStats } from "@/lib/game-analysis";
import ChessLoader from "@/components/ChessLoader";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => <div className="w-full aspect-square bg-[var(--border)]/40 rounded-lg animate-pulse" />,
  }
);

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ─── FEN helpers ───────────────────────────────────────────────────────────────

function fenFromMoves(moves: string[]): string {
  const chess = new Chess();
  for (const m of moves) { try { chess.move(m); } catch { break; } }
  return chess.fen();
}

function getOpeningFen(game: ParsedGame): string {
  return fenFromMoves(game.moves.slice(0, Math.min(15, game.moves.length)));
}

// ─── Move Tree ─────────────────────────────────────────────────────────────────

interface TreeNode {
  move: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  children: Map<string, TreeNode>;
}

function buildMoveTree(games: ParsedGame[]): TreeNode {
  const root: TreeNode = { move: "", games: 0, wins: 0, draws: 0, losses: 0, children: new Map() };
  for (const game of games) {
    let node = root;
    node.games++;
    if (game.result === "win") node.wins++;
    else if (game.result === "loss") node.losses++;
    else node.draws++;
    for (const san of game.moves) {
      if (!node.children.has(san)) {
        node.children.set(san, { move: san, games: 0, wins: 0, draws: 0, losses: 0, children: new Map() });
      }
      node = node.children.get(san)!;
      node.games++;
      if (game.result === "win") node.wins++;
      else if (game.result === "loss") node.losses++;
      else node.draws++;
    }
  }
  return root;
}

function getCommonPrefix(games: ParsedGame[]): string[] {
  if (games.length === 0) return [];
  const first = games[0].moves;
  let len = first.length;
  for (const g of games) {
    len = Math.min(len, g.moves.length);
    for (let i = 0; i < len; i++) {
      if (g.moves[i] !== first[i]) { len = i; break; }
    }
  }
  return first.slice(0, len);
}

function getNodeAtPath(root: TreeNode, path: string[]): TreeNode | null {
  let node: TreeNode = root;
  for (const move of path) {
    const child = node.children.get(move);
    if (!child) return null;
    node = child;
  }
  return node;
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

function winRateColor(rate: number): string {
  if (rate >= 60) return "#81b64c";
  if (rate >= 50) return "var(--text-2)";
  if (rate >= 40) return "#f6c700";
  return "#ca3431";
}

function accuracyColor(acc: number): string {
  if (acc >= 90) return "#81b64c";
  if (acc >= 75) return "var(--text-2)";
  if (acc >= 40) return "#e28c28";
  return "#ca3431";
}

// ─── Engine toggle button ──────────────────────────────────────────────────────

function EngineButton({ on, loading, onClick }: { on: boolean; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={on ? "Hide engine best move" : "Show engine best move"}
      style={{
        padding: "4px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        border: `1px solid ${on ? "var(--green)" : "var(--border)"}`,
        background: on ? "rgba(129,182,76,0.15)" : "none",
        color: on ? "var(--green)" : "var(--text-3)",
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: 4,
        transition: "all 0.15s",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 13, lineHeight: 1 }}>{loading ? "…" : "♟"}</span>
      Engine
    </button>
  );
}

// ─── Page header ───────────────────────────────────────────────────────────────

function PageHeader({ username }: { username: string }) {
  const { data: session } = useSession();
  return (
    <header style={{
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-surface)",
      backdropFilter: "blur(12px)",
      height: 44,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="var(--green)" opacity="0.9" />
            <path d="M11 25V23.5C11 23.5 9 22 9 19C9 16 11 14 11 14L10 12H12L13 10H15L15.5 11.5C17 11 18 11 19 12C20 13 20 14 20 14L18 15L19 17C19 17 20 19 19 21C18 23 17 23.5 17 23.5V25H11Z" fill="white" opacity="0.95" />
            <rect x="10" y="26" width="12" height="2" rx="1" fill="white" opacity="0.7" />
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
            Chess<span style={{ color: "var(--green)" }}>IQ</span>
          </span>
        </a>
        <a
          href={`/player/${encodeURIComponent(username)}`}
          style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
        >
          ← {username}
        </a>
      </div>
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

// ─── Move Tree Component ────────────────────────────────────────────────────────

interface MoveTreeProps {
  root: TreeNode;
  movePath: string[];
  onMovePath: (path: string[]) => void;
}

function MoveTree({ root, movePath, onMovePath }: MoveTreeProps) {
  const currentNode = getNodeAtPath(root, movePath);
  const children = currentNode ? Array.from(currentNode.children.values()).sort((a, b) => b.games - a.games) : [];
  const maxGames = children[0]?.games ?? 1;

  // Breadcrumb chips
  const breadcrumb = movePath.map((move, i) => ({
    move,
    path: movePath.slice(0, i + 1),
  }));

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{
        padding: "8px 12px 4px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        flexWrap: "nowrap",
        overflowX: "auto",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }} className="scrollbar-hide">
        {/* Back button */}
        <button
          onClick={() => onMovePath(movePath.slice(0, -1))}
          disabled={movePath.length === 0}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "2px 7px",
            fontSize: 11,
            color: movePath.length === 0 ? "var(--text-4)" : "var(--text-3)",
            cursor: movePath.length === 0 ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          ←
        </button>

        {/* Move chips */}
        {breadcrumb.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-4)", fontStyle: "italic" }}>Start</span>
        ) : (
          breadcrumb.map((item, i) => (
            <button
              key={i}
              onClick={() => onMovePath(item.path)}
              style={{
                background: i === breadcrumb.length - 1 ? "rgba(129,182,76,0.15)" : "none",
                border: "none",
                borderRadius: 3,
                padding: "1px 5px",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: i === breadcrumb.length - 1 ? "var(--green)" : "var(--text-4)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {item.move}
            </button>
          ))
        )}
      </div>

      {/* Children */}
      {children.length === 0 ? (
        <div style={{ padding: "16px 12px", color: "var(--text-4)", fontSize: 12, textAlign: "center" }}>
          No further moves
        </div>
      ) : (
        children.map(child => {
          const winRate = child.games > 0 ? (child.wins / child.games) * 100 : 0;
          const barWidth = (child.games / maxGames) * 100;
          return (
            <button
              key={child.move}
              onClick={() => onMovePath([...movePath, child.move])}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                background: "none",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              {/* Move SAN */}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--text-1)", width: 44, flexShrink: 0 }}>
                {child.move}
              </span>

              {/* Frequency bar + game count */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 2 }}>
                  <div style={{
                    height: "100%",
                    width: `${barWidth}%`,
                    background: "var(--text-3)",
                    borderRadius: 2,
                  }} />
                </div>
                <span style={{ fontSize: 10, color: "var(--text-4)" }}>{child.games}g</span>
              </div>

              {/* W/D/L mini bar */}
              <div style={{ display: "flex", height: 10, width: 36, borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
                {child.wins > 0 && <div style={{ flex: child.wins, background: "#81b64c" }} />}
                {child.draws > 0 && <div style={{ flex: child.draws, background: "var(--text-4)" }} />}
                {child.losses > 0 && <div style={{ flex: child.losses, background: "#ca3431" }} />}
              </div>

              {/* Win rate */}
              <span style={{ fontSize: 11, fontWeight: 700, color: winRateColor(winRate), width: 32, textAlign: "right", flexShrink: 0 }}>
                {winRate.toFixed(0)}%
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function OpeningsPage() {
  const params = useParams();
  const username = params.username as string;

  const [allGames, setAllGames] = useState<ParsedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [colorTab, setColorTab] = useState<"all" | "white" | "black">("all");
  const [selectedOpening, setSelectedOpening] = useState<OpeningStats | null>(null);
  const [selectedGame, setSelectedGame] = useState<ParsedGame | null>(null);
  const [analysis, setAnalysis] = useState<GameAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);

  // Tree navigation state
  const [movePath, setMovePath] = useState<string[]>([]);

  // Engine state
  const [engineOn, setEngineOn] = useState(false);
  const [engineMove, setEngineMove] = useState<string | null>(null);
  const [engineLoading, setEngineLoading] = useState(false);

  // Refs for engine request lifecycle
  const engineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engineControllerRef = useRef<AbortController | null>(null);

  // Fetch all games
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(username)}?months=6`);
        if (!res.ok) throw new Error("Failed to load games");
        const data = await res.json();
        setAllGames(data.games ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load games");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  // Openings filtered by color tab, sorted by game count
  const filteredOpenings = useMemo(() => {
    const games = colorTab === "all" ? allGames : allGames.filter(g => g.playerColor === colorTab);
    return getOpeningStats(games).sort((a, b) => b.games - a.games);
  }, [allGames, colorTab]);

  // Games for the selected opening
  const openingGames = useMemo(() => {
    if (!selectedOpening) return [];
    return allGames
      .filter(g =>
        g.opening === selectedOpening.name &&
        (colorTab === "all" || g.playerColor === colorTab)
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedOpening, allGames, colorTab]);

  // Set initial movePath to the common prefix when an opening is selected
  useEffect(() => {
    if (selectedOpening && openingGames.length > 0) {
      setMovePath(getCommonPrefix(openingGames));
    } else {
      setMovePath([]);
    }
    setEngineMove(null);
  }, [selectedOpening, openingGames]);

  // Build move tree from openingGames
  const moveTree = useMemo(() => buildMoveTree(openingGames), [openingGames]);

  // Games that match the current movePath prefix
  const pathGames = useMemo(() => {
    return openingGames.filter(g =>
      movePath.every((san, i) => g.moves[i] === san)
    );
  }, [openingGames, movePath]);

  // Trigger Stockfish analysis when a game is selected
  useEffect(() => {
    if (!selectedGame) return;
    const controller = new AbortController();
    setAnalyzing(true);
    setAnalysis(null);
    setAnalysisError(null);
    setCurrentMoveIndex(-1);
    analyzeGame(selectedGame.pgn, 14, selectedGame.id, controller.signal)
      .then(result => setAnalysis(result))
      .catch(err => {
        if (err?.name === "AbortError") return;
        console.error(err);
        setAnalysisError("Analysis failed. Please try again.");
      })
      .finally(() => setAnalyzing(false));
    return () => controller.abort();
  }, [selectedGame]);

  // Keyboard navigation
  useEffect(() => {
    if (!analysis) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); setCurrentMoveIndex(p => Math.max(-1, p - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setCurrentMoveIndex(p => Math.min(analysis.moves.length - 1, p + 1)); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [analysis]);

  // Engine effect — progressive deepening: 8 → 14 → 20, each result updates the arrow immediately
  useEffect(() => {
    if (!engineOn || selectedGame) {
      setEngineMove(null);
      return;
    }

    // Abort any in-flight chain immediately before starting a new one
    engineControllerRef.current?.abort();
    const controller = new AbortController();
    engineControllerRef.current = controller;

    async function deepen(path: string[]) {
      setEngineLoading(true);
      setEngineMove(null);
      for (const depth of [8, 14, 20]) {
        if (controller.signal.aborted) return;
        try {
          const r = await fetch("/api/stockfish/position", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moves: path, depth }),
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const d = await r.json();
          setEngineMove(d.bestMove ?? null);
          setEngineLoading(false);
        } catch {
          if (!controller.signal.aborted) setEngineMove(null);
          return;
        }
      }
    }

    // Debounce 300ms before starting the deepening chain
    if (engineDebounceRef.current) clearTimeout(engineDebounceRef.current);
    engineDebounceRef.current = setTimeout(() => deepen(movePath), 300);

    return () => {
      controller.abort();
      engineControllerRef.current = null;
      if (engineDebounceRef.current) clearTimeout(engineDebounceRef.current);
    };
  }, [engineOn, movePath, selectedGame]);

  // Current board FEN
  const currentFen = useMemo(() => {
    if (selectedGame && analysis && currentMoveIndex >= 0)
      return analysis.moves[currentMoveIndex]?.fen ?? START_FEN;
    if (selectedOpening)
      return fenFromMoves(movePath);
    return START_FEN;
  }, [selectedGame, analysis, currentMoveIndex, selectedOpening, movePath]);

  const currentMove = analysis?.moves[currentMoveIndex] ?? null;

  // Square highlights for current move (game analysis state)
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (!currentMove) return styles;
    const from = currentMove.move.slice(0, 2);
    const to = currentMove.move.slice(2, 4);
    const color =
      currentMove.classification === "blunder" ? "rgba(202,52,49,0.45)" :
      currentMove.classification === "mistake" ? "rgba(224,138,32,0.45)" :
      currentMove.classification === "brilliant" ? "rgba(38,201,195,0.4)" :
      currentMove.classification === "great" ? "rgba(92,139,176,0.4)" :
      "rgba(100,100,100,0.2)";
    styles[from] = { backgroundColor: color };
    styles[to] = { backgroundColor: color };
    return styles;
  }, [currentMove]);

  // Engine arrows
  const engineArrows = useMemo(() => {
    if (!engineOn) return [];
    // In game analysis: use bestMove from analysis
    if (selectedGame && currentMove?.bestMove && currentMove.bestMove.length >= 4) {
      return [{ startSquare: currentMove.bestMove.slice(0, 2), endSquare: currentMove.bestMove.slice(2, 4), color: "#22c55e" }];
    }
    // In tree nav: use fetched engineMove
    if (!selectedGame && engineMove && engineMove.length >= 4) {
      return [{ startSquare: engineMove.slice(0, 2), endSquare: engineMove.slice(2, 4), color: "#22c55e" }];
    }
    return [];
  }, [engineOn, selectedGame, currentMove, engineMove]);

  // Board orientation
  const boardOrientation = useMemo(() => {
    if (selectedGame) return selectedGame.playerColor;
    if (openingGames.length > 0) return openingGames[0].playerColor;
    return "white" as const;
  }, [selectedGame, openingGames]);

  const boardSizeCSS = "min(calc(100vh - 44px), calc(100vw - 384px))";

  // ── Loading / error ──
  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
      <PageHeader username={username} />
      <ChessLoader username={username} />
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-1)]">
      <PageHeader username={username} />
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-3)" }}>{error}</div>
    </div>
  );

  return (
    <div className="h-screen bg-[var(--bg)] text-[var(--text-1)] flex flex-col overflow-hidden">
      <PageHeader username={username} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Board area ── */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, gap: 4 }}>
          {selectedGame && (
            <div style={{ height: boardSizeCSS, width: 20, flexShrink: 0 }}>
              <EvalBar eval_={currentMove?.engineEval ?? 0} mate={currentMove?.mate ?? null} />
            </div>
          )}
          <div style={{ width: boardSizeCSS, height: boardSizeCSS }}>
            <Chessboard
              options={{
                position: currentFen,
                pieces: neoPieces,
                squareStyles,
                darkSquareStyle: { backgroundColor: "#779952" },
                lightSquareStyle: { backgroundColor: "#edeed1" },
                boardOrientation,
                allowDragging: false,
                animationDurationInMs: 150,
                arrows: engineArrows,
              }}
            />
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{
          width: 340, flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          background: "var(--bg-card)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>

          {/* ════ STATE: Game analysis ════ */}
          {selectedGame && (<>
            {/* Back + engine toggle */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => { setSelectedGame(null); setAnalysis(null); setCurrentMoveIndex(-1); }}
                style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 13, padding: 0, display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}
              >
                ← <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedOpening?.name}</span>
              </button>
              <EngineButton on={engineOn} loading={false} onClick={() => setEngineOn(e => !e)} />
            </div>

            {/* Game meta */}
            <div style={{ padding: "8px 16px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>vs. {selectedGame.opponentName}</span>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: selectedGame.result === "win" ? "#81b64c" : selectedGame.result === "loss" ? "#ca3431" : "var(--text-3)",
                  letterSpacing: "0.04em",
                }}>
                  {selectedGame.result.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 8 }}>
                <span>{new Date(selectedGame.date).toLocaleDateString()}</span>
                <span style={{ textTransform: "capitalize" }}>{selectedGame.playerColor}</span>
                <span>{selectedGame.timeControl}</span>
                {selectedGame.accuracy != null && (
                  <span style={{ color: accuracyColor(selectedGame.accuracy), fontWeight: 600 }}>
                    {selectedGame.accuracy.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* Eval graph */}
            {analysis && (
              <div style={{ height: 64, background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                <EvalGraph
                  data={analysis.moves.map((m, i) => ({ move: i + 1, eval: m.engineEval, mate: m.mate ?? null }))}
                  currentMove={currentMoveIndex + 1}
                  onMoveClick={(move) => setCurrentMoveIndex(move - 1)}
                  mini
                />
              </div>
            )}

            {/* Move list or analyzing spinner */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {analyzing && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
                  <span style={{ fontSize: 32, display: "block", animation: "openingsSpin 1.4s linear infinite" }}>♟</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>Analyzing with Stockfish…</span>
                  <style>{`@keyframes openingsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
              {analysisError && !analyzing && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)", fontSize: 13 }}>
                  {analysisError}
                </div>
              )}
              {analysis && (
                <MoveList
                  moves={analysis.moves}
                  currentMoveIndex={currentMoveIndex}
                  onMoveClick={setCurrentMoveIndex}
                />
              )}
            </div>
          </>)}

          {/* ════ STATE: Opening selected ════ */}
          {!selectedGame && selectedOpening && (<>
            {/* Header */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <button
                  onClick={() => setSelectedOpening(null)}
                  style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 12, padding: 0, display: "flex", alignItems: "center", gap: 4 }}
                >
                  ← All Openings
                </button>
                <div style={{ flex: 1 }} />
                <EngineButton on={engineOn} loading={engineLoading} onClick={() => setEngineOn(e => !e)} />
              </div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1.3 }}>
                {selectedOpening.name}
              </h2>
              {selectedOpening.eco && (
                <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{selectedOpening.eco}</span>
              )}
            </div>

            {/* Stats bar */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                {selectedOpening.wins > 0 && <div style={{ flex: selectedOpening.wins, background: "#81b64c" }} />}
                {selectedOpening.draws > 0 && <div style={{ flex: selectedOpening.draws, background: "var(--text-4)" }} />}
                {selectedOpening.losses > 0 && <div style={{ flex: selectedOpening.losses, background: "#ca3431" }} />}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{selectedOpening.games}g</span>
                <span style={{ fontSize: 12, color: "#81b64c", fontWeight: 600 }}>{selectedOpening.wins}W</span>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>{selectedOpening.draws}D</span>
                <span style={{ fontSize: 12, color: "#ca3431", fontWeight: 600 }}>{selectedOpening.losses}L</span>
                <span style={{ fontSize: 12, color: winRateColor(selectedOpening.winRate), fontWeight: 700 }}>
                  {selectedOpening.winRate.toFixed(0)}% W
                </span>
                {selectedOpening.avgAccuracy != null && (
                  <span style={{ fontSize: 12, color: accuracyColor(selectedOpening.avgAccuracy), fontWeight: 700 }}>
                    {selectedOpening.avgAccuracy.toFixed(1)}% acc
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable body: tree + games */}
            <div style={{ flex: 1, overflowY: "auto" }} className="scrollbar-hide">

              {/* Move tree section */}
              <div style={{ borderBottom: "1px solid var(--border)" }}>
                <div style={{ padding: "6px 12px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Move Tree
                </div>
                <MoveTree root={moveTree} movePath={movePath} onMovePath={setMovePath} />
              </div>

              {/* Games at this position */}
              <div>
                <div style={{ padding: "6px 12px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Games {pathGames.length !== openingGames.length ? `(${pathGames.length} of ${openingGames.length})` : `(${openingGames.length})`}
                </div>
                {pathGames.length === 0 ? (
                  <div style={{ padding: "16px 12px", color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>No games at this line</div>
                ) : (
                  pathGames.map(game => (
                    <button
                      key={game.id}
                      onClick={() => setSelectedGame(game)}
                      style={{ width: "100%", display: "flex", alignItems: "center", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 8, textAlign: "left" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: game.result === "win" ? "#81b64c" : game.result === "loss" ? "#ca3431" : "var(--text-4)",
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          vs. {game.opponentName}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", gap: 6, marginTop: 1 }}>
                          <span>{new Date(game.date).toLocaleDateString()}</span>
                          <span style={{ textTransform: "capitalize" }}>{game.playerColor}</span>
                          <span>({game.opponentRating})</span>
                        </div>
                      </div>
                      {game.accuracy != null && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: accuracyColor(game.accuracy), flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                          {game.accuracy.toFixed(0)}%
                        </span>
                      )}
                      <span style={{ fontSize: 13, color: "var(--text-4)", flexShrink: 0 }}>›</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>)}

          {/* ════ STATE: Browse ════ */}
          {!selectedGame && !selectedOpening && (<>
            {/* Header */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>♟</span>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Opening Study</h2>
            </div>

            {/* Color tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              {(["all", "white", "black"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setColorTab(tab)}
                  style={{
                    flex: 1, padding: "9px 0", background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: colorTab === tab ? 700 : 400,
                    color: colorTab === tab ? "var(--green)" : "var(--text-3)",
                    borderBottom: colorTab === tab ? "2px solid var(--green)" : "2px solid transparent",
                    textTransform: "capitalize", transition: "color 0.15s",
                  }}
                >
                  {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Openings list */}
            <div style={{ overflowY: "auto", flex: 1 }} className="scrollbar-hide">
              {filteredOpenings.length === 0 ? (
                <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                  No openings found
                </div>
              ) : (
                filteredOpenings.map(opening => (
                  <button
                    key={`${opening.eco}-${opening.name}`}
                    onClick={() => setSelectedOpening(opening)}
                    style={{ width: "100%", display: "flex", alignItems: "center", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 10, textAlign: "left" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                  >
                    {opening.eco ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", fontFamily: "var(--font-mono)", width: 28, flexShrink: 0, letterSpacing: "0.04em" }}>
                        {opening.eco}
                      </span>
                    ) : <span style={{ width: 28, flexShrink: 0 }} />}

                    <span style={{ flex: 1, fontSize: 13, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {opening.name}
                    </span>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 1 }}>
                      <span style={{ fontSize: 11, color: "var(--text-4)" }}>{opening.games}g</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: winRateColor(opening.winRate) }}>
                        {opening.winRate.toFixed(0)}%
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>)}

        </div>
      </div>
    </div>
  );
}
