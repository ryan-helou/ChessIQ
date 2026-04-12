"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  username?: string;
}

export default function Header({ username }: Props) {
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
    <header className="sticky top-0 z-50" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-overlay)", backdropFilter: "blur(20px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-4">

          {/* Logo */}
          <a href="/" className="flex items-center gap-3 shrink-0 group">
            <div className="relative w-7 h-7 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                {/* Knight silhouette simplified */}
                <path d="M10 22V20.5C10 20.5 8 19 8 16C8 13 10 11 10 11L9 9H11L12 7H14L14.5 8.5C16 8 17 8 18 9C19 10 19 11 19 11L17 12L18 14C18 14 19 16 18 18C17 20 16 20.5 16 20.5V22H10Z" fill="var(--gold)" opacity="0.9"/>
                <path d="M10 22V20.5C10 20.5 8 19 8 16C8 13 10 11 10 11L9 9H11L12 7H14L14.5 8.5C16 8 17 8 18 9C19 10 19 11 19 11L17 12L18 14C18 14 19 16 18 18C17 20 16 20.5 16 20.5V22H10Z" stroke="var(--gold)" strokeWidth="0.75" strokeLinejoin="round" fill="none"/>
                <rect x="9" y="23" width="10" height="2" rx="1" fill="var(--gold)" opacity="0.7"/>
              </svg>
            </div>
            <span
              className="font-display text-xl font-semibold tracking-wide"
              style={{ color: "var(--text-1)", letterSpacing: "0.04em" }}
            >
              Chess<span style={{ color: "var(--gold)" }}>IQ</span>
            </span>
          </a>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xs">
            <div
              className="relative"
              style={{
                filter: focused ? `drop-shadow(0 0 8px var(--gold-glow))` : "none",
                transition: "filter 0.3s",
              }}
            >
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: focused ? "var(--gold-muted)" : "var(--text-3)", transition: "color 0.2s" }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Search player…"
                className="input-base w-full pl-9 pr-4 py-2 rounded-lg text-sm"
                style={{ fontSize: "13px" }}
              />
            </div>
          </form>

          {/* Active player */}
          {username && (
            <div className="hidden sm:flex items-center gap-2 text-sm shrink-0" style={{ color: "var(--text-3)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold)", boxShadow: "0 0 6px var(--gold)" }} />
              <span style={{ color: "var(--text-2)", fontFamily: "var(--font-mono)", fontSize: "12px", letterSpacing: "0.05em" }}>
                {username}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
