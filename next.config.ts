import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Sentry source maps upload (requires SENTRY_AUTH_TOKEN in CI)
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,            // Suppress Sentry CLI output during build
  disableLogger: true,
  automaticVercelMonitors: false,
});
