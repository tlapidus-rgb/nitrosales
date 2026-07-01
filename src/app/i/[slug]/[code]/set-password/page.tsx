// Página pública: el afiliado define su contraseña desde el link del mail (Opción B).
// Server component: lee params + token de la URL y se lo pasa al form (client).

import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";

export default function SetPasswordPage({
  params,
  searchParams,
}: {
  params: { slug: string; code: string };
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <SetPasswordForm slug={params.slug} code={params.code} token={token} />
  );
}
