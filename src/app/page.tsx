import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { landingPathForAllowedSections } from "@/lib/section-access";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Landing: manda a la primera sección permitida del user. Los users normales
  // (con "dashboard") caen en /dashboard como siempre; un user restringido
  // (ej: solo-pixel) cae en /pixel en vez de un /dashboard que tendría bloqueado.
  const session = await getServerSession(authOptions);
  const allowed = (session?.user as { allowedSections?: string[] } | undefined)
    ?.allowedSections;
  redirect(landingPathForAllowedSections(allowed));
}
