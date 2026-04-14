"use client";

// Phase accuracy requires per-move accuracy data from the analysis pipeline.
// Until that data is available this component shows a placeholder.

export function AccuracyByPhase() {
  return (
    <div style={{
      height: "300px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      color: "var(--text-3)",
      fontSize: "13px",
      fontFamily: "var(--font-mono)",
    }}>
      <span style={{ fontSize: "24px" }}>♟</span>
      <span>Accuracy by phase</span>
      <span style={{ fontSize: "12px", opacity: 0.6 }}>Coming soon — requires per-move analysis data</span>
    </div>
  );
}
