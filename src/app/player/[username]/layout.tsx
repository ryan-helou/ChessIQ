import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} — ChessIQ`,
    description: `Game analysis, loss patterns, and personalized training for ${username} on ChessIQ.`,
  };
}

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
