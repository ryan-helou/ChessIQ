import ChessLoader from "@/components/ChessLoader";

export default function Loading() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <ChessLoader />
    </div>
  );
}
