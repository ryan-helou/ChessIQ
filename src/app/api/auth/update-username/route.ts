import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let newUsername: string;
  try {
    ({ newUsername } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!newUsername || !/^[\w-]{1,50}$/.test(newUsername)) {
    return NextResponse.json({ error: "Invalid Chess.com username" }, { status: 400 });
  }

  const normalizedUsername = newUsername.toLowerCase().trim();

  // Check 14-day cooldown
  const userResult = await query(
    "SELECT username_changed_at FROM users WHERE id = $1",
    [session.user.id]
  );
  const user = userResult.rows[0];
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.username_changed_at) {
    const daysSince = (Date.now() - new Date(user.username_changed_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 14) {
      const daysRemaining = Math.ceil(14 - daysSince);
      return NextResponse.json(
        { error: `You can change your username again in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}` },
        { status: 422 }
      );
    }
  }

  // Verify Chess.com username exists
  const chessComRes = await fetch(`https://api.chess.com/pub/player/${normalizedUsername}`, {
    headers: { "User-Agent": "ChessIQ/1.0" },
    signal: AbortSignal.timeout(5000),
  });
  if (!chessComRes.ok) {
    return NextResponse.json(
      { error: "Chess.com username not found. Please check the spelling." },
      { status: 422 }
    );
  }

  try {
    await query(
      `UPDATE users SET chess_com_username = $1, username_changed_at = NOW() WHERE id = $2`,
      [normalizedUsername, session.user.id]
    );
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const pgErr = err as { constraint?: string };
    if (pgErr.constraint === "users_chess_com_username_key") {
      return NextResponse.json(
        { error: "This Chess.com account is already linked to another user" },
        { status: 409 }
      );
    }
    console.error("[update-username] error:", err);
    return NextResponse.json({ error: "Failed to update username" }, { status: 500 });
  }
}
