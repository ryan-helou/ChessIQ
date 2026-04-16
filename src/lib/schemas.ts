import { z } from "zod";

export const usernameSchema = z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/);

export const depthSchema = z.number().int().min(8).max(22).default(12);

export const gameReviewBodySchema = z.object({
  pgn: z.string().min(10).max(200_000),
  depth: depthSchema.optional(),
  chessComId: z.string().optional(),
});
