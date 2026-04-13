import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (req.nextUrl.pathname.startsWith("/player/") && !req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/player/:path*"],
};
