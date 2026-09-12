// ══════════════════════════════════════════════════════════════════════════
// src/lib/onboarding/verificacion-pixel.ts — ¿llegó algo del pixel?
// ══════════════════════════════════════════════════════════════════════════
// E-14, la mitad que faltaba. El wizard tiene un checkbox **"ya pegué el
// snippet"** que no verifica absolutamente nada: el backend lo descarta
// (`NITROPIXEL` no está en `VALID_PLATFORMS`), así que un cliente puede
// completar el alta entera sin haber instalado el pixel y nadie se entera.
//
// ── LO QUE HACE VIABLE VERIFICARLO EN EL WIZARD ──────────────────────────
// El usuario del wizard **ya pertenece a una organización** (`state` devuelve
// `orgId` justo para incrustarlo en el snippet), así que el snippet que copia es
// real y los eventos pueden empezar a llegar mientras completa el alta. No hace
// falta esperar a la activación.
//
// ── POR QUÉ NO ALCANZA CON `testNitroPixel` ──────────────────────────────
// Ese mira una ventana de 48 h, que es lo correcto para el semáforo del admin y
// lo inútil acá: el cliente pegó el snippet hace treinta segundos y quiere saber
// si funcionó. Necesita una ventana corta, y necesita distinguir "nunca llegó
// nada" de "llegó antes pero ahora no".
//
// ── Y POR QUÉ CERO EVENTOS NO PRUEBA QUE ESTÉ MAL ────────────────────────
// Una tienda recién abierta puede no tener una sola visita. Si el mensaje dijera
// "el pixel no está instalado", le estaríamos echando la culpa al cliente por no
// tener tráfico. Es la misma disciplina que E-24: **no afirmar más de lo que el
// dato sostiene.**
//
// Y por eso esto **no bloquea el alta**: NitroPixel no es una plataforma
// esencial del wizard, y lo inconcluso no puede trabar a nadie (la lección de
// E-13, que rompió el alta dos veces por exactamente eso). El chequeo que sí
// decide es el del semáforo, al habilitar.
// ══════════════════════════════════════════════════════════════════════════

export type EstadoDelPixel =
  /** Llegaron eventos en la ventana reciente: está andando, confirmado ahora. */
  | "recibiendo"
  /** Llegó algo alguna vez, pero nada reciente. Instalado; sin tráfico ahora. */
  | "recibio-antes"
  /** Nunca llegó nada. Puede ser que no esté instalado, o que no haya visitas. */
  | "sin-senal";

export type VerificacionDelPixel = {
  estado: EstadoDelPixel;
  /** `true` si podemos afirmar que está instalado. */
  confirmado: boolean;
  titulo: string;
  detalle: string;
};

/** Cuánto hacia atrás se mira para decir "está llegando AHORA". */
export const VENTANA_RECIENTE_MIN = 30;

export function evaluarPixel(i: {
  /**
   * Si llegó **algún** evento en los últimos `VENTANA_RECIENTE_MIN` minutos.
   *
   * Es un booleano y no un conteo a propósito: contar sobre `pixel_events` es el
   * error de performance #1 de este repo (millones de filas), y para lo único
   * que sirve el número acá es para decorar el mensaje. Con un `LIMIT 1` sobre
   * el índice alcanza y cuesta nada.
   */
  hayEventosRecientes: boolean;
  /** Si llegó algún evento alguna vez. */
  huboEventosAlgunaVez: boolean;
}): VerificacionDelPixel {
  if (i.hayEventosRecientes) {
    return {
      estado: "recibiendo",
      confirmado: true,
      titulo: "Listo, ya estamos recibiendo datos",
      detalle:
        `Nos llegaron eventos tuyos en los últimos ${VENTANA_RECIENTE_MIN} minutos. ` +
        "El pixel está instalado y funcionando.",
    };
  }

  if (i.huboEventosAlgunaVez) {
    return {
      estado: "recibio-antes",
      confirmado: true,
      titulo: "El pixel está instalado",
      detalle:
        "Recibimos eventos tuyos antes, aunque ninguno en los últimos minutos. " +
        "Eso es normal si tu sitio no tuvo visitas recién.",
    };
  }

  return {
    estado: "sin-senal",
    confirmado: false,
    titulo: "Todavía no nos llegó nada",
    // ⚠️ NO dice "el pixel no está instalado". No lo sabemos: puede estar
    // perfectamente puesto en un sitio que todavía no tuvo una visita.
    detalle:
      "Puede ser que nadie haya entrado a tu sitio desde que lo pegaste, o que el " +
      "snippet no haya quedado en el <head>. Probá abrir tu tienda en otra pestaña " +
      "y verificá de nuevo. Podés seguir con el alta igual: lo vamos a seguir " +
      "mirando y te avisamos si no llega nada.",
  };
}
