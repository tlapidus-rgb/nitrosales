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

/**
 * Las únicas plataformas cuyas credenciales el cliente TIPEA en el wizard.
 *
 * ⚠️ ESTO ES EL CORAZÓN DEL ARREGLO (revisión del 2026-09-07). La primera
 * versión validaba TODAS las plataformas y rompía el alta para tres de las
 * cuatro.
 *
 * Motivo: en Meta Ads, Google Ads y MercadoLibre las credenciales de verdad
 * —`accessToken`, `refreshToken`— **no viajan en el wizard**. Viven en la
 * Connection del lado del servidor, puestas ahí por el callback de OAuth, y el
 * componente del wizard ni siquiera las conoce (`grep -c refreshToken
 * OnboardingOverlay.tsx` → 0). El submit las recupera y las mergea, pero
 * **después** de este punto.
 *
 * Con lo cual la validación las veía vacías y los testers devolvían una falla
 * CONFIRMADA —"OAuth pendiente, falta autorizar Google Ads"— sobre un cliente
 * que ya había hecho OAuth. Resultado: 400 en cada intento, sin ninguna forma
 * de salir del loop desde la interfaz. El alta quedaba imposible de completar.
 *
 * Y aunque se validara después del merge, seguiría estando mal: una falla de
 * OAuth **no es accionable por el cliente desde el wizard**. Lo que E-13 viene
 * a evitar es la ida y vuelta por credenciales MAL TIPEADAS, y las tipeadas son
 * las de VTEX. El estado de las conexiones OAuth lo mira el admin en el semáforo
 * (`/api/admin/onboardings/[id]/readiness`), que corre sobre las credenciales
 * ya guardadas.
 */
export const PLATAFORMAS_QUE_SE_TIPEAN = new Set(["VTEX"]);

/**
 * De todo lo que mandó el wizard, qué se valida realmente.
 *
 * Vive acá y no en la route para poder testear el criterio: el bug de arriba
 * era exactamente esta línea, y estaba escrita adentro del handler donde no la
 * cubría nada.
 *
 * `esPlataformaConocida` lo inyecta quien llama porque la lista de plataformas
 * válidas es de la route (incluye cosas como NITROPIXEL que no son una conexión
 * con credenciales).
 */
export function plataformasAValidar<T extends { platform: string }>(
  platforms: readonly T[],
  esPlataformaConocida: (p: string) => boolean,
): T[] {
  return platforms.filter(
    (p) => esPlataformaConocida(p.platform) && PLATAFORMAS_QUE_SE_TIPEAN.has(p.platform),
  );
}

/**
 * Fallas que NO son culpa de las credenciales: la plataforma tardó o la red
 * falló. Se tratan como inconcluso.
 *
 * ⚠️ Esto está acoplado al texto que devuelve `credential-tests.ts`, y eso es
 * feo, pero la alternativa era peor. Los testers ya convierten el timeout en
 * `ok:false` con su propio tope de 10s (`credential-tests.ts:499`), o sea que
 * el "no sé" se vuelve "no" ANTES de que el presupuesto de acá se entere. Sin
 * esto, una Graph API de Meta que tarda 11 segundos le bloquea el alta a un
 * cliente cuyas credenciales están perfectas.
 *
 * El acoplamiento está pineado por un test: si alguien cambia el texto, salta
 * ahí y no en producción.
 */
const SEÑALES_DE_FALLA_TRANSITORIA = ["timeout", "error de red"];

function esTransitoria(detalle?: string): boolean {
  if (!detalle) return false;
  const d = detalle.toLowerCase();
  return SEÑALES_DE_FALLA_TRANSITORIA.some((s) => d.includes(s));
}

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
              // Una falla transitoria vuelve como inconcluso: no es culpa de
              // las credenciales y no puede trabar un alta.
              ok: x.ok ? true : esTransitoria(x.detail) ? null : false,
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
