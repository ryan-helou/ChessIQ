import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { query } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log("[auth] missing credentials");
            return null;
          }

          const email = String(credentials.email).toLowerCase().trim();
          const password = String(credentials.password);
          console.log("[auth] authorizing:", email);

          const result = await query(
            "SELECT id, email, password_hash, chess_com_username FROM users WHERE email = $1",
            [email]
          );
          const user = result.rows[0];
          if (!user) {
            console.log("[auth] user not found:", email);
            return null;
          }

          const valid = await compare(password, user.password_hash);
          console.log("[auth] password valid:", valid);
          if (!valid) return null;

          return {
            id:               user.id,
            email:            user.email,
            chessComUsername: user.chess_com_username,
          };
        } catch (err) {
          console.error("[auth] authorize error:", err);
          return null;
        }
      },
    }),
  ],
});
