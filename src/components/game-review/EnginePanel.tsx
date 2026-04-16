"use client";

import type { EngineLine } from "@/hooks/useEngineStream";

interface EnginePanelProps {
  lines: EngineLine[];
  depth: number;
  status: "idle" | "streaming" | "done" | "error";
  sideToMove: "w" | "b";
  onPlayLine?: (lineIndex: number, moveIndex: number) => void;
}

function formatEval(
  scoreCp: number | null,
  mate: number | null,
  sideToMove: "w" | "b"
): { text: string; isPositive: boolean } {
  if (mate !== null) {
    // mate is from side-to-move POV; display from White's POV
    const mateFromWhite = sideToMove === "b" ? -mate : mate;
    const abs = Math.abs(mateFromWhite);
    return {
      text: `${mateFromWhite > 0 ? "+" : "-"}M${abs}`,
      isPositive: mateFromWhite > 0,
    };
  }
  if (scoreCp === null) return { text: "0.00", isPositive: true };
  // scoreCp is from side-to-move POV; negate if black to move to get White's POV
  const cpFromWhite = sideToMove === "b" ? -scoreCp : scoreCp;
  const pawns = cpFromWhite / 100;
  return {
    text: `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`,
    isPositive: pawns >= 0,
  };
}

function getMoveNumbering(
  sideToMove: "w" | "b",
  pvIndex: number
): { number: number; suffix: string } | null {
  // First move inherits the current side to move
  const isBlackMove = (sideToMove === "b" && pvIndex % 2 === 0) ||
                      (sideToMove === "w" && pvIndex % 2 === 1);
  // We don't do full move numbering here; caller handles display
  return null; // numbering handled inline below
}

export default function EnginePanel({
  lines,
  depth,
  status,
  sideToMove,
  onPlayLine,
}: EnginePanelProps) {
  const displayLines = lines.slice(0, 3);

  // Build move text with numbering for a PV line
  function renderPv(san: string[]): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    // We don't know the absolute move number, but we know side to move.
    // Convention: if white to move, first move is "1." style; if black, "1..." style.
    // We'll just show relative numbering starting from 1.
    let moveNum = 1;
    let isBlack = sideToMove === "b";

    // If black to move, first "move number" gets "..."
    if (isBlack) {
      nodes.push(
        <span key="num-0" style={{ color: "var(--text-3)", fontSize: 11 }}>
          {moveNum}...{" "}
        </span>
      );
    }

    const maxMoves = Math.min(san.length, 10);
    for (let i = 0; i < maxMoves; i++) {
      if (!isBlack) {
        nodes.push(
          <span key={`num-${i}`} style={{ color: "var(--text-3)", fontSize: 11 }}>
            {moveNum}.{" "}
          </span>
        );
      }

      nodes.push(
        <span
          key={`mv-${i}`}
          style={{
            color: "var(--text-1)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
            cursor: onPlayLine ? "pointer" : "default",
            marginRight: 3,
          }}
        >
          {san[i]}
        </span>
      );

      if (isBlack) {
        moveNum++;
      }
      isBlack = !isBlack;
    }

    if (san.length > maxMoves) {
      nodes.push(
        <span key="ellipsis" style={{ color: "var(--text-3)", fontSize: 11 }}>
          ...
        </span>
      );
    }

    return nodes;
  }

  return (
    <div
      style={{
        background: "var(--surface-2, var(--bg-surface))",
        borderBottom: "1px solid var(--border)",
        padding: "6px 12px",
        flexShrink: 0,
      }}
    >
      {/* Header: depth + analyzing indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: displayLines.length > 0 ? 4 : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-3)",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Engine
          </span>
          {depth > 0 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--text-3)",
                fontFamily: "var(--font-mono)",
              }}
            >
              depth {depth}
            </span>
          )}
        </div>
        {status === "streaming" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--accent, var(--green))",
                display: "inline-block",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
            <span style={{ fontSize: 10, color: "var(--text-3)" }}>analyzing</span>
          </div>
        )}
      </div>

      {/* Engine lines */}
      {displayLines.length === 0 && status !== "idle" && (
        <div style={{ fontSize: 11, color: "var(--text-3)", padding: "2px 0" }}>
          Waiting for engine...
        </div>
      )}

      {displayLines.map((line, idx) => {
        const evalInfo = formatEval(line.scoreCp, line.mate, sideToMove);
        return (
          <div
            key={idx}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "3px 0",
              borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}
          >
            {/* Eval badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 52,
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
                background: evalInfo.isPositive
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(30,30,30,0.9)",
                color: evalInfo.isPositive ? "#1a1a1a" : "#e0e0e0",
                lineHeight: 1.4,
              }}
            >
              {evalInfo.text}
            </span>

            {/* PV moves */}
            <div
              style={{
                flex: 1,
                lineHeight: 1.6,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {renderPv(line.san)}
            </div>
          </div>
        );
      })}

      {/* Pulse animation keyframes */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
