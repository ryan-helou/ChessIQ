import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // 5 registration attempts per IP per 15 minutes — fail closed if Redis is down
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(`register:${ip}`, 5, 15 * 60 * 1000, { failOpen: false });
  if (!rl.allowed) {
    if (rl.reason === "unavailable") {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  await ensureDbInit();

  let email: string, password: string, chessComUsername: string;
  try {
    ({ email, password, chessComUsername } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate
  if (!email || !password || !chessComUsername) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!/^[\w-]{1,50}$/.test(chessComUsername)) {
    return NextResponse.json({ error: "Invalid Chess.com username" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = chessComUsername.toLowerCase().trim();

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

  const passwordHash = await hash(password, 12);

  try {
    await query(
      `INSERT INTO users (email, password_hash, chess_com_username)
       VALUES ($1, $2, $3)`,
      [normalizedEmail, passwordHash, normalizedUsername]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const pgErr = err as { constraint?: string };
    if (pgErr.constraint === "users_email_key") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    if (pgErr.constraint === "users_chess_com_username_key") {
      return NextResponse.json({ error: "This Chess.com account is already linked to another user" }, { status: 409 });
    }
    console.error("[register] DB error:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
