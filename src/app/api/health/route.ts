import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET() {
  // Check DB connectivity as part of health
  try {
    await getPool().query("SELECT 1");
  } catch {
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
}
