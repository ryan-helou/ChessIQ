"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "";
  const resetSuccess = searchParams.get("reset") === "success";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(errorParam ? "Invalid email or password." : "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    // Get the chess.com username from the session to build redirect URL
    // Fetch session to get chessComUsername
    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();
    const username = session?.user?.chessComUsername;

    if (callbackUrl) {
      router.push(callbackUrl);
    } else if (username) {
      router.push(`/player/${username}`);
    } else {
      router.push("/");
    }
    router.refresh();
  };

  return (
    <div
      className="card p-8"
      style={{ borderColor: "var(--border-strong)" }}
    >
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", marginBottom: "6px" }}>
        Sign in
      </h1>
      <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "28px" }}>
        Welcome back to ChessIQ
      </p>

      {resetSuccess && (
        <div
          className="rounded-lg p-3 mb-5 text-sm"
          style={{ background: "var(--green-dim)", border: "1px solid var(--green-line)", color: "var(--green)" }}
        >
          Password reset successfully. Sign in with your new password.
        </div>
      )}

      {error && (
        <div
          className="rounded-lg p-3 mb-5 text-sm"
          style={{ background: "var(--loss-dim)", border: "1px solid rgba(202,52,49,0.3)", color: "#e57373" }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="input-base rounded-lg px-3 py-2.5 text-sm w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>Password</label>
            <Link
              href="/forgot-password"
              style={{ fontSize: "12px", color: "var(--green)", textDecoration: "none" }}
            >
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            className="input-base rounded-lg px-3 py-2.5 text-sm w-full"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-gold rounded-lg py-2.5 text-sm mt-1"
          style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "var(--text-3)" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" style={{ color: "var(--green)", textDecoration: "none", fontWeight: 600 }}>
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
