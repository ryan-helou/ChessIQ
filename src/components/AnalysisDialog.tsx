"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface AnalysisDialogProps {
  username: string;
  months: number;
  onClose: () => void;
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

  const abortRef = useRef<AbortController | null>(null);
  const msgRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when closed
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
      }, 300);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (msgRef.current) clearInterval(msgRef.current);
    };
  }, []);

  async function handleAnalyze(count: 10 | 20 | 50 | "all") {
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
      // Step 1: Queue all games
      const queueRes = await fetch(`/api/games/${encodeURIComponent(username)}/analyze-queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months, gameCount: count }),
        signal: abortRef.current.signal,
      });

      if (!queueRes.ok) {
        let msg = "Failed to queue games for analysis.";
        try { const err = await queueRes.json(); msg = err.error || msg; } catch {}
        throw new Error(msg);
      }

      const queueData = await queueRes.json();
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

      // Step 2: Loop analyze-next until done
      let analyzed = alreadyDone;
      let blunders = 0;

      while (true) {
        if (abortRef.current?.signal.aborted) break;

        const nextRes = await fetch(`/api/games/${encodeURIComponent(username)}/analyze-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ depth: 14 }),
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
      <div className="fixed inset-0 bg-black/60 z-40" onClick={phase === "select" ? onClose : undefined} />

      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-[#1a1916] border border-[#3a3835] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">

          {/* ── PHASE: SELECT ── */}
          {phase === "select" && (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">♟</span>
                <h2 className="text-lg font-bold text-white">Analyze Games</h2>
              </div>
              <p className="text-sm text-[#989795] mb-6">
                Choose how many games from the last {months} month{months !== 1 ? "s" : ""} to analyse with Stockfish. Blunders and tactical themes are saved for your puzzle recommendations.
              </p>

              {error && (
                <div className="bg-[#ca3431]/20 border border-[#ca3431] rounded-lg p-3 mb-4 text-sm text-[#ff9999]">
                  {error}
                </div>
              )}

              <div className="space-y-2 mb-4">
                {GAME_COUNTS.map(({ count, label }) => (
                  <button
                    key={count}
                    onClick={() => handleAnalyze(count)}
                    className="w-full px-4 py-3 bg-[#262522] hover:bg-[#2f2d2a] text-left text-white rounded-xl transition-colors border border-[#3a3835] hover:border-[#81b64c]/40 group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{label}</span>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-[#706e6b] hover:text-[#989795] text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── PHASE: ANALYZING ── */}
          {phase === "analyzing" && (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl animate-bounce">♟</span>
                <div>
                  <h2 className="text-base font-bold text-white">Analysing your games</h2>
                  <p className="text-xs text-[#706e6b]">This may take a few minutes — hang tight</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm text-[#989795]">
                    {gamesTotal > 0
                      ? `Game ${gamesAnalyzed} of ${gamesTotal}`
                      : "Queuing games..."}
                  </span>
                  <span className="text-sm font-bold text-[#81b64c]">{progress}%</span>
                </div>

                {/* Chess-board track */}
                <div className="relative h-8 rounded-lg overflow-hidden" style={{
                  background: "repeating-linear-gradient(90deg, #2a2825 0px, #2a2825 20px, #232120 20px, #232120 40px)"
                }}>
                  {/* Green fill */}
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-300 rounded-lg"
                    style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, #5a8a2c, #81b64c)",
                    }}
                  />
                  {/* Pawn at leading edge */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-lg leading-none transition-all duration-300 drop-shadow-lg select-none"
                    style={{ left: `${Math.max(progress, 2)}%` }}
                  >
                    ♙
                  </div>
                  {/* Rank markers */}
                  {[1,2,3,4,5,6,7].map((i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 w-px bg-white/5"
                      style={{ left: `${i * 12.5}%` }}
                    />
                  ))}
                </div>
              </div>

              {/* Animated message */}
              <div className="flex items-center gap-2 text-sm text-[#989795] h-5">
                <span className="text-[#81b64c] text-xs">●</span>
                <span className="truncate">{MESSAGES[msgIdx]}</span>
              </div>

              {/* Chess decoration */}
              <div className="mt-6 flex justify-center gap-3 text-[#3a3835] text-2xl select-none">
                {["♜","♞","♝","♛","♚","♝","♞","♜"].map((p, i) => (
                  <span
                    key={i}
                    className="transition-colors"
                    style={{
                      color: i < Math.round((progress / 100) * 8) ? "#4a6a2a" : "#3a3835",
                      transitionDelay: `${i * 80}ms`,
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── PHASE: DONE ── */}
          {phase === "done" && (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">♔</span>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {alreadyUpToDate ? "Already up to date" : "Analysis complete"}
                  </h2>
                  <p className="text-xs text-[#706e6b]">
                    {alreadyUpToDate
                      ? `${gamesAnalyzed} game${gamesAnalyzed !== 1 ? "s" : ""} already analyzed`
                      : `${gamesAnalyzed} game${gamesAnalyzed !== 1 ? "s" : ""} analysed`}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className={`grid gap-3 mb-5 ${alreadyUpToDate ? "grid-cols-1" : "grid-cols-2"}`}>
                <div className="bg-[#262522] rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-[#81b64c]">{gamesAnalyzed}</div>
                  <div className="text-xs text-[#706e6b] mt-0.5">Games analysed</div>
                </div>
                {!alreadyUpToDate && (
                  <div className="bg-[#262522] rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-[#ca3431]">{totalBlunders}</div>
                    <div className="text-xs text-[#706e6b] mt-0.5">Blunders found</div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    onClose();
                    if (totalBlunders > 0) {
                      router.push(`/player/${encodeURIComponent(username)}/puzzles`);
                    }
                  }}
                  className="w-full px-4 py-2.5 bg-[#262522] hover:bg-[#2f2d2a] text-white rounded-xl transition-colors text-sm border border-[#3a3835]"
                >
                  {totalBlunders > 0 ? "View Puzzle Recommendations →" : "Done"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
