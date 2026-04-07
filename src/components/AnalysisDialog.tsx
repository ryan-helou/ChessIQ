"use client";

import { useState } from "react";

interface AnalysisDialogProps {
  months: number;
  onAnalyze: (gameCount: 10 | 20 | 50 | "all") => Promise<void>;
  onClose: () => void;
  isOpen: boolean;
}

export default function AnalysisDialog({
  months,
  onAnalyze,
  onClose,
  isOpen,
}: AnalysisDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const options = [
    { count: 10, label: "Last 10 games" },
    { count: 20, label: "Last 20 games" },
    { count: 50, label: "Last 50 games" },
    { count: "all", label: "All games this period" },
  ] as const;

  const handleAnalyze = async (count: (typeof options)[number]["count"]) => {
    setLoading(true);
    setError(null);
    try {
      await onAnalyze(count);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      ></div>

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-[#1a1916] border border-[#3a3835] rounded-xl p-6 max-w-sm w-full">
          <h2 className="text-lg font-bold text-white mb-2">
            Analyze Games
          </h2>
          <p className="text-sm text-[#989795] mb-6">
            How many games from the last {months} month{months > 1 ? "s" : ""} would you like to analyze with Stockfish?
          </p>

          {error && (
            <div className="bg-[#ca3431]/20 border border-[#ca3431] rounded-lg p-3 mb-4 text-sm text-[#ff9999]">
              {error}
            </div>
          )}

          <div className="space-y-2 mb-6">
            {options.map(({ count, label }) => (
              <button
                key={count}
                onClick={() => handleAnalyze(count)}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-[#262522] hover:bg-[#3a3835] disabled:opacity-50 disabled:cursor-not-allowed text-left text-white rounded-lg transition-colors border border-[#3a3835]"
              >
                {loading ? (
                  <span className="inline-block">⏳ Queuing...</span>
                ) : (
                  label
                )}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="w-full px-4 py-2 bg-[#81b64c] hover:bg-[#96bc4b] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
          >
            Cancel
          </button>

          <p className="text-xs text-[#706e6b] mt-4 text-center">
            Note: Analysis runs in the background. You can navigate away from this page.
          </p>
        </div>
      </div>
    </>
  );
}
