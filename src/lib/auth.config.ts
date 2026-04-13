import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";

// Edge-compatible auth config — no Node.js/DB imports.
// Used by middleware for JWT verification only.
export const authConfig = {
  pages: {
    signIn: "/login",
    error:  "/login",
  },
  session: { strategy: "jwt" as const },
  callbacks: {
    jwt({ token, user }: { token: JWT; user?: { id?: string; chessComUsername?: string } }) {
      if (user) {
        token.id               = user.id;
        token.chessComUsername = user.chessComUsername;
      }
      return token;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      session.user.id               = token.id as string;
      session.user.chessComUsername = token.chessComUsername as string;
      return session;
    },
  },
  providers: [], // Credentials provider added in auth.ts (Node.js only)
} satisfies NextAuthConfig;
