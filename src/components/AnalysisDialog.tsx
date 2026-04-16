"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface AnalysisDialogProps {
  username: string;
  months: number;
  onClose: (analysisRan?: boolean) => void;
  isOpen: boolean;
}

type Phase = "select" | "analyzing" | "done";

const MESSAGES = [
  "Sending positions to Stockfish...",
  "Detecting blunders and mistakes...",
  "Looking for hanging pieces...",
  "Scanning for missed forks...",
  "Checking pin and skewer patterns...",
  "Analysing pawn structure...",
  "Evaluating endgame accuracy...",
  "Hunting back-rank threats...",
  "Calculating move accuracy scores...",
  "Identifying critical moments...",
  "Comparing your moves to engine best...",
  "Detecting discovered attacks...",
];

const GAME_COUNTS = [
  { count: 10, label: "10 games" },
  { count: 20, label: "20 games" },
  { count: 50, label: "50 games" },
  { count: "all", label: "All games this period" },
] as const;

export default function AnalysisDialog({
  username,
  months,
  onClose,
  isOpen,
}: AnalysisDialogProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("select");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [gamesAnalyzed, setGamesAnalyzed] = useState(0);
  const [gamesTotal, setGamesTotal] = useState(0);
  const [totalBlunders, setTotalBlunders] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [selectedCount, setSelectedCount] = useState<10 | 20 | 50 | "all" | null>(null);
  const [alreadyUpToDate, setAlreadyUpToDate] = useState(false);
  const [analysisRan, setAnalysisRan] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const msgRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setPhase("select");
        setError(null);
        setProgress(0);
        setGamesAnalyzed(0);
        setGamesTotal(0);
        setTotalBlunders(0);
        setSelectedCount(null);
        setAlreadyUpToDate(false);
        setAnalysisRan(false);
        setFailedCount(0);
      }, 300);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (msgRef.current) clearInterval(msgRef.current);
    };
  }, []);

  async function handleAnalyze(count: 10 | 20 | 50 | "all", retryFailed = false) {
    setSelectedCount(count);
    setError(null);
    setMsgIdx(0);
    setGamesAnalyzed(0);
    setGamesTotal(0);
    setTotalBlunders(0);
    setProgress(0);
    setPhase("analyzing");

    abortRef.current = new AbortController();

    msgRef.current = setInterval(() => {
      setMsgIdx((i) => (i + 1) % MESSAGES.length);
    }, 2800);

    try {
      const queueRes = await fetch(`/api/games/${encodeURIComponent(username)}/analyze-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, gameCount: count, retryFailed }),
        signal: abortRef.current.signal,
      });

      if (!queueRes.ok) {
        let msg = "Failed to queue games for analysis.";
        try { const err = await queueRes.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }

      const queueData = await queueRes.json();
      if (queueData.failedCount) setFailedCount(queueData.failedCount);
      const total: number = queueData.total ?? (queueData.queued + (queueData.alreadyDone ?? 0));
      const alreadyDone: number = queueData.alreadyDone ?? 0;
      const toAnalyze: number = queueData.queued ?? 0;

      setGamesTotal(total);
      setGamesAnalyzed(alreadyDone);

      if (toAnalyze === 0) {
        if (msgRef.current) clearInterval(msgRef.current);
        if (total === 0) {
          setError("No games found for this time period. Try a longer range.");
          setPhase("select");
        } else {
          setAlreadyUpToDate(true);
          setProgress(100);
          setGamesAnalyzed(total);
          setPhase("done");
        }
        return;
      }

      let analyzed = alreadyDone;
      let blunders = 0;
      const MAX_ITERATIONS = 1000; // Safety: never loop more than 1000 times regardless of server response
      const DEADLINE = Date.now() + 5 * 60 * 1000; // 5-minute wall-clock limit
      let iterations = 0;

      while (iterations++ < MAX_ITERATIONS && Date.now() < DEADLINE) {
        if (abortRef.current?.signal.aborted) break;

        const nextRes = await fetch(`/api/games/${encodeURIComponent(username)}/analyze-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ depth: 12 }),
          signal: abortRef.current.signal,
        });

        if (!nextRes.ok) {
          let msg = "Analysis failed. Try again.";
          try { const err = await nextRes.json(); msg = err.error || msg; } catch {}
          throw new Error(msg);
        }

        const nextData = await nextRes.json();
        analyzed += 1;
        blunders += nextData.blundersFound ?? 0;

        setGamesAnalyzed(analyzed);
        setTotalBlunders(blunders);
        setProgress(Math.round((analyzed / total) * 100));

        if (nextData.done || nextData.remaining === 0) break;
      }

      if (msgRef.current) clearInterval(msgRef.current);
      setProgress(100);
      setGamesAnalyzed(total);
      setAnalysisRan(true);
      setPhase("done");
    } catch (err: unknown) {
      if (msgRef.current) clearInterval(msgRef.current);
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("select");
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 40, backdropFilter: "blur(4px)" }}
        onClick={phase === "select" ? () => onClose(false) : undefined}
      />

      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}>
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "360px",
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        }}>

          {/* SELECT PHASE */}
          {phase === "select" && (
            <div style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <span style={{ fontSize: "22px" }}>♟</span>
                <h2 className="" style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-1)" }}>Analyze Games</h2>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-3)", marginBottom: "20px", lineHeight: 1.5 }}>
                Choose how many games from the last {months} month{months !== 1 ? "s" : ""} to analyse with Stockfish.
              </p>

              {error && (
                <div style={{ background: "var(--loss-dim)", border: "1px solid rgba(224,85,85,0.3)", borderRadius: "8px", padding: "12px", marginBottom: "16px", fontSize: "13px", color: "var(--loss)" }}>
                  {error}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
                {GAME_COUNTS.map(({ count, label }) => (
                  <button
                    key={count}
                    onClick={() => handleAnalyze(count)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      textAlign: "left",
                      color: "var(--text-1)",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 500,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--green-line)";
                      e.currentTarget.style.background = "var(--bg-card-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.background = "var(--bg-card)";
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => onClose(false)}
                style={{ width: "100%", padding: "8px", color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", fontSize: "13px", transition: "color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)"; }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* ANALYZING PHASE */}
          {phase === "analyzing" && (
            <div style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
                <span style={{ fontSize: "22px", animation: "scaleIn 0.5s ease infinite alternate" }}>♟</span>
                <div>
                  <h2 className="" style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)" }}>Analysing your games</h2>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>This may take a few minutes</p>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                    {gamesTotal > 0 ? `Game ${gamesAnalyzed} of ${gamesTotal}` : "Queuing games..."}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-mono)" }}>{progress}%</span>
                </div>

                <div style={{ height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    background: "linear-gradient(to right, var(--green-muted), var(--green))",
                    width: `${progress}%`,
                    borderRadius: "3px",
                    transition: "width 0.3s ease-out",
                  }} />
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-mono)", height: "16px" }}>
                <span style={{ color: "var(--green)", fontSize: "8px" }}>●</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{MESSAGES[msgIdx]}</span>
              </div>

              <div style={{ marginTop: "24px", display: "flex", justifyContent: "center", gap: "10px", fontSize: "20px", userSelect: "none" }}>
                {["♜","♞","♝","♛","♚","♝","♞","♜"].map((p, i) => (
                  <span
                    key={i}
                    style={{
                      color: i < Math.round((progress / 100) * 8) ? "var(--green-muted)" : "var(--border-strong)",
                      transition: `color 0.4s ${i * 80}ms`,
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* DONE PHASE */}
          {phase === "done" && (
            <div style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <span style={{ fontSize: "22px" }}>♔</span>
                <div>
                  <h2 className="" style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)" }}>
                    {alreadyUpToDate ? "Already up to date" : "Analysis complete"}
                  </h2>
                  <p style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                    {alreadyUpToDate
                      ? `${gamesAnalyzed} game${gamesAnalyzed !== 1 ? "s" : ""} already analyzed`
                      : `${gamesAnalyzed} game${gamesAnalyzed !== 1 ? "s" : ""} analysed`}
                  </p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: alreadyUpToDate ? "1fr" : "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px", textAlign: "center" }}>
                  <div className="" style={{ fontSize: "28px", fontWeight: 700, color: "var(--win)" }}>{gamesAnalyzed}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>Games analysed</div>
                </div>
                {!alreadyUpToDate && (
                  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px", textAlign: "center" }}>
                    <div className="" style={{ fontSize: "28px", fontWeight: 700, color: "var(--loss)" }}>{totalBlunders}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>Blunders found</div>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  onClose(analysisRan);
                  if (totalBlunders > 0) {
                    router.push(`/player/${encodeURIComponent(username)}/puzzles`);
                  }
                }}
                className="btn-gold"
                style={{ width: "100%", padding: "11px 16px", borderRadius: "10px", fontSize: "13px", border: "none", cursor: "pointer" }}
              >
                {totalBlunders > 0 ? "View Puzzle Recommendations →" : "Done"}
              </button>

              {failedCount > 0 && (
                <button
                  onClick={() => handleAnalyze(selectedCount ?? "all", true)}
                  style={{
                    width: "100%",
                    marginTop: "8px",
                    padding: "9px 16px",
                    background: "var(--loss-dim)",
                    border: "1px solid rgba(202,52,49,0.3)",
                    borderRadius: "10px",
                    color: "var(--loss)",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {failedCount} game{failedCount !== 1 ? "s" : ""} failed — Retry?
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
