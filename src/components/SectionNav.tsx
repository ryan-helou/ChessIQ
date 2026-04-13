"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SECTIONS = [
  { id: "overview",  label: "Overview" },
  { id: "ratings",   label: "Ratings" },
  { id: "results",   label: "Results" },
  { id: "accuracy",  label: "Accuracy" },
  { id: "openings",  label: "Openings" },
  { id: "games",     label: "Games" },
];

interface Props {
  username?: string;
}

export default function SectionNav({ username }: Props) {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const items = [
    ...SECTIONS.map((s) => ({ id: s.id, label: s.label, href: undefined })),
    ...(username ? [{ id: "puzzles", label: "Puzzles ↗", href: `/player/${encodeURIComponent(username)}/puzzles` }] : []),
  ];

  return (
    <nav
      className="sticky scrollbar-hide"
      style={{
        top: "56px",
        zIndex: 40,
        background: "var(--bg-overlay)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-0 overflow-x-auto scrollbar-hide">
          {items.map((s) => {
            const isActive = active === s.id;
            const inner = (
              <span
                style={{
                  display: "inline-block",
                  padding: "10px 14px",
                  fontSize: "12.5px",
                  fontFamily: "var(--font-sans)",
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  color: isActive ? "var(--green)" : "var(--text-3)",
                  borderBottom: isActive ? "1px solid var(--green)" : "1px solid transparent",
                  marginBottom: "-1px",
                  transition: "color 0.18s, border-color 0.18s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-2)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-3)"; }}
              >
                {s.label}
              </span>
            );
            return s.href ? (
              <Link key={s.id} href={s.href} style={{ textDecoration: "none" }}>
                {inner}
              </Link>
            ) : (
              <button key={s.id} onClick={() => scrollTo(s.id)} style={{ background: "none", border: "none", padding: 0 }}>
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
