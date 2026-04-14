import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/chess-com/check?username=xyz
 * Lightweight probe — returns { exists: boolean }.
 * Used by the signup form for real-time username validation.
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim();

  if (!username || !/^[\w-]{1,50}$/.test(username)) {
    return NextResponse.json({ exists: false });
  }

  try {
    const res = await fetch(
      `https://api.chess.com/pub/player/${encodeURIComponent(username)}`,
      {
        headers: { "User-Agent": "ChessIQ/1.0" },
        signal: AbortSignal.timeout(5_000),
      }
    );
    return NextResponse.json({ exists: res.status === 200 });
  } catch {
    // Network error — don't block signup, just say unknown
    return NextResponse.json({ exists: null });
  }
}
