// ══════════════════════════════════════════════════════════════
// VTEX Email helper (cross-pipeline)
// ══════════════════════════════════════════════════════════════
// VTEX entrega emails en 2 formatos enmascarados:
//
//   1. "real@email.com-265600829169b.ct.vtex.com.br"
//      → tiene el email real escondido (caso comun, customer dio email)
//
//   2. "abc123def456@ct.vtex.com.br"
//      → es un hash anonimo (customer NO dio email, VTEX lo invento)
//
// Esta funcion devuelve:
//   - El email real si esta enmascarado
//   - "" (string vacio) si es hash anonimo (no es un email real, no sirve)
//   - El email original lowercased si ya estaba limpio
//
// CRITICO: este helper se usa en TODOS los pipelines que ingesten orders
// VTEX (webhook, backfill, sync) para que la data quede consistente.
// Antes era una funcion duplicada en 3 archivos distintos y faltaba en
// el backfill, lo que hizo que TVC quede con 43% de emails enmascarados.
// ══════════════════════════════════════════════════════════════

export function extractRealEmail(vtexEmail: string | null | undefined): string {
  if (!vtexEmail) return "";

  const raw = String(vtexEmail).trim();
  if (!raw) return "";

  // Caso 1: hash anonimo "abc123def456@ct.vtex.com.br"
  // VTEX genera 20+ caracteres hex cuando el customer no dio email.
  const vtexAnonPattern = /^[a-f0-9]{20,}@ct\.vtex\.com\.br$/i;
  if (vtexAnonPattern.test(raw)) {
    return ""; // No es email real — no sirve para nada
  }

  // Caso 2: enmascarado "real@email.com-{vtexId}b.ct.vtex.com.br"
  // VTEX appendea el ID del orden + ".ct.vtex.com.br" al email real.
  const vtexMaskPattern = /-[0-9a-z]+b?\.ct\.vtex\.com\.br$/i;
  if (vtexMaskPattern.test(raw)) {
    const cleaned = raw.replace(vtexMaskPattern, "");
    // Validar que el resultado sea un email valido
    if (cleaned.includes("@") && cleaned.includes(".")) {
      return cleaned.toLowerCase();
    }
    return ""; // Si quedo algo raro, descartamos
  }

  // Caso 3: email ya limpio
  return raw.toLowerCase();
}
