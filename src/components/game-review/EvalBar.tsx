"use client";

interface Props {
  eval_: number; // centipawns
  mate: number | null;
}

export default function EvalBar({ eval_, mate }: Props) {
  // Convert eval to white win percentage for the bar
  let whitePercent: number;
  if (mate !== null) {
    whitePercent = mate > 0 ? 95 : 5;
  } else {
    // Sigmoid-like mapping: ±500cp maps to roughly 10-90%
    whitePercent = 50 + 50 * (2 / (1 + Math.exp(-eval_ / 200)) - 1);
    whitePercent = Math.max(5, Math.min(95, whitePercent));
  }

  // Format eval text — short, like Chess.com
  let evalText: string;
  if (mate !== null) {
    evalText = `M${Math.abs(mate)}`;
  } else {
    const pawns = Math.abs(eval_) / 100;
    evalText = pawns < 10 ? pawns.toFixed(1) : Math.round(pawns).toString();
  }

  const isWhiteAdvantage = mate !== null ? mate > 0 : eval_ >= 0;

  return (
    <div className="flex flex-col w-full h-full rounded-sm overflow-hidden select-none relative">
      {/* Black portion (top) */}
      <div
        className="w-full bg-[#262522] transition-all duration-500 ease-out"
        style={{ height: `${100 - whitePercent}%` }}
      />
      {/* White portion (bottom) */}
      <div
        className="w-full bg-[#f0ede4] transition-all duration-500 ease-out"
        style={{ height: `${whitePercent}%` }}
      />
      {/* Eval text: top of bar when black leads, bottom when white leads */}
      <span
        className={`absolute left-0 right-0 text-center text-[9px] font-bold leading-none ${
          isWhiteAdvantage
            ? "bottom-0.5 text-[#262522]"
            : "top-0.5 text-[#b0aea8]"
        }`}
      >
        {evalText}
      </span>
    </div>
  );
}
