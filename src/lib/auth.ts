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
        if (!credentials?.email || !credentials?.password) return null;

        const result = await query(
          "SELECT id, email, password_hash, chess_com_username FROM users WHERE email = $1",
          [String(credentials.email).toLowerCase().trim()]
        );
        const user = result.rows[0];
        if (!user) return null;

        const valid = await compare(String(credentials.password), user.password_hash);
        if (!valid) return null;

        return {
          id:               user.id,
          email:            user.email,
          chessComUsername: user.chess_com_username,
        };
      },
    }),
  ],
});
