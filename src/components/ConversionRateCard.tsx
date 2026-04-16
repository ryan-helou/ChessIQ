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
          <div key={i} className="skeleton" aria-hidden style={{ height: 80, flex: 1, minWidth: 100, borderRadius: 10, border: "1px solid var(--border)" }} />
        ))}
      </div>
    );
  }

  if (!data || data.gamesWithAdvantage === 0) {
    return (
      <div style={{
        textAlign: "center",
        padding: "32px 16px",
        border: "1px dashed var(--border)",
        borderRadius: 10,
        color: "var(--text-3)",
      }}>
        <div style={{ fontSize: 22, opacity: 0.5, marginBottom: 6 }}>♛</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)", marginBottom: 4 }}>
          Not enough analyzed games yet
        </div>
        <div style={{ fontSize: 12 }}>
          Conversion rate appears once we&apos;ve analyzed a handful of your games with clear advantages.
        </div>
      </div>
    );
  }

  const rate = data.conversionRate ?? 0;
  const rateColor = rate >= 70 ? "var(--win)" : rate >= 50 ? "var(--gold)" : "var(--loss)";

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
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--win)", lineHeight: 1 }}>
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
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--loss)", lineHeight: 1 }}>
            {data.squandered}
          </div>
        </div>
      </div>

      {/* Insight callout */}
      <div style={{
        background: rate >= 70 ? "var(--green-glow)" : rate >= 50 ? "var(--gold-glow)" : "var(--loss-dim)",
        border: `1px solid ${rate >= 70 ? "var(--green-line)" : rate >= 50 ? "var(--gold-line)" : "rgba(202,52,49,0.22)"}`,
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
