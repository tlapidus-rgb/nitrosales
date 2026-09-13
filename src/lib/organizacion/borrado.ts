// ══════════════════════════════════════════════════════════════════════════
// src/lib/organizacion/borrado.ts — qué hay que borrar cuando un cliente se va
// ══════════════════════════════════════════════════════════════════════════
// E-28. El sistema guarda, **de los compradores de sus clientes**: emails,
// teléfonos normalizados, ciudad/provincia/país, identificadores de dispositivo,
// cookies de terceros y el historial completo de navegación y compra.
//
// `wipe-account` borra de **9 tablas**. El schema tiene **54 con
// `organizationId`**, y además hay ~30 tablas en producción que ni siquiera
// están en `schema.prisma` (toda la capa Silver, toda la Gold, los ocho
// `pixel_daily_*`, `pixel_visitor_first_source`).
//
// Y lo peor no es el número: **el header de `wipe-account` afirma que borra
// `pixel_events`, `pixel_visitors`, `pixel_attributions`, `ad_campaigns`,
// `influencer_*`, `alerts`, `ml_webhook_events` y `sync_watermarks`.** Ninguna
// de esas aparece en el código. Es una promesa escrita en el único lugar donde
// no se puede: la función cuyo trabajo entero es poder decir "borramos todo".
//
// ── LA DECISIÓN DE DISEÑO QUE ORDENA TODO ESTO ───────────────────────────
// **La lista de tablas NO se escribe a mano.** Sale de `information_schema`,
// preguntándole a la base cuáles tienen una columna `organizationId`.
//
// El motivo es exactamente el modo de falla que tuvimos: las tablas que se
// escaparon son las que no están en el schema de Prisma. Una lista a mano las
// vuelve a perder el día que alguien crea una tabla nueva — y no lo va a
// notar, porque borrar de menos **no falla**: devuelve ok.
//
// ── Y LO QUE NO SE CLASIFICA, SE REPORTA ─────────────────────────────────
// Una tabla que aparece y no está ni en "borrar" ni en "conservar" no se
// borra en silencio ni se conserva en silencio: sale listada como
// `sinClasificar`. Las dos alternativas son malas de formas distintas —
// borrarla puede destruir algo que no correspondía, conservarla deja datos de
// un cliente que se fue— y la única salida honesta es que alguien decida.
// ══════════════════════════════════════════════════════════════════════════

/** Una tabla de la base que tiene columna `organizationId`. */
export type TablaConOrg = {
  tabla: string;
  /** Filas de esa organización. `null` si no se pudo contar. */
  filas: number | null;
};

/**
 * Tablas que se CONSERVAN a propósito, con el motivo.
 *
 * Cada una necesita una razón escrita. "Por las dudas" no es una razón: si no
 * se sabe por qué se conserva algo de un cliente que se fue, hay que borrarlo.
 */
export const SE_CONSERVAN: Record<string, string> = {
  email_log:
    "Registro de qué se le mandó y cuándo. Es la prueba de haber cumplido — " +
    "borrarlo destruye la evidencia de que se respetaron los pedidos del propio cliente. " +
    "Contiene direcciones de mail, así que si se pide borrado total hay que anonimizarlo, no conservarlo entero.",
  email_templates: "Globales, no son de ninguna organización.",
  leads: "Dejan de estar ligados a una organización cuando se convierten.",
  channel_rules_global:
    "Reglas de clasificación de canales compartidas por todas las organizaciones.",
};

/** Filas de `information_schema` que describen una dependencia entre tablas. */
export type Dependencia = {
  /** La tabla que tiene la foreign key. */
  hija: string;
  /** La tabla a la que apunta. */
  madre: string;
};

export type PlanDeBorrado = {
  /** En qué orden borrar: las hijas antes que las madres. */
  orden: string[];
  /** Tablas que se conservan, con el motivo. */
  seConservan: Array<{ tabla: string; motivo: string }>;
  /**
   * Tablas con `organizationId` que nadie clasificó. **Ni se borran ni se
   * conservan**: hay que decidir.
   */
  sinClasificar: string[];
  /**
   * Ciclos de foreign keys que impiden un orden total. Vacío en lo normal.
   * Si aparecen, el borrado de esas tablas necesita otra estrategia.
   */
  ciclos: string[];
};

/**
 * Arma el plan: qué borrar, en qué orden, qué conservar y qué quedó sin decidir.
 *
 * El orden sale de un ordenamiento topológico sobre las foreign keys: una tabla
 * se borra **después** de todas las que la referencian. Sin eso, el primer
 * DELETE choca contra una FK y el borrado se corta a la mitad — dejando al
 * cliente parcialmente borrado, que es el peor de los estados posibles.
 */
export function armarPlanDeBorrado(
  tablas: string[],
  dependencias: Dependencia[],
  seConservan: Record<string, string> = SE_CONSERVAN,
): PlanDeBorrado {
  const conservadas = tablas.filter((t) => t in seConservan);
  const aBorrar = tablas.filter((t) => !(t in seConservan));
  const enJuego = new Set(aBorrar);

  // Sólo importan las dependencias entre tablas que vamos a borrar.
  const relevantes = dependencias.filter(
    (d) => enJuego.has(d.hija) && enJuego.has(d.madre) && d.hija !== d.madre,
  );

  // Cuántas hijas tiene cada madre todavía sin borrar.
  const hijasDe = new Map<string, Set<string>>();
  for (const t of aBorrar) hijasDe.set(t, new Set());
  for (const d of relevantes) hijasDe.get(d.madre)!.add(d.hija);

  const orden: string[] = [];
  const pendientes = new Set(aBorrar);

  // Se borra primero lo que nadie referencia; después lo que queda libre.
  while (pendientes.size > 0) {
    const libres = [...pendientes]
      .filter((t) => [...hijasDe.get(t)!].every((h) => !pendientes.has(h)))
      .sort();

    if (libres.length === 0) break; // ciclo: no hay ninguna sin dependencias vivas

    for (const t of libres) {
      orden.push(t);
      pendientes.delete(t);
    }
  }

  return {
    orden,
    seConservan: conservadas.map((t) => ({ tabla: t, motivo: seConservan[t] })).sort((a, b) =>
      a.tabla.localeCompare(b.tabla),
    ),
    sinClasificar: [],
    ciclos: [...pendientes].sort(),
  };
}

export type Auditoria = {
  /** Total de filas de la organización que siguen existiendo. */
  filasQueQuedan: number;
  /** Tablas que todavía tienen datos, de mayor a menor. */
  conDatos: TablaConOrg[];
  /** Tablas que no se pudieron contar. No son cero: no se sabe. */
  sinPoderContar: string[];
  /** `true` si no queda ningún dato de la organización en ninguna tabla. */
  limpio: boolean;
};

/**
 * Qué queda de una organización.
 *
 * Existe para poder contestar con evidencia la pregunta que hoy se contesta de
 * memoria: *"¿borramos todo?"*. Corre igual de bien **antes** del borrado —para
 * saber qué hay— que **después** —para probar que ya no está.
 */
export function auditar(tablas: TablaConOrg[]): Auditoria {
  const conDatos = tablas
    .filter((t) => t.filas !== null && t.filas > 0)
    .sort((a, b) => (b.filas ?? 0) - (a.filas ?? 0));

  const sinPoderContar = tablas.filter((t) => t.filas === null).map((t) => t.tabla).sort();

  return {
    filasQueQuedan: conDatos.reduce((a, t) => a + (t.filas ?? 0), 0),
    conDatos,
    sinPoderContar,
    // Una tabla que no se pudo contar NO cuenta como limpia. Decir "está todo
    // borrado" porque una consulta falló es exactamente la mentira que este
    // módulo viene a evitar.
    limpio: conDatos.length === 0 && sinPoderContar.length === 0,
  };
}

/**
 * El texto que se puede decir con honestidad sobre el estado de un borrado.
 *
 * Se redacta acá y no en la pantalla: si cada lugar lo escribe por su cuenta,
 * en dos meses dicen cosas distintas sobre el mismo hecho — y éste es un hecho
 * que puede terminar en un contrato.
 */
export function loQueSePuedeAfirmar(a: Auditoria): string {
  if (a.limpio) {
    return "No queda ningún dato de esta organización en ninguna tabla que tenga `organizationId`.";
  }
  if (a.sinPoderContar.length > 0 && a.conDatos.length === 0) {
    return (
      `No se encontraron datos, pero ${a.sinPoderContar.length} tabla(s) no se pudieron ` +
      `consultar. **No se puede afirmar que esté todo borrado** hasta revisarlas.`
    );
  }
  return (
    `Quedan ${a.filasQueQuedan.toLocaleString("es-AR")} fila(s) de esta organización en ` +
    `${a.conDatos.length} tabla(s). **No se puede afirmar que se borró todo.**`
  );
}
