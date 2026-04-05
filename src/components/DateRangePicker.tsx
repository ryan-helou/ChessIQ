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
    <div className="flex items-center gap-1 bg-[#262522] border border-[#3a3835] rounded-lg p-1">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          disabled={loading}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            value === r.value
              ? "bg-[#81b64c] text-white shadow-sm shadow-[#81b64c]/20"
              : "text-[#989795] hover:text-white hover:bg-[#3a3835]"
          } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
