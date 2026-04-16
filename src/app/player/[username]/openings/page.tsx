"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Chess, type Square } from "chess.js";
import { neoPieces } from "@/lib/chess-pieces";
import EvalBar from "@/components/game-review/EvalBar";
import { type ParsedGame } from "@/lib/game-analysis";
import { useEngineStream, type EngineLine } from "@/hooks/useEngineStream";

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

interface TopGame {
  id: string;
  winner: "white" | "black" | null;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year: number;
  month: string | null;
}

interface PositionGame {
  id: string;
  url: string;
  date: Date;
  result: "win" | "loss" | "draw";
  playerColor: "white" | "black";
  opponentName: string;
  opponentRating: number;
  opening: string;
  timeClass: string;
}

interface LoadedGameMeta {
  gameId: string;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
}

type TimeFilter = "all" | "bullet" | "blitz" | "rapid";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function fmtEval(scoreCp: number | null, mate: number | null): string {
  if (mate !== null) {
    return (mate >= 0 ? "M" : "−M") + Math.abs(mate);
  }
  if (scoreCp === null) return "—";
  const v = scoreCp / 100;
  if (v === 0) return "0.00";
  return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(2);
}

function evalTextColor(scoreCp: number | null, mate: number | null): string {
  if (mate !== null) return mate >= 0 ? "#81b64c" : "#ca3431";
  if (scoreCp === null) return "var(--text-4)";
  if (scoreCp > 15) return "#81b64c";
  if (scoreCp < -15) return "#ca3431";
  return "var(--text-3)";
}

function buildPersonalMaps(games: ParsedGame[]): {
  moveMap: Map<string, PersonalMoveStats[]>;
  gamesMap: Map<string, PositionGame[]>;
} {
  const moveMap = new Map<string, PersonalMoveStats[]>();
  const gamesMap = new Map<string, PositionGame[]>();

  for (const game of games) {
    const chess = new Chess();
    const seenFens = new Set<string>();

    for (const san of game.moves) {
      const fen = chess.fen();

      if (!seenFens.has(fen)) {
        seenFens.add(fen);
        let gl = gamesMap.get(fen);
        if (!gl) { gl = []; gamesMap.set(fen, gl); }
        if (gl.length < 20) {
          gl.push({
            id: game.id, url: game.url, date: game.date,
            result: game.result, playerColor: game.playerColor,
            opponentName: game.opponentName, opponentRating: game.opponentRating,
            opening: game.opening, timeClass: game.timeClass,
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
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="var(--green)" opacity="0.9" />
            <path d="M11 25V23.5C11 23.5 9 22 9 19C9 16 11 14 11 14L10 12H12L13 10H15L15.5 11.5C17 11 18 11 19 12C20 13 20 14 20 14L18 15L19 17C19 17 20 19 19 21C18 23 17 23.5 17 23.5V25H11Z" fill="white" opacity="0.95" />
            <rect x="10" y="26" width="12" height="2" rx="1" fill="white" opacity="0.7" />
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>
            Chess<span style={{ color: "var(--green)" }}>IQ</span>
          </span>
        </Link>
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

// ─── Player strip ──────────────────────────────────────────────────────────────

function PlayerStrip({
  color,
  name,
  rating,
  isActive,
}: {
  color: "white" | "black";
  name: string;
  rating: number | null;
  isActive: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      height: 30, padding: "0 10px",
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 4,
    }}>
      <div style={{
        width: 12, height: 12, borderRadius: "50%",
        background: color === "white" ? "#eeeed2" : "#2a2a2a",
        border: color === "black" ? "1px solid #555" : "1px solid #ccc",
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: isActive ? "var(--text-1)" : "var(--text-4)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{name}</span>
      {rating !== null && rating > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-5)", fontVariantNumeric: "tabular-nums" }}>
          ({rating})
        </span>
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
  const [loadError, setLoadError] = useState("");

  // Board navigation state
  const [movesPlayed, setMovesPlayed] = useState<string[]>([]);
  const [, setFutureMoves] = useState<string[]>([]);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [pendingSquare, setPendingSquare] = useState<string | null>(null);

  // Panel tab
  const [activeTab, setActiveTab] = useState<"masters" | "my-games">("masters");

  // Engine toggle
  const [engineOn, setEngineOn] = useState(true);

  // Time-control filter (My Games only)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  // Loaded master-game metadata (for player strips)
  const [loadedGameMeta, setLoadedGameMeta] = useState<LoadedGameMeta | null>(null);

  // Lichess master games + moves for this position
  const [masterGames, setMasterGames] = useState<TopGame[]>([]);
  const [lichessMoves, setLichessMoves] = useState<LichessMove[]>([]);
  const [lichessTotal, setLichessTotal] = useState(0);
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [gameLoadingId, setGameLoadingId] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  // Derived FEN from moves
  const fen = useMemo(() => {
    const chess = new Chess();
    for (const san of movesPlayed) {
      try { chess.move(san); } catch { break; }
    }
    return chess.fen();
  }, [movesPlayed]);

  const fenRef = useRef(START_FEN);
  fenRef.current = fen;

  const pendingSquareRef = useRef<string | null>(null);
  pendingSquareRef.current = pendingSquare;

  // Engine stream (multiPv=8, depths 8→22)
  const engineStream = useEngineStream(fen, { enabled: engineOn, maxDepth: 22, multiPv: 8 });

  // Load games
  useEffect(() => {
    fetch(`/api/games/${encodeURIComponent(username)}?months=6`)
      .then(r => r.json())
      .then(data => {
        const games: ParsedGame[] = (data.games ?? []).map((g: ParsedGame & { date: string | Date }) => ({
          ...g,
          date: typeof g.date === "string" ? new Date(g.date) : g.date,
        }));
        setAllGames(games);
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : "Failed to load games"))
      .finally(() => setLoading(false));
  }, [username]);

  // Time-filtered games
  const filteredGames = useMemo(
    () => timeFilter === "all" ? allGames : allGames.filter(g => g.timeClass === timeFilter),
    [allGames, timeFilter]
  );

  // Personal maps (rebuild when filter or games change)
  const { moveMap: personalStatsMap, gamesMap: positionGamesMap } = useMemo(
    () => buildPersonalMaps(filteredGames),
    [filteredGames]
  );

  // Fetch Lichess master games + moves for this position
  useEffect(() => {
    setMasterGames([]);
    setLichessMoves([]);
    setLichessTotal(0);
    setActiveGameId(null);
    setOpeningName(null);
    const controller = new AbortController();
    fetch(`/api/lichess-explorer?fen=${encodeURIComponent(fen)}`, { signal: controller.signal })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(r => r.json()).then((data: any) => {
        setMasterGames(data.topGames ?? []);
        setLichessMoves(data.moves ?? []);
        setLichessTotal((data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0));
        if (data.opening?.name) setOpeningName(data.opening.name);
      })
      .catch((err) => { if (err.name !== "AbortError") console.warn("[openings] lichess fetch failed:", err.message); });
    return () => controller.abort();
  }, [fen]);

  // Clear loaded-game meta when user navigates off the loaded line
  useEffect(() => {
    if (activeGameId === null && loadedGameMeta !== null) setLoadedGameMeta(null);
  }, [activeGameId, loadedGameMeta]);

  // Play a move (SAN) — clears future when a new branch is taken
  const playMoveSan = useCallback((san: string) => {
    setPendingSquare(null);
    setFutureMoves([]);
    setActiveGameId(null);
    setMovesPlayed(prev => [...prev, san]);
  }, []);

  // Load a master game
  const loadGame = useCallback(async (game: TopGame) => {
    setGameLoadingId(game.id);
    try {
      const r = await fetch(`/api/lichess-explorer/game?id=${encodeURIComponent(game.id)}`);
      const data = await r.json();
      const moves: string[] = data.moves ?? [];
      if (moves.length === 0) return;

      const current = movesPlayed;
      const startsWithCurrent =
        current.length <= moves.length &&
        current.every((m, idx) => moves[idx] === m);

      if (startsWithCurrent) {
        setFutureMoves(moves.slice(current.length));
      } else {
        setMovesPlayed([]);
        setFutureMoves(moves);
      }
      setPendingSquare(null);
      setActiveGameId(game.id);
      setLoadedGameMeta({ gameId: game.id, white: game.white, black: game.black });
    } finally {
      setGameLoadingId(null);
    }
  }, [movesPlayed]);

  // Drag-to-move
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

  // Two-click move
  const onSquareClick = useCallback(
    ({ square }: { piece: unknown; square: string }) => {
      const chess = new Chess(fenRef.current);
      const pending = pendingSquareRef.current;
      if (pending === null) {
        const piece = chess.get(square as Square);
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
    const moves = chess.moves({ square: pendingSquare as Square, verbose: true });
    for (const m of moves) {
      styles[m.to] = { backgroundColor: "rgba(129,182,76,0.2)", borderRadius: "50%" };
    }
    return styles;
  }, [pendingSquare, fen]);

  // Best-move arrow (from engine)
  const bestMoveUci = useMemo(() => {
    if (!engineOn) return null;
    const top = engineStream.lines.find(l => l.rank === 1);
    return top?.uci[0] ?? null;
  }, [engineOn, engineStream.lines]);

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

  // Side to move
  const sideToMove = useMemo(() => fen.split(" ")[1] as "w" | "b", [fen]);

  // Personal moves at current FEN
  const personalMoves = useMemo(
    () => personalStatsMap.get(fen) ?? [],
    [personalStatsMap, fen]
  );

  const gamesAtPosition = useMemo(
    () => positionGamesMap.get(fen) ?? [],
    [positionGamesMap, fen]
  );

  // Eval for display (white-POV): flip sign when black to move
  const displayEvalCp = useMemo(() => {
    const top = engineStream.lines.find(l => l.rank === 1);
    if (!top) return null;
    if (top.scoreCp === null) return null;
    return sideToMove === "w" ? top.scoreCp : -top.scoreCp;
  }, [engineStream.lines, sideToMove]);

  const displayMate = useMemo(() => {
    const top = engineStream.lines.find(l => l.rank === 1);
    if (!top || top.mate === null) return null;
    return sideToMove === "w" ? top.mate : -top.mate;
  }, [engineStream.lines, sideToMove]);

  // Top 3 engine moves for Best Moves section
  const bestThreeLines = useMemo<EngineLine[]>(() => {
    return [...engineStream.lines].sort((a, b) => a.rank - b.rank).slice(0, 3);
  }, [engineStream.lines]);

  // Lookup map: first-ply SAN → scoreCp (white POV for consistent display)
  const engineSanEval = useMemo(() => {
    const m = new Map<string, { scoreCp: number | null; mate: number | null }>();
    for (const line of engineStream.lines) {
      const firstSan = line.san[0];
      if (!firstSan) continue;
      if (!m.has(firstSan)) {
        const cp = line.scoreCp !== null ? (sideToMove === "w" ? line.scoreCp : -line.scoreCp) : null;
        const mt = line.mate !== null ? (sideToMove === "w" ? line.mate : -line.mate) : null;
        m.set(firstSan, { scoreCp: cp, mate: mt });
      }
    }
    return m;
  }, [engineStream.lines, sideToMove]);

  // Master moves: Lichess frequency + engine eval
  const masterMovesTable = useMemo(() => {
    if (lichessMoves.length === 0) return [];
    return [...lichessMoves]
      .map(m => {
        const total = m.white + m.draws + m.black;
        const freqPct = lichessTotal > 0 ? (total / lichessTotal) * 100 : 0;
        const wPct = total > 0 ? ((sideToMove === "w" ? m.white : m.black) / total) * 100 : 0;
        const dPct = total > 0 ? (m.draws / total) * 100 : 0;
        const lPct = total > 0 ? ((sideToMove === "w" ? m.black : m.white) / total) * 100 : 0;
        const ev = engineSanEval.get(m.san) ?? null;
        return { san: m.san, uci: m.uci, freqPct, total, wPct, dPct, lPct, scoreCp: ev?.scoreCp ?? null, mate: ev?.mate ?? null };
      })
      .sort((a, b) => b.total - a.total);
  }, [lichessMoves, lichessTotal, sideToMove, engineSanEval]);

  // My games moves: personal frequency + engine eval
  const myMovesTable = useMemo(() => {
    const totalAtPos = personalMoves.reduce((s, m) => s + m.wins + m.draws + m.losses, 0);
    return [...personalMoves]
      .map(m => {
        const total = m.wins + m.draws + m.losses;
        const freqPct = totalAtPos > 0 ? (total / totalAtPos) * 100 : 0;
        const wPct = total > 0 ? (m.wins / total) * 100 : 0;
        const dPct = total > 0 ? (m.draws / total) * 100 : 0;
        const lPct = total > 0 ? (m.losses / total) * 100 : 0;
        const ev = engineSanEval.get(m.san) ?? null;
        return { san: m.san, uci: m.uci, freqPct, total, wPct, dPct, lPct, scoreCp: ev?.scoreCp ?? null, mate: ev?.mate ?? null };
      })
      .sort((a, b) => b.total - a.total);
  }, [personalMoves, engineSanEval]);



  // Notable master games — sort by avgRating + (year − 1990) * 3
  const sortedMasterGames = useMemo(() => {
    return [...masterGames]
      .map(g => {
        const avgRating = ((g.white.rating || 0) + (g.black.rating || 0)) / 2;
        const yearRef = g.month ? parseInt(g.month.slice(0, 4), 10) || g.year : g.year;
        const monthRef = g.month ? (parseInt(g.month.slice(5, 7), 10) || 0) / 12 : 0;
        const score = avgRating + (yearRef + monthRef - 1990) * 3;
        return { ...g, _score: score };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 10);
  }, [masterGames]);

  // Player strips: figure out who goes on top/bottom
  const userRating = useMemo(
    () => allGames.length > 0 ? allGames[0].playerRating : null,
    [allGames]
  );

  const { topStrip, bottomStrip } = useMemo(() => {
    // bottomColor = the color whose pieces are at the bottom of the board
    const bottomColor: "white" | "black" = boardFlipped ? "black" : "white";
    const topColor: "white" | "black" = boardFlipped ? "white" : "black";

    if (loadedGameMeta) {
      return {
        topStrip: { color: topColor, name: loadedGameMeta[topColor].name, rating: loadedGameMeta[topColor].rating, isActive: true },
        bottomStrip: { color: bottomColor, name: loadedGameMeta[bottomColor].name, rating: loadedGameMeta[bottomColor].rating, isActive: true },
      };
    }
    return {
      topStrip: { color: topColor, name: "—", rating: null as number | null, isActive: false },
      bottomStrip: { color: bottomColor, name: username, rating: userRating, isActive: true },
    };
  }, [boardFlipped, loadedGameMeta, username, userRating]);

  // Board size: account for header(44) + strips(2*30 + gap*2 = 72) + engine status(24) + padding(32)
  const BOARD_SIZE = "min(calc(100vh - 180px), calc(100vw - 356px))";

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

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT: Board ───────────────────────────────────────────────────────── */}
        <div style={{
          flexShrink: 0,
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "16px 12px 16px 16px",
          borderRight: "1px solid var(--border)",
          background: "var(--bg-page)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Top player strip */}
            <div style={{ width: BOARD_SIZE, marginLeft: engineOn ? 20 : 0 }}>
              <PlayerStrip {...topStrip} />
            </div>

            {/* Eval bar + Board */}
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              {engineOn && (
                <div style={{ width: 12, alignSelf: "stretch", flexShrink: 0 }}>
                  <EvalBar eval_={displayEvalCp ?? 0} mate={displayMate} />
                </div>
              )}
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
            </div>

            {/* Bottom player strip */}
            <div style={{ width: BOARD_SIZE, marginLeft: engineOn ? 20 : 0 }}>
              <PlayerStrip {...bottomStrip} />
            </div>
          </div>

          {/* Engine status line */}
          <div style={{ marginTop: 8, height: 16, display: "flex", alignItems: "center", gap: 10 }}>
            {engineOn && (
              engineStream.status === "streaming" && engineStream.depth === 0 ? (
                <span style={{ fontSize: 11, color: "var(--text-4)", fontStyle: "italic" }}>Analyzing…</span>
              ) : engineStream.depth > 0 ? (
                <>
                  <span style={{ fontSize: 11, color: "var(--text-4)" }}>
                    Depth {engineStream.depth}
                    {engineStream.finalDepth !== null && engineStream.status === "done" && " (final)"}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)",
                    color: evalTextColor(displayEvalCp, displayMate),
                  }}>
                    {fmtEval(displayEvalCp, displayMate)}
                  </span>
                  {engineStream.status === "streaming" && (
                    <span style={{ fontSize: 10, color: "var(--text-5)", fontStyle: "italic" }}>deepening…</span>
                  )}
                </>
              ) : engineStream.status === "error" ? (
                <span style={{ fontSize: 11, color: "#ca3431" }}>Engine: {engineStream.error}</span>
              ) : null
            )}
          </div>
        </div>

        {/* ── RIGHT: Panel (Chess.com Explore style) ────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-card)" }}>

          {/* ── Header row: Engine toggle + controls ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => setEngineOn(p => !p)}
                style={{
                  padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                  border: `1px solid ${engineOn ? "#22c55e" : "var(--border)"}`,
                  background: engineOn ? "rgba(34,197,94,0.12)" : "none",
                  color: engineOn ? "#22c55e" : "var(--text-3)",
                  cursor: "pointer",
                }}
              >
                Analysis {engineOn ? "···" : "OFF"}
              </button>
              {engineOn && engineStream.depth > 0 && (
                <span style={{ fontSize: 10, color: "var(--text-4)" }}>
                  depth={engineStream.depth}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => setBoardFlipped(p => !p)} style={{ padding: "3px 8px", borderRadius: 5, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-3)", cursor: "pointer" }}>⇅</button>
              <button onClick={() => { setMovesPlayed([]); setFutureMoves([]); setPendingSquare(null); setActiveGameId(null); setLoadedGameMeta(null); }} style={{ padding: "3px 8px", borderRadius: 5, fontSize: 11, border: "1px solid var(--border)", background: "none", color: "var(--text-3)", cursor: "pointer" }}>↺</button>
            </div>
          </div>

          {/* ── Engine PV lines (Chess.com style: eval badge + line text) ── */}
          {engineOn && (
            <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
              {bestThreeLines.length > 0 ? bestThreeLines.map((line, i) => {
                const wpovCp = line.scoreCp !== null ? (sideToMove === "w" ? line.scoreCp : -line.scoreCp) : null;
                const wpovMate = line.mate !== null ? (sideToMove === "w" ? line.mate : -line.mate) : null;
                const evStr = fmtEval(wpovCp, wpovMate);
                const isWhiteAdvantage = (wpovCp !== null && wpovCp > 0) || (wpovMate !== null && wpovMate > 0);
                return (
                  <div
                    key={line.rank}
                    onClick={() => line.san[0] && playMoveSan(line.san[0])}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "none"; }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 12px",
                      borderBottom: i < bestThreeLines.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800,
                      color: isWhiteAdvantage ? "#000" : "#fff",
                      background: isWhiteAdvantage ? "#e8e6e1" : "#333",
                      borderRadius: 3, padding: "2px 6px", minWidth: 42, textAlign: "center",
                      flexShrink: 0,
                    }}>{evStr}</span>
                    <div style={{ display: "flex", gap: 3, overflow: "hidden", flex: 1 }} className="scrollbar-hide">
                      {line.san.slice(0, 12).map((san, idx) => {
                        const moveNum = Math.floor((movesPlayed.length + idx) / 2) + 1;
                        const isWhiteMove = (movesPlayed.length + idx) % 2 === 0;
                        return (
                          <span key={idx} style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                            {(idx === 0 || isWhiteMove) && (
                              <span style={{ fontSize: 11, color: "var(--text-5)" }}>
                                {moveNum}.{!isWhiteMove && ".."}
                              </span>
                            )}
                            <span style={{
                              fontSize: 11, fontWeight: idx === 0 ? 700 : 400,
                              color: idx === 0 ? "var(--text-1)" : "var(--text-3)",
                            }}>{san}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              }) : engineStream.status === "error" ? (
                <div style={{ padding: "10px 12px", color: "#ca3431", fontSize: 11 }}>Engine offline</div>
              ) : (
                <div style={{ padding: "10px 12px", color: "var(--text-4)", fontSize: 11 }}>Analyzing…</div>
              )}
            </div>
          )}

          {/* ── Opening name + move breadcrumb ── */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 4, padding: "8px 12px",
            borderBottom: "1px solid var(--border)", flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, color: "var(--text-2)", fontWeight: 600 }}>
              {openingName || (movesPlayed.length === 0 ? "Starting Position" : `Move ${movesPlayed.length}`)}
            </span>
            {movesPlayed.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
                <button
                  onClick={() => navigateTo(0)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 11, color: "var(--text-4)", padding: "1px 4px", borderRadius: 3,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                >Start</button>
                {breadcrumbItems.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => navigateTo(item.ply)}
                    style={{
                      background: idx === breadcrumbItems.length - 1 ? "rgba(255,255,255,0.1)" : "none",
                      border: "none", cursor: "pointer",
                      fontSize: 11, fontWeight: idx === breadcrumbItems.length - 1 ? 700 : 400,
                      color: idx === breadcrumbItems.length - 1 ? "var(--text-1)" : "var(--text-4)",
                      padding: "1px 4px", borderRadius: 3, fontFamily: "var(--font-mono)",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = idx === breadcrumbItems.length - 1 ? "rgba(255,255,255,0.1)" : "none"; }}
                  >{item.label}</button>
                ))}
              </div>
            )}
          </div>

          {/* ── Tab bar: Master Games / My Games ── */}
          <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
            {(["masters", "my-games"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: "pointer",
                  background: activeTab === tab ? "rgba(255,255,255,0.04)" : "none",
                  color: activeTab === tab ? "var(--text-1)" : "var(--text-4)",
                  borderBottom: activeTab === tab ? "2px solid var(--text-1)" : "2px solid transparent",
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => { if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)"; }}
                onMouseLeave={e => { if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-4)"; }}
              >
                {tab === "masters" ? "Master Games" : "My Games"}
              </button>
            ))}
          </div>

          {/* ── Time-control filter (My Games only) ── */}
          {activeTab === "my-games" && (
            <div style={{ display: "flex", gap: 4, padding: "6px 12px", alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              {(["all", "rapid", "blitz", "bullet"] as const).map(tc => (
                <button
                  key={tc}
                  onClick={() => setTimeFilter(tc)}
                  style={{
                    padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                    border: "none",
                    background: timeFilter === tc ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                    color: timeFilter === tc ? "var(--text-1)" : "var(--text-4)",
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {tc === "all" ? "All" : tc}
                </button>
              ))}
            </div>
          )}

          {/* ── Scrollable content ── */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* ── MASTERS TAB ── */}
            {activeTab === "masters" && (
              <>
                {/* Move table */}
                {masterMovesTable.map((row) => (
                  <button
                    key={row.san}
                    onClick={() => playMoveSan(row.san)}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                    style={{
                      width: "100%", display: "grid", gridTemplateColumns: "56px 40px 48px 48px 50px 1fr",
                      gap: 4, padding: "8px 12px", background: "none", border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      cursor: "pointer", textAlign: "left", alignItems: "center",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>
                      {Math.floor(movesPlayed.length / 2) + 1}.{sideToMove === "b" ? ".." : ""} {row.san}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.freqPct.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCount(row.total)}</span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, textAlign: "right",
                      color: evalTextColor(row.scoreCp, row.mate),
                      background: row.scoreCp !== null || row.mate !== null ? "rgba(255,255,255,0.06)" : "none",
                      borderRadius: 3, padding: "1px 5px",
                      fontVariantNumeric: "tabular-nums",
                    }}>{row.scoreCp === null && row.mate === null ? "" : fmtEval(row.scoreCp, row.mate)}</span>
                    <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.wPct.toFixed(0)}%</span>
                    <div style={{ display: "flex", height: 14, borderRadius: 2, overflow: "hidden", minWidth: 0 }}>
                      <div style={{ width: `${row.wPct}%`, background: "#e8e6e1" }} />
                      <div style={{ width: `${row.dPct}%`, background: "#888" }} />
                      <div style={{ width: `${row.lPct}%`, background: "#555" }} />
                    </div>
                  </button>
                ))}

                {masterMovesTable.length === 0 && (
                  <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
                    No master games at this position.
                  </div>
                )}

                {/* Notable games */}
                {sortedMasterGames.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 2 }}>
                    <div style={{ padding: "10px 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>Notable games in this position</span>
                      <span style={{ fontSize: 11, color: "var(--text-4)" }}>Relevance</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 36px 12px 1fr 36px 48px 40px", gap: 2, padding: "4px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {["Player", "Rating", "", "Player", "Rating", "Result", "Year"].map((h, i) => (
                        <span key={i} style={{ fontSize: 9, fontWeight: 600, color: "var(--text-5)", textTransform: "uppercase" }}>{h}</span>
                      ))}
                    </div>
                    {sortedMasterGames.map(game => {
                      const isLoading = gameLoadingId === game.id;
                      const isActive = activeGameId === game.id;
                      const resultSymbol = game.winner === "white" ? "1-0" : game.winner === "black" ? "0-1" : "½-½";
                      return (
                        <button
                          key={game.id}
                          onClick={() => loadGame(game)}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isActive ? "rgba(34,197,94,0.07)" : "none"; }}
                          disabled={isLoading}
                          style={{
                            width: "100%", display: "grid", gridTemplateColumns: "1fr 36px 12px 1fr 36px 48px 40px",
                            gap: 2, padding: "7px 12px",
                            background: isActive ? "rgba(34,197,94,0.07)" : "none",
                            border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                            cursor: isLoading ? "wait" : "pointer", textAlign: "left", alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.white.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{game.white.rating}</span>
                          <span style={{ fontSize: 11, color: "var(--text-5)", textAlign: "center" }}>vs</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.black.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{game.black.rating}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textAlign: "center", fontFamily: "var(--font-mono)" }}>{isLoading ? "…" : resultSymbol}</span>
                          <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right" }}>{game.year}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── MY GAMES TAB ── */}
            {activeTab === "my-games" && (
              <>
                {/* Move table */}
                {myMovesTable.map((row) => (
                  <button
                    key={row.san}
                    onClick={() => playMoveSan(row.san)}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                    style={{
                      width: "100%", display: "grid", gridTemplateColumns: "56px 40px 48px 48px 50px 1fr",
                      gap: 4, padding: "8px 12px", background: "none", border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      cursor: "pointer", textAlign: "left", alignItems: "center",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>
                      {Math.floor(movesPlayed.length / 2) + 1}.{sideToMove === "b" ? ".." : ""} {row.san}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.freqPct.toFixed(0)}%</span>
                    <span style={{ fontSize: 12, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.total}</span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, textAlign: "right",
                      color: evalTextColor(row.scoreCp, row.mate),
                      background: row.scoreCp !== null || row.mate !== null ? "rgba(255,255,255,0.06)" : "none",
                      borderRadius: 3, padding: "1px 5px",
                      fontVariantNumeric: "tabular-nums",
                    }}>{row.scoreCp === null && row.mate === null ? "" : fmtEval(row.scoreCp, row.mate)}</span>
                    <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.wPct.toFixed(0)}%</span>
                    <div style={{ display: "flex", height: 14, borderRadius: 2, overflow: "hidden", minWidth: 0 }}>
                      <div style={{ width: `${row.wPct}%`, background: "#81b64c" }} />
                      <div style={{ width: `${row.dPct}%`, background: "#888" }} />
                      <div style={{ width: `${row.lPct}%`, background: "#ca3431" }} />
                    </div>
                  </button>
                ))}

                {myMovesTable.length === 0 && (
                  <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
                    {loading ? "Loading games…" : "No personal games at this position"}
                  </div>
                )}

                {/* Notable personal games */}
                {gamesAtPosition.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 2 }}>
                    <div style={{ padding: "10px 12px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>Notable games in this position</span>
                      <span style={{ fontSize: 11, color: "var(--text-4)" }}>Relevance</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 36px 48px 40px", gap: 4, padding: "4px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {["Opponent", "Rating", "Result", "Year"].map((h, i) => (
                        <span key={i} style={{ fontSize: 9, fontWeight: 600, color: "var(--text-5)", textTransform: "uppercase" }}>{h}</span>
                      ))}
                    </div>
                    {[...gamesAtPosition]
                      .sort((a, b) => b.date.getTime() - a.date.getTime())
                      .slice(0, 10)
                      .map((g, i, arr) => {
                        const whiteWon = (g.result === "win" && g.playerColor === "white") || (g.result === "loss" && g.playerColor === "black");
                        const blackWon = (g.result === "win" && g.playerColor === "black") || (g.result === "loss" && g.playerColor === "white");
                        const resultSymbol = whiteWon ? "1-0" : blackWon ? "0-1" : "½-½";
                        const dateStr = g.date instanceof Date && !isNaN(g.date.getTime())
                          ? String(g.date.getFullYear())
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
                              display: "grid", gridTemplateColumns: "1fr 36px 48px 40px",
                              gap: 4, padding: "7px 12px", background: "none", textDecoration: "none",
                              borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                              alignItems: "center",
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.opponentName}</span>
                            <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.opponentRating || "—"}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: g.result === "win" ? "#81b64c" : g.result === "loss" ? "#ca3431" : "var(--text-3)", textAlign: "center", fontFamily: "var(--font-mono)" }}>{resultSymbol}</span>
                            <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right" }}>{dateStr}</span>
                          </a>
                        );
                      })}
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
