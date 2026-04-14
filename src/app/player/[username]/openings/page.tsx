"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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

function getOpeningFen(game: ParsedGame): string {
  const chess = new Chess();
  const depth = Math.min(15, game.moves.length);
  for (let i = 0; i < depth; i++) {
    try { chess.move(game.moves[i]); } catch { break; }
  }
  return chess.fen();
}

function winRateColor(rate: number): string {
  if (rate >= 60) return "#81b64c";
  if (rate >= 50) return "var(--text-2)";
  if (rate >= 40) return "#f6c700";
  return "#ca3431";
}

function accuracyColor(acc: number): string {
  if (acc >= 90) return "#81b64c";
  if (acc >= 75) return "#f6c700";
  if (acc >= 40) return "#e28c28";
  return "#ca3431";
}

// ─── Page header (same slim style as game review) ───
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

// ─── Main page ───
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
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);

  // Fetch all games
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(username)}?months=12`);
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

  // Trigger Stockfish analysis when a game is selected
  useEffect(() => {
    if (!selectedGame) return;
    const controller = new AbortController();
    setAnalyzing(true);
    setAnalysis(null);
    setCurrentMoveIndex(-1);
    analyzeGame(selectedGame.pgn, 14, selectedGame.id, controller.signal)
      .then(result => setAnalysis(result))
      .catch(err => { if (err?.name !== "AbortError") console.error(err); })
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

  // Current board FEN
  const currentFen = useMemo(() => {
    if (selectedGame && analysis && currentMoveIndex >= 0)
      return analysis.moves[currentMoveIndex]?.fen ?? START_FEN;
    if (selectedOpening && openingGames.length > 0)
      return getOpeningFen(openingGames[0]);
    return START_FEN;
  }, [selectedGame, analysis, currentMoveIndex, selectedOpening, openingGames]);

  const currentMove = analysis?.moves[currentMoveIndex] ?? null;

  // Square highlights for current move
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

  const boardSizeCSS = "min(calc(100vh - 56px), calc(100vw - 384px))";

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
                boardOrientation: selectedGame?.playerColor ?? openingGames[0]?.playerColor ?? "white",
                allowDragging: false,
                animationDurationInMs: 150,
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
            {/* Back */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <button
                onClick={() => { setSelectedGame(null); setAnalysis(null); setCurrentMoveIndex(-1); }}
                style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 13, padding: 0, display: "flex", alignItems: "center", gap: 5 }}
              >
                ← <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{selectedOpening?.name}</span>
              </button>
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
              <button
                onClick={() => setSelectedOpening(null)}
                style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 12, padding: 0, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}
              >
                ← All Openings
              </button>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1.3 }}>
                {selectedOpening.name}
              </h2>
              {selectedOpening.eco && (
                <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{selectedOpening.eco}</span>
              )}
            </div>

            {/* Stats */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              {/* W/L/D bar */}
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                {selectedOpening.wins > 0 && <div style={{ flex: selectedOpening.wins, background: "#81b64c" }} />}
                {selectedOpening.draws > 0 && <div style={{ flex: selectedOpening.draws, background: "var(--text-4)" }} />}
                {selectedOpening.losses > 0 && <div style={{ flex: selectedOpening.losses, background: "#ca3431" }} />}
              </div>
              <div style={{ display: "flex", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>{selectedOpening.games} game{selectedOpening.games !== 1 ? "s" : ""}</span>
                <span style={{ fontSize: 13, color: "#81b64c", fontWeight: 600 }}>{selectedOpening.wins}W</span>
                <span style={{ fontSize: 13, color: "var(--text-3)" }}>{selectedOpening.draws}D</span>
                <span style={{ fontSize: 13, color: "#ca3431", fontWeight: 600 }}>{selectedOpening.losses}L</span>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                  Win rate:{" "}
                  <span style={{ color: winRateColor(selectedOpening.winRate), fontWeight: 700 }}>
                    {selectedOpening.winRate.toFixed(0)}%
                  </span>
                </span>
                {selectedOpening.avgAccuracy != null && (
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                    Accuracy:{" "}
                    <span style={{ color: accuracyColor(selectedOpening.avgAccuracy), fontWeight: 700 }}>
                      {selectedOpening.avgAccuracy.toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Games list */}
            <div style={{ overflowY: "auto", flex: 1 }} className="scrollbar-hide">
              <div style={{ padding: "8px 16px 4px", fontSize: 11, fontWeight: 700, color: "var(--text-4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Games
              </div>
              {openingGames.length === 0 && (
                <div style={{ padding: "24px 16px", color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>No games found</div>
              )}
              {openingGames.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game)}
                  style={{ width: "100%", display: "flex", alignItems: "center", padding: "9px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 10, textAlign: "left" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                >
                  {/* Result dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: game.result === "win" ? "#81b64c" : game.result === "loss" ? "#ca3431" : "var(--text-4)",
                  }} />
                  {/* Info */}
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
                  {/* Accuracy */}
                  {game.accuracy != null && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: accuracyColor(game.accuracy), flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                      {game.accuracy.toFixed(0)}%
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: "var(--text-4)", flexShrink: 0 }}>›</span>
                </button>
              ))}
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
                    {/* ECO badge */}
                    {opening.eco ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", fontFamily: "var(--font-mono)", width: 28, flexShrink: 0, letterSpacing: "0.04em" }}>
                        {opening.eco}
                      </span>
                    ) : <span style={{ width: 28, flexShrink: 0 }} />}

                    {/* Opening name */}
                    <span style={{ flex: 1, fontSize: 13, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {opening.name}
                    </span>

                    {/* Game count + win rate */}
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
