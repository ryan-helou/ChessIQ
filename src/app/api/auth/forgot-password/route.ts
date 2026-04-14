import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { query } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // 3 password reset requests per IP per 10 minutes
  const ip = getClientIp(req.headers);
  if (!await checkRateLimit(`forgot-password:${ip}`, 3, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: true }); // Return ok:true to not reveal rate limiting to attackers
  }

  await ensureDbInit();

  let email: string;
  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Look up user — always return 200 to avoid user enumeration
  const result = await query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  const user = result.rows[0];

  if (user) {
    // Delete any existing unused tokens for this user
    await query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL",
      [user.id]
    );

    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, tokenHash]
    );

    const baseUrl = process.env.NEXT_PUBLIC_URL ?? process.env.NEXTAUTH_URL;
    if (!baseUrl) console.error("[forgot-password] NEXT_PUBLIC_URL not set — reset links will be broken");
    const resetUrl = `${baseUrl ?? "http://localhost:3000"}/reset-password?token=${raw}`;

    // Send email via Resend if configured
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "ChessIQ <noreply@chessiq.app>",
        to: normalizedEmail,
        subject: "Reset your ChessIQ password",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #262522; color: #e8e6e1; padding: 32px; border-radius: 8px;">
            <h2 style="color: #81b64c; margin-top: 0;">Reset your password</h2>
            <p>Click the button below to reset your ChessIQ password. This link expires in 1 hour.</p>
            <a href="${resetUrl}" style="display: inline-block; background: #81b64c; color: #fff; font-weight: 700; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Reset Password</a>
            <p style="color: #706e6b; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
    } else {
      // Dev fallback: log the reset URL
      console.log("[forgot-password] Reset URL (no RESEND_API_KEY set):", resetUrl);
    }
  }

  return NextResponse.json({ ok: true });
}
