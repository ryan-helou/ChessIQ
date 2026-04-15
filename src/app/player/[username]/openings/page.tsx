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

interface LichessMove {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
}

interface LichessData {
  white: number;
  draws: number;
  black: number;
  moves: LichessMove[];
  opening: { eco: string; name: string } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildPersonalStatsMap(games: ParsedGame[]): Map<string, PersonalMoveStats[]> {
  const map = new Map<string, PersonalMoveStats[]>();
  for (const game of games) {
    const chess = new Chess();
    for (const san of game.moves) {
      const fen = chess.fen();
      let moveList = map.get(fen);
      if (!moveList) { moveList = []; map.set(fen, moveList); }
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
  return map;
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
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [pendingSquare, setPendingSquare] = useState<string | null>(null);

  // Engine state
  const [engineOn, setEngineOn] = useState(false);
  const [bestMoveUci, setBestMoveUci] = useState<string | null>(null);
  const [evalCp, setEvalCp] = useState<number | null>(null);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [engineLoading, setEngineLoading] = useState(false);
  const engineControllerRef = useRef<AbortController | null>(null);

  // Lichess data
  const [lichessData, setLichessData] = useState<LichessData | null>(null);
  const [lichessLoading, setLichessLoading] = useState(false);

  // Personal stats map, built once when games load
  const personalStatsMapRef = useRef<Map<string, PersonalMoveStats[]>>(new Map());

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

  // Load games and build personal stats map
  useEffect(() => {
    fetch(`/api/games/${encodeURIComponent(username)}?months=6`)
      .then(r => r.json())
      .then(data => {
        const games: ParsedGame[] = data.games ?? [];
        setAllGames(games);
        personalStatsMapRef.current = buildPersonalStatsMap(games);
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

  // Fetch Lichess master data whenever position changes
  useEffect(() => {
    setLichessData(null);
    setLichessLoading(true);
    const controller = new AbortController();
    fetch(`/api/lichess-explorer?fen=${encodeURIComponent(fen)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(setLichessData)
      .catch(() => { /* ignore */ })
      .finally(() => setLichessLoading(false));
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

  // Play a move (SAN)
  const playMoveSan = useCallback((san: string) => {
    setPendingSquare(null);
    setBestMoveUci(null);
    setEvalCp(null);
    setCurrentDepth(0);
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
    setMovesPlayed(prev => prev.slice(0, ply));
    setPendingSquare(null);
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
      lichessWhite: number; lichessDraws: number; lichessBlack: number;
    }
    const rowMap = new Map<string, MergedRow>();

    for (const pm of personalMoves) {
      rowMap.set(pm.san, {
        san: pm.san, uci: pm.uci,
        personalWins: pm.wins, personalDraws: pm.draws, personalLosses: pm.losses,
        lichessWhite: 0, lichessDraws: 0, lichessBlack: 0,
      });
    }
    for (const lm of lichessData?.moves ?? []) {
      const existing = rowMap.get(lm.san);
      if (existing) {
        existing.lichessWhite = lm.white;
        existing.lichessDraws = lm.draws;
        existing.lichessBlack = lm.black;
      } else {
        rowMap.set(lm.san, {
          san: lm.san, uci: lm.uci,
          personalWins: 0, personalDraws: 0, personalLosses: 0,
          lichessWhite: lm.white, lichessDraws: lm.draws, lichessBlack: lm.black,
        });
      }
    }

    return Array.from(rowMap.values()).sort((a, b) => {
      const aP = a.personalWins + a.personalDraws + a.personalLosses;
      const bP = b.personalWins + b.personalDraws + b.personalLosses;
      if (aP > 0 && bP === 0) return -1;
      if (bP > 0 && aP === 0) return 1;
      if (aP !== bP) return bP - aP;
      return (b.lichessWhite + b.lichessDraws + b.lichessBlack) - (a.lichessWhite + a.lichessDraws + a.lichessBlack);
    });
  }, [personalMoves, lichessData]);

  const evalDisplay = evalCp !== null
    ? (evalCp >= 0 ? "+" : "") + (evalCp / 100).toFixed(1)
    : null;

  const BOARD_SIZE = 380;

  // ─── Loading / error states ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-page)" }}>
        <PageHeader username={username} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 32 }}>♟</span>
          <span style={{ color: "var(--text-3)", fontSize: 14 }}>Loading games…</span>
        </div>
      </div>
    );
  }

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
          padding: "16px 8px 16px 16px",
          borderRight: "1px solid var(--border)",
        }}>
          {/* Board + eval bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <div style={{ width: BOARD_SIZE }}>
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
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Opening Study</span>
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
              <button
                onClick={() => setBoardFlipped(p => !p)}
                style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "none", color: "var(--text-3)", cursor: "pointer" }}
              >
                ⇅
              </button>
              <button
                onClick={() => { setMovesPlayed([]); setPendingSquare(null); setBestMoveUci(null); setEvalCp(null); setCurrentDepth(0); }}
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
                  onClick={() => { setMovesPlayed(j.moves); setPendingSquare(null); setBestMoveUci(null); setEvalCp(null); setCurrentDepth(0); }}
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

          {/* Opening name */}
          {lichessData?.opening && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-mono)", background: "rgba(129,182,76,0.1)", border: "1px solid rgba(129,182,76,0.25)", borderRadius: 3, padding: "1px 6px" }}>
                {lichessData.opening.eco}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>{lichessData.opening.name}</span>
            </div>
          )}

          {/* Move table — scrollable */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr", gap: 8, padding: "7px 16px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Move</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Your games</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Masters</span>
            </div>

            {/* Rows */}
            {mergedMoves.length === 0 && !lichessLoading ? (
              <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
                No moves — drag a piece or click a square to explore
              </div>
            ) : (
              <>
                {mergedMoves.map((row, i) => {
                  const pTotal = row.personalWins + row.personalDraws + row.personalLosses;
                  const pWinPct = pTotal > 0 ? (row.personalWins / pTotal) * 100 : 0;
                  const lTotal = row.lichessWhite + row.lichessDraws + row.lichessBlack;
                  const lWPct = lTotal > 0 ? (row.lichessWhite / lTotal) * 100 : 0;
                  const lDPct = lTotal > 0 ? (row.lichessDraws / lTotal) * 100 : 0;
                  const lBPct = lTotal > 0 ? (row.lichessBlack / lTotal) * 100 : 0;

                  return (
                    <button
                      key={row.san}
                      onClick={() => playMoveSan(row.san)}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                      style={{
                        width: "100%", display: "grid",
                        gridTemplateColumns: "48px 1fr 1fr",
                        gap: 8, padding: "9px 16px",
                        background: "none", border: "none",
                        borderBottom: i < mergedMoves.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                        cursor: "pointer", textAlign: "left", alignItems: "center",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>
                        {row.san}
                      </span>

                      {pTotal > 0 ? (
                        <div>
                          <div style={{ display: "flex", gap: 5, marginBottom: 4, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "#81b64c", fontWeight: 600 }}>{row.personalWins}W</span>
                            <span style={{ fontSize: 10, color: "var(--text-4)" }}>{row.personalDraws}D</span>
                            <span style={{ fontSize: 10, color: "#ca3431", fontWeight: 600 }}>{row.personalLosses}L</span>
                            <span style={{ fontSize: 10, color: "var(--text-4)", marginLeft: 2 }}>· {pWinPct.toFixed(0)}%</span>
                          </div>
                          <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
                            {row.personalWins > 0 && <div style={{ flex: row.personalWins, background: "#81b64c" }} />}
                            {row.personalDraws > 0 && <div style={{ flex: row.personalDraws, background: "#555" }} />}
                            {row.personalLosses > 0 && <div style={{ flex: row.personalLosses, background: "#ca3431" }} />}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-5)" }}>—</span>
                      )}

                      {lTotal > 0 ? (
                        <div>
                          <div style={{ display: "flex", gap: 5, marginBottom: 4, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "#d4d0ca", fontWeight: 600 }}>{lWPct.toFixed(0)}%</span>
                            <span style={{ fontSize: 10, color: "var(--text-4)" }}>{lDPct.toFixed(0)}%</span>
                            <span style={{ fontSize: 10, color: "#888" }}>{lBPct.toFixed(0)}%</span>
                          </div>
                          <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ flex: row.lichessWhite || 0, background: "#d4d0ca", minWidth: row.lichessWhite > 0 ? 2 : 0 }} />
                            <div style={{ flex: row.lichessDraws || 0, background: "#555", minWidth: row.lichessDraws > 0 ? 1 : 0 }} />
                            <div style={{ flex: row.lichessBlack || 0, background: "#262522", minWidth: row.lichessBlack > 0 ? 2 : 0 }} />
                          </div>
                        </div>
                      ) : lichessLoading ? (
                        <div style={{ height: 12, background: "var(--border)", borderRadius: 2, opacity: 0.35, animation: "pulse 1.5s ease-in-out infinite" }} />
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-5)" }}>—</span>
                      )}
                    </button>
                  );
                })}

                {lichessLoading && mergedMoves.length === 0 && [1, 2, 3, 4].map(k => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr", gap: 8, padding: "9px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ height: 14, width: 28, background: "var(--border)", borderRadius: 2, opacity: 0.4, animation: "pulse 1.5s ease-in-out infinite" }} />
                    <div style={{ height: 14, background: "var(--border)", borderRadius: 2, opacity: 0.3, animation: "pulse 1.5s ease-in-out infinite" }} />
                    <div style={{ height: 14, background: "var(--border)", borderRadius: 2, opacity: 0.3, animation: "pulse 1.5s ease-in-out infinite" }} />
                  </div>
                ))}
              </>
            )}

            {/* Lichess source note */}
            {lichessData && (lichessData.white + lichessData.draws + lichessData.black) > 0 && (
              <div style={{ padding: "6px 16px", fontSize: 10, color: "var(--text-5)", textAlign: "right", borderTop: "1px solid var(--border)" }}>
                {Math.round((lichessData.white + lichessData.draws + lichessData.black) / 1000)}k master games · Lichess Explorer
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
