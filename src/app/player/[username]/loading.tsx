export default function Loading() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", paddingTop: 80 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        <Skeleton height={120} style={{ marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={90} />
          ))}
        </div>
        <Skeleton height={320} style={{ marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Skeleton height={240} />
          <Skeleton height={240} />
        </div>
      </div>
    </div>
  );
}

function Skeleton({ height, style }: { height: number; style?: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      className="skeleton"
      style={{
        height,
        borderRadius: 8,
        border: "1px solid var(--border)",
        ...style,
      }}
    />
  );
}
