"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface AnalysisResult {
  status: "complete" | "partial" | "already_complete";
  message: string;
  analyzed: number;
  remaining: number;
  totalBlunders: number;
}

interface AnalysisDialogProps {
  username: string;
  months: number;
  onAnalyze: (gameCount: 10 | 20 | 50 | "all") => Promise<AnalysisResult>;
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
  { count: 10, label: "10 games", est: 35 },
  { count: 20, label: "20 games", est: 70 },
  { count: 50, label: "50 games", est: 175 },
  { count: "all", label: "All games this period", est: 200 },
] as const;

export default function AnalysisDialog({
  username,
  months,
  onAnalyze,
  onClose,
  isOpen,
}: AnalysisDialogProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("select");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState(0);          // 0-100
  const [gamesDone, setGamesDone] = useState(0);
  const [gamesTotal, setGamesTotal] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [selectedCount, setSelectedCount] = useState<10 | 20 | 50 | "all" | null>(null);

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const estimatedSecsRef = useRef(70);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setPhase("select");
        setError(null);
        setResult(null);
        setProgress(0);
        setGamesDone(0);
        setSelectedCount(null);
      }, 300);
    }
  }, [isOpen]);

  function startProgress(estSecs: number, total: number) {
    setProgress(0);
    setGamesDone(0);
    setGamesTotal(total);
    estimatedSecsRef.current = estSecs;

    const tickMs = 200;
    const targetPct = 88; // don't reach 100 until API returns
    const totalTicks = (estSecs * 1000) / tickMs;
    let tick = 0;

    progressRef.current = setInterval(() => {
      tick++;
      // Ease-out curve: fast start, slow near target
      const raw = tick / totalTicks;
      const eased = 1 - Math.pow(1 - raw, 2);
      const pct = Math.min(eased * targetPct, targetPct);
      setProgress(pct);
      setGamesDone(Math.min(Math.floor((pct / 100) * total), total - 1));
    }, tickMs);

    msgRef.current = setInterval(() => {
      setMsgIdx((i) => (i + 1) % MESSAGES.length);
    }, 2800);
  }

  function stopProgress(finalAnalyzed: number) {
    if (progressRef.current) clearInterval(progressRef.current);
    if (msgRef.current) clearInterval(msgRef.current);
    setProgress(100);
    setGamesDone(finalAnalyzed);
  }

  async function handleAnalyze(count: 10 | 20 | 50 | "all") {
    setSelectedCount(count);
    setError(null);
    setMsgIdx(0);

    const option = GAME_COUNTS.find((o) => o.count === count)!;
    const total = count === "all" ? 50 : count;
    setPhase("analyzing");
    startProgress(option.est, total);

    try {
      const res = await onAnalyze(count);
      stopProgress(res.analyzed);
      setResult(res);
      setPhase("done");
    } catch (err) {
      stopProgress(0);
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
                {GAME_COUNTS.map(({ count, label, est }) => (
                  <button
                    key={count}
                    onClick={() => handleAnalyze(count)}
                    className="w-full px-4 py-3 bg-[#262522] hover:bg-[#2f2d2a] text-left text-white rounded-xl transition-colors border border-[#3a3835] hover:border-[#81b64c]/40 group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-[#706e6b] group-hover:text-[#989795]">~{Math.round(est / 60)}–{Math.round(est / 60) + 1} min</span>
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
                  <p className="text-xs text-[#706e6b]">This may take a minute — hang tight</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm text-[#989795]">
                    {gamesTotal > 0
                      ? `Game ${Math.max(gamesDone, 0)} of ${gamesTotal}`
                      : "Starting up..."}
                  </span>
                  <span className="text-sm font-bold text-[#81b64c]">{Math.round(progress)}%</span>
                </div>

                {/* Chess-board track */}
                <div className="relative h-8 rounded-lg overflow-hidden" style={{
                  background: "repeating-linear-gradient(90deg, #2a2825 0px, #2a2825 20px, #232120 20px, #232120 40px)"
                }}>
                  {/* Green fill */}
                  <div
                    className="absolute inset-y-0 left-0 transition-all duration-200 rounded-lg"
                    style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, #5a8a2c, #81b64c)",
                    }}
                  />
                  {/* Pawn at leading edge */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-lg leading-none transition-all duration-200 drop-shadow-lg select-none"
                    style={{ left: `${Math.max(progress, 2)}%` }}
                  >
                    ♙
                  </div>
                  {/* Rank markers (chess squares aesthetic) */}
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
          {phase === "done" && result && (
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">♔</span>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {result.status === "already_complete" ? "Already up to date" : "Analysis complete"}
                  </h2>
                  <p className="text-xs text-[#706e6b]">{result.message}</p>
                </div>
              </div>

              {/* Stats */}
              {result.analyzed > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-[#262522] rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-[#81b64c]">{result.analyzed}</div>
                    <div className="text-xs text-[#706e6b] mt-0.5">Games analysed</div>
                  </div>
                  <div className="bg-[#262522] rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold text-[#ca3431]">{result.totalBlunders}</div>
                    <div className="text-xs text-[#706e6b] mt-0.5">Blunders found</div>
                  </div>
                </div>
              )}

              {/* Remaining */}
              {result.remaining > 0 && (
                <div className="bg-[#e6a117]/10 border border-[#e6a117]/30 rounded-xl p-3 mb-4 text-sm text-[#e6a117]">
                  {result.remaining} game{result.remaining !== 1 ? "s" : ""} still pending — click below to continue.
                </div>
              )}

              <div className="space-y-2">
                {result.remaining > 0 && (
                  <button
                    onClick={() => handleAnalyze(selectedCount ?? 20)}
                    className="w-full px-4 py-2.5 bg-[#81b64c] hover:bg-[#96bc4b] text-white font-bold rounded-xl transition-colors text-sm"
                  >
                    Analyse {result.remaining} more
                  </button>
                )}
                <button
                  onClick={() => {
                    onClose();
                    if (result.totalBlunders > 0) {
                      router.push(`/player/${encodeURIComponent(username)}/puzzles`);
                    }
                  }}
                  className="w-full px-4 py-2.5 bg-[#262522] hover:bg-[#2f2d2a] text-white rounded-xl transition-colors text-sm border border-[#3a3835]"
                >
                  {result.totalBlunders > 0 ? "View Puzzle Recommendations →" : "Done"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
