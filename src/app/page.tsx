import { redirect } from "next/navigation";

export default function Home() {
  // Por ahora redirige al dashboard.
  // Cuando sumemos auth, va a chequear si está logueado primero.
  redirect("/dashboard");
}
