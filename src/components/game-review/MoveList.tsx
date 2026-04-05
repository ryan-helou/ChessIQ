"use client";

import { useRef, useEffect } from "react";

type MoveClassification =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "miss"
  | "forced"
  | "book";

interface AnalyzedMove {
  moveNumber: number;
  move: string;
  san: string;
  fen: string;
  bestMove: string;
  engineEval: number;
  accuracy: number;
  isBlunder: boolean;
  isMistake: boolean;
  isInaccuracy: boolean;
  classification: MoveClassification;
}

interface Props {
  moves: AnalyzedMove[];
  currentMoveIndex: number;
  onMoveClick: (index: number) => void;
}

const CLASSIFICATION_COLORS: Record<MoveClassification, string> = {
  brilliant: "text-cyan-400 bg-cyan-500/10",
  great: "text-blue-400 bg-blue-500/10",
  best: "text-emerald-400 bg-emerald-500/10",
  excellent: "text-emerald-300 bg-emerald-500/5",
  good: "text-[#989795] bg-transparent",
  inaccuracy: "text-yellow-400 bg-yellow-500/10",
  mistake: "text-orange-400 bg-orange-500/10",
  blunder: "text-red-400 bg-red-500/15",
  miss: "text-amber-400 bg-amber-500/10",
  forced: "text-[#989795] bg-[#706e6b]/10",
  book: "text-violet-400 bg-violet-500/10",
};

const CLASSIFICATION_ICONS: Record<MoveClassification, string> = {
  brilliant: "!!",
  great: "!",
  best: "★",
  excellent: "",
  good: "",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  miss: "⊘",
  forced: "→",
  book: "📖",
};

export default function MoveList({ moves, currentMoveIndex, onMoveClick }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentMoveIndex]);

  // Group moves into pairs (white + black)
  const pairs: { number: number; white?: AnalyzedMove; black?: AnalyzedMove; whiteIdx: number; blackIdx: number }[] = [];

  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
      whiteIdx: i,
      blackIdx: i + 1,
    });
  }

  const MoveButton = ({
    move,
    index,
  }: {
    move: AnalyzedMove;
    index: number;
  }) => {
    const isActive = index === currentMoveIndex;
    const colors = CLASSIFICATION_COLORS[move.classification];
    const icon = CLASSIFICATION_ICONS[move.classification];

    return (
      <button
        ref={isActive ? activeRef : undefined}
        onClick={() => onMoveClick(index)}
        className={`px-1.5 py-1 rounded text-sm font-mono transition-all ${colors} ${
          isActive
            ? "ring-2 ring-[#81b64c] ring-offset-1 ring-offset-[#262522] font-bold"
            : "hover:brightness-125"
        }`}
      >
        {move.san}
        {icon && <span className="text-[10px] ml-0.5">{icon}</span>}
      </button>
    );
  };

  return (
    <div className="overflow-y-auto max-h-[500px] scrollbar-hide">
      <div className="space-y-0.5">
        {pairs.map((pair) => (
          <div
            key={pair.number}
            className="flex items-center gap-1 text-sm"
          >
            <span className="w-8 text-right text-[#706e6b] text-xs font-mono shrink-0">
              {pair.number}.
            </span>
            <div className="flex-1 min-w-0">
              {pair.white && (
                <MoveButton move={pair.white} index={pair.whiteIdx} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {pair.black && (
                <MoveButton move={pair.black} index={pair.blackIdx} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
