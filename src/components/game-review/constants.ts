import type { MoveClassification } from "@/lib/backend-api";

export interface ClassInfo {
  label: string;
  color: string; // text color class
  bg: string; // circle bg color (hex)
  icon: string; // fallback text
  img?: string; // path to image asset
}

export const CLASSIFICATIONS: { key: MoveClassification; info: ClassInfo }[] = [
  { key: "brilliant",  info: { label: "Brilliant",  color: "text-[#26c9c3]", bg: "#26c9c3", icon: "!!", img: "/Chess Symbols/brilliant.gif" } },
  { key: "great",      info: { label: "Great",      color: "text-[#5b8bb4]", bg: "#5b8bb4", icon: "!",  img: "/Chess Symbols/great.png" } },
  { key: "best",       info: { label: "Best",       color: "text-[var(--win)]", bg: "#52c07a", icon: "★",  img: "/Chess Symbols/best.gif" } },
  { key: "excellent",  info: { label: "Excellent",  color: "text-[#5eba3a]", bg: "#5eba3a", icon: "👍", img: "/Chess Symbols/excellent.gif" } },
  { key: "good",       info: { label: "Good",       color: "text-[#88bf40]", bg: "#88bf40", icon: "✓",  img: "/Chess Symbols/good.gif" } },
  { key: "book",       info: { label: "Book",       color: "text-[#b09860]", bg: "#b09860", icon: "📖", img: "/Chess Symbols/book.jpeg" } },
  { key: "inaccuracy", info: { label: "Inaccuracy", color: "text-[#f6c700]", bg: "#f6c700", icon: "?!", img: "/Chess Symbols/inacuracy.png" } },
  { key: "mistake",    info: { label: "Mistake",    color: "text-[#e28c28]", bg: "#e28c28", icon: "?",  img: "/Chess Symbols/mistake.png" } },
  { key: "miss",       info: { label: "Miss",       color: "text-[#e26b50]", bg: "#e26b50", icon: "✕",  img: "/Chess Symbols/miss.png" } },
  { key: "blunder",    info: { label: "Blunder",    color: "text-[var(--loss)]", bg: "#ca3431", icon: "??", img: "/Chess Symbols/blunder.png" } },
  { key: "forced",     info: { label: "Forced",     color: "text-[var(--text-2)]", bg: "#888888", icon: "→" } },
];

export const CLASSIFICATION_LABELS: Record<MoveClassification, ClassInfo> = Object.fromEntries(
  CLASSIFICATIONS.map((c) => [c.key, c.info])
) as Record<MoveClassification, ClassInfo>;
