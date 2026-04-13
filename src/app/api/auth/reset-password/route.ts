import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { getPool } from "@/lib/db";
import { ensureDbInit } from "@/lib/db-init";

export async function POST(req: NextRequest) {
  await ensureDbInit();

  let token: string, newPassword: string;
  try {
    ({ token, newPassword } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const tokenResult = await getPool().query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  const tokenRow = tokenResult.rows[0];
  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  const passwordHash = await hash(newPassword, 12);

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, tokenRow.user_id]);
    await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [tokenRow.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[reset-password] transaction error:", err);
    return NextResponse.json({ error: "Failed to reset password. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
