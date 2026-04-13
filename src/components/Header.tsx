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
    <header className="sticky top-0 z-50" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", backdropFilter: "blur(12px)" }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[52px] gap-4">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                {/* Chess.com-style knight */}
                <rect width="32" height="32" rx="6" fill="var(--green)" opacity="0.9"/>
                <path d="M11 25V23.5C11 23.5 9 22 9 19C9 16 11 14 11 14L10 12H12L13 10H15L15.5 11.5C17 11 18 11 19 12C20 13 20 14 20 14L18 15L19 17C19 17 20 19 19 21C18 23 17 23.5 17 23.5V25H11Z" fill="white" opacity="0.95"/>
                <rect x="10" y="26" width="12" height="2" rx="1" fill="white" opacity="0.7"/>
              </svg>
            </div>
            <span
              style={{
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "0.01em",
                color: "var(--text-1)",
              }}
            >
              Chess<span style={{ color: "var(--green)" }}>IQ</span>
            </span>
          </a>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-[280px]">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
                style={{ color: focused ? "var(--green)" : "var(--text-3)", transition: "color 0.2s" }}
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
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
              <span style={{ color: "var(--text-2)", fontSize: "13px", letterSpacing: "0.02em", fontWeight: 600 }}>
                {username}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
