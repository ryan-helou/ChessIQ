"use client";

import React, { useState } from "react";
import Image from "next/image";
import type { PlayerProfile } from "./utils";

const avatarContainerStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 6,
  overflow: "hidden",
  border: "2px solid var(--border-strong)",
  flexShrink: 0,
};

const avatarImgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const avatarFallbackStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  background: "var(--border-strong)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  fontWeight: 700,
  color: "var(--text-2)",
};

export const PanelAvatar = React.memo(function PanelAvatar({
  profile,
  username,
}: {
  profile: PlayerProfile | null;
  username: string;
}) {
  const [err, setErr] = useState(false);
  return (
    <div style={avatarContainerStyle}>
      {profile?.avatar && !err ? (
        <Image
          src={profile.avatar}
          alt={username}
          width={64}
          height={64}
          unoptimized
          onError={() => setErr(true)}
          style={avatarImgStyle}
        />
      ) : (
        <div style={avatarFallbackStyle}>
          {username[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
});
