// ══════════════════════════════════════════════════════════════════════════
// src/lib/organizacion/exportacion.ts — llevarse los datos propios
// ══════════════════════════════════════════════════════════════════════════
// E-27. "Exportar los datos de un cliente" no existía como función. Es la otra
// mitad de E-28: un contrato que dice que el cliente es dueño de sus datos
// necesita las dos cosas — poder llevárselos y poder borrarlos.
//
// ── LA REGLA QUE ORDENA ESTE ARCHIVO ─────────────────────────────────────
// **Una exportación que recorta en silencio es peor que no tener exportación.**
// Sin ella, el cliente sabe que no tiene sus datos. Con una incompleta que no
// avisa, cree que los tiene.
//
// Por eso el archivo arranca con un manifiesto: qué trae, qué no, y por qué.
// Va primero y no al final **a propósito** — si la descarga se corta a la
// mitad, lo que quedó igual dice qué debería haber contenido.
//
// ── QUÉ SE EXPORTA Y QUÉ NO ──────────────────────────────────────────────
// Se exporta lo que el cliente **es dueño**: sus órdenes, sus clientes, su
// catálogo. No se exportan nuestros derivados —rollups, capas Silver y Gold,
// predicciones— porque son cálculos nuestros sobre esos datos, no datos suyos,
// y se pueden reconstruir enteros a partir de lo que sí va.
//
// Los eventos crudos del pixel son el caso incómodo: **son suyos** (son las
// visitas a su tienda) pero Arredo tiene ~6,7 M en 30 días, que no entran en
// una respuesta HTTP. Se declaran en el manifiesto como "no incluidos, pedir
// aparte" en vez de recortarlos calladamente a los primeros N.
// ══════════════════════════════════════════════════════════════════════════

/** Una tabla que se exporta, con el motivo de estar. */
export type TablaExportable = {
  tabla: string;
  /** Qué es, en palabras del cliente. */
  que: string;
};

/**
 * Lo que se lleva el cliente. Son datos suyos, no cálculos nuestros.
 *
 * El orden importa poco técnicamente, pero se listan de lo más importante a lo
 * menos: si la descarga se corta, que lo primero sea lo que más le sirve.
 */
export const SE_EXPORTA: TablaExportable[] = [
  { tabla: "orders", que: "Tus pedidos" },
  { tabla: "order_items", que: "Los productos de cada pedido" },
  { tabla: "customers", que: "Tus compradores" },
  { tabla: "products", que: "Tu catálogo" },
  { tabla: "manual_costs", que: "Los costos que cargaste a mano" },
  { tabla: "manual_channel_spends", que: "La inversión publicitaria que cargaste a mano" },
  { tabla: "influencers", que: "Tus creadores" },
  { tabla: "influencer_deals", que: "Los acuerdos con cada creador" },
  { tabla: "influencer_attributions", que: "Las ventas atribuidas a cada creador" },
  { tabla: "payouts", que: "Los pagos a creadores" },
];

/** Lo que NO va, con el motivo. Viaja en el manifiesto. */
export const NO_SE_EXPORTA: Array<{ que: string; porQue: string }> = [
  {
    que: "Eventos crudos del pixel (`pixel_events`, `pixel_visitors`)",
    porQue:
      "Son datos tuyos, pero son millones de filas y no entran en una descarga. " +
      "Se piden aparte y se entregan como archivo.",
  },
  {
    que: "Rollups diarios y las capas Silver y Gold",
    porQue:
      "Son cálculos nuestros sobre tus datos, no datos tuyos. Se reconstruyen enteros " +
      "a partir de lo que sí va en esta exportación.",
  },
  {
    que: "Predicciones de LTV y scores de comportamiento",
    porQue: "Mismo motivo: los produce nuestro modelo, no salen de tu operación.",
  },
  {
    que: "Credenciales de las integraciones",
    porQue:
      "No se exportan NUNCA. Las claves de VTEX y MercadoLibre viven en tu cuenta de " +
      "esas plataformas; acá sólo hay una copia para poder consultarlas.",
  },
];

export type Manifiesto = {
  formato: "ndjson";
  generadoEn: string;
  organizationId: string;
  organizacion: string | null;
  /** Filas por tabla. `null` = no se pudo contar. */
  contenido: Array<{ tabla: string; que: string; filas: number | null }>;
  noIncluido: Array<{ que: string; porQue: string }>;
  /** Total de filas que el archivo debería tener, sin contar esta línea. */
  filasEsperadas: number | null;
  comoLeerlo: string;
};

export function armarManifiesto(args: {
  organizationId: string;
  organizacion: string | null;
  conteos: Array<{ tabla: string; filas: number | null }>;
  ahora?: Date;
}): Manifiesto {
  const porTabla = new Map(args.conteos.map((c) => [c.tabla, c.filas]));

  const contenido = SE_EXPORTA.map((t) => ({
    tabla: t.tabla,
    que: t.que,
    filas: porTabla.has(t.tabla) ? (porTabla.get(t.tabla) as number | null) : null,
  }));

  // Si alguna no se pudo contar, el total es `null` y no una suma parcial: un
  // número que parece completo y no lo es es peor que no dar número.
  const algunaSinContar = contenido.some((c) => c.filas === null);

  return {
    formato: "ndjson",
    generadoEn: (args.ahora ?? new Date()).toISOString(),
    organizationId: args.organizationId,
    organizacion: args.organizacion,
    contenido,
    noIncluido: NO_SE_EXPORTA,
    filasEsperadas: algunaSinContar
      ? null
      : contenido.reduce((a, c) => a + (c.filas ?? 0), 0),
    comoLeerlo:
      "Cada línea es un JSON independiente. La primera es este manifiesto; las demás " +
      'tienen la forma {"tabla":"orders","fila":{...}}. Se puede abrir con cualquier ' +
      "herramienta que lea NDJSON, o línea por línea sin cargar todo en memoria.",
  };
}

/**
 * ¿La exportación quedó completa?
 *
 * Se compara lo que el manifiesto prometió contra lo que efectivamente salió.
 * Si no coinciden, el archivo está incompleto — y hay que decirlo, aunque la
 * descarga haya terminado sin error.
 */
export function estaCompleta(esperadas: number | null, escritas: number): boolean {
  if (esperadas === null) return false;
  return escritas === esperadas;
}
