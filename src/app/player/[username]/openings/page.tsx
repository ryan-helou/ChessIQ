"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Chess } from "chess.js";
import { neoPieces } from "@/lib/chess-pieces";
import EvalBar from "@/components/game-review/EvalBar";
import { getOpeningStats, type ParsedGame } from "@/lib/game-analysis";
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

  // Quick-jump opening shortcuts (top 6 by game count)
  const quickJumps = useMemo(() => {
    if (filteredGames.length === 0) return [];
    const stats = getOpeningStats(filteredGames).sort((a, b) => b.games - a.games);
    return stats
      .map(op => {
        const opGames = filteredGames.filter(g => g.opening === op.name);
        const common = getCommonPrefix(opGames).slice(0, 20);
        return { name: op.name, moves: common, games: op.games };
      })
      .filter(j => j.moves.length > 0)
      .slice(0, 6);
  }, [filteredGames]);

  // Fetch Lichess master games + moves for this position
  useEffect(() => {
    setMasterGames([]);
    setLichessMoves([]);
    setLichessTotal(0);
    setActiveGameId(null);
    const controller = new AbortController();
    fetch(`/api/lichess-explorer?fen=${encodeURIComponent(fen)}`, { signal: controller.signal })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(r => r.json()).then((data: any) => {
        setMasterGames(data.topGames ?? []);
        setLichessMoves(data.moves ?? []);
        setLichessTotal((data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0));
      })
      .catch(() => {});
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

  // Lookup map: first-ply SAN → scoreCp (from side-to-move POV)
  const engineSanEval = useMemo(() => {
    const m = new Map<string, { scoreCp: number | null; mate: number | null }>();
    for (const line of engineStream.lines) {
      const firstSan = line.san[0];
      if (!firstSan) continue;
      if (!m.has(firstSan)) m.set(firstSan, { scoreCp: line.scoreCp, mate: line.mate });
    }
    return m;
  }, [engineStream.lines]);

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

  // Aggregate personal stats
  const positionSummary = useMemo(() => {
    const wins = personalMoves.reduce((s, m) => s + m.wins, 0);
    const draws = personalMoves.reduce((s, m) => s + m.draws, 0);
    const losses = personalMoves.reduce((s, m) => s + m.losses, 0);
    const total = wins + draws + losses;
    return { wins, draws, losses, total };
  }, [personalMoves]);

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

        {/* ── RIGHT: Panel ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Panel header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            padding: "8px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 8,
          }}>
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
              {engineOn && engineStream.depth > 0 && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  color: "var(--text-4)", background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px",
                }}>
                  depth={engineStream.depth}
                </span>
              )}
              <button
                onClick={() => setBoardFlipped(p => !p)}
                style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "none", color: "var(--text-3)", cursor: "pointer" }}
              >
                ⇅
              </button>
              <button
                onClick={() => {
                  setMovesPlayed([]); setFutureMoves([]); setPendingSquare(null);
                  setActiveGameId(null); setLoadedGameMeta(null);
                }}
                style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: "1px solid var(--border)", background: "none", color: "var(--text-3)", cursor: "pointer" }}
              >
                ↺
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
            {(["masters", "my-games"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700,
                  border: "none", cursor: "pointer",
                  background: activeTab === tab ? "rgba(129,182,76,0.08)" : "none",
                  color: activeTab === tab ? "var(--green)" : "var(--text-3)",
                  borderBottom: activeTab === tab ? "2px solid var(--green)" : "2px solid transparent",
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => { if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-1)"; }}
                onMouseLeave={e => { if (activeTab !== tab) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)"; }}
              >
                {tab === "masters" ? "Master Games" : "My Games"}
              </button>
            ))}
          </div>

          {/* Time-control filter chips — My Games only */}
          {activeTab === "my-games" && (
            <div style={{ display: "flex", gap: 5, padding: "8px 16px", alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "var(--text-4)", flexShrink: 0 }}>Time:</span>
              {(["all", "bullet", "blitz", "rapid"] as const).map(tc => (
                <button
                  key={tc}
                  onClick={() => setTimeFilter(tc)}
                  style={{
                    padding: "2px 10px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${timeFilter === tc ? "var(--green)" : "var(--border)"}`,
                    background: timeFilter === tc ? "rgba(129,182,76,0.12)" : "none",
                    color: timeFilter === tc ? "var(--green)" : "var(--text-3)",
                    cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {tc}
                </button>
              ))}
            </div>
          )}

          {/* Quick-jump chips */}
          {quickJumps.length > 0 && (
            <div style={{ display: "flex", gap: 5, padding: "8px 16px", flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "var(--text-4)", flexShrink: 0 }}>Jump to:</span>
              {quickJumps.map(j => (
                <button
                  key={j.name}
                  onClick={() => {
                    setMovesPlayed(j.moves); setFutureMoves([]); setPendingSquare(null);
                    setActiveGameId(null); setLoadedGameMeta(null);
                  }}
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
              style={{ background: movesPlayed.length === 0 ? "rgba(129,182,76,0.12)" : "none", border: "none", borderRadius: 3, padding: "2px 6px", fontSize: 11, color: movesPlayed.length === 0 ? "var(--green)" : "var(--text-4)", cursor: "pointer", flexShrink: 0, fontWeight: movesPlayed.length === 0 ? 700 : 500 }}
            >
              Start
            </button>
            {breadcrumbItems.map((item, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <span style={{ color: "var(--border)", fontSize: 12, margin: "0 1px" }}>›</span>
                <button
                  onClick={() => navigateTo(item.ply)}
                  style={{ background: i === breadcrumbItems.length - 1 ? "rgba(129,182,76,0.12)" : "none", border: "none", borderRadius: 3, padding: "2px 5px", fontSize: 11, fontFamily: "var(--font-mono)", color: i === breadcrumbItems.length - 1 ? "var(--green)" : "var(--text-3)", cursor: "pointer", flexShrink: 0, fontWeight: i === breadcrumbItems.length - 1 ? 700 : 500 }}
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

          {/* ── Best Moves — engine top-3 with PV lines ── */}
          <div style={{ flexShrink: 0, borderBottom: "2px solid var(--border)", background: "rgba(129,182,76,0.03)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 16px 4px" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                ★ Best Moves
              </span>
              <span style={{ fontSize: 9, color: "var(--text-5)" }}>
                {engineOn
                  ? engineStream.status === "streaming"
                    ? `stockfish · depth ${engineStream.depth}…`
                    : engineStream.status === "done"
                      ? `stockfish · depth ${engineStream.finalDepth ?? engineStream.depth}`
                      : engineStream.status === "error"
                        ? "engine offline"
                        : "engine starting…"
                  : "engine off"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "28px 56px 60px 1fr", gap: 6, padding: "3px 16px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>#</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Move</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Eval</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Principal Variation</span>
            </div>

            {/* Rows or skeleton */}
            {engineOn && bestThreeLines.length > 0 ? (
              bestThreeLines.map((line, i) => {
                const firstSan = line.san[0] ?? "";
                return (
                  <div
                    key={line.rank}
                    style={{
                      display: "grid", gridTemplateColumns: "28px 56px 60px 1fr",
                      gap: 6, padding: "8px 16px",
                      borderBottom: i < bestThreeLines.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)", fontVariantNumeric: "tabular-nums" }}>{line.rank}.</span>
                    <button
                      onClick={() => firstSan && playMoveSan(firstSan)}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,197,94,0.08)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                      style={{
                        background: "none", border: "none", textAlign: "left",
                        fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-1)",
                        cursor: firstSan ? "pointer" : "default", padding: "2px 4px", borderRadius: 3,
                      }}
                    >{firstSan || "—"}</button>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                      color: evalTextColor(line.scoreCp, line.mate),
                      fontVariantNumeric: "tabular-nums",
                    }}>{fmtEval(line.scoreCp, line.mate)}</span>
                    <div
                      style={{ display: "flex", gap: 4, overflowX: "auto", alignItems: "center" }}
                      className="scrollbar-hide"
                    >
                      {line.san.slice(0, 10).map((san, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const path = line.san.slice(0, idx + 1);
                            setMovesPlayed(prev => [...prev, ...path]);
                            setFutureMoves([]); setPendingSquare(null);
                            setActiveGameId(null); setLoadedGameMeta(null);
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                          style={{
                            background: "none", border: "none",
                            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: idx === 0 ? 700 : 500,
                            color: idx === 0 ? "var(--text-2)" : "var(--text-4)",
                            padding: "1px 4px", borderRadius: 3, cursor: "pointer",
                            whiteSpace: "nowrap", flexShrink: 0,
                          }}
                        >{san}</button>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : engineOn ? (
              [1, 2, 3].map(k => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "28px 56px 60px 1fr", gap: 6, padding: "8px 16px", borderBottom: k < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ height: 12, width: 14, background: "var(--border)", borderRadius: 2, opacity: 0.3, animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: 14, width: 36, background: "var(--border)", borderRadius: 2, opacity: 0.4, animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: 14, width: 40, background: "var(--border)", borderRadius: 2, opacity: 0.3, animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: 12, background: "var(--border)", borderRadius: 2, opacity: 0.25, animation: "pulse 1.5s ease-in-out infinite" }} />
                </div>
              ))
            ) : (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--text-4)", fontSize: 12 }}>
                Turn the engine on to see the best moves.
              </div>
            )}
          </div>

          {/* ── Tab content ── */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* ── MASTERS TAB ── */}
            {activeTab === "masters" && (
              <>
                <div style={{ padding: "8px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Most Common Moves
                  </span>
                  {lichessTotal > 0 && (
                    <span style={{ fontSize: 9, color: "var(--text-5)" }}>{fmtCount(lichessTotal)} games</span>
                  )}
                </div>

                {masterMovesTable.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "52px 40px 52px 52px 1fr", gap: 6, padding: "4px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, zIndex: 1 }}>
                    {["Move", "%", "Count", "Eval", "W · D · L"].map((h, i) => (
                      <span key={i} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: i === 1 || i === 2 || i === 3 ? "right" : "left" }}>{h}</span>
                    ))}
                  </div>
                )}

                {masterMovesTable.map((row, i) => (
                  <button
                    key={row.san}
                    onClick={() => playMoveSan(row.san)}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                    style={{
                      width: "100%", display: "grid", gridTemplateColumns: "52px 40px 52px 52px 1fr",
                      gap: 6, padding: "9px 16px", background: "none", border: "none",
                      borderBottom: i < masterMovesTable.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      cursor: "pointer", textAlign: "left", alignItems: "center",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>{row.san}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.freqPct.toFixed(0)}%</span>
                    <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCount(row.total)}</span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textAlign: "right",
                      color: evalTextColor(row.scoreCp, row.mate),
                      fontVariantNumeric: "tabular-nums",
                    }}>{row.scoreCp === null && row.mate === null ? "—" : fmtEval(row.scoreCp, row.mate)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: 64, flexShrink: 0 }}>
                        <div style={{ width: `${row.wPct}%`, background: "#d4d0ca" }} />
                        <div style={{ width: `${row.dPct}%`, background: "#555" }} />
                        <div style={{ width: `${row.lPct}%`, background: "#8b8b8b" }} />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ color: "#d4d0ca" }}>{row.wPct.toFixed(0)}%</span>
                        <span style={{ color: "var(--text-5)" }}> · {row.dPct.toFixed(0)}% · </span>
                        <span style={{ color: "#888" }}>{row.lPct.toFixed(0)}%</span>
                      </span>
                    </div>
                  </button>
                ))}

                {masterMovesTable.length === 0 && (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
                    No master games at this position.
                  </div>
                )}

                {/* Notable master games */}
                {sortedMasterGames.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
                    <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Notable Master Games</span>
                      <span style={{ fontSize: 9, color: "var(--text-5)" }}>rating × recency · click to replay</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 1fr 40px 56px 36px", gap: 4, padding: "4px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {["White", "Rtg", "Black", "Rtg", "Result", "Year"].map((h, i) => (
                        <span key={i} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                      ))}
                    </div>
                    {sortedMasterGames.map(game => {
                      const isLoading = gameLoadingId === game.id;
                      const isActive = activeGameId === game.id;
                      const resultSymbol = game.winner === "white" ? "1-0" : game.winner === "black" ? "0-1" : "½-½";
                      const winnerArrow = game.winner === "white" ? "▲ " : game.winner === "black" ? "▼ " : "";
                      const resultColor = game.winner === "white" ? "#d4d0ca" : game.winner === "black" ? "#999" : "var(--text-4)";
                      return (
                        <button
                          key={game.id}
                          onClick={() => loadGame(game)}
                          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isActive ? "rgba(34,197,94,0.07)" : "none"; }}
                          disabled={isLoading}
                          style={{
                            width: "100%", display: "grid", gridTemplateColumns: "1fr 40px 1fr 40px 56px 36px",
                            gap: 4, padding: "8px 16px",
                            background: isActive ? "rgba(34,197,94,0.07)" : "none",
                            border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)",
                            borderLeft: isActive ? "2px solid #22c55e" : "2px solid transparent",
                            cursor: isLoading ? "wait" : "pointer", textAlign: "left", alignItems: "center",
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#d4d0ca", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.white.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-5)", textAlign: "right" }}>{game.white.rating}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{game.black.name}</span>
                          <span style={{ fontSize: 11, color: "var(--text-5)", textAlign: "right" }}>{game.black.rating}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: resultColor, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{isLoading ? "…" : `${winnerArrow}${resultSymbol}`}</span>
                          <span style={{ fontSize: 11, color: "var(--text-5)", textAlign: "right" }}>{game.year}</span>
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
                {positionSummary.total > 0 && (
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>Your results at this position</span>
                      <span style={{ fontSize: 11, color: "var(--text-4)" }}>{positionSummary.total} games</span>
                    </div>
                    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
                      {positionSummary.wins > 0 && <div style={{ flex: positionSummary.wins, background: "#81b64c" }} />}
                      {positionSummary.draws > 0 && <div style={{ flex: positionSummary.draws, background: "#555" }} />}
                      {positionSummary.losses > 0 && <div style={{ flex: positionSummary.losses, background: "#ca3431" }} />}
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span style={{ fontSize: 11, color: "#81b64c", fontWeight: 700 }}>{((positionSummary.wins / positionSummary.total) * 100).toFixed(0)}% W</span>
                      <span style={{ fontSize: 11, color: "var(--text-4)" }}>{((positionSummary.draws / positionSummary.total) * 100).toFixed(0)}% D</span>
                      <span style={{ fontSize: 11, color: "#ca3431", fontWeight: 700 }}>{((positionSummary.losses / positionSummary.total) * 100).toFixed(0)}% L</span>
                    </div>
                  </div>
                )}

                <div style={{ padding: "8px 16px 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Most Common Moves</span>
                </div>

                {myMovesTable.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "52px 40px 52px 52px 1fr", gap: 6, padding: "4px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, zIndex: 1 }}>
                    {["Move", "%", "Count", "Eval", "W · D · L"].map((h, i) => (
                      <span key={i} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: i === 1 || i === 2 || i === 3 ? "right" : "left" }}>{h}</span>
                    ))}
                  </div>
                )}

                {myMovesTable.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>
                    {loading ? "Loading games…" : "No personal games at this position"}
                  </div>
                ) : myMovesTable.map((row, i) => (
                  <button
                    key={row.san}
                    onClick={() => playMoveSan(row.san)}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                    style={{
                      width: "100%", display: "grid", gridTemplateColumns: "52px 40px 52px 52px 1fr",
                      gap: 6, padding: "9px 16px", background: "none", border: "none",
                      borderBottom: i < myMovesTable.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      cursor: "pointer", textAlign: "left", alignItems: "center",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>{row.san}</span>
                    <span style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.freqPct.toFixed(0)}%</span>
                    <span style={{ fontSize: 11, color: "var(--text-4)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.total}</span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textAlign: "right",
                      color: evalTextColor(row.scoreCp, row.mate),
                      fontVariantNumeric: "tabular-nums",
                    }}>{row.scoreCp === null && row.mate === null ? "—" : fmtEval(row.scoreCp, row.mate)}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: 64, flexShrink: 0 }}>
                        <div style={{ width: `${row.wPct}%`, background: "#81b64c" }} />
                        <div style={{ width: `${row.dPct}%`, background: "#555" }} />
                        <div style={{ width: `${row.lPct}%`, background: "#ca3431" }} />
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ color: "#81b64c" }}>{row.wPct.toFixed(0)}%</span>
                        <span style={{ color: "var(--text-5)" }}> · {row.dPct.toFixed(0)}% · </span>
                        <span style={{ color: "#ca3431" }}>{row.lPct.toFixed(0)}%</span>
                      </span>
                    </div>
                  </button>
                ))}

                {/* Notable My Games — sorted by date desc, cap 10, with TC chip */}
                {gamesAtPosition.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
                    <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Notable Games</span>
                      <span style={{ fontSize: 9, color: "var(--text-5)" }}>most recent first</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 44px 36px 56px", gap: 4, padding: "4px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {["Result", "Opponent", "TC", "Rtg", "Date"].map(h => (
                        <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                      ))}
                    </div>
                    {[...gamesAtPosition]
                      .sort((a, b) => b.date.getTime() - a.date.getTime())
                      .slice(0, 10)
                      .map((g, i, arr) => {
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
                            style={{ display: "grid", gridTemplateColumns: "48px 1fr 44px 36px 56px", gap: 4, padding: "8px 16px", background: "none", textDecoration: "none", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, color: resultColor, whiteSpace: "nowrap" }}>{resultLabel}</span>
                            <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.opponentName}</span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: "var(--text-4)",
                              textTransform: "uppercase", letterSpacing: "0.03em",
                              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                              borderRadius: 3, padding: "1px 4px", textAlign: "center",
                            }}>{g.timeClass.slice(0, 4)}</span>
                            <span style={{ fontSize: 11, color: "var(--text-5)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.opponentRating || "—"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-5)", textAlign: "right" }}>{dateStr}</span>
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
