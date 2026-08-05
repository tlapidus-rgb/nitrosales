// Preview del design system "enterprise" — scopea Geist + el canvas warm a esta
// ruta, sin tocar el resto de la app. Ver design-appstack-enterprise.local.md.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import type { ReactNode } from "react";

export const metadata = { title: "Design preview · nitrosales" };

export default function DesignPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${GeistSans.variable} ${GeistMono.variable} font-geist min-h-screen bg-canvas text-ink antialiased`}>
      {children}
    </div>
  );
}
