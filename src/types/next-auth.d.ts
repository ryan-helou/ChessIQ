import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    chessComUsername?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      chessComUsername: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    chessComUsername?: string;
  }
}
