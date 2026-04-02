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
    <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700/40 rounded-lg p-1">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          disabled={loading}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            value === r.value
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
          } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
