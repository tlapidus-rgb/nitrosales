// ══════════════════════════════════════════════════════════════════════════
// src/lib/onboarding/listo-para-enviar.ts — ¿el alta se puede enviar?
// ══════════════════════════════════════════════════════════════════════════
// E-29. El wizard tenía UNA barra que decía "Completitud general" y llegaba al
// 100 % en verde contando cada plataforma salteada como "decidida". O sea que
// alguien que salteaba las seis veía **100 %, en verde, con el botón
// habilitado** — y al apretarlo el backend devolvía 400 "Tenés que conectar al
// menos una plataforma".
//
// No era una promesa falsa que dejaba pasar un lead: era una **pared**. La
// pantalla decía "listo" y el servidor decía "no", sin nada en el medio que
// explicara cuál de los dos tenía razón.
//
// ── EL CASO QUE NO ES HIPOTÉTICO ─────────────────────────────────────────
// NitroPixel se filtra antes de mandar (`p.key !== "NITROPIXEL"`), así que
// alguien que elige **sólo el pixel** y saltea el resto también llega a un
// `platforms: []` y al mismo 400. Y "sólo el pixel" no es un caso raro: es el
// paquete acotado que ya se vendió (TeVeCompras).
//
// ── LO QUE ESTO NO HACE ──────────────────────────────────────────────────
// No bloquea la captura de leads, que es deliberada. Un prospecto de Shopify
// que elige "la uso" viaja como `{platform:"VTEX", credentials:{provider:
// "shopify"}}`, o sea que **cuenta como plataforma** y pasa igual. Lo único que
// se bloquea es lo que el backend ya bloqueaba.
//
// Este módulo existe aparte del componente porque el componente no se puede
// testear: el repo no tiene stack de testing de React. La regla sí.
// ══════════════════════════════════════════════════════════════════════════

export type DecisionDePlataforma = "pending" | "use" | "skip";

/**
 * Plataformas que el wizard muestra pero **no manda al backend**.
 *
 * NitroPixel se instala con un script, no con credenciales: no hay Connection
 * que crear. El backend nunca la ve, y por eso elegir sólo ésta equivale a no
 * elegir ninguna.
 */
export const NO_VIAJAN_AL_BACKEND = new Set(["NITROPIXEL"]);

export type PlataformaDelWizard = {
  clave: string;
  nombre: string;
  decision: DecisionDePlataforma;
  /** `true` si la decisión es "use" y todos los campos requeridos están. */
  completa: boolean;
};

export type EstadoDelWizard = {
  /** Cuántas de las N plataformas tienen una decisión tomada y cerrada. */
  decididas: number;
  total: number;
  /** % de decisiones tomadas. NO es "completitud del alta". */
  progreso: number;
  /** Las que efectivamente se van a mandar. */
  aEnviar: string[];
  listo: boolean;
  /** Por qué no está listo, ya redactado. `null` si lo está. */
  motivo: string | null;
};

export function evaluarWizard(plataformas: PlataformaDelWizard[]): EstadoDelWizard {
  const total = plataformas.length;

  const pendiente = plataformas.find((p) => p.decision === "pending");
  const incompleta = plataformas.find((p) => p.decision === "use" && !p.completa);

  const decididas = plataformas.filter(
    (p) => p.decision === "skip" || (p.decision === "use" && p.completa),
  ).length;

  const aEnviar = plataformas
    .filter((p) => p.decision === "use" && p.completa && !NO_VIAJAN_AL_BACKEND.has(p.clave))
    .map((p) => p.clave);

  const progreso = total === 0 ? 0 : Math.round((decididas / total) * 100);

  let motivo: string | null = null;
  if (pendiente) {
    motivo = `Falta decidir sobre "${pendiente.nombre}".`;
  } else if (incompleta) {
    motivo = `Completá todos los campos de "${incompleta.nombre}".`;
  } else if (aEnviar.length === 0) {
    // Dos caminos distintos llegan acá, y decirles lo mismo confunde: el que
    // eligió el pixel SÍ eligió algo, y un "conectá al menos una plataforma"
    // genérico lo deja mirando la pantalla sin entender qué le falta.
    const eligioSoloElPixel = plataformas.some(
      (p) => p.decision === "use" && p.completa && NO_VIAJAN_AL_BACKEND.has(p.clave),
    );
    motivo = eligioSoloElPixel
      ? "NitroPixel solo no alcanza para dar de alta la cuenta: se instala con un script, " +
        "no trae datos de ventas. Sumá tu plataforma de ecommerce o un marketplace."
      : "Todavía no conectaste ninguna plataforma. Elegí al menos una para poder enviar el alta.";
  }

  return { decididas, total, progreso, aEnviar, listo: motivo === null, motivo };
}
