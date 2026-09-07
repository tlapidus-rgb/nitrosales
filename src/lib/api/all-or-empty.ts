// ══════════════════════════════════════════════════════════════════════════
// src/lib/api/all-or-empty.ts — un batch donde una query rota no tumba al resto
// ══════════════════════════════════════════════════════════════════════════
// E-06. El batch de `/api/metrics/pixel` son 28 queries en paralelo. Con
// `Promise.all`, UNA sola que rechazara —un `statement_timeout`, un plan malo,
// `hll` no disponible, una tabla que todavía no existe en esa DB— rechazaba el
// batch ENTERO, caía al catch final y devolvía el mock vacío con **HTTP 200**.
//
// Lo que ve el cliente no es "una métrica no disponible": es **"mi negocio
// facturó $0"**. Y si el warm-cache toma la foto en ese momento, ese cero se
// persiste en el caché compartido y se le sirve a toda la organización hasta el
// próximo TTL.
//
// ── POR QUÉ ESTÁ ACÁ Y NO ADENTRO DE LA ROUTE ────────────────────────────
// Estaba adentro, privado, y el test lo cubría con una RÉPLICA del algoritmo
// escrita en el propio archivo de test. O sea que el test verificaba su propia
// copia: si alguien cambiaba el original, la réplica seguía en verde. Lo
// levantó la auditoría de calidad de tests del 2026-09-07 y tiene razón — la
// salida correcta era mover el helper, no clonarlo. Un `route.ts` de Next no
// puede exportar cualquier cosa (sólo los handlers y la config), así que el
// lugar es un módulo aparte.
// ══════════════════════════════════════════════════════════════════════════

/**
 * Como `Promise.all`, pero lo que falla vuelve como `[]` en vez de tumbar todo.
 *
 * Los índices de lo que falló se empujan a `degraded`, para que el caller pueda
 * decirle al cliente que la foto está incompleta en vez de mentirle un cero.
 *
 * ⚠️ `[]` es el fallback correcto SÓLO porque todas las entradas del batch son
 * consultas que devuelven arrays. Si algún día se agrega una que devuelva un
 * escalar, hay que darle su propio fallback: sin eso, un `[]` donde se espera un
 * número se propaga río abajo como `undefined` y termina en `NaN` en la pantalla
 * — que es otra forma de mentir, sólo que más difícil de rastrear.
 */
export async function allOrEmpty<T extends readonly unknown[]>(
  promises: readonly [...{ [K in keyof T]: Promise<T[K]> }],
  degraded: number[],
  etiqueta = "batch",
): Promise<T> {
  const settled = await Promise.allSettled(promises);
  return settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    degraded.push(i);
    console.error(
      `[${etiqueta}] query #${i} del batch falló (el resto sigue): ${
        (r.reason as any)?.message ?? r.reason
      }`,
    );
    return [];
  }) as unknown as T;
}
