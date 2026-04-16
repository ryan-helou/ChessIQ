"use client";

import React from "react";
import { phaseIcon } from "./utils";

// ─── Classification Circle Icon ───

export const ClassCircle = React.memo(function ClassCircle({
  bg,
  icon,
  img,
  small,
}: {
  bg: string;
  icon: string;
  img?: string;
  small?: boolean;
}) {
  const size = small ? "w-4 h-4" : "w-5 h-5";
  const fontSize = small ? "8px" : "10px";
  if (img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={img} alt={icon} className={`${size} rounded-full object-cover shrink-0`} />
    );
  }
  return (
    <span
      className={`${size} rounded-full inline-flex items-center justify-center font-bold text-white shrink-0 leading-none`}
      style={{ backgroundColor: bg, fontSize }}
    >
      {icon}
    </span>
  );
});

// ─── Phase icon helper ───

export const PhaseIcon = React.memo(function PhaseIcon({ acc }: { acc: number | null }) {
  const { icon, color } = phaseIcon(acc);
  if (icon === "-") return <span className="text-[var(--text-3)] text-sm">&mdash;</span>;
  return (
    <span
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
      style={{ backgroundColor: color === "text-green-400" ? "#81b64c" : color === "text-green-500" ? "#5eba3a" : color === "text-yellow-400" ? "#f6c700" : "#ca3431" }}
    >
      {icon === "👍" ? "✓" : icon}
    </span>
  );
});
