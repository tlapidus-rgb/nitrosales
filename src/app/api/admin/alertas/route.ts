import { NextResponse } from "next/server";
import { isInternalUser } from "@/lib/feature-flags";
import { obtenerAlertasClientes } from "@/lib/alertas/clientes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request) {
  try {
    if (!(await isInternalUser())) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(await obtenerAlertasClientes());
  } catch (e) {
    console.error("[/api/admin/alertas]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
