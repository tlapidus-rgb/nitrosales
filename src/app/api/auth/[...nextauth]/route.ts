export const dynamic = "force-dynamic";

// BP-ROLES-001: este handler ahora usa la config ÚNICA de @/lib/auth
// (authOptions). Antes tenía una config inline divergente que solo
// seteaba role+organizationId en el JWT e ignoraba authOptions
// (impersonate, View-as-Org, login logging, isStaff, allowedSections).
// Ese split-brain hacía que el middleware no viera allowedSections.

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
