// ══════════════════════════════════════════════════════════════════════════
// src/lib/costos/consumo-por-cliente.ts — las seis dimensiones que se facturan
// ══════════════════════════════════════════════════════════════════════════
// E-21. El modelo de precios (Scope × Scale) factura por seis cosas:
//
//   1. órdenes/mes      4. eventos de pixel/mes
//   2. SKUs activos     5. usuarios
//   3. integraciones    6. uso de IA (queries × modo)
//
// **Ninguna de las seis tenía un reporte por organización.** No es higiene: si
// el precio es por consumo, medir el consumo es parte del producto. Sin esto,
// cerrar un contrato y después facturarlo son dos actos de fe distintos.
//
// ── LA REGLA QUE ORDENA TODO ESTE ARCHIVO ────────────────────────────────
// `null` ≠ 0. Una dimensión que no se pudo medir tiene que verse distinta de
// una que midió cero, porque las decisiones son opuestas: un cero real puede
// ser un cliente que no usa el módulo (no se factura); un `null` es una
// consulta que falló (hay que ir a mirar). Un reporte de facturación que
// confunde las dos factura mal, y en la dirección que el cliente no reclama.
//
// Es la misma regla de E-26 y del checklist de merge. Acá pesa más porque el
// número termina en una factura.
// ══════════════════════════════════════════════════════════════════════════

import { costoDeLaLlamada } from "./precios-de-modelos";

/**
 * Consumo de Aurum, ya agrupado por (organización, modo, modelo).
 *
 * Agrupado y no fila por fila **a propósito**: el endpoint viejo
 * (`/api/admin/usage`) trae las filas crudas con `take: 10000`, que es un
 * truncado silencioso esperando su turno — con 90 días y varias orgs, el techo
 * se toca y los números salen mal sin decirlo. Agregando en SQL el problema no
 * se reporta mejor: **deja de existir**.
 *
 * `llamadas` es cuántas llamadas representa la fila. Una fila cruda es 1.
 */
export type LlamadaDeAurum = {
  organizationId: string;
  mode: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  llamadas?: number;
};

export type CostoDeAurum = {
  queries: number;
  tokensEntrada: number;
  tokensSalida: number;
  /** USD de las llamadas cuyo modelo está en la tabla de precios. */
  usdConocido: number;
  /** Queries por modo: FLASH / CORE / DEEP. Deep cuesta 10-50× Flash. */
  porModo: Record<string, number>;
  /**
   * Modelos que no están en la tabla, con cuántas llamadas tiene cada uno.
   *
   * Se reporta aparte y NO se suma como cero: el total dice "esto es lo que sé"
   * y esta lista dice "y esto es lo que no". Si se sumaran como cero, el total
   * cerraría, se vería bien, y estaría mal.
   */
  modelosSinPrecio: Array<{ modelo: string; llamadas: number }>;
};

export function costoDeAurum(
  filas: LlamadaDeAurum[],
  env: NodeJS.ProcessEnv = process.env,
): CostoDeAurum {
  let usdConocido = 0;
  let tokensEntrada = 0;
  let tokensSalida = 0;
  let queries = 0;
  const porModo: Record<string, number> = {};
  const sinPrecio = new Map<string, number>();

  for (const f of filas) {
    const n = f.llamadas ?? 1;
    queries += n;
    tokensEntrada += f.inputTokens;
    tokensSalida += f.outputTokens;
    porModo[f.mode] = (porModo[f.mode] || 0) + n;

    // Los tokens ya vienen sumados por grupo, así que se costea el grupo
    // entero de una: el precio es lineal en tokens.
    const c = costoDeLaLlamada(f.model, f.inputTokens, f.outputTokens, env);
    if (c.conocido && c.usd !== null) usdConocido += c.usd;
    else sinPrecio.set(f.model, (sinPrecio.get(f.model) || 0) + n);
  }

  return {
    queries,
    tokensEntrada,
    tokensSalida,
    usdConocido,
    porModo,
    modelosSinPrecio: [...sinPrecio.entries()]
      .map(([modelo, llamadas]) => ({ modelo, llamadas }))
      .sort((a, b) => b.llamadas - a.llamadas),
  };
}

/** Las seis dimensiones para una organización. `null` = no se pudo medir. */
export type ConsumoDeUnCliente = {
  organizationId: string;
  nombre: string;
  plan: string | null;
  ordenesDelPeriodo: number | null;
  skusActivos: number | null;
  integracionesActivas: number | null;
  eventosPixelDelPeriodo: number | null;
  usuarios: number | null;
  aurum: CostoDeAurum;
  /** Nombres de las dimensiones que no se pudieron medir, para mostrar arriba. */
  sinMedir: string[];
};

const NOMBRES: Record<string, string> = {
  ordenesDelPeriodo: "órdenes del período",
  skusActivos: "SKUs activos",
  integracionesActivas: "integraciones activas",
  eventosPixelDelPeriodo: "eventos de pixel del período",
  usuarios: "usuarios",
};

export function armarConsumo(
  base: Omit<ConsumoDeUnCliente, "sinMedir">,
): ConsumoDeUnCliente {
  const sinMedir = Object.keys(NOMBRES).filter(
    (k) => (base as unknown as Record<string, number | null>)[k] === null,
  ).map((k) => NOMBRES[k]);
  return { ...base, sinMedir };
}

export type AvisosDelReporte = {
  /** Cosas que hacen que el número NO se pueda usar para facturar tal cual. */
  avisos: string[];
  /** `true` si todas las dimensiones de todos los clientes se pudieron medir. */
  completo: boolean;
};

export function avisosDelReporte(args: {
  clientes: ConsumoDeUnCliente[];
  preciosVerificadosEl: string;
  convieneRevisarPrecios: boolean;
  filasDeAurumTruncadas: boolean;
}): AvisosDelReporte {
  const avisos: string[] = [];

  const conFaltantes = args.clientes.filter((c) => c.sinMedir.length > 0);
  if (conFaltantes.length > 0) {
    avisos.push(
      `${conFaltantes.length} cliente(s) tienen dimensiones sin medir. Esas NO son cero: ` +
        `la consulta no se pudo hacer. Antes de facturar, revisar cuáles.`,
    );
  }

  const sinPrecio = new Set<string>();
  for (const c of args.clientes) for (const m of c.aurum.modelosSinPrecio) sinPrecio.add(m.modelo);
  if (sinPrecio.size > 0) {
    avisos.push(
      `Hay llamadas de modelos sin precio en la tabla (${[...sinPrecio].join(", ")}). ` +
        `Su costo NO está sumado en el total. Agregalos con PRECIOS_MODELOS_JSON.`,
    );
  }

  if (args.convieneRevisarPrecios) {
    avisos.push(
      `La tabla de precios se verificó el ${args.preciosVerificadosEl} y ya pasó bastante. ` +
        `Los precios los pone Anthropic y cambian: convendría re-verificarla.`,
    );
  }

  if (args.filasDeAurumTruncadas) {
    avisos.push(
      `Se alcanzó el techo de filas de Aurum: el costo de IA está SUBESTIMADO. ` +
        `Acotá el período con ?dias= para que entre entero.`,
    );
  }

  // El costo de infraestructura no es una advertencia "a veces": es siempre, y
  // es lo que más fácil se olvida al mirar un número que dice "USD".
  avisos.push(
    `El USD de Aurum es costo de INFERENCIA, no el costo de servir al cliente: ` +
      `no incluye Neon, Vercel ni storage, que hoy no son atribuibles por organización.`,
  );

  return { avisos, completo: conFaltantes.length === 0 && sinPrecio.size === 0 };
}
