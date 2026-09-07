// ══════════════════════════════════════════════════════════════════════════
// src/lib/onboarding/validacion-wizard.ts — validar credenciales al enviar
// ══════════════════════════════════════════════════════════════════════════
// E-13, versión "punto medio".
//
// La ficha del plan decía "exponer el test de credenciales en el wizard y
// bloquear el submit hasta que pasen". Pero el endpoint
// (`/api/onboarding/test-credentials`) **no estaba apagado por olvido**: su
// propio comentario dice que se sacó del UI *"por decisión de UX — el cliente no
// debe ver fallas, las valida el admin antes de aprobar el backfill"*.
//
// Encender el botón "Probar conexión" habría revertido esa decisión. Esto no lo
// hace: **no hay botón de probar y no se muestra nunca un error crudo**. Lo que
// se hace es validar UNA vez, al enviar, y si algo no anda devolver la
// instrucción concreta para corregirlo.
//
// Y hay una razón por la que eso no choca con la decisión original: los `hint`
// de `credential-tests.ts` ya están escritos para un humano no técnico —
// *"El App Token de VTEX tiene 60+ caracteres. Volvé a tu admin VTEX, copialo
// COMPLETO sin cortar"*. Lo que la decisión de UX quería evitar era el error
// crudo, no la ayuda.
//
// ── LO INCONCLUSO NO BLOQUEA ─────────────────────────────────────────────
// Si un test se pasa del presupuesto de tiempo o explota, **se deja pasar**. Un
// cliente no puede quedar trabado en el alta porque nuestra verificación estuvo
// lenta o porque la API de la plataforma tuvo un hipo. Sólo bloquea una falla
// que el test alcanzó a confirmar.
// ══════════════════════════════════════════════════════════════════════════

import { testCredentialsByPlatform } from "@/lib/onboarding/credential-tests";

/** Cuánto se espera en total por TODAS las verificaciones, en paralelo. */
export const PRESUPUESTO_VALIDACION_MS = 20_000;

export type ResultadoDePlataforma = {
  plataforma: string;
  /** `true` pasó · `false` falló de verdad · `null` no se pudo determinar. */
  ok: boolean | null;
  detalle?: string;
  hint?: string;
};

/** Nombre lindo para el cliente. Los internos no le dicen nada a nadie. */
const NOMBRES: Record<string, string> = {
  VTEX: "VTEX",
  MERCADOLIBRE: "MercadoLibre",
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  GSC: "Google Search Console",
};

const nombre = (p: string) => NOMBRES[p] ?? p;

/**
 * El mensaje que ve el cliente, o `null` si puede seguir.
 *
 * Sólo menciona lo que **falló de verdad**. Lo inconcluso no aparece: decirle
 * "no pudimos verificar Meta Ads" a alguien que está terminando un alta es
 * ruido que no puede accionar.
 */
export function mensajeParaElCliente(resultados: ResultadoDePlataforma[]): string | null {
  const fallaron = resultados.filter((r) => r.ok === false);
  if (fallaron.length === 0) return null;

  const lineas = fallaron.map((r) => {
    // El `hint` está escrito para un humano y dice qué hacer; el `detail` es
    // más técnico. Se prefiere el hint y se cae al detail sólo si no hay.
    const ayuda = r.hint || r.detalle || "revisá los datos e intentá de nuevo";
    return `${nombre(r.plataforma)}: ${ayuda}`;
  });

  const encabezado =
    fallaron.length === 1
      ? "No pudimos conectarnos con una de tus plataformas."
      : `No pudimos conectarnos con ${fallaron.length} de tus plataformas.`;

  return `${encabezado}\n\n${lineas.join("\n\n")}\n\nCorregí eso y volvé a enviar. Si ya lo revisaste y sigue igual, escribinos y lo vemos juntos.`;
}

/**
 * Corre los tests de todas las plataformas en paralelo, con un tope de tiempo
 * total. Lo que no termine a tiempo vuelve como `ok: null` (inconcluso).
 */
export async function validarCredenciales(
  plataformas: Array<{ platform: string; credentials: unknown }>,
  opts: { presupuestoMs?: number } = {},
): Promise<ResultadoDePlataforma[]> {
  const presupuesto = opts.presupuestoMs ?? PRESUPUESTO_VALIDACION_MS;

  const conTope = <T,>(p: Promise<T>, alVencer: T): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(alVencer), presupuesto)),
    ]);

  return Promise.all(
    plataformas.map(async ({ platform, credentials }) => {
      const inconcluso: ResultadoDePlataforma = { plataforma: platform, ok: null };
      try {
        const r = await conTope(
          testCredentialsByPlatform(platform, credentials).then(
            (x): ResultadoDePlataforma => ({
              plataforma: platform,
              ok: !!x.ok,
              detalle: x.detail,
              hint: x.hint,
            }),
          ),
          inconcluso,
        );
        return r;
      } catch {
        // Que la verificación explote no puede trabar un alta.
        return inconcluso;
      }
    }),
  );
}
