"use client";

import React, { useState } from "react";
import Image from "next/image";
import type { PlayerProfile } from "./utils";

export interface PlayerBarProps {
  username: string;
  rating: string;
  profile: PlayerProfile | null;
  time: string;
  result: string;
  playerColor: "white" | "black";
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 6px",
  height: 48,
  background: "var(--bg)",
  flexShrink: 0,
};

const fallbackAvatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 4,
  flexShrink: 0,
  background: "var(--border-strong)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text-2)",
};

export const PlayerBar = React.memo(function PlayerBar({
  username,
  rating,
  profile,
  time,
  result,
  playerColor,
}: PlayerBarProps) {
  const [imgError, setImgError] = useState(false);
  const won = (playerColor === "white" && result === "1-0") || (playerColor === "black" && result === "0-1");
  const drew = result === "1/2-1/2";

  return (
    <div style={barStyle}>
      {/* Avatar */}
      {profile?.avatar && !imgError ? (
        <Image
          src={profile.avatar}
          alt={username}
          width={36}
          height={36}
          unoptimized
          onError={() => setImgError(true)}
          style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div style={fallbackAvatarStyle}>
          {username[0]?.toUpperCase()}
        </div>
      )}

      {/* Name + flag + rating */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {username}
          </span>
          {profile?.flagEmoji && (
            <span style={{ fontSize: 14, lineHeight: 1 }}>{profile.flagEmoji}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          ({rating})
        </span>
      </div>

      {/* Right side: result dot + clock */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span
          style={{
            width: 8, height: 8, borderRadius: "50%", display: "inline-block",
            background: won ? "var(--win)" : drew ? "var(--text-3)" : "var(--loss)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 16,
            fontWeight: 700,
            color: time === "--:--" ? "var(--text-3)" : "var(--text-1)",
            letterSpacing: "-0.02em",
          }}
        >
          {time}
        </span>
      </div>
    </div>
  );
});
