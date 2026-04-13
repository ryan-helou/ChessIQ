/**
 * Deterministic UUID from a Chess.com username.
 * This is used as the user_id in the games table.
 * Kept for backward-compatibility — existing game rows use this ID.
 */
export function usernameToUserId(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = Math.imul(31, h) + username.charCodeAt(i) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `00000000-0000-0000-0000-${hex.padStart(12, "0")}`;
}
