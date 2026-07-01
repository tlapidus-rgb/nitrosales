import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { landingPathForAllowedSections } from "@/lib/section-access";
import {
  resolveEffectivePermissionsByEmail,
  allowedSectionsFrom,
} from "@/lib/permissions-resolve";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Landing: manda a la primera sección permitida del user. Los users normales
  // (con "dashboard") caen en /dashboard como siempre; un user restringido
  // (ej: solo-pixel) cae en su sección (nitropixel/pixel) en vez de un /dashboard
  // que tendría bloqueado.
  //
  // Resolvemos las secciones FRESCAS desde la DB (no del snapshot del token). El
  // snapshot llega undefined al RSC en algunos casos y mandaba al fallback
  // /dashboard, que el middleware bloquea para un user restringido → /unauthorized.
  // Resolviendo por email usamos exactamente lo mismo que snapshotea el middleware.
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  let allowed: string[] | undefined;
  if (email) {
    try {
      const eff = await resolveEffectivePermissionsByEmail(email);
      allowed = eff ? allowedSectionsFrom(eff.permissions) : undefined;
    } catch {
      allowed = undefined; // fail-open → /dashboard (comportamiento previo)
    }
  }
  redirect(landingPathForAllowedSections(allowed));
}
