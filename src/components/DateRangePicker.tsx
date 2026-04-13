"use client";

const RANGES = [
  { label: "1M", value: 1 },
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "1Y", value: 12 },
  { label: "All", value: 0 },
];

interface Props {
  value: number;
  onChange: (months: number) => void;
  loading?: boolean;
}

export default function DateRangePicker({ value, onChange, loading }: Props) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "2px",
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      padding: "3px",
    }}>
      {RANGES.map((r) => {
        const isActive = value === r.value;
        return (
          <button
            key={r.value}
            onClick={() => onChange(r.value)}
            disabled={loading}
            style={{
              padding: "5px 12px",
              borderRadius: "6px",
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              fontWeight: isActive ? 700 : 400,
              border: "none",
              background: isActive ? "var(--green-dim)" : "transparent",
              color: isActive ? "var(--green)" : "var(--text-3)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              transition: "all 0.15s",
              outline: isActive ? "1px solid var(--green-line)" : "none",
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-2)"; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-3)"; }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
