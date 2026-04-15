import { NextRequest, NextResponse } from "next/server";
import { Chess } from "chess.js";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9]{6,12}$/.test(id)) {
    return NextResponse.json({ moves: [] }, { status: 400 });
  }

  try {
    const res = await fetch(`https://explorer.lichess.ovh/masters/pgn/${id}`, {
      headers: { "Accept": "application/x-chess-pgn" },
      next: { revalidate: 86400 }, // cache for 24h — games don't change
    });
    if (!res.ok) return NextResponse.json({ moves: [] });

    const pgn = await res.text();
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history(); // SAN array

    return NextResponse.json({ moves });
  } catch {
    return NextResponse.json({ moves: [] });
  }
}
