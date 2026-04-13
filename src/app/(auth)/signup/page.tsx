"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [chessComUsername, setChessComUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, chessComUsername }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Registration failed. Please try again.");
      setLoading(false);
      return;
    }

    // Auto sign-in after successful registration
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // Account created but sign-in failed — send to login
      router.push("/login");
      return;
    }

    // Get username from session to build redirect
    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();
    const username = session?.user?.chessComUsername;

    router.push(username ? `/player/${username}` : "/");
    router.refresh();
  };

  return (
    <div className="card p-8" style={{ borderColor: "var(--border-strong)" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", marginBottom: "6px" }}>
        Create account
      </h1>
      <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "28px" }}>
        Start improving your chess today
      </p>

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
          <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>Chess.com Username</label>
          <input
            type="text"
            value={chessComUsername}
            onChange={(e) => setChessComUsername(e.target.value)}
            placeholder="YourChessComUsername"
            required
            autoComplete="off"
            className="input-base rounded-lg px-3 py-2.5 text-sm w-full"
          />
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
            Must match your Chess.com account exactly
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoComplete="new-password"
            className="input-base rounded-lg px-3 py-2.5 text-sm w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="new-password"
            className="input-base rounded-lg px-3 py-2.5 text-sm w-full"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-gold rounded-lg py-2.5 text-sm mt-1"
          style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "var(--text-3)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--green)", textDecoration: "none", fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
