// ══════════════════════════════════════════════════════════════
// /control — Centro de Control (panel admin, separado del producto)
// ══════════════════════════════════════════════════════════════
// Layout propio, minimalista, dark. Fuera del shell de NitroSales
// porque este panel no es producto: es panel interno de Tomy.
// Gated por isInternalUser().
// ══════════════════════════════════════════════════════════════

import { redirect } from "next/navigation";
import { isInternalUser } from "@/lib/feature-flags";
import ControlNav from "./ControlNav";

export const dynamic = "force-dynamic";

export default async function ControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const allowed = await isInternalUser();
  if (!allowed) {
    redirect("/");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0B",
        color: "#E4E4E7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <ControlNav />
      <main style={{ paddingTop: 72 }}>{children}</main>
    </div>
  );
}
