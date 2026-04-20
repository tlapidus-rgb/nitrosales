// @ts-nocheck
// ══════════════════════════════════════════════════════════════
// Layout público para /onboarding y /onboarding/status/[token]
// ══════════════════════════════════════════════════════════════
// NO requiere auth. Dark theme premium, fuera del app shell.
// ══════════════════════════════════════════════════════════════

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activar tu cuenta — NitroSales",
  description: "Solicitá la activación de tu cuenta de NitroSales en minutos.",
  robots: { index: false, follow: false }, // onboarding es por link, no público SEO
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0F",
        color: "#FFFFFF",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
