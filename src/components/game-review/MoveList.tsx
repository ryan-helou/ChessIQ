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

// Classifications that get a visible icon badge
const CLASSIFICATION_IMGS: Partial<Record<MoveClassification, string>> = {
  brilliant: "/Chess Symbols/brilliant.gif",
  great:     "/Chess Symbols/great.png",
  best:      "/Chess Symbols/best.gif",
  book:      "/Chess Symbols/book.jpeg",
  inaccuracy:"/Chess Symbols/inacuracy.png",
  mistake:   "/Chess Symbols/mistake.png",
  miss:      "/Chess Symbols/miss.png",
  blunder:   "/Chess Symbols/blunder.png",
};

const CLASSIFICATION_CIRCLE_BG: Partial<Record<MoveClassification, string>> = {
  brilliant: "#26c9c3",
  great:     "#5b8bb4",
  best:      "#52c07a",
  book:      "#b09860",
  inaccuracy:"#f6c700",
  mistake:   "#e28c28",
  blunder:   "#ca3431",
  miss:      "#e26b50",
};

const CLASSIFICATION_ICON_TEXT: Partial<Record<MoveClassification, string>> = {
  brilliant: "!!",
  great:     "!",
  best:      "★",
  book:      "📖",
  inaccuracy:"?!",
  mistake:   "?",
  blunder:   "??",
  miss:      "✕",
};

// Derive piece key (for neo piece images) from SAN + color
function getPieceKey(san: string, color: "w" | "b"): string {
  if (san.startsWith("O")) return `${color}K`; // castling
  const first = san[0];
  if (first === "N") return `${color}N`;
  if (first === "B") return `${color}B`;
  if (first === "R") return `${color}R`;
  if (first === "Q") return `${color}Q`;
  if (first === "K") return `${color}K`;
  return `${color}P`; // pawn
}

function PieceIcon({ pieceKey }: { pieceKey: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.chess.com/chess-themes/pieces/neo/150/${pieceKey.toLowerCase()}.png`}
      alt={pieceKey}
      draggable={false}
      style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0 }}
    />
  );
}

export default function MoveList({ moves, currentMoveIndex, onMoveClick }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentMoveIndex]);

  // Group into pairs
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

  const MoveCell = ({ move, index, color }: { move: AnalyzedMove; index: number; color: "w" | "b" }) => {
    const isActive = index === currentMoveIndex;
    const img = CLASSIFICATION_IMGS[move.classification];
    const circleBg = CLASSIFICATION_CIRCLE_BG[move.classification];
    const iconText = CLASSIFICATION_ICON_TEXT[move.classification];
    const hasIcon = !!img || !!circleBg;
    const pieceKey = getPieceKey(move.san, color);

    return (
      <button
        ref={isActive ? activeRef : undefined}
        onClick={() => onMoveClick(index)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          width: "100%",
          padding: "3px 6px",
          borderRadius: 4,
          background: isActive ? "rgba(129,182,76,0.15)" : "transparent",
          border: isActive ? "1px solid rgba(129,182,76,0.35)" : "1px solid transparent",
          cursor: "pointer",
          transition: "background 0.12s",
          minWidth: 0,
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        {/* Classification icon — fixed width slot so text aligns */}
        <span style={{ width: 16, height: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hasIcon && (
            img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={move.classification} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: circleBg,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 8,
                  width: 16,
                  height: 16,
                  lineHeight: 1,
                  letterSpacing: "-0.5px",
                }}
              >
                {iconText}
              </span>
            )
          )}
        </span>

        {/* Piece icon */}
        <PieceIcon pieceKey={pieceKey} />

        {/* Move text */}
        <span
          style={{
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            fontWeight: isActive ? 700 : 500,
            color: isActive ? "var(--text-1)" : "var(--text-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {move.san}
        </span>
      </button>
    );
  };

  return (
    <div style={{ overflowY: "auto", height: "100%", padding: "2px 0" }} className="scrollbar-hide">
      {pairs.map((pair) => (
        <div
          key={pair.number}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, padding: "1px 4px" }}
        >
          <div>{pair.white && <MoveCell move={pair.white} index={pair.whiteIdx} color="w" />}</div>
          <div>{pair.black && <MoveCell move={pair.black} index={pair.blackIdx} color="b" />}</div>
        </div>
      ))}
    </div>
  );
}
