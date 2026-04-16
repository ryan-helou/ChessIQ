"use client";

import React from "react";
import { useSession, signOut } from "next-auth/react";
import { useToast } from "@/components/Toast";

export interface ReviewHeaderProps {
  username: string;
  prevId?: string | null;
  nextId?: string | null;
  pgn?: string;
  onShowShortcuts?: () => void;
  engineEnabled?: boolean;
  onToggleEngine?: () => void;
}

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
  cursor: "pointer",
  transition: "color 0.15s, border-color 0.15s",
  lineHeight: 1.4,
};

const headerStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-surface)",
  backdropFilter: "blur(12px)",
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 12px",
  flexShrink: 0,
  gap: 8,
};

export const ReviewHeader = React.memo(function ReviewHeader({
  username,
  prevId,
  nextId,
  pgn,
  onShowShortcuts,
  engineEnabled,
  onToggleEngine,
}: ReviewHeaderProps) {
  const { data: session } = useSession();
  const { toast } = useToast();

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => toast("Link copied!"));
  };

  const copyPgn = () => {
    if (!pgn) return;
    navigator.clipboard.writeText(pgn).then(() => toast("PGN copied!"));
  };

  return (
    <header style={headerStyle}>
      {/* Left: logo + back link + prev/next */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <a href={`/player/${username}`} style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="var(--green)" opacity="0.9"/>
            <path d="M11 25V23.5C11 23.5 9 22 9 19C9 16 11 14 11 14L10 12H12L13 10H15L15.5 11.5C17 11 18 11 19 12C20 13 20 14 20 14L18 15L19 17C19 17 20 19 19 21C18 23 17 23.5 17 23.5V25H11Z" fill="white" opacity="0.95"/>
            <rect x="10" y="26" width="12" height="2" rx="1" fill="white" opacity="0.7"/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>
            Chess<span style={{ color: "var(--green)" }}>IQ</span>
          </span>
        </a>

        {/* Prev / Next game */}
        {(prevId || nextId) && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 4 }}>
            <a
              href={prevId ? `/player/${username}/review/${prevId}` : undefined}
              title="Previous game"
              style={{
                ...iconBtn,
                opacity: prevId ? 1 : 0.3,
                pointerEvents: prevId ? "auto" : "none",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 7px",
              }}
            >
              &larr;
            </a>
            <a
              href={nextId ? `/player/${username}/review/${nextId}` : undefined}
              title="Next game"
              style={{
                ...iconBtn,
                opacity: nextId ? 1 : 0.3,
                pointerEvents: nextId ? "auto" : "none",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 7px",
              }}
            >
              &rarr;
            </a>
          </div>
        )}
      </div>

      {/* Right: action buttons + user */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {onToggleEngine && (
          <button
            onClick={onToggleEngine}
            style={{
              ...iconBtn,
              ...(engineEnabled
                ? {
                    borderColor: "var(--green)",
                    color: "var(--green)",
                    background: "rgba(82,192,122,0.08)",
                  }
                : {}),
            }}
            title={engineEnabled ? "Disable engine" : "Enable engine"}
          >
            Engine
          </button>
        )}
        {pgn && (
          <button onClick={copyPgn} style={iconBtn} title="Copy PGN">
            PGN
          </button>
        )}
        <button onClick={copyLink} style={iconBtn} title="Copy link to this game">
          Share
        </button>
        {onShowShortcuts && (
          <button onClick={onShowShortcuts} style={iconBtn} title="Keyboard shortcuts (?)">
            ?
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 2 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px var(--green)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", letterSpacing: "0.02em" }}>{username}</span>
        </div>
        {session && (
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            style={iconBtn}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
});
