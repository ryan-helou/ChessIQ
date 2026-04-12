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
  brilliant: "text-[#26c9c3] bg-[#26c9c3]/10",
  great: "text-[#5b8bb4] bg-[#5b8bb4]/10",
  best: "text-[var(--win)] bg-[var(--win)]/10",
  excellent: "text-[#5eba3a] bg-[#5eba3a]/10",
  good: "text-[#88bf40] bg-[#88bf40]/10",
  inaccuracy: "text-[#dbac18] bg-[#dbac18]/10",
  mistake: "text-[#e28c28] bg-[#e28c28]/10",
  blunder: "text-[var(--loss)] bg-[var(--loss)]/15",
  miss: "text-[#e26b50] bg-[#e26b50]/10",
  forced: "text-[#9896b4] bg-[#524f68]/10",
  book: "text-[#b09860] bg-[#b09860]/10",
};

const CLASSIFICATION_ICONS: Record<MoveClassification, string> = {
  brilliant: "!!",
  great: "!",
  best: "★",
  excellent: "👍",
  good: "✓",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  miss: "✕",
  forced: "→",
  book: "📖",
};

const CLASSIFICATION_IMGS: Partial<Record<MoveClassification, string>> = {
  brilliant: "/Chess Symbols/brilliant.gif",
  great:     "/Chess Symbols/great.png",
  best:      "/Chess Symbols/best.gif",
  excellent: "/Chess Symbols/excellent.gif",
  good:      "/Chess Symbols/good.gif",
  book:      "/Chess Symbols/book.jpeg",
  inaccuracy:"/Chess Symbols/inacuracy.png",
  mistake:   "/Chess Symbols/mistake.png",
  miss:      "/Chess Symbols/miss.png",
  blunder:   "/Chess Symbols/blunder.png",
};

const CLASSIFICATION_CIRCLE_BG: Record<MoveClassification, string> = {
  brilliant: "#26c9c3",
  great: "#5b8bb4",
  best: "#52c07a",
  excellent: "#5eba3a",
  good: "#88bf40",
  inaccuracy: "#dbac18",
  mistake: "#e28c28",
  blunder: "#e05555",
  miss: "#e26b50",
  forced: "#888888",
  book: "#b09860",
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
    const img = CLASSIFICATION_IMGS[move.classification];
    const circleBg = CLASSIFICATION_CIRCLE_BG[move.classification];

    return (
      <button
        ref={isActive ? activeRef : undefined}
        onClick={() => onMoveClick(index)}
        className={`flex items-center gap-1 px-1.5 py-1 rounded text-sm font-mono transition-all ${colors} ${
          isActive
            ? "ring-2 ring-[#d4a84b] ring-offset-1 ring-offset-[#13121c] font-bold"
            : "hover:brightness-125"
        }`}
      >
        {move.san}
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={icon} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : icon ? (
          <span
            className="inline-flex items-center justify-center rounded-full text-white font-bold leading-none shrink-0"
            style={{
              backgroundColor: circleBg,
              width: "16px",
              height: "16px",
              fontSize: "9px",
            }}
          >
            {icon}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="overflow-y-auto h-full scrollbar-hide">
      {pairs.map((pair) => (
        <div
          key={pair.number}
          className="flex items-center gap-0.5"
        >
          <span className="w-7 text-right text-[#4a4845] text-xs font-mono shrink-0 pr-1">
            {pair.number}.
          </span>
          <div className="flex-1 min-w-0">
            {pair.white && <MoveButton move={pair.white} index={pair.whiteIdx} />}
          </div>
          <div className="flex-1 min-w-0">
            {pair.black && <MoveButton move={pair.black} index={pair.blackIdx} />}
          </div>
        </div>
      ))}
    </div>
  );
}
