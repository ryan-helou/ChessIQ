"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

const FEATURES = [
  {
    label: "01",
    title: "Rating Progression",
    desc: "Track your Elo across bullet, blitz, rapid, and daily with interactive charts that show real momentum.",
    accent: "var(--gold)",
  },
  {
    label: "02",
    title: "Opening Intelligence",
    desc: "Win rate, accuracy, and record for every opening you play — know which lines serve you and which betray you.",
    accent: "var(--blue)",
  },
  {
    label: "03",
    title: "Accuracy Analysis",
    desc: "See how accurate you really are over time and against different rating brackets. No illusions.",
    accent: "var(--win)",
  },
  {
    label: "04",
    title: "Game Review",
    desc: "Chess.com-quality move classification with blunders, mistakes, and best moves annotated by engine.",
    accent: "var(--gold)",
  },
  {
    label: "05",
    title: "Tactical Puzzles",
    desc: "Personalized puzzles built from your actual weaknesses. Train what breaks your games, not random tactics.",
    accent: "var(--loss)",
  },
  {
    label: "06",
    title: "Loss Patterns",
    desc: "Understand exactly why you lose — missed forks, weak king safety, overextension. Fix the root cause.",
    accent: "var(--blue)",
  },
];

export default function Home() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [focused, setFocused] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      router.push(`/player/${searchInput.trim()}`);
    }
  };

  return (
    <div style={{ background: "var(--bg)", color: "var(--text-1)", minHeight: "100vh" }}>
      <Header />

      {/* ── Background ───────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Dot grid */}
        <div className="absolute inset-0 dot-grid" style={{ opacity: 1 }} />
        {/* Radial glow center */}
        <div
          className="absolute"
          style={{
            top: "-10%", left: "50%", transform: "translateX(-50%)",
            width: "900px", height: "600px",
            background: "radial-gradient(ellipse at center, rgba(212,168,75,0.05) 0%, transparent 65%)",
          }}
        />
        {/* Bottom right ambient */}
        <div
          className="absolute"
          style={{
            bottom: 0, right: 0,
            width: "600px", height: "500px",
            background: "radial-gradient(ellipse at bottom right, rgba(91,156,246,0.04) 0%, transparent 65%)",
          }}
        />
        {/* Floating chess pieces */}
        {["♙", "♘", "♗", "♖", "♛", "♚"].map((piece, i) => (
          <div
            key={i}
            className="absolute select-none"
            style={{
              fontSize: "64px",
              color: "var(--gold)",
              opacity: 0.04,
              top: `${[12, 35, 60, 20, 75, 45][i]}%`,
              left: `${[8, 85, 5, 90, 78, 92][i]}%`,
              animation: `float ${5 + i * 0.8}s ease-in-out infinite`,
              animationDelay: `${i * 0.7}s`,
            }}
          >
            {piece}
          </div>
        ))}
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative" style={{ zIndex: 1 }}>
        <div
          className="max-w-4xl mx-auto px-6 lg:px-8 text-center"
          style={{ paddingTop: "clamp(64px, 12vw, 130px)", paddingBottom: "80px" }}
        >
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 mb-10 animate-fade-up"
            style={{
              background: "var(--gold-dim)",
              border: "1px solid var(--gold-line)",
              borderRadius: "100px",
              padding: "5px 14px",
              fontSize: "12px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.1em",
              color: "var(--gold)",
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--gold)", display: "inline-block", boxShadow: "0 0 8px var(--gold)" }} />
            Free · No sign-up
          </div>

          {/* Headline */}
          <h1
            className="font-display animate-fade-up"
            style={{
              fontSize: "clamp(52px, 9vw, 104px)",
              lineHeight: 1.0,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              marginBottom: "28px",
              animationDelay: "0.08s",
            }}
          >
            <span style={{ color: "var(--text-1)" }}>Know your</span>
            <br />
            <span className="text-gold-gradient" style={{ fontStyle: "italic" }}>chess.</span>
          </h1>

          {/* Sub */}
          <p
            className="animate-fade-up"
            style={{
              fontSize: "clamp(15px, 2vw, 19px)",
              color: "var(--text-2)",
              maxWidth: "520px",
              margin: "0 auto 44px",
              lineHeight: 1.65,
              animationDelay: "0.16s",
            }}
          >
            Deep analytics for your Chess.com games. Find the patterns behind your losses,
            open your weaknesses to the light, and train what actually matters.
          </p>

          {/* Search */}
          <form
            onSubmit={handleSearch}
            className="max-w-md mx-auto animate-fade-up"
            style={{ animationDelay: "0.22s" }}
          >
            <div
              style={{
                display: "flex",
                background: "var(--bg-input)",
                border: `1px solid ${focused ? "var(--gold-line)" : "var(--border)"}`,
                borderRadius: "12px",
                overflow: "hidden",
                boxShadow: focused ? "0 0 0 3px var(--gold-glow), 0 8px 40px rgba(212,168,75,0.08)" : "0 4px 24px rgba(0,0,0,0.4)",
                transition: "border-color 0.2s, box-shadow 0.3s",
              }}
            >
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Enter your Chess.com username…"
                style={{
                  flex: 1,
                  padding: "14px 18px",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-1)",
                  fontSize: "15px",
                  fontFamily: "var(--font-sans)",
                }}
              />
              <button
                type="submit"
                className="btn-gold"
                style={{
                  padding: "14px 24px",
                  fontSize: "14px",
                  borderRadius: "0",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Analyze →
              </button>
            </div>
          </form>

          <p
            className="animate-fade-up"
            style={{ marginTop: "14px", fontSize: "12px", color: "var(--text-3)", letterSpacing: "0.05em", animationDelay: "0.28s" }}
          >
            Works with any public Chess.com profile
          </p>
        </div>

        {/* ── Gold rule ──────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-6" style={{ marginBottom: "80px" }}>
          <div className="rule-gold" />
        </div>

        {/* ── Features ───────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-6 lg:px-8" style={{ paddingBottom: "120px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "1px",
              background: "var(--border)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            {FEATURES.map((f, i) => (
              <div
                key={f.label}
                className="group"
                style={{
                  background: "var(--bg-card)",
                  padding: "32px",
                  cursor: "default",
                  transition: "background 0.2s",
                  position: "relative",
                  animation: "fadeUp 0.5s ease both",
                  animationDelay: `${0.05 * i}s`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-card)")}
              >
                {/* Accent line top */}
                <div style={{ position: "absolute", top: 0, left: "32px", right: "32px", height: "1px", background: `linear-gradient(to right, ${f.accent}60, transparent)`, opacity: 0, transition: "opacity 0.2s" }}
                  className="group-hover:opacity-100" />
                <div
                  className="font-display"
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.14em",
                    color: f.accent,
                    marginBottom: "16px",
                    opacity: 0.7,
                  }}
                >
                  {f.label}
                </div>
                <h3
                  className="font-display"
                  style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "var(--text-1)",
                    marginBottom: "10px",
                    lineHeight: 1.2,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: "13.5px", color: "var(--text-2)", lineHeight: 1.65 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "28px 0" }}>
          <div
            className="max-w-7xl mx-auto px-6 lg:px-8"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}
          >
            <div
              className="font-display"
              style={{ fontSize: "13px", color: "var(--text-3)", letterSpacing: "0.04em" }}
            >
              Chess<span style={{ color: "var(--gold-muted)" }}>IQ</span>
              <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
              Powered by Chess.com
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
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-3)")}
            >
              github ↗
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
