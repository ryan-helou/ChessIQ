export default function Loading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", paddingTop: 80 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 320px", gap: 16 }}>
          <Skeleton height={600} />
          <Skeleton height={600} />
          <Skeleton height={600} />
        </div>
      </div>
    </div>
  );
}

function Skeleton({ height }: { height: number }) {
  return (
    <div
      aria-hidden
      className="skeleton"
      style={{
        height,
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
    />
  );
}
