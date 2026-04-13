"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="card p-8" style={{ borderColor: "var(--border-strong)" }}>
        <p style={{ color: "#e57373", textAlign: "center", marginBottom: "16px" }}>
          Invalid or missing reset link.
        </p>
        <Link href="/forgot-password" className="btn-gold rounded-lg py-2.5 text-sm block text-center" style={{ textDecoration: "none" }}>
          Request a new link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to reset password. The link may have expired.");
      return;
    }

    router.push("/login?reset=success");
  };

  return (
    <div className="card p-8" style={{ borderColor: "var(--border-strong)" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-1)", marginBottom: "6px" }}>
        Set new password
      </h1>
      <p style={{ color: "var(--text-2)", fontSize: "14px", marginBottom: "28px" }}>
        Choose a strong password for your account
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
          <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-2)" }}>New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
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
          className="btn-gold rounded-lg py-2.5 text-sm"
          style={{ opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
