const TACTICAL_THEMES = new Set([
  "mate", "backRankMate", "promotion", "hangingPiece",
  "fork", "discoveredAttack", "skewer", "materialGain", "pin",
]);

const POSITIONAL_THEMES = new Set([
  "exposedKing", "weakKingSafety", "inactivePieces",
  "pawnStructure", "poorPawnStructure", "overextension", "positional",
]);

export function classifyTacticCategory(theme: string | null): "tactical" | "positional" | "unknown" {
  if (!theme) return "unknown";
  if (TACTICAL_THEMES.has(theme)) return "tactical";
  if (POSITIONAL_THEMES.has(theme)) return "positional";
  return "unknown";
}
