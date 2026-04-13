"use client";

import { useState, useEffect, useRef } from "react";

// ── Rotating messages ──────────────────────────────────────────────────────
const MESSAGE_SETS: Record<string, string[]> = {
  default: [
    "Counting how many times you hung your queen…",
    "Consulting Magnus (he's disappointed)…",
    "Locating all the pieces you left hanging…",
    "Calculating your blunder-to-brilliancy ratio…",
    "Asking Stockfish to be gentle with you…",
    "Measuring the distance between your king and safety…",
    "Your opponent is studying theory right now…",
    "Discovering you played e4 e5 Qh5…",
    "Tallying your \"I had it won\" moments…",
    "Preparing your post-game excuses…",
    "Converting pawns to insights (slowly)…",
    "Stockfish is sobbing quietly…",
    "Recounting your en passant trauma…",
    "Summoning the ghost of your rating…",
    "Analyzing 47 consecutive pawn moves…",
  ],
  puzzle: [
    "Finding puzzles you'll definitely get wrong…",
    "Selecting tactics you've missed before…",
    "Curating your personal blunder museum…",
    "Generating fork-avoidance practice…",
    "Building your pin-detection curriculum…",
    "Stockfish recommends these humbling exercises…",
    "Loading positions your past self failed…",
    "Preparing precisely calibrated suffering…",
  ],
  review: [
    "Rewinding to the moment it all fell apart…",
    "Identifying your worst move (there were many)…",
    "Building your personal blunder timeline…",
    "Locating the moment you \"had it won\"…",
    "Annotating your optimistic sacrifices…",
    "Timestamping each critical mistake…",
    "Summoning the position where it went wrong…",
    "Loading the crime scene…",
  ],
};

// ── Knight tour path (48 squares for smooth looping) ──────────────────────
const KNIGHT_TOUR = [
  0,10,25,19,4,14,31,21,6,16,33,27,12,2,17,35,
  20,5,15,30,44,29,39,24,9,3,18,28,43,37,22,32,
  47,41,26,36,51,45,34,40,55,49,38,48,63,53,42,52,
];

// ── Piece symbols cycling in header ───────────────────────────────────────
const PIECES = ["♟", "♞", "♝", "♜", "♛", "♚", "♙", "♘", "♗", "♖", "♕", "♔"];

// ── Mini animated board ────────────────────────────────────────────────────
function AnimatedBoard() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [trail, setTrail] = useState<number[]>([]);
  const stepRef = useRef(0);

  useEffect(() => {
    const iv = setInterval(() => {
      const sq = KNIGHT_TOUR[stepRef.current % KNIGHT_TOUR.length];
      setActiveIdx(sq);
      setTrail((prev) => [...prev.slice(-7), sq]);
      stepRef.current++;
    }, 320);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        width: "220px",
        height: "220px",
        borderRadius: "10px",
        overflow: "hidden",
        border: "2px solid var(--border-strong)",
        boxShadow: "0 0 0 1px var(--border), 0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(129,182,76,0.08)",
        position: "relative",
      }}
    >
      {Array.from({ length: 64 }).map((_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isLight = (row + col) % 2 === 0;
        const isActive = i === activeIdx;
        const trailPos = trail.lastIndexOf(i);
        const isTrail = trailPos !== -1 && !isActive;
        const trailStrength = trailPos / trail.length; // 0 = oldest, 1 = newest

        let bg = isLight ? "#3d3b38" : "#2a2826";
        if (isActive) {
          bg = "var(--green)";
        } else if (isTrail) {
          const alpha = 0.08 + trailStrength * 0.28;
          bg = `rgba(129,182,76,${alpha})`;
        }

        return (
          <div
            key={i}
            style={{
              background: bg,
              transition: "background 0.22s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {isActive && (
              <span
                style={{
                  fontSize: "14px",
                  lineHeight: 1,
                  filter: "drop-shadow(0 0 4px rgba(0,0,0,0.6))",
                  animation: "chessPiecePop 0.22s ease",
                }}
              >
                ♞
              </span>
            )}
            {isTrail && (
              <div
                style={{
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: `rgba(129,182,76,${0.3 + trailStrength * 0.5})`,
                  boxShadow: trailStrength > 0.7 ? "0 0 4px rgba(129,182,76,0.6)" : "none",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Floating piece decoration ─────────────────────────────────────────────
function FloatingPieces() {
  const pieces = [
    { piece: "♛", x: "8%",  y: "12%", delay: "0s",    dur: "6s",  size: "28px", opacity: 0.07 },
    { piece: "♜", x: "88%", y: "8%",  delay: "1.2s",  dur: "7s",  size: "22px", opacity: 0.06 },
    { piece: "♝", x: "5%",  y: "72%", delay: "0.6s",  dur: "8s",  size: "20px", opacity: 0.05 },
    { piece: "♞", x: "92%", y: "65%", delay: "2s",    dur: "6.5s",size: "24px", opacity: 0.07 },
    { piece: "♟", x: "50%", y: "5%",  delay: "0.3s",  dur: "9s",  size: "18px", opacity: 0.04 },
    { piece: "♚", x: "18%", y: "88%", delay: "1.8s",  dur: "7.5s",size: "26px", opacity: 0.06 },
  ];

  return (
    <>
      {pieces.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            top: p.y,
            fontSize: p.size,
            opacity: p.opacity,
            color: "var(--text-1)",
            animation: `floatPiece ${p.dur} ease-in-out ${p.delay} infinite`,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {p.piece}
        </div>
      ))}
    </>
  );
}

// ── Piece carousel above board ─────────────────────────────────────────────
function PieceCarousel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setIdx((i) => (i + 1) % PIECES.length), 900);
    return () => clearInterval(iv);
  }, []);

  const prev = (idx - 1 + PIECES.length) % PIECES.length;
  const next = (idx + 1) % PIECES.length;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px", height: "52px" }}>
      <span style={{ fontSize: "22px", opacity: 0.2, transition: "opacity 0.3s" }}>{PIECES[prev]}</span>
      <span
        key={idx}
        style={{
          fontSize: "40px",
          lineHeight: 1,
          filter: "drop-shadow(0 0 12px rgba(129,182,76,0.5))",
          animation: "pieceSwap 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
          display: "block",
        }}
      >
        {PIECES[idx]}
      </span>
      <span style={{ fontSize: "22px", opacity: 0.2, transition: "opacity 0.3s" }}>{PIECES[next]}</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────
interface Props {
  username?: string;
  variant?: "default" | "puzzle" | "review";
  message?: string;
}

export default function ChessLoader({ username, variant = "default", message }: Props) {
  const messages = message ? [message] : MESSAGE_SETS[variant] ?? MESSAGE_SETS.default;
  const [msgIdx, setMsgIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIdx((i) => (i + 1) % messages.length);
        setVisible(true);
      }, 220);
    }, 2600);
    return () => clearInterval(iv);
  }, [messages.length]);

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes chessPiecePop {
          0%   { transform: scale(0.5) rotate(-15deg); opacity: 0; }
          70%  { transform: scale(1.15) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes pieceSwap {
          0%   { transform: translateY(-10px) scale(0.7); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes floatPiece {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33%       { transform: translateY(-14px) rotate(5deg); }
          66%       { transform: translateY(-6px) rotate(-3deg); }
        }
        @keyframes msgFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loaderPulse {
          0%, 100% { opacity: 0.4; transform: scaleX(1); }
          50%       { opacity: 1;   transform: scaleX(1.02); }
        }
        @keyframes rankGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(129,182,76,0); }
          50%       { box-shadow: 0 0 0 6px rgba(129,182,76,0.15); }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
          position: "relative",
          overflow: "hidden",
          padding: "40px 20px",
        }}
      >
        {/* Floating decorative pieces */}
        <FloatingPieces />

        {/* Piece carousel */}
        <PieceCarousel />

        {/* Board */}
        <div
          style={{
            marginBottom: "32px",
            animation: "rankGlow 3s ease-in-out infinite",
            borderRadius: "10px",
          }}
        >
          <AnimatedBoard />
        </div>

        {/* Username */}
        {username && (
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-2)",
              marginBottom: "6px",
              letterSpacing: "0.01em",
            }}
          >
            Loading{" "}
            <span
              style={{
                color: "var(--green)",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              {username}
            </span>
          </p>
        )}

        {/* Rotating message */}
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-3)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
            height: "18px",
            marginBottom: "24px",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(4px)",
            transition: "opacity 0.22s ease, transform 0.22s ease",
            textAlign: "center",
            maxWidth: "320px",
          }}
        >
          {messages[msgIdx]}
        </p>

        {/* Segmented progress bar (chess rank squares) */}
        <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <BarSegment key={i} index={i} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Animated bar segments ─────────────────────────────────────────────────
function BarSegment({ index }: { index: number }) {
  const [lit, setLit] = useState(false);

  useEffect(() => {
    // Each segment pulses with a staggered delay, looping
    const CYCLE = 1800;
    const offset = (index / 8) * CYCLE;
    let frame: ReturnType<typeof setTimeout>;

    const pulse = () => {
      setLit(true);
      frame = setTimeout(() => {
        setLit(false);
        frame = setTimeout(pulse, CYCLE - 320);
      }, 320);
    };

    const start = setTimeout(pulse, offset);
    return () => { clearTimeout(start); clearTimeout(frame); };
  }, [index]);

  return (
    <div
      style={{
        width: "20px",
        height: "6px",
        borderRadius: "2px",
        background: lit ? "var(--green)" : "var(--border-strong)",
        boxShadow: lit ? "0 0 8px rgba(129,182,76,0.6)" : "none",
        transition: "background 0.18s ease, box-shadow 0.18s ease",
      }}
    />
  );
}
