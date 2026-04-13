import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Use Edge-safe config (no pg/Node.js imports)
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (req.nextUrl.pathname.startsWith("/player/") && !req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/player/:path*"],
};
