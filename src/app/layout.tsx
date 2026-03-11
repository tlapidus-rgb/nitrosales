import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NitroSales - Inteligencia para vender más",
  description: "Dashboard inteligente con IA para ecommerce. Conectá tu tienda, analytics y ads en un solo lugar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
