// ══════════════════════════════════════════════════════════════════════════
// src/lib/vtex/orders-broadcaster.ts — ¿está bien enchufado el webhook?
// ══════════════════════════════════════════════════════════════════════════
// E-33. El Orders Broadcaster de VTEX es el mecanismo que nos avisa cuando una
// orden cambia de estado. **Sin él no llega una sola orden nueva**: el cliente
// queda con lo que trajo el backfill histórico y nada más, que es
// indistinguible de un alta exitosa hasta que alguien mira los números. Ya
// rompió a TeVe Compras entero: 0 de 8 órdenes atribuidas.
//
// ── QUÉ FALTABA, QUE NO ERA LO QUE DECÍA LA FICHA ────────────────────────
// La ficha del plan decía "falta el botón para configurarlo". Al mirar el
// código, configurar **ya estaba resuelto**: existe
// `/api/admin/vtex-configure-broadcaster` y `activate-client` lo dispara solo al
// activar un cliente.
//
// Lo que falta es lo otro: **nadie verifica que haya quedado bien.**
//   · `activate-client` lo intenta y, si falla, NO bloquea — deja un flag en un
//     JSON que alguien tiene que acordarse de mirar.
//   · El semáforo de E-15 hardcodea `webhookVtexRegistrado: null` ("sin
//     verificar") porque llamar a VTEX lo haría lento.
//   · La única verificación real es un endpoint de *debug* con `orgSlug=teve`
//     hardcodeado como valor por defecto.
//
// O sea: el sistema dispara el POST, no mira el resultado, y después pregunta.
//
// ── EL CASO QUE NADIE ESTABA MIRANDO ─────────────────────────────────────
// Que el hook EXISTA no alcanza. VTEX guarda **un solo hook por cuenta**, y la
// URL lleva `?org=<orgId>` para que sepamos de quién es cada orden. Hay dos
// formas de que esté configurado y mal:
//
//   · **sin `?org=`** — es lo que le pasó a TeVe Compras. Las órdenes llegan y
//     no se pueden atribuir a nadie.
//   · **con el `?org=` de OTRO cliente** — las órdenes de este cliente se
//     cuentan como del otro. Es el peor de todos, es silencioso, y es el que se
//     vuelve probable justo cuando empiezan a entrar clientes: alcanza con
//     copiar el curl de un alta anterior y olvidarse de cambiar el id.
//
// El endpoint de debug detectaba el primero y **no el segundo**.
// ══════════════════════════════════════════════════════════════════════════

export type VeredictoDelHook =
  /** Configurado, apunta a nosotros y con el org correcto. */
  | "ok"
  /** No hay ningún hook configurado en esa cuenta de VTEX. */
  | "sin-hook"
  /** Hay hook y apunta a nosotros, pero sin `?org=`. El caso TeVe Compras. */
  | "sin-org"
  /** Hay hook y lleva el `org` de OTRO cliente. El peor, y silencioso. */
  | "org-ajena"
  /** Hay hook pero apunta a otro lado (otro proveedor, un endpoint viejo). */
  | "dominio-ajeno";

export type AnalisisDelHook = {
  veredicto: VeredictoDelHook;
  /** `true` sólo si el veredicto es "ok". Es lo que consume el semáforo. */
  registrado: boolean;
  /** El org que la URL configurada dice, si dice alguno. */
  orgEnLaUrl: string | null;
  /** Qué hacer, en una línea, listo para mostrar. */
  queHacer: string;
};

/** Los dominios que son nuestros. Un hook que no apunte acá no nos llega. */
const DOMINIOS_PROPIOS = /nitrosales|99media/i;

/**
 * Decide si el hook configurado en VTEX sirve para esta organización.
 *
 * Es puro a propósito: el criterio es la parte que hay que poder probar, y la
 * llamada a VTEX es la parte que no se puede.
 *
 * @param urlConfigurada la URL que VTEX tiene guardada, o `null` si no hay hook
 * @param orgIdEsperado  el id de la organización que estamos verificando
 */
export function analizarHook(
  urlConfigurada: string | null | undefined,
  orgIdEsperado: string,
): AnalisisDelHook {
  if (!urlConfigurada || typeof urlConfigurada !== "string" || !urlConfigurada.trim()) {
    return {
      veredicto: "sin-hook",
      registrado: false,
      orgEnLaUrl: null,
      queHacer:
        "No hay Orders Broadcaster configurado: no va a llegar ninguna orden nueva. " +
        `Configuralo con POST /api/admin/vtex-configure-broadcaster?orgSlug=<slug>.`,
    };
  }

  if (!DOMINIOS_PROPIOS.test(urlConfigurada)) {
    return {
      veredicto: "dominio-ajeno",
      registrado: false,
      orgEnLaUrl: null,
      queHacer:
        `El hook apunta a ${recortar(urlConfigurada)}, que no es nuestro. Las órdenes ` +
        "se están yendo a otro lado. Revisá con el cliente antes de pisarlo: VTEX " +
        "guarda un solo hook por cuenta y configurarlo borra el que está.",
    };
  }

  const orgEnLaUrl = orgDeLaUrl(urlConfigurada);

  if (!orgEnLaUrl) {
    return {
      veredicto: "sin-org",
      registrado: false,
      orgEnLaUrl: null,
      queHacer:
        "El hook existe pero le falta `?org=` en la URL, así que las órdenes llegan " +
        "y no se pueden atribuir a nadie. Es lo que le pasó a TeVe Compras. " +
        "Reconfiguralo con POST /api/admin/vtex-configure-broadcaster.",
    };
  }

  if (orgEnLaUrl !== orgIdEsperado) {
    return {
      veredicto: "org-ajena",
      registrado: false,
      orgEnLaUrl,
      queHacer:
        `⚠️ El hook está mandando las órdenes de este cliente a la organización ` +
        `${orgEnLaUrl}, que NO es la suya. Los dos clientes tienen los números mal. ` +
        "Reconfiguralo YA y revisá las órdenes ya ingresadas de las dos.",
    };
  }

  return {
    veredicto: "ok",
    registrado: true,
    orgEnLaUrl,
    queHacer: "",
  };
}

/** El `org` de la query string, si la URL trae uno. */
function orgDeLaUrl(url: string): string | null {
  const m = url.match(/[?&]org=([^&#\s]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]) || null;
  } catch {
    return m[1] || null;
  }
}

function recortar(s: string): string {
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

// ══════════════════════════════════════════════════════════════════════════
// La parte que habla con VTEX
// ══════════════════════════════════════════════════════════════════════════

/**
 * Le pregunta a VTEX qué hook tiene configurado y lo analiza.
 *
 * **Nunca tira.** Un semáforo que se rompe no puede tumbar la pantalla que lo
 * muestra, y sobre todo no puede reportar "está mal" cuando lo que pasó es que
 * no pudo preguntar. Si algo falla, `registrado: null` — que es "no sé", y en
 * el semáforo sale en amarillo con la instrucción al lado.
 */
export async function verificarOrdersBroadcaster(
  orgId: string,
): Promise<{ registrado: boolean | null; detalle?: string }> {
  try {
    const { getVtexConfig } = await import("@/lib/vtex-credentials");
    const cfg: any = await getVtexConfig(orgId);
    const account = cfg?.creds?.accountName;
    if (!account) return { registrado: null, detalle: "La organización no tiene credenciales de VTEX." };

    const res = await fetch(
      `https://${account}.vtexcommercestable.com.br/api/orders/hook/config`,
      { headers: cfg.headers, signal: AbortSignal.timeout(12_000) },
    );

    // 404 = VTEX contesta que no hay nada configurado. Eso NO es un error de
    // la consulta: es la respuesta, y es la mala.
    if (res.status === 404) {
      const a = analizarHook(null, orgId);
      return { registrado: a.registrado, detalle: a.queHacer };
    }
    if (!res.ok) {
      return {
        registrado: null,
        detalle: `VTEX respondió ${res.status} al consultar el hook. No se pudo verificar.`,
      };
    }

    const body: any = await res.json().catch(() => null);
    const a = analizarHook(body?.url, orgId);
    return { registrado: a.registrado, detalle: a.queHacer || undefined };
  } catch (e: any) {
    return {
      registrado: null,
      detalle: `No se pudo consultar VTEX: ${String(e?.message || e).slice(0, 140)}`,
    };
  }
}
