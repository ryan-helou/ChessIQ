import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Starter CSP — report-only so we can tune without breaking the app.
// 'unsafe-inline'/'unsafe-eval' on scripts are needed for Next.js dev + some
// third-party widgets; tighten once we have nonce-based inline script support.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://www.chess.com https://images.chesscomfiles.com https://*.chesscomfiles.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.chess.com https://explorer.lichess.ovh https://*.railway.app https://*.sentry.io https://*.ingest.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.chess.com" },
      { protocol: "https", hostname: "images.chesscomfiles.com" },
      { protocol: "https", hostname: "*.chesscomfiles.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  disableLogger: true,
});
