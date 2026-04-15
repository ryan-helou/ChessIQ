"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { neoPieces } from "@/lib/chess-pieces";
import EvalBar from "@/components/game-review/EvalBar";
import { getOpeningStats, type ParsedGame } from "@/lib/game-analysis";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  {
    ssr: false,
    loading: () => (
      <div style={{
        width: "100%", aspectRatio: "1",
        background: "var(--border)", borderRadius: 8,
        animation: "pulse 1.5s ease-in-out infinite",
      }} />
    ),
  }
);

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PersonalMoveStats {
  san: string;
  uci: string;
  wins: number;
  draws: number;
  losses: number;
}

interface ExplorerMove {
  san: string;
  uci: string;
  winrate: number;  // win% for the side that made this move
  rank: number;     // 2=best, 1=good, 0=questionable
}

// ──  kept for "My Games" notable games panel
interface PositionGame {
  id: string;
  url: string;
  date: Date;
  result: "win" | "loss" | "draw";
  playerColor: "white" | "black";
  opponentName: string;
  opponentRating: number;
  opening: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function buildPersonalMaps(games: ParsedGame[]): {
  moveMap: Map<string, PersonalMoveStats[]>;
  gamesMap: Map<string, PositionGame[]>;
} {
  const moveMap = new Map<string, PersonalMoveStats[]>();
  const gamesMap = new Map<string, PositionGame[]>();

  for (const game of games) {
    const chess = new Chess();
    const seenFens = new Set<string>(); // track visited FENs in this game

    for (const san of game.moves) {
      const fen = chess.fen();

      // Record this game reached this FEN (once per game)
      if (!seenFens.has(fen)) {
        seenFens.add(fen);
        let gl = gamesMap.get(fen);
        if (!gl) { gl = []; gamesMap.set(fen, gl); }
        if (gl.length < 20) { // cap at 20 per position
          gl.push({
            id: game.id, url: game.url, date: game.date,
            result: game.result, playerColor: game.playerColor,
            opponentName: game.opponentName, opponentRating: game.opponentRating,
            opening: game.opening,
          });
        }
      }

      let moveList = moveMap.get(fen);
      if (!moveList) { moveList = []; moveMap.set(fen, moveList); }
      let entry: PersonalMoveStats | undefined;
      try {
        const result = chess.move(san);
        const uci = `${result.from}${result.to}${result.promotion ?? ""}`;
        entry = moveList.find(e => e.san === san);
        if (!entry) { entry = { san, uci, wins: 0, draws: 0, losses: 0 }; moveList.push(entry); }
      } catch { break; }
      if (entry) {
        if (game.result === "win") entry.wins++;
        else if (game.result === "loss") entry.losses++;
        else entry.draws++;
      }
    }
  }
  return { moveMap, gamesMap };
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

// ─── Header ────────────────────────────────────────────────────────────────────

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
          style={{ fontSize: 12, color: "var(--text-3)", textDecoration: "none" }}
        >
          ← {username}
        </a>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{username}</span>
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function OpeningsPage() {
  const params = useParams();
  const username = params.username as string;

  const [allGames, setAllGames] = useState<ParsedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Board navigation state
  const [movesPlayed, setMovesPlayed] = useState<string[]>([]);
  const [futureMoves, setFutureMoves] = useState<string[]>([]); // for → key
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [pendingSquare, setPendingSquare] = useState<string | null>(null);

  // Panel tab
  const [activeTab, setActiveTab] = useState<"masters" | "my-games">("masters");

  // Engine state
  const [engineOn, setEngineOn] = useState(false);
  const [bestMoveUci, setBestMoveUci] = useState<string | null>(null);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [engineLoading, setEngineLoading] = useState(false);
  const engineControllerRef = useRef<AbortController | null>(null);

  // Explorer (chessdb.cn) data
  const [explorerMoves, setExplorerMoves] = useState<ExplorerMove[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);

  // Personal stats map + position→games map, built once when games load
  const personalStatsMapRef = useRef<Map<string, PersonalMoveStats[]>>(new Map());
  const positionGamesRef = useRef<Map<string, PositionGame[]>>(new Map());

  // Derived FEN from moves
  const fen = useMemo(() => {
    const chess = new Chess();
    for (const san of movesPlayed) {
      try { chess.move(san); } catch { break; }
    }
    return chess.fen();
  }, [movesPlayed]);

  // Ref so callbacks always read the latest FEN without stale-closure issues
  const fenRef = useRef(START_FEN);
  fenRef.current = fen;

  // Ref so onSquareClick always reads the latest pendingSquare
  const pendingSquareRef = useRef<string | null>(null);
  pendingSquareRef.current = pendingSquare;

  // Load games and build personal stats + position-games maps
  useEffect(() => {
    fetch(`/api/games/${encodeURIComponent(username)}?months=6`)
      .then(r => r.json())
      .then(data => {
        const games: ParsedGame[] = data.games ?? [];
        setAllGames(games);
        const { moveMap, gamesMap } = buildPersonalMaps(games);
        personalStatsMapRef.current = moveMap;
        positionGamesRef.current = gamesMap;
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : "Failed to load games"))
      .finally(() => setLoading(false));
  }, [username]);

  // Quick-jump opening shortcuts (top 6 by game count)
  const quickJumps = useMemo(() => {
    if (allGames.length === 0) return [];
    const stats = getOpeningStats(allGames).sort((a, b) => b.games - a.games);
    return stats
      .map(op => {
        const opGames = allGames.filter(g => g.opening === op.name);
        const common = getCommonPrefix(opGames).slice(0, 20);
        return { name: op.name, moves: common, games: op.games };
      })
      .filter(j => j.moves.length > 0)
      .slice(0, 6);
  }, [allGames]);

  // Fetch engine analysis from chessdb.cn (public API, no auth needed)
  useEffect(() => {
    setExplorerMoves([]);
    setExplorerLoading(true);
    const controller = new AbortController();
    fetch(
      `https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(fen)}&json=1`,
      { signal: controller.signal }
    )
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any) => {
        if (data?.status === "ok" && Array.isArray(data.moves)) {
          setExplorerMoves(
            data.moves.slice(0, 12).map((m: { san: string; uci: string; rank?: number; winrate?: string }) => ({
              san: m.san,
              uci: m.uci,
              rank: m.rank ?? 0,
              winrate: parseFloat(m.winrate ?? "50"),
            }))
          );
        }
      })
      .catch(() => { /* ignore aborts / errors */ })
      .finally(() => setExplorerLoading(false));
    return () => controller.abort();
  }, [fen]);

  // Progressive engine deepening
  useEffect(() => {
    setBestMoveUci(null);
    setEvalCp(null);
    setCurrentDepth(0);
    if (!engineOn) return;

    engineControllerRef.current?.abort();
    const controller = new AbortController();
    engineControllerRef.current = controller;

    (async () => {
      setEngineLoading(true);

      // Start position: backend can't analyze it; show neutral eval immediately
      if (movesPlayed.length === 0) {
        setEvalCp(0);
        setCurrentDepth(20);
        setEngineLoading(false);
        return;
      }

      for (const depth of [10, 14, 20]) {
        if (controller.signal.aborted) return;
        try {
          const r = await fetch("/api/stockfish/position", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moves: movesPlayed, depth }),
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const d = await r.json();
          setBestMoveUci(d.bestMove ?? null);
          if (typeof d.evalCp === "number") setEvalCp(d.evalCp);
          setCurrentDepth(depth);
          setEngineLoading(false);
        } catch {
          if (!controller.signal.aborted) { setBestMoveUci(null); setEngineLoading(false); }
          return;
        }
      }
    })();

    return () => {
      controller.abort();
      engineControllerRef.current = null;
    };
  }, [engineOn, movesPlayed]);

  // Play a move (SAN) — clears future when a new branch is taken
  const playMoveSan = useCallback((san: string) => {
    setPendingSquare(null);
    setBestMoveUci(null);
    setEvalCp(null);
    setCurrentDepth(0);
    setFutureMoves([]);
    setMovesPlayed(prev => [...prev, san]);
  }, []);

  // Drag-to-move — uses fenRef so the closure never goes stale
  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { piece: unknown; sourceSquare: string; targetSquare: string | null }): boolean => {
      if (!targetSquare) return false;
      const chess = new Chess(fenRef.current);
      try {
        const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
        playMoveSan(move.san);
        return true;
      } catch {
        return false;
      }
    },
    [playMoveSan]
  );

  // Two-click move — uses refs so closures never go stale
  const onSquareClick = useCallback(
    ({ square }: { piece: unknown; square: string }) => {
      const chess = new Chess(fenRef.current);
      const pending = pendingSquareRef.current;
      if (pending === null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const piece = chess.get(square as any);
        if (piece && piece.color === chess.turn()) setPendingSquare(square);
      } else {
        try {
          const move = chess.move({ from: pending, to: square, promotion: "q" });
          playMoveSan(move.san);
        } catch {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const piece = chess.get(square as any);
          if (piece && piece.color === chess.turn()) { setPendingSquare(square); return; }
          setPendingSquare(null);
        }
      }
    },
    [playMoveSan]
  );

  // Square highlight styles
  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (!pendingSquare) return styles;
    styles[pendingSquare] = { backgroundColor: "rgba(129,182,76,0.4)" };
    const chess = new Chess(fen);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moves = chess.moves({ square: pendingSquare as any, verbose: true });
    for (const m of moves) {
      styles[m.to] = { backgroundColor: "rgba(129,182,76,0.2)", borderRadius: "50%" };
    }
    return styles;
  }, [pendingSquare, fen]);

  // Engine arrow
  const engineArrows = useMemo(() => {
    if (!engineOn || !bestMoveUci || bestMoveUci.length < 4) return [];
    return [{ startSquare: bestMoveUci.slice(0, 2), endSquare: bestMoveUci.slice(2, 4), color: "#22c55e" }];
  }, [engineOn, bestMoveUci]);

  // Breadcrumb items
  const breadcrumbItems = useMemo(() => {
    const items: { label: string; ply: number }[] = [];
    for (let i = 0; i < movesPlayed.length; i++) {
      const moveNum = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      items.push({ label: isWhite ? `${moveNum}. ${movesPlayed[i]}` : movesPlayed[i], ply: i + 1 });
    }
    return items;
  }, [movesPlayed]);

  // Navigate to a specific ply via breadcrumb
  const navigateTo = useCallback((ply: number) => {
    setMovesPlayed(prev => {
      setFutureMoves(prev.slice(ply));
      return prev.slice(0, ply);
    });
    setPendingSquare(null);
  }, []);


  // Arrow key navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setMovesPlayed(prev => {
          if (prev.length === 0) return prev;
          setFutureMoves(f => [prev[prev.length - 1], ...f]);
          return prev.slice(0, prev.length - 1);
        });
        setPendingSquare(null);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFutureMoves(f => {
          if (f.length === 0) return f;
          setMovesPlayed(prev => [...prev, f[0]]);
          return f.slice(1);
        });
        setPendingSquare(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Personal moves at current FEN
  const personalMoves = useMemo(
    () => personalStatsMapRef.current.get(fen) ?? [],
    [fen]
  );

  // Merged move table rows
  const mergedMoves = useMemo(() => {
    interface MergedRow {
      san: string; uci: string;
      personalWins: number; personalDraws: number; personalLosses: number;
      explorerWinrate: number | null;
      explorerRank: number;
    }
    const rowMap = new Map<string, MergedRow>();

    for (const pm of personalMoves) {
      rowMap.set(pm.san, {
        san: pm.san, uci: pm.uci,
        personalWins: pm.wins, personalDraws: pm.draws, personalLosses: pm.losses,
        explorerWinrate: null, explorerRank: 0,
      });
    }
    for (const em of explorerMoves) {
      const existing = rowMap.get(em.san);
      if (existing) {
        existing.explorerWinrate = em.winrate;
        existing.explorerRank = em.rank;
      } else {
        rowMap.set(em.san, {
          san: em.san, uci: em.uci,
          personalWins: 0, personalDraws: 0, personalLosses: 0,
          explorerWinrate: em.winrate, explorerRank: em.rank,
        });
      }
    }

    return Array.from(rowMap.values()).sort((a, b) => {
      // Explorer rank first (best moves at top), then personal, then rest
      if (a.explorerRank !== b.explorerRank) return b.explorerRank - a.explorerRank;
      const aP = a.personalWins + a.personalDraws + a.personalLosses;
      const bP = b.personalWins + b.personalDraws + b.personalLosses;
      if (aP !== bP) return bP - aP;
      if (a.explorerWinrate !== null && b.explorerWinrate !== null) return b.explorerWinrate - a.explorerWinrate;
      return 0;
    });
  }, [personalMoves, explorerMoves]);

  // Games at current position (from user's history)
  const gamesAtPosition = useMemo(
    () => positionGamesRef.current.get(fen) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fen, loading]
  );

  const evalDisplay = evalCp !== null
    ? (evalCp >= 0 ? "+" : "") + (evalCp / 100).toFixed(1)
    : null;

  // Aggregate personal stats across all moves at this position
  const positionSummary = useMemo(() => {
    const wins = personalMoves.reduce((s, m) => s + m.wins, 0);
    const draws = personalMoves.reduce((s, m) => s + m.draws, 0);
    const losses = personalMoves.reduce((s, m) => s + m.losses, 0);
    const total = wins + draws + losses;
    return { wins, draws, losses, total };
  }, [personalMoves]);

  // header(44) + engine status(24) + padding(32) = ~100px vertical overhead
  // right panel min width = 320px + eval bar = ~336px horizontal overhead
  const BOARD_SIZE = "min(calc(100vh - 100px), calc(100vw - 336px))";

  // ─── Error state ─────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-page)" }}>
        <PageHeader username={username} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#ca3431" }}>{loadError}</span>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--bg-page)" }}>
      <PageHeader username={username} />

      {/* ── Two-column layout ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: Board ────────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "16px 12px 16px 16px",
          borderRight: "1px solid var(--border)",
          background: "var(--bg-page)",
        }}>
          {/* Board + eval bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <div style={{ width: BOARD_SIZE, height: BOARD_SIZE }}>
              <Chessboard options={{
                position: fen,
                pieces: neoPieces,
                boardOrientation: boardFlipped ? "black" : "white",
                squareStyles,
                arrows: engineArrows,
                allowDragging: true,
                animationDurationInMs: 150,
                darkSquareStyle: { backgroundColor: "#769656" },
                lightSquareStyle: { backgroundColor: "#eeeed2" },
                onPieceDrop,
                onSquareClick,
              }} />
            </div>
            {engineOn && (
              <div style={{ width: 12, alignSelf: "stretch", flexShrink: 0 }}>
                <EvalBar eval_={evalCp ?? 0} mate={null} />
              </div>
            )}
          </div>

          {/* Engine status line */}
          <div style={{ marginTop: 8, height: 16, display: "flex", alignItems: "center", gap: 10 }}>
            {engineOn ? (
              engineLoading && currentDepth === 0 ? (
                <span style={{ fontSize: 11, color: "var(--text-4)", fontStyle: "italic" }}>Analyzing…</span>
              ) : currentDepth > 0 ? (
                <>
                  <span style={{ fontSize: 11, color: "var(--text-4)" }}>Depth {currentDepth}</span>
                  {evalDisplay && (
                    <span style={{
                      fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)",
                      color: evalCp !== null && evalCp > 0 ? "#e8e6e1" : evalCp !== null && evalCp < 0 ? "#aaa" : "var(--text-2)",
                    }}>
                      {evalDisplay}
                    </span>
                  )}
                  {bestMoveUci && (
                    <span style={{ fontSize: 11, color: "var(--text-4)" }}>
                      Best: <span style={{ color: "#22c55e", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{bestMoveUci}</span>
                    </span>
                  )}
                  {engineLoading && <span style={{ fontSize: 10, color: "var(--text-5)", fontStyle: "italic" }}>deepening…</span>}
                </>
              ) : null
            ) : null}
          </div>
        </div>

        {/* ── RIGHT: Panel ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Panel header: title + controls */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 8,
          }}>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 2 }}>
              {(["masters", "my-games"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "4px 12px", borderRadius: 5, fontSize: 12, fontWeight: 600,
                    border: "none", cursor: "pointer",
                    background: activeTab === tab ? "rgba(129,182,76,0.15)" : "none",
                    color: activeTab === tab ? "var(--green)" : "var(--text-3)",
                    borderBottom: activeTab === tab ? "2px solid var(--green)" : "2px solid transparent",
                  }}
                >
                  {tab === "masters" ? "Master Games" : "My Games"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => setEngineOn(p => !p)}
                style={{
                  padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                  border: `1px solid ${engineOn ? "#22c55e" : "var(--border)"}`,
                  background: engineOn ? "rgba(34,197,94,0.12)" : "none",
                  color: engineOn ? "#22c55e" : "var(--text-3)",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                }}
              >
                ⚡ Engine {engineOn ? "ON" : "OFF"}
              </button>
              {engineOn && currentDepth > 0 && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  color: "var(--text-4)", background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px",
                }}>
                  depth={currentDepth}
                </span>
              )}
              <button
                onClick={() => setBoardFlipped(p => !p)}
                style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "none", color: "var(--text-3)", cursor: "pointer" }}
              >
                ⇅
              </button>
              <button
                onClick={() => { setMovesPlayed([]); setFutureMoves([]); setPendingSquare(null); setBestMoveUci(null); setEvalCp(null); setCurrentDepth(0); }}
                style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "none", color: "var(--text-3)", cursor: "pointer" }}
              >
                ↺
              </button>
            </div>
          </div>

          {/* Quick-jump chips */}
          {quickJumps.length > 0 && (
            <div style={{ display: "flex", gap: 5, padding: "8px 16px", flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "var(--text-4)", flexShrink: 0 }}>Jump to:</span>
              {quickJumps.map(j => (
                <button
                  key={j.name}
                  onClick={() => { setMovesPlayed(j.moves); setFutureMoves([]); setPendingSquare(null); setBestMoveUci(null); setEvalCp(null); setCurrentDepth(0); }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                  style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, border: "1px solid var(--border)", background: "none", color: "var(--text-2)", cursor: "pointer" }}
                >
                  {j.name.length > 22 ? j.name.slice(0, 22) + "…" : j.name}
                  <span style={{ color: "var(--text-4)", marginLeft: 3, fontSize: 9 }}>{j.games}g</span>
                </button>
              ))}
            </div>
          )}

          {/* Breadcrumb */}
          <div
            style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 16px", overflowX: "auto", flexWrap: "nowrap", borderBottom: "1px solid var(--border)", flexShrink: 0 }}
            className="scrollbar-hide"
          >
            <button
              onClick={() => navigateTo(0)}
              style={{ background: movesPlayed.length === 0 ? "rgba(129,182,76,0.12)" : "none", border: "none", borderRadius: 3, padding: "2px 6px", fontSize: 11, color: movesPlayed.length === 0 ? "var(--green)" : "var(--text-4)", cursor: "pointer", flexShrink: 0, fontWeight: movesPlayed.length === 0 ? 700 : 400 }}
            >
              Start
            </button>
            {breadcrumbItems.map((item, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <span style={{ color: "var(--border)", fontSize: 12, margin: "0 1px" }}>›</span>
                <button
                  onClick={() => navigateTo(item.ply)}
                  style={{ background: i === breadcrumbItems.length - 1 ? "rgba(129,182,76,0.12)" : "none", border: "none", borderRadius: 3, padding: "2px 5px", fontSize: 11, fontFamily: "var(--font-mono)", color: i === breadcrumbItems.length - 1 ? "var(--green)" : "var(--text-3)", cursor: "pointer", flexShrink: 0, fontWeight: i === breadcrumbItems.length - 1 ? 700 : 400 }}
                >
                  {item.label}
                </button>
              </span>
            ))}
            {movesPlayed.length > 0 && (
              <button
                onClick={() => navigateTo(movesPlayed.length - 1)}
                style={{ marginLeft: "auto", flexShrink: 0, background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "var(--text-3)", cursor: "pointer" }}
              >
                ←
              </button>
            )}
          </div>


          {/* Position summary bar */}
          {positionSummary.total > 0 && (
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>Your results at this position</span>
                <span style={{ fontSize: 11, color: "var(--text-4)" }}>{positionSummary.total} games</span>
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
                {positionSummary.wins > 0 && <div style={{ flex: positionSummary.wins, background: "#81b64c" }} />}
                {positionSummary.draws > 0 && <div style={{ flex: positionSummary.draws, background: "#555" }} />}
                {positionSummary.losses > 0 && <div style={{ flex: positionSummary.losses, background: "#ca3431" }} />}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 11, color: "#81b64c", fontWeight: 600 }}>
                  {((positionSummary.wins / positionSummary.total) * 100).toFixed(0)}% W
                </span>
                <span style={{ fontSize: 11, color: "var(--text-4)" }}>
                  {((positionSummary.draws / positionSummary.total) * 100).toFixed(0)}% D
                </span>
                <span style={{ fontSize: 11, color: "#ca3431", fontWeight: 600 }}>
                  {((positionSummary.losses / positionSummary.total) * 100).toFixed(0)}% L
                </span>
              </div>
            </div>
          )}

          {/* Move table — scrollable */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: activeTab === "masters" ? "52px 44px 1fr" : "52px 36px 52px 1fr",
              gap: 6, padding: "7px 16px",
              background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)",
              position: "sticky", top: 0, zIndex: 1,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Move</span>
              {activeTab === "masters" ? (
                <>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Quality</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Win %</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>%</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Games</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>W · D · L</span>
                </>
              )}
            </div>

            {/* Rows */}
            {mergedMoves.length === 0 && !explorerLoading ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
                No moves — drag a piece or click a square to explore
              </div>
            ) : (
              <>
                {mergedMoves.map((row, i) => {
                  const pTotal = row.personalWins + row.personalDraws + row.personalLosses;
                  const pWPct = pTotal > 0 ? (row.personalWins / pTotal) * 100 : 0;
                  const pDPct = pTotal > 0 ? (row.personalDraws / pTotal) * 100 : 0;
                  const pLPct = pTotal > 0 ? (row.personalLosses / pTotal) * 100 : 0;

                  const isMasters = activeTab === "masters";

                  // Rank badge: 2=Best, 1=Good, 0=OK
                  const rankLabel = row.explorerRank === 2 ? "Best" : row.explorerRank === 1 ? "Good" : "OK";
                  const rankColor = row.explorerRank === 2 ? "#81b64c" : row.explorerRank === 1 ? "#60a5fa" : "var(--text-5)";
                  const rankBg = row.explorerRank === 2 ? "rgba(129,182,76,0.12)" : row.explorerRank === 1 ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)";

                  return (
                    <button
                      key={row.san}
                      onClick={() => playMoveSan(row.san)}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                      style={{
                        width: "100%", display: "grid",
                        gridTemplateColumns: isMasters ? "52px 44px 1fr" : "52px 36px 52px 1fr",
                        gap: 6, padding: "9px 16px",
                        background: "none", border: "none",
                        borderBottom: i < mergedMoves.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        cursor: "pointer", textAlign: "left", alignItems: "center",
                      }}
                    >
                      {/* Move */}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>
                        {row.san}
                      </span>

                      {isMasters ? (
                        <>
                          {/* Rank badge */}
                          {row.explorerWinrate !== null ? (
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: rankColor,
                              background: rankBg, border: `1px solid ${rankColor}33`,
                              borderRadius: 3, padding: "1px 5px", textAlign: "center",
                              whiteSpace: "nowrap", alignSelf: "center",
                            }}>
                              {rankLabel}
                            </span>
                          ) : explorerLoading ? (
                            <div style={{ height: 14, width: 32, background: "var(--border)", borderRadius: 3, opacity: 0.35, animation: "pulse 1.5s ease-in-out infinite" }} />
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-5)" }}>—</span>
                          )}

                          {/* Win% bar */}
                          {row.explorerWinrate !== null ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <div style={{ position: "relative", height: 6, borderRadius: 3, overflow: "hidden", width: 80, flexShrink: 0, background: "rgba(255,255,255,0.08)" }}>
                                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${row.explorerWinrate}%`, background: "#81b64c", borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: 10, color: "var(--text-3)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                {row.explorerWinrate.toFixed(0)}% win
                              </span>
                            </div>
                          ) : explorerLoading ? (
                            <div style={{ height: 6, width: 80, background: "var(--border)", borderRadius: 3, opacity: 0.35, animation: "pulse 1.5s ease-in-out infinite" }} />
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-5)" }}>—</span>
                          )}
                        </>
                      ) : (
                        <>
                          {/* My Games: % popularity */}
                          <span style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            —
                          </span>

                          {/* My Games: game count */}
                          <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {pTotal > 0 ? fmtCount(pTotal) : "—"}
                          </span>

                          {/* My Games: W/D/L bar */}
                          {pTotal > 0 ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: 64, flexShrink: 0 }}>
                                <div style={{ width: `${pWPct}%`, background: "#81b64c" }} />
                                <div style={{ width: `${pDPct}%`, background: "#555" }} />
                                <div style={{ width: `${pLPct}%`, background: "#ca3431" }} />
                              </div>
                              <span style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                                <span style={{ color: "#81b64c" }}>{pWPct.toFixed(0)}%</span>
                                <span style={{ color: "var(--text-5)" }}> · {pDPct.toFixed(0)}% · </span>
                                <span style={{ color: "#ca3431" }}>{pLPct.toFixed(0)}%</span>
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-5)" }}>No games</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}

                {activeTab === "masters" && explorerLoading && mergedMoves.length === 0 && [1, 2, 3, 4].map(k => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "52px 44px 1fr", gap: 6, padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ height: 14, width: 28, background: "var(--border)", borderRadius: 2, opacity: 0.4, animation: "pulse 1.5s ease-in-out infinite" }} />
                    <div style={{ height: 14, width: 32, background: "var(--border)", borderRadius: 2, opacity: 0.3, animation: "pulse 1.5s ease-in-out infinite" }} />
                    <div style={{ height: 6, background: "var(--border)", borderRadius: 3, opacity: 0.3, animation: "pulse 1.5s ease-in-out infinite" }} />
                  </div>
                ))}
              </>
            )}

            {/* Your games at this position */}
            {gamesAtPosition.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>Your games at this position</span>
                  <span style={{ fontSize: 10, color: "var(--text-5)" }}>{gamesAtPosition.length} game{gamesAtPosition.length !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 36px 56px", gap: 4, padding: "4px 16px", borderBottom: "1px solid var(--border)" }}>
                  {["Result", "Opponent", "Rtg", "Date"].map(h => (
                    <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                  ))}
                </div>
                {gamesAtPosition.slice(0, 10).map((g, i) => {
                  const resultColor = g.result === "win" ? "#81b64c" : g.result === "loss" ? "#ca3431" : "var(--text-4)";
                  const resultLabel = g.result === "win" ? "▲ Win" : g.result === "loss" ? "▼ Loss" : "½ Draw";
                  const dateStr = g.date instanceof Date && !isNaN(g.date.getTime())
                    ? g.date.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
                    : "";
                  return (
                    <a
                      key={g.id + i}
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "none"; }}
                      style={{
                        display: "grid", gridTemplateColumns: "48px 1fr 36px 56px",
                        gap: 4, padding: "8px 16px",
                        background: "none", textDecoration: "none",
                        borderBottom: i < Math.min(gamesAtPosition.length, 10) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: resultColor, whiteSpace: "nowrap" }}>{resultLabel}</span>
                      <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.opponentName}</span>
                      <span style={{ fontSize: 11, color: "var(--text-5)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.opponentRating || "—"}</span>
                      <span style={{ fontSize: 10, color: "var(--text-5)", textAlign: "right" }}>{dateStr}</span>
                    </a>
                  );
                })}
              </div>
            )}

            {/* ChessDB source note */}
            {explorerMoves.length > 0 && (
              <div style={{ padding: "6px 16px", fontSize: 10, color: "var(--text-5)", textAlign: "right", borderTop: "1px solid var(--border)" }}>
                Engine data · ChessDB
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
