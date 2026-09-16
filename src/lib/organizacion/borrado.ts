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
// ── EL DEFAULT ES BORRAR, Y HAY QUE DECIRLO ──────────────────────────────
// Una tabla que aparece y no está en `SE_CONSERVAN` **se borra**. No hay una
// tercera categoría: el default es borrar, no conservar, porque los datos de un
// cliente que se fue no se quedan por omisión.
//
// ⚠️ Eso tiene un costo y hay que mirarlo de frente: si mañana alguien crea una
// tabla `audit_log` o `retention_holds` con `organizationId`, este módulo la
// descubre sola —que es la virtud del diseño— y el próximo borrado la vacía sin
// que nadie lo haya decidido. **Por eso el simulacro muestra `plan.orden`
// entero**: quien lo corra tiene que reconocer lo que hay ahí adentro.
//
// Una versión anterior de este archivo prometía en este mismo lugar un campo
// `sinClasificar` que reportaría esas tablas. El campo existía y estaba
// cableado a `[]`: nunca reportó nada. Lo encontró una revisión de seguridad.
// Se sacó en vez de dejarlo, porque un campo vacío que promete vigilancia es
// peor que no tener el campo.
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
  /** La columna de la hija que apunta a la madre. Para las tablas indirectas. */
  columna?: string;
  /**
   * Qué hace Postgres cuando se borra la fila referenciada: `NO ACTION`,
   * `RESTRICT`, `CASCADE`, `SET NULL`, `SET DEFAULT`.
   *
   * **Sólo las dos primeras obligan a un orden de borrado.** Las otras tres las
   * resuelve la base sola, así que exigir orden por ellas es inventar una
   * restricción que no existe.
   */
  reglaDeBorrado?: string;
};

/**
 * Las reglas que de verdad obligan a borrar la hija antes que la madre.
 *
 * Con `CASCADE`, `SET NULL` o `SET DEFAULT`, Postgres arregla la referencia
 * solo y el DELETE no falla. Tratarlas como bloqueantes fue un error real de
 * este módulo: el primer plan sobre datos de verdad reportó un "ciclo" entre
 * `users` y `custom_roles` que no existía — las dos FKs son `SET NULL`.
 *
 * El costo de esa equivocación no era borrar mal: era **negarse a borrar** algo
 * que se puede borrar. Falla del lado seguro, pero falla.
 */
const REGLAS_QUE_OBLIGAN_ORDEN = new Set(["NO ACTION", "RESTRICT"]);

/** `true` si esa foreign key obliga a borrar la hija primero. */
export function obligaOrden(d: Dependencia): boolean {
  // Sin el dato, se asume lo más restrictivo: es el default de Postgres.
  const regla = (d.reglaDeBorrado ?? "NO ACTION").toUpperCase();
  return REGLAS_QUE_OBLIGAN_ORDEN.has(regla);
}

export type PlanDeBorrado = {
  /** En qué orden borrar: las hijas antes que las madres. */
  orden: string[];
  /** Tablas que se conservan, con el motivo. */
  seConservan: Array<{ tabla: string; motivo: string }>;
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
  // ⚠️ `seConservan` SE REPORTA ENTERO, no filtrado contra `tablas` (R-10).
  //
  // `tablas` son, por construcción, las que tienen columna `organizationId`.
  // Y **ninguna de las cuatro de `SE_CONSERVAN` la tiene**: `email_log` y
  // `leads` se crean por `migrate-*` sin esa columna, y `email_templates` y
  // `channel_rules_global` son globales.
  //
  // O sea que el filtro nunca encontraba nada y `seConservan` salía **siempre
  // vacío**, en las dos respuestas que lo publican. La configuración estaba
  // escrita, documentada, y era inerte.
  //
  // Lo que importa no es el campo: es que `email_log.toEmail` —las direcciones
  // de la gente del cliente— y `leads.contactEmail`/`contactPhone` sobreviven
  // al borrado **y no se mencionaban en ninguna parte de la respuesta**. Quien
  // corre un borrado total no se enteraba de que quedaban.
  //
  // El motivo de cada una dice "si se pide borrado total hay que anonimizarlo,
  // no conservarlo entero", y no hay nada en el código que anonimice. Eso
  // sigue abierto; lo que se cierra acá es que deje de ser invisible.
  const conservadas = Object.keys(seConservan);
  const aBorrar = tablas.filter((t) => !(t in seConservan));
  const enJuego = new Set(aBorrar);

  // Sólo importan las dependencias que (a) están entre tablas que vamos a
  // borrar, (b) no son autorreferencias, y (c) de verdad obligan a un orden.
  const relevantes = dependencias.filter(
    (d) => enJuego.has(d.hija) && enJuego.has(d.madre) && d.hija !== d.madre && obligaOrden(d),
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

// ══════════════════════════════════════════════════════════════════════════
// LAS TABLAS QUE NO TIENEN `organizationId` (agregado el 2026-09-13)
// ══════════════════════════════════════════════════════════════════════════
// Encontrado revisando la branch entera antes de mergear, y es un bug propio:
// preguntarle a `information_schema` por las tablas con columna
// `organizationId` deja afuera a las que **cuelgan de otra tabla**. Son seis:
//
//   order_items                 → orderId       → orders
//   bot_messages                → chatId        → bot_chats
//   pixel_visitor_aliases       → visitorId     → pixel_visitors
//   influencer_commission_tiers → influencerId  → influencers
//   audience_sync_logs          → audienceId    → audiences
//   login_events                → userId        → users
//
// Las consecuencias eran distintas y todas malas:
//
//   · **La auditoría podía decir "no queda ningún dato"** con seis tablas
//     llenas. Ésa es exactamente la afirmación falsa que el módulo existe para
//     evitar — el bug estaba adentro de la función que promete lo contrario.
//   · **El borrado habría fallado.** `order_items.orderId` no tiene
//     `ON DELETE CASCADE`, así que borrar `orders` choca contra la FK. Fallaba
//     del lado seguro (la transacción revierte) pero el borrado no funcionaba.
//   · **La exportación perdía los items de cada pedido**, que es la mitad del
//     valor de exportar los pedidos.
//
// El `wipe-account` viejo —el que borra 9 tablas— SÍ borraba `order_items`, con
// un `WHERE orderId IN (SELECT id FROM orders WHERE organizationId = ...)`.
// O sea que en esto era más completo que mi reemplazo.
// ══════════════════════════════════════════════════════════════════════════

/** Una tabla que pertenece a la organización a través de otra. */
export type TablaIndirecta = {
  tabla: string;
  /** La columna que apunta a la madre. */
  columna: string;
  /** La tabla madre, que sí tiene `organizationId`. */
  madre: string;
};

/**
 * Las tablas que son de la organización pero no lo dicen en una columna propia.
 *
 * Se buscan por sus foreign keys a tablas que **sí** tienen `organizationId`.
 * Sale de la base y no de una lista escrita a mano por el mismo motivo que el
 * resto de este archivo: una lista a mano se queda vieja y no avisa.
 *
 * Sólo un nivel de indirección, que es lo que hay hoy (las seis cuelgan
 * directo de una tabla con `organizationId`). Si algún día aparece una que
 * cuelgue de otra indirecta, va a quedar afuera — y por eso
 * `tablasQueNadieReclama` la va a listar.
 */
export function tablasIndirectas(
  conOrganizationId: string[],
  dependencias: Dependencia[],
): TablaIndirecta[] {
  const directas = new Set(conOrganizationId);
  const vistas = new Set<string>();
  const salida: TablaIndirecta[] = [];

  for (const d of dependencias) {
    if (directas.has(d.hija)) continue; // ya se resuelve sola
    if (!directas.has(d.madre)) continue; // la madre tampoco sabe de quién es
    if (!d.columna) continue; // sin la columna no se puede armar el WHERE
    if (vistas.has(d.hija)) continue; // con una vía alcanza
    vistas.add(d.hija);
    salida.push({ tabla: d.hija, columna: d.columna, madre: d.madre });
  }

  return salida.sort((a, b) => a.tabla.localeCompare(b.tabla));
}

/**
 * El `WHERE` que acota una tabla indirecta a una organización.
 *
 * Los nombres salen de `information_schema`, no de la request, así que no hay
 * nada que escapar. El `orgId` va como parámetro.
 */
export function whereIndirecto(t: TablaIndirecta): string {
  return `"${t.columna}" IN (SELECT "id" FROM "${t.madre}" WHERE "organizationId" = $1)`;
}

/**
 * Tablas que no son de nadie: ni tienen `organizationId` ni cuelgan de algo que
 * lo tenga.
 *
 * Se reportan para que alguien mire. Pueden ser globales y legítimas
 * (`email_templates`, diccionarios) o pueden ser un agujero nuevo — y la
 * diferencia no se puede adivinar desde acá.
 */
export function tablasQueNadieReclama(
  todasLasTablas: string[],
  conOrganizationId: string[],
  indirectas: TablaIndirecta[],
): string[] {
  const resueltas = new Set([...conOrganizationId, ...indirectas.map((t) => t.tabla)]);
  return todasLasTablas.filter((t) => !resueltas.has(t)).sort();
}
