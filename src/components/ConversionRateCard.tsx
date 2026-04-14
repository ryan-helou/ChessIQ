"use client";

import { useEffect, useState } from "react";

interface ConversionData {
  totalAnalyzed: number;
  gamesWithAdvantage: number;
  converted: number;
  squandered: number;
  conversionRate: number | null;
}

interface Props {
  username: string;
}

export default function ConversionRateCard({ username }: Props) {
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/conversion-rate/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 80, flex: 1, minWidth: 100, background: "var(--border)", borderRadius: 8, opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  if (!data || data.gamesWithAdvantage === 0) {
    return (
      <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
        Not enough analysed games yet to compute conversion rate.
      </div>
    );
  }

  const rate = data.conversionRate ?? 0;
  const rateColor = rate >= 70 ? "#81b64c" : rate >= 50 ? "#f6c700" : "#ca3431";

  return (
    <div>
      {/* Main stat */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{
          flex: "1 1 120px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "14px 18px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Conversion Rate
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: rateColor, lineHeight: 1 }}>
            {rate}%
          </div>
        </div>

        <div style={{
          flex: "1 1 120px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "14px 18px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Converted
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#81b64c", lineHeight: 1 }}>
            {data.converted}
            <span style={{ fontSize: 14, color: "var(--text-3)", fontWeight: 400, marginLeft: 5 }}>
              / {data.gamesWithAdvantage}
            </span>
          </div>
        </div>

        <div style={{
          flex: "1 1 120px",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "14px 18px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
            Squandered
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#ca3431", lineHeight: 1 }}>
            {data.squandered}
          </div>
        </div>
      </div>

      {/* Insight callout */}
      <div style={{
        background: rate >= 70 ? "rgba(129,182,76,0.07)" : rate >= 50 ? "rgba(246,199,0,0.07)" : "rgba(202,52,49,0.07)",
        border: `1px solid ${rate >= 70 ? "rgba(129,182,76,0.2)" : rate >= 50 ? "rgba(246,199,0,0.2)" : "rgba(202,52,49,0.2)"}`,
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
          {rate >= 70 ? "✓" : rate >= 50 ? "⚠" : "✗"}
        </span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 3 }}>
            {rate >= 70
              ? "Strong endgame conversion — you close out winning positions well."
              : rate >= 50
              ? "Decent conversion, but you let winning positions slip regularly."
              : `You converted ${data.converted} of ${data.gamesWithAdvantage} winning positions — improvement here would directly gain rating points.`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            A "winning position" means you had a +2.5 pawn advantage or better for at least 2 consecutive moves after move 10.
            {data.squandered > 0 && ` You squandered ${data.squandered} game${data.squandered !== 1 ? "s" : ""} where you were winning.`}
          </div>
        </div>
      </div>
    </div>
  );
}
