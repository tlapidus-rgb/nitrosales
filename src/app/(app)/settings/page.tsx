import { redirect } from "next/navigation";

// /settings raiz → redirige a Organizacion (primer tab productivo).
// La logica real vive en /settings/[tab]/page.tsx.
export default function SettingsIndex() {
  redirect("/settings/organizacion");
}
