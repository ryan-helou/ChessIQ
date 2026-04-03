"use client";

interface Props {
  eval_: number; // centipawns
  mate: number | null;
}

export default function EvalBar({ eval_, mate }: Props) {
  // Convert eval to white win percentage for the bar
  let whitePercent: number;
  if (mate !== null) {
    whitePercent = mate > 0 ? 100 : 0;
  } else {
    // Sigmoid-like mapping: ±500cp maps to roughly 10-90%
    whitePercent = 50 + 50 * (2 / (1 + Math.exp(-eval_ / 200)) - 1);
    whitePercent = Math.max(2, Math.min(98, whitePercent));
  }

  // Format eval text
  let evalText: string;
  if (mate !== null) {
    evalText = `M${Math.abs(mate)}`;
  } else {
    const pawns = Math.abs(eval_) / 100;
    evalText = pawns < 10 ? pawns.toFixed(1) : Math.round(pawns).toString();
    if (eval_ > 0) evalText = `+${evalText}`;
    else if (eval_ < 0) evalText = `-${evalText}`;
    else evalText = "0.0";
  }

  const isWhiteAdvantage = mate !== null ? mate > 0 : eval_ >= 0;

  return (
    <div className="flex flex-col items-center w-8 h-full rounded overflow-hidden bg-slate-900 border border-slate-700/50 select-none">
      {/* Black portion (top) */}
      <div
        className="w-full bg-slate-800 transition-all duration-500 ease-out"
        style={{ height: `${100 - whitePercent}%` }}
      />
      {/* White portion (bottom) */}
      <div
        className="w-full bg-slate-100 transition-all duration-500 ease-out relative"
        style={{ height: `${whitePercent}%` }}
      />
      {/* Eval text */}
      <div
        className={`absolute text-[10px] font-bold tracking-tight ${
          isWhiteAdvantage
            ? "bottom-1 text-slate-800"
            : "top-1 text-slate-300"
        }`}
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        {evalText}
      </div>
    </div>
  );
}
