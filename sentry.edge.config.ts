import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: 0.1,

  // Only send errors in production
  enabled: process.env.NODE_ENV === "production",
});
