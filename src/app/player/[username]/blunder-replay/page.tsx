"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import ChessLoader from "@/components/ChessLoader";
import PuzzleBoard from "@/components/puzzle-trainer/PuzzleBoard";
import {
  getPuzzleRecommendations,
  getUserPuzzleRating,
  recordPuzzleAttempt,
  blunderPuzzleToTrainer,
  type BlunderPuzzle,
  type TrainerPuzzle,
} from "@/lib/puzzle-api";

type View = "overview" | "training" | "complete";

const SEVERITY_COLOR: Record<string, string> = {
  blunder: "#ca3431",
  mistake: "#e28c28",
  inaccuracy: "#f6c700",
};

const SEVERITY_LABEL: Record<string, string> = {
  blunder: "Blunder",
  mistake: "Mistake",
  inaccuracy: "Inaccuracy",
};

export default function BlunderReplayPage() {
  const params = useParams();
  const username = params.username as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blunders, setBlunders] = useState<BlunderPuzzle[]>([]);
  const [puzzleQueue, setPuzzleQueue] = useState<TrainerPuzzle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [view, setView] = useState<View>("overview");
  const [sessionSolved, setSessionSolved] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [playerRating, setPlayerRating] = useState(1200);
  const [ratingChange, setRatingChange] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "blunder" | "mistake">("all");

  // Map from TrainerPuzzle id → original BlunderPuzzle for context display
  const blunderMap = useRef<Map<string, BlunderPuzzle>>(new Map());

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [data, rating] = await Promise.all([
          getPuzzleRecommendations(username, 1200, 200),
          getUserPuzzleRating(username),
        ]);
        setBlunders(data.ownBlunderPuzzles);
        setPlayerRating(rating);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load blunders");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  const buildQueue = useCallback((severityFilter: "all" | "blunder" | "mistake") => {
    const filtered = blunders.filter((b) => {
      if (severityFilter === "all") return true;
      if (severityFilter === "blunder") return b.severity === "blunder";
      if (severityFilter === "mistake") return b.severity === "blunder" || b.severity === "mistake";
      return true;
    });
    const queue = filtered.map(blunderPuzzleToTrainer);
    const map = new Map<string, BlunderPuzzle>();
    for (let i = 0; i < queue.length; i++) {
      map.set(queue[i].id, filtered[i]);
    }
    blunderMap.current = map;
    setPuzzleQueue(queue);
    setCurrentIndex(0);
    setSessionSolved(0);
    setSessionTotal(0);
    setStreak(0);
  }, [blunders]);

  function startSession(f: "all" | "blunder" | "mistake") {
    setFilter(f);
    buildQueue(f);
    setView("training");
  }

  const handleSolved = useCallback(async (attempts: number, timeSeconds: number) => {
    setSessionSolved((s) => s + 1);
    setSessionTotal((t) => t + 1);
    setStreak((s) => s + 1);
    const puzzle = puzzleQueue[currentIndex];
    if (puzzle) {
      const result = await recordPuzzleAttempt(
        puzzle.id, username, true, attempts, timeSeconds, puzzle.rating
      );
      if (result) setRatingChange(result.ratingChange);
    }
  }, [currentIndex, puzzleQueue, username]);

  const handleFailed = useCallback(async (attempts: number, timeSeconds: number) => {
    setSessionTotal((t) => t + 1);
    setStreak(0);
    const puzzle = puzzleQueue[currentIndex];
    if (puzzle) {
      await recordPuzzleAttempt(
        puzzle.id, username, false, attempts, timeSeconds, puzzle.rating
      );
      setRatingChange(null);
    }
  }, [currentIndex, puzzleQueue, username]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= puzzleQueue.length) {
      setView("complete");
    } else {
      setCurrentIndex((i) => i + 1);
    }
    setRatingChange(null);
  }, [currentIndex, puzzleQueue.length]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  // Severity breakdown
  const counts = blunders.reduce((acc, b) => {
    acc[b.severity] = (acc[b.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const biggestBlunder = blunders
    .filter((b) => b.evalDrop > 0)
    .sort((a, b) => b.evalDrop - a.evalDrop)[0] ?? null;

  const currentPuzzle = puzzleQueue[currentIndex] ?? null;
  const currentBlunder = currentPuzzle ? blunderMap.current.get(currentPuzzle.id) : null;

  // ─── Loading ───
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <Header username={username} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
          <ChessLoader />
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>Loading your blunders…</span>
        </div>
      </div>
    );
  }

  // ─── Error ───
  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <Header username={username} />
        <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <div>{error}</div>
          <Link href={`/player/${username}`} style={{ color: "var(--green)", marginTop: 16, display: "inline-block" }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ─── Overview ───
  if (view === "overview") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <Header username={username} />
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "28px 16px" }}>

          {/* Breadcrumb */}
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 20 }}>
            <Link href={`/player/${username}`} style={{ color: "var(--text-3)" }}>Dashboard</Link>
            <span style={{ margin: "0 6px" }}>›</span>
            <span style={{ color: "var(--text-2)" }}>Blunder Replay</span>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>
              Blunder Replay
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
              Review and replay the positions where you went wrong. Find the best move to learn from each mistake.
            </p>
          </div>

          {blunders.length === 0 ? (
            <div style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "32px 24px", textAlign: "center",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 8 }}>No blunders to replay yet</div>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 16 }}>
                Analyze your games first — blunders will appear here.
              </div>
              <Link href={`/player/${username}`}>
                <button style={{ background: "var(--green)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Back to Dashboard
                </button>
              </Link>
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                {["blunder", "mistake", "inaccuracy"].map((sev) => counts[sev] ? (
                  <div key={sev} style={{
                    flex: "1 1 120px",
                    background: "var(--bg-card)",
                    border: `1px solid ${SEVERITY_COLOR[sev]}33`,
                    borderRadius: 10,
                    padding: "14px 16px",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                      {SEVERITY_LABEL[sev]}s
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: SEVERITY_COLOR[sev], lineHeight: 1 }}>
                      {counts[sev]}
                    </div>
                  </div>
                ) : null)}
              </div>

              {/* Biggest blunder callout */}
              {biggestBlunder && (
                <div style={{
                  background: "rgba(202,52,49,0.07)",
                  border: "1px solid rgba(202,52,49,0.2)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 20,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>⚡</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 2 }}>
                      Biggest blunder: Move {biggestBlunder.moveNumber}
                      {biggestBlunder.theme && ` — missed ${biggestBlunder.theme}`}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                      Lost {(biggestBlunder.evalDrop / 100).toFixed(1)} pawns of advantage
                    </div>
                  </div>
                </div>
              )}

              {/* Session start options */}
              <div style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "20px",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", marginBottom: 14 }}>
                  Start a session
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    onClick={() => startSession("blunder")}
                    disabled={!counts["blunder"]}
                    style={{
                      background: counts["blunder"] ? "rgba(202,52,49,0.1)" : "var(--border)",
                      border: `1px solid ${counts["blunder"] ? "rgba(202,52,49,0.3)" : "transparent"}`,
                      borderRadius: 8, padding: "11px 16px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      cursor: counts["blunder"] ? "pointer" : "not-allowed",
                      opacity: counts["blunder"] ? 1 : 0.5,
                    }}
                  >
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Blunders only</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Focus on the worst mistakes</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#ca3431" }}>
                      {counts["blunder"] ?? 0} puzzles →
                    </span>
                  </button>

                  <button
                    onClick={() => startSession("mistake")}
                    disabled={!(counts["blunder"] || counts["mistake"])}
                    style={{
                      background: (counts["blunder"] || counts["mistake"]) ? "rgba(226,140,40,0.08)" : "var(--border)",
                      border: `1px solid ${(counts["blunder"] || counts["mistake"]) ? "rgba(226,140,40,0.25)" : "transparent"}`,
                      borderRadius: 8, padding: "11px 16px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      cursor: (counts["blunder"] || counts["mistake"]) ? "pointer" : "not-allowed",
                      opacity: (counts["blunder"] || counts["mistake"]) ? 1 : 0.5,
                    }}
                  >
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Blunders + Mistakes</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Include significant errors</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#e28c28" }}>
                      {(counts["blunder"] ?? 0) + (counts["mistake"] ?? 0)} puzzles →
                    </span>
                  </button>

                  <button
                    onClick={() => startSession("all")}
                    style={{
                      background: "rgba(129,182,76,0.07)",
                      border: "1px solid rgba(129,182,76,0.2)",
                      borderRadius: 8, padding: "11px 16px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>All errors</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>Every blunder, mistake, and inaccuracy</div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#81b64c" }}>
                      {blunders.length} puzzles →
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Session Complete ───
  if (view === "complete") {
    const pct = sessionTotal > 0 ? Math.round((sessionSolved / sessionTotal) * 100) : 0;
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <Header username={username} />
        <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", padding: "0 16px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {pct >= 70 ? "🏆" : pct >= 40 ? "👍" : "📚"}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
            Session Complete
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-3)", marginBottom: 24 }}>
            You solved {sessionSolved} of {sessionTotal} positions ({pct}%)
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => { buildQueue(filter); setView("training"); }}
              style={{ background: "var(--green)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Retry Session
            </button>
            <button
              onClick={() => { setView("overview"); }}
              style={{ background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Back to Overview
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Training ───
  if (!currentPuzzle) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Header username={username} />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 16px 48px" }}>

        {/* Top nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button
            onClick={() => setView("overview")}
            style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 13, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}
          >
            ‹ Overview
          </button>
          <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
            {currentIndex + 1} / {puzzleQueue.length}
          </span>
        </div>

        {/* Context banner */}
        {currentBlunder && (
          <div style={{
            background: "var(--bg-card)",
            border: `1px solid ${SEVERITY_COLOR[currentBlunder.severity] ?? "var(--border)"}33`,
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
              color: SEVERITY_COLOR[currentBlunder.severity] ?? "var(--text-3)",
              background: `${SEVERITY_COLOR[currentBlunder.severity] ?? "var(--border)"}1a`,
              padding: "2px 8px", borderRadius: 4,
            }}>
              {SEVERITY_LABEL[currentBlunder.severity] ?? currentBlunder.severity}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              Move {currentBlunder.moveNumber}
            </span>
            {currentBlunder.evalDrop > 0 && (
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                −{(currentBlunder.evalDrop / 100).toFixed(1)} pawns
              </span>
            )}
            {currentBlunder.theme && (
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Missed: {currentBlunder.theme}
              </span>
            )}
          </div>
        )}

        {/* Puzzle Board */}
        <PuzzleBoard
          puzzle={currentPuzzle}
          sessionSolved={sessionSolved}
          sessionTotal={sessionTotal}
          streak={streak}
          puzzleIndex={currentIndex}
          totalPuzzles={puzzleQueue.length}
          onSolved={handleSolved}
          onFailed={handleFailed}
          onNext={handleNext}
          onSkip={handleSkip}
          mode="blunders"
          hasBlunderPuzzles={true}
          playerRating={playerRating}
          ratingChange={ratingChange}
          username={username}
        />
      </div>
    </div>
  );
}
