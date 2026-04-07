import { Router, Request, Response } from "express";
import {
  getUserWeaknessProfile,
  getBlunderPuzzlesForUser,
  getPuzzlesByThemes,
  getPuzzle,
  insertPuzzleAttempt,
  getUserPuzzleStats,
} from "../db/puzzles.js";

const router = Router();

// GET /api/puzzles/recommendations/:username
// Returns weakness profile + matching puzzles + own blunder puzzles
router.get("/recommendations/:username", async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const playerRating = parseInt(req.query.rating as string) || 1200;
    const limit = parseInt(req.query.limit as string) || 20;

    // 1. Get weakness profile
    const weaknesses = await getUserWeaknessProfile(username);
    const totalBlunders = weaknesses.reduce((sum, w) => sum + w.count, 0);

    // Add percentage to each weakness
    const weaknessesWithPct = weaknesses.map((w) => ({
      ...w,
      percentage: totalBlunders > 0 ? Math.round((w.count / totalBlunders) * 100) : 0,
    }));

    // 2. Get matching Lichess puzzles
    const topThemes = weaknesses.slice(0, 5).map((w) => w.theme);
    let puzzles: any[] = [];

    if (topThemes.length > 0) {
      puzzles = await getPuzzlesByThemes(
        topThemes,
        Math.max(600, playerRating - 200),
        Math.min(2400, playerRating + 200),
        username,
        limit
      );
    }

    // 3. Get own-blunder puzzles
    const ownBlunderPuzzles = await getBlunderPuzzlesForUser(username, 10);

    // 4. Get user puzzle stats
    const stats = await getUserPuzzleStats(username);

    res.json({
      weaknesses: weaknessesWithPct,
      totalBlunders,
      puzzles,
      ownBlunderPuzzles,
      stats,
    });
  } catch (error) {
    console.error("Puzzle recommendations error:", error);
    res.status(500).json({ error: "Failed to get puzzle recommendations" });
  }
});

// GET /api/puzzles/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const puzzle = await getPuzzle(req.params.id);
    if (!puzzle) {
      res.status(404).json({ error: "Puzzle not found" });
      return;
    }
    res.json(puzzle);
  } catch (error) {
    console.error("Get puzzle error:", error);
    res.status(500).json({ error: "Failed to get puzzle" });
  }
});

// POST /api/puzzles/:id/attempt
router.post("/:id/attempt", async (req: Request, res: Response) => {
  try {
    const { username, solved, attempts, timeSeconds } = req.body as {
      username: string;
      solved: boolean;
      attempts: number;
      timeSeconds?: number;
    };

    if (!username || typeof solved !== "boolean") {
      res.status(400).json({ error: "username and solved are required" });
      return;
    }

    await insertPuzzleAttempt(
      username,
      req.params.id,
      solved,
      attempts || 1,
      timeSeconds ?? null
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Record attempt error:", error);
    res.status(500).json({ error: "Failed to record attempt" });
  }
});

export default router;
