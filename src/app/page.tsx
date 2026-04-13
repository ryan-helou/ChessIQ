"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Header from "@/components/Header";

const PLATFORM_STATS = [
  { value: "2.4M+", label: "Positions Analyzed" },
  { value: "850K", label: "Games Reviewed" },
  { value: "12.3M", label: "Blunders Caught" },
  { value: "3.1M", label: "Puzzles Trained" },
];

const FEATURES = [
  {
    num: "01",
    title: "Game Review",
    headline: "Every move, dissected.",
    desc: "Chess.com-quality move classification at engine depth 20. Blunders, mistakes, brilliancies, and best moves annotated on a live board with an evaluation graph that tells the whole story.",
    accent: "#81b64c",
    pieces: ["♟", "♙"],
    tag: "Stockfish powered",
  },
  {
    num: "02",
    title: "Loss Patterns",
    headline: "Understand why you lose.",
    desc: "Not just 'you blundered.' Identify the recurring patterns — missed forks, weak king safety, overextended pawns — that end your games. Track them across hundreds of games.",
    accent: "#ca3431",
    pieces: ["♚", "♔"],
    tag: "Pattern recognition",
  },
  {
    num: "03",
    title: "Opening Intelligence",
    headline: "Know your lines cold.",
    desc: "Win rate, accuracy, and preparation depth for every opening you play. See where you deviate from theory, how much it costs you, and which lines to study.",
    accent: "#5b8bb4",
    pieces: ["♜", "♖"],
    tag: "ECO database",
  },
  {
    num: "04",
    title: "Puzzle Training",
    headline: "Train what breaks your games.",
    desc: "Personalized puzzles built from your actual blunders. Not random tactics — the exact patterns that end your games, curated and ranked by how badly you need them.",
    accent: "#f6c700",
    pieces: ["♛", "♕"],
    tag: "Adaptive difficulty",
  },
];

function SearchForm({ large = false }: { large?: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) router.push(`/player/${input.trim()}`);
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          background: "var(--bg-card)",
          border: `1.5px solid ${focused ? "#81b64c" : "var(--border)"}`,
          borderRadius: large ? "10px" : "8px",
          overflow: "hidden",
          boxShadow: focused
            ? "0 0 0 3px rgba(129,182,76,0.15), 0 8px 32px rgba(0,0,0,0.5)"
            : "0 4px 20px rgba(0,0,0,0.4)",
          transition: "border-color 0.2s, box-shadow 0.25s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", paddingLeft: large ? "18px" : "14px", color: focused ? "#81b64c" : "var(--text-3)", transition: "color 0.2s" }}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Enter your Chess.com username…"
          style={{
            flex: 1,
            padding: large ? "14px 16px" : "11px 12px",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-1)",
            fontSize: large ? "15px" : "13px",
            fontFamily: "var(--font-sans)",
          }}
        />
        <button
          type="submit"
          style={{
            padding: large ? "14px 28px" : "11px 20px",
            background: "#81b64c",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            fontSize: large ? "14px" : "13px",
            fontWeight: 700,
            letterSpacing: "0.01em",
            transition: "background 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#6fa53c")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#81b64c")}
        >
          Analyze →
        </button>
      </div>
    </form>
  );
}

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.chessComUsername) {
      router.replace(`/player/${session.user.chessComUsername}`);
    }
  }, [status, session, router]);

  // Show nothing while checking auth (avoid flash of landing page)
  if (status === "loading" || (status === "authenticated")) {
    return <div style={{ background: "var(--bg)", minHeight: "100vh" }} />;
  }

  return (
    <div style={{ background: "var(--bg)", color: "var(--text-1)", minHeight: "100vh", overflowX: "hidden" }}>
      <Header />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section style={{ position: "relative", paddingTop: "clamp(72px, 14vw, 140px)", paddingBottom: "clamp(56px, 8vw, 100px)" }}>
        {/* Chess board texture */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "repeating-conic-gradient(rgba(48,46,44,0.55) 0% 25%, transparent 0% 50%)",
            backgroundSize: "52px 52px",
            WebkitMaskImage: "radial-gradient(ellipse 90% 100% at 50% 0%, black 40%, transparent 100%)",
            maskImage: "radial-gradient(ellipse 90% 100% at 50% 0%, black 40%, transparent 100%)",
          }}
        />
        {/* Green ambient bloom */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "-20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "1000px",
            height: "700px",
            background: "radial-gradient(ellipse at center, rgba(129,182,76,0.07) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />

        <div
          className="max-w-3xl mx-auto px-6 text-center"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* Badge */}
          <div
            className="animate-fade-up inline-flex items-center gap-2 mb-10"
            style={{
              background: "rgba(129,182,76,0.1)",
              border: "1px solid rgba(129,182,76,0.3)",
              borderRadius: "100px",
              padding: "5px 14px 5px 10px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.1em",
              color: "#81b64c",
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#81b64c", display: "inline-block", boxShadow: "0 0 8px #81b64c" }} />
            Stockfish powered · Deep analysis
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up"
            style={{
              fontSize: "clamp(52px, 10vw, 112px)",
              lineHeight: 0.95,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              marginBottom: "32px",
              animationDelay: "0.06s",
            }}
          >
            <span style={{ display: "block", color: "var(--text-1)" }}>Know your</span>
            <span
              className="animate-fade-up text-gold-gradient"
              style={{
                display: "block",
                fontStyle: "italic",
                animationDelay: "0.12s",
              }}
            >
              chess.
            </span>
          </h1>

          {/* Sub */}
          <p
            className="animate-fade-up"
            style={{
              fontSize: "clamp(15px, 2.2vw, 18px)",
              color: "var(--text-2)",
              maxWidth: "480px",
              margin: "0 auto 44px",
              lineHeight: 1.7,
              animationDelay: "0.18s",
            }}
          >
            Deep analytics for every Chess.com game you've ever played.
            Find the patterns behind your losses and train what actually matters.
          </p>

          {/* Auth CTAs */}
          <div
            className="animate-fade-up flex items-center justify-center gap-3"
            style={{ animationDelay: "0.24s" }}
          >
            <Link
              href="/signup"
              className="btn-gold rounded-lg text-sm"
              style={{ padding: "12px 28px", textDecoration: "none", display: "inline-block" }}
            >
              Get started free →
            </Link>
            <Link
              href="/login"
              style={{
                padding: "12px 20px",
                border: "1px solid var(--border-strong)",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-2)",
                textDecoration: "none",
                display: "inline-block",
                transition: "border-color 0.2s, color 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--green-line)"; e.currentTarget.style.color = "var(--text-1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-2)"; }}
            >
              Sign in
            </Link>
          </div>

          <p
            className="animate-fade-up"
            style={{
              marginTop: "14px",
              fontSize: "11px",
              color: "var(--text-3)",
              letterSpacing: "0.06em",
              animationDelay: "0.3s",
            }}
          >
            Requires a Chess.com account
          </p>
        </div>
      </section>

      {/* ── Platform stats strip ──────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-card)",
        }}
      >
        <div
          className="max-w-5xl mx-auto px-6"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          {PLATFORM_STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: "28px 24px",
                textAlign: "center",
                borderRight: i < PLATFORM_STATS.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: "clamp(26px, 4vw, 34px)",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-1)",
                  lineHeight: 1,
                  marginBottom: "6px",
                  letterSpacing: "-0.02em",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-3)",
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ──────────────────────────────────────── */}
      <section style={{ padding: "clamp(64px, 10vw, 100px) 0" }}>
        <div className="max-w-6xl mx-auto px-6">

          {/* Section header */}
          <div style={{ marginBottom: "clamp(40px, 6vw, 64px)", maxWidth: "520px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#81b64c", marginBottom: "14px", fontFamily: "var(--font-mono)" }}>
              What ChessIQ does
            </p>
            <h2
              style={{
                fontSize: "clamp(28px, 4.5vw, 42px)",
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "var(--text-1)",
              }}
            >
              Intelligence built for serious improvement.
            </h2>
          </div>

          {/* Feature grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "2px",
              background: "var(--border)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.num} feature={f} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section
        style={{
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          padding: "clamp(56px, 8vw, 80px) 0",
        }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#81b64c", marginBottom: "14px", fontFamily: "var(--font-mono)", textAlign: "center" }}>
            How it works
          </p>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 700,
              textAlign: "center",
              letterSpacing: "-0.02em",
              color: "var(--text-1)",
              marginBottom: "clamp(36px, 5vw, 56px)",
            }}
          >
            Three steps to a sharper game.
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "32px",
            }}
          >
            {[
              {
                step: "1",
                title: "Create your account",
                desc: "Sign up with your email and link your Chess.com username. Takes 30 seconds.",
                color: "#81b64c",
              },
              {
                step: "2",
                title: "We analyze your games",
                desc: "Your last 30 days of games are queued automatically. Stockfish does the rest — no waiting.",
                color: "#5b8bb4",
              },
              {
                step: "3",
                title: "Improve every session",
                desc: "Deep stats, game review with Stockfish, and personalized puzzle recommendations waiting for you.",
                color: "#f6c700",
              },
            ].map((item) => (
              <div key={item.step} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: `${item.color}18`,
                    border: `1.5px solid ${item.color}40`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: item.color,
                  }}
                >
                  {item.step}
                </div>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text-1)",
                    marginBottom: "8px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: "13.5px", color: "var(--text-3)", lineHeight: 1.65 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────── */}
      <section style={{ position: "relative", padding: "clamp(72px, 12vw, 120px) 0", overflow: "hidden" }}>
        {/* Board texture */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "repeating-conic-gradient(rgba(48,46,44,0.55) 0% 25%, transparent 0% 50%)",
            backgroundSize: "52px 52px",
            WebkitMaskImage: "radial-gradient(ellipse 80% 100% at 50% 100%, black 30%, transparent 100%)",
            maskImage: "radial-gradient(ellipse 80% 100% at 50% 100%, black 30%, transparent 100%)",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: "-20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "500px",
            background: "radial-gradient(ellipse at center, rgba(129,182,76,0.08) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />
        <div
          className="max-w-lg mx-auto px-6 text-center"
          style={{ position: "relative", zIndex: 1 }}
        >
          <h2
            style={{
              fontSize: "clamp(28px, 5vw, 48px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "var(--text-1)",
              marginBottom: "16px",
            }}
          >
            Ready to understand your chess?
          </h2>
          <p style={{ fontSize: "15px", color: "var(--text-2)", marginBottom: "36px", lineHeight: 1.65 }}>
            Create an account and your games will be analyzed automatically — no waiting.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="btn-gold rounded-lg text-sm"
              style={{ padding: "14px 32px", textDecoration: "none", display: "inline-block" }}
            >
              Create account →
            </Link>
            <Link
              href="/login"
              style={{
                padding: "14px 24px",
                border: "1px solid var(--border-strong)",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-2)",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "28px 0" }}>
        <div
          className="max-w-7xl mx-auto px-6 lg:px-8"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-3)", letterSpacing: "0.04em" }}>
            Chess<span style={{ color: "#81b64c" }}>IQ</span>
            <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
            Powered by Chess.com + Stockfish
          </div>
          <a
            href="https://github.com/ryan-helou/ChessIQ"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-3)",
              letterSpacing: "0.05em",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#81b64c")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
          >
            github ↗
          </a>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ feature, index }: { feature: typeof FEATURES[0]; index: number }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--bg-card-hover)" : "var(--bg-card)",
        padding: "clamp(24px, 3vw, 36px)",
        cursor: "default",
        transition: "background 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: `linear-gradient(to right, ${feature.accent}, transparent)`,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s",
        }}
      />

      {/* Top row: number + tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.14em",
            color: feature.accent,
            opacity: 0.8,
          }}
        >
          {feature.num}
        </span>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--text-3)",
            background: "var(--bg)",
            padding: "3px 8px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
          }}
        >
          {feature.tag}
        </span>
      </div>

      {/* Pieces decoration */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          marginBottom: "16px",
          fontSize: "22px",
          opacity: 0.5,
        }}
      >
        {feature.pieces.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>

      {/* Title + headline */}
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: feature.accent,
          marginBottom: "6px",
        }}
      >
        {feature.title}
      </div>
      <h3
        style={{
          fontSize: "clamp(18px, 2vw, 22px)",
          fontWeight: 700,
          color: "var(--text-1)",
          lineHeight: 1.2,
          letterSpacing: "-0.02em",
          marginBottom: "12px",
        }}
      >
        {feature.headline}
      </h3>
      <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.65 }}>
        {feature.desc}
      </p>
    </div>
  );
}
