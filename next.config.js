const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import("next").NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Sentry options
  org: "nitrosales",
  project: "javascript-nextjs",

  // Suppress source map upload logs
  silent: true,

  // Upload source maps for better stack traces
  widenClientFileUpload: true,

  // Hide source maps from users
  hideSourceMaps: true,

  // Tree-shake Sentry logger statements
  disableLogger: true,

  // Automatically instrument API routes
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
});
