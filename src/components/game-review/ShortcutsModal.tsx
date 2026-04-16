"use client";

import React from "react";

const SHORTCUTS = [
  { key: "\u2190  \u2192", desc: "Navigate moves" },
  { key: "Home / End", desc: "Jump to start / end" },
  { key: "J", desc: "Jump to worst move" },
  { key: "F", desc: "Flip board (coming soon)" },
  { key: "?", desc: "Toggle this help panel" },
  { key: "Esc", desc: "Close this panel" },
];

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-strong)",
  borderRadius: 12,
  padding: "20px 24px",
  minWidth: 280,
  maxWidth: 360,
};

const kbdStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: 5,
  padding: "2px 8px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text-2)",
  whiteSpace: "nowrap",
};

export const ShortcutsModal = React.memo(function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
            Keyboard Shortcuts
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0 }}
          >
            &times;
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <kbd style={kbdStyle}>
                {key}
              </kbd>
              <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
