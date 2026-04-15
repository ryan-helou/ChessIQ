import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const fen = request.nextUrl.searchParams.get("fen");
  if (!fen) {
    return NextResponse.json({ white: 0, draws: 0, black: 0, moves: [] });
  }

  const url =
    `https://explorer.lichess.ovh/lichess?variant=standard&speeds=rapid,blitz,bullet` +
    `&ratings=2000,2200&fen=${encodeURIComponent(fen)}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ white: 0, draws: 0, black: 0, moves: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();

    return NextResponse.json({
      white: data.white ?? 0,
      draws: data.draws ?? 0,
      black: data.black ?? 0,
      moves: (data.moves ?? []).slice(0, 10).map((m: { san: string; uci: string; white: number; draws: number; black: number }) => ({
        san: m.san,
        uci: m.uci,
        white: m.white,
        draws: m.draws,
        black: m.black,
      })),
      opening: data.opening ?? null,
    });
  } catch {
    return NextResponse.json({ white: 0, draws: 0, black: 0, moves: [] });
  }
}
