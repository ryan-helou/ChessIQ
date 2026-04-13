"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    setSubmitted(true);
  };

  return (
    <div className="card p-8" style={{ borderColor: "var(--border-strong)" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", marginBottom: "6px" }}>
        Forgot password
      </h1>
      <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "28px" }}>
        {submitted
          ? "Check your inbox"
          : "Enter your email and we'll send you a reset link"}
      </p>

      {submitted ? (
        <div>
          <div
            className="rounded-lg p-4 mb-6 text-sm"
            style={{ background: "var(--green-dim)", border: "1px solid var(--green-line)", color: "var(--green)" }}
          >
            If an account with that email exists, you&apos;ll receive a reset link shortly.
            The link expires in 1 hour.
          </div>
          <Link
            href="/login"
            className="btn-gold rounded-lg py-2.5 text-sm block text-center"
            style={{ textDecoration: "none" }}
          >
            Back to sign in
          </Link>
        </div>
      ) : (
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

          <button
            type="submit"
            disabled={loading}
            className="btn-gold rounded-lg py-2.5 text-sm"
            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <Link
            href="/login"
            style={{ textAlign: "center", fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}
          >
            ← Back to sign in
          </Link>
        </form>
      )}
    </div>
  );
}
