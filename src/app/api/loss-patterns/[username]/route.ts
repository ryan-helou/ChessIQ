import { NextRequest, NextResponse } from "next/server";
import { ensureDbInit } from "@/lib/db-init";
import { classifyTacticCategory, fetchLossGames } from "@/modules/loss-analysis";
import { withCache, cachedResponse } from "@/lib/api-cache";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  await ensureDbInit().catch((err: Error) =>
    console.error("[loss-patterns] db-init failed:", err.message)
  );

  try {
    const { data, cached } = await withCache(`loss-patterns:${username}`, async () => {
      const losses = await fetchLossGames(username);
      const totalLosses = losses.length;

      if (totalLosses === 0) {
        return { totalLosses: 0, byCategory: [] as any[], avgFirstBlunderMove: null, byOpening: [] as any[], recentTrend: "stable" as const };
      }

      // ── Category breakdown ──────────────────────────────────────────────────────
      let tactical = 0;
      let positional = 0;
      let openingBlunder = 0; // first blunder <= move 12
      let outplayed = 0;      // no blunders found — opponent simply played better
      const firstBlunderMoves: number[] = [];

      for (const row of losses) {
        const moves: (number | null)[] = row.blunder_moves ?? [];
        const tactics: (string | null)[] = row.missed_tactics ?? [];

        // Find first meaningful blunder move
        const firstMove = moves.find((m) => m != null) ?? null;
        if (firstMove != null) firstBlunderMoves.push(firstMove);

        if (moves.length === 0 || moves.every((m) => m == null)) {
          outplayed++;
          continue;
        }

        // Classify by the first (worst) blunder's tactic
        const firstTactic = tactics.find((t) => t != null) ?? null;
        const category = classifyTacticCategory(firstTactic);

        if (firstMove != null && firstMove <= 12) {
          openingBlunder++;
        } else if (category === "tactical") {
          tactical++;
        } else if (category === "positional") {
          positional++;
        } else {
          tactical++; // unknown — count as tactical (most likely)
        }
      }

      const avgFirstBlunderMove =
        firstBlunderMoves.length > 0
          ? Math.round(
              firstBlunderMoves.reduce((s, n) => s + n, 0) / firstBlunderMoves.length
            )
          : null;

      const byCategory = [
        { category: "Tactical Error", key: "tactical",  count: tactical,       description: "A tactic was available but missed" },
        { category: "Opening Mistake", key: "opening",  count: openingBlunder, description: "First blunder happened in the opening (≤ move 12)" },
        { category: "Positional Error", key: "positional", count: positional,  description: "Positional errors eroded the advantage" },
        { category: "Outplayed",        key: "outplayed",  count: outplayed,   description: "No blunders found — opponent simply played better" },
      ]
        .filter((c) => c.count > 0)
        .map((c) => ({
          ...c,
          percentage: Math.round((c.count / totalLosses) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      // ── By opening ──────────────────────────────────────────────────────────────
      const openingMap = new Map<string, { losses: number; blunderMoves: number[] }>();
      for (const row of losses) {
        const name = row.opening ?? row.eco ?? "Unknown";
        if (!openingMap.has(name)) openingMap.set(name, { losses: 0, blunderMoves: [] });
        const entry = openingMap.get(name)!;
        entry.losses++;
        const moves: (number | null)[] = row.blunder_moves ?? [];
        const first = moves.find((m) => m != null);
        if (first != null) entry.blunderMoves.push(first);
      }

      const byOpening = Array.from(openingMap.entries())
        .filter(([, v]) => v.losses >= 2)
        .map(([name, v]) => ({
          name,
          losses: v.losses,
          avgFirstBlunderMove:
            v.blunderMoves.length > 0
              ? Math.round(v.blunderMoves.reduce((s, n) => s + n, 0) / v.blunderMoves.length)
              : null,
        }))
        .sort((a, b) => b.losses - a.losses)
        .slice(0, 6);

      // ── Recent trend: compare last 10 vs prior 10 losses ────────────────────────
      let recentTrend: "improving" | "declining" | "stable" = "stable";
      if (losses.length >= 20) {
        const recent10 = losses.slice(0, 10);
        const prior10 = losses.slice(10, 20);
        const avgBlunders = (batch: typeof losses) =>
          batch.reduce((s, r) => s + (r.blunder_moves?.filter((m: number | null) => m != null).length ?? 0), 0) / batch.length;
        const recentAvg = avgBlunders(recent10);
        const priorAvg = avgBlunders(prior10);
        if (recentAvg < priorAvg - 0.3) recentTrend = "improving";
        else if (recentAvg > priorAvg + 0.3) recentTrend = "declining";
      }

      return {
        totalLosses,
        byCategory,
        avgFirstBlunderMove,
        byOpening,
        recentTrend,
      };
    });

    return cachedResponse(data, cached);
  } catch (error) {
    console.error("[loss-patterns] error:", error);
    return cachedResponse(
      { totalLosses: 0, byCategory: [], avgFirstBlunderMove: null, byOpening: [], recentTrend: "stable" },
      false
    );
  }
}
