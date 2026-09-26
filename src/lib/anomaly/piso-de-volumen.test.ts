import { describe, it, expect } from "vitest";
import {
  ruidoEsperadoPct,
  esSubaDeGastoCreible,
  umbralCreible,
  esCambioCreible,
  elCeroEsNoticia,
  VOLUMEN_MINIMO,
} from "./piso-de-volumen";
import { detectRuleBasedAnomalies, type MetricSnapshot } from "./detector";

// ══════════════════════════════════════════════════════════════════════════
// E-24 — un porcentaje sobre una base chica no es una anomalía, es ruido
// ══════════════════════════════════════════════════════════════════════════
// El detector es 100 % porcentual. Con 7 órdenes por día, pasar a 4 dispara una
// alerta HIGH de "facturación cayó 43 %".
//
// Con cuatro clientes grandes eso era teórico. Desde E-19 los checks mandan un
// mail por día, así que el primer cliente chico recibe alertas falsas desde la
// semana uno — y el modo de falla no es "molesta", es que **deja de leer los
// mails**, y ahí el producto pierde su único canal proactivo.
// ══════════════════════════════════════════════════════════════════════════

describe("la cuenta: ruido de Poisson", () => {
  it("con 7 eventos el ruido esperado es ~38 % — más que el umbral de -30 %", () => {
    // Éste es el número que hace que el umbral fijo no sirva para un cliente
    // chico: la variación que el detector llama anomalía es MENOR que la que
    // pasa sola.
    expect(Math.round(ruidoEsperadoPct(7))).toBe(38);
  });

  it("con 100 eventos baja a ~10 %, y con 400 a ~5 %", () => {
    expect(Math.round(ruidoEsperadoPct(100))).toBe(10);
    expect(Math.round(ruidoEsperadoPct(400))).toBe(5);
  });

  it("sin eventos, cualquier cambio es ruido", () => {
    expect(ruidoEsperadoPct(0)).toBe(Infinity);
    expect(ruidoEsperadoPct(-3)).toBe(Infinity);
  });
});

describe("el umbral se adapta al tamaño del cliente", () => {
  it("a un cliente grande lo deja exactamente como está hoy", () => {
    // 400 órdenes → ruido 5 % → 2 sigmas = 10 %, menos que el 30 % de negocio.
    // Manda el umbral de negocio: nada cambia para Arredo.
    expect(umbralCreible(-30, 400)).toBe(30);
  });

  it("a un cliente chico le sube la vara hasta donde el dato deja de ser azar", () => {
    // 9 órdenes → ruido 33 % → 2 sigmas = 67 %. Una caída del 40 % no alcanza.
    expect(Math.round(umbralCreible(-30, 9))).toBe(67);
  });

  it("el umbral nunca baja del de negocio", () => {
    expect(umbralCreible(-30, 1_000_000)).toBe(30);
  });
});

describe("esCambioCreible", () => {
  it("EL CASO DE LA FICHA: 7 órdenes que pasan a 4 NO es una anomalía", () => {
    // -43 % suena grave y no lo es: con esa base, el ruido esperado ya es 38 %.
    expect(esCambioCreible(-43, -30, 7)).toBe(false);
  });

  it("pero la misma caída con volumen de verdad SÍ lo es", () => {
    expect(esCambioCreible(-43, -30, 300)).toBe(true);
  });

  it("una caída brutal en un cliente chico igual pasa", () => {
    // La adaptación sube la vara, no la cierra. -90 % sobre 9 órdenes supera
    // los 67 % que exige ese volumen.
    expect(esCambioCreible(-90, -30, 9)).toBe(true);
  });

  it("por debajo del piso duro no corre ninguna regla porcentual", () => {
    // De 2 a 1 es "-50 %" y no significa nada.
    expect(esCambioCreible(-50, -30, VOLUMEN_MINIMO - 1)).toBe(false);
    expect(esCambioCreible(-99, -30, 2)).toBe(false);
  });

  it("respeta el signo del umbral: una suba no dispara una regla de caída", () => {
    expect(esCambioCreible(+80, -30, 300)).toBe(false);
    expect(esCambioCreible(+80, +50, 300)).toBe(true);
  });

  it("un cambio nulo o no numérico no dispara", () => {
    expect(esCambioCreible(null, -30, 300)).toBe(false);
    expect(esCambioCreible(NaN, -30, 300)).toBe(false);
  });

  it("una base no numérica tampoco", () => {
    expect(esCambioCreible(-50, -30, NaN)).toBe(false);
  });
});

describe("el cero tiene su propio criterio", () => {
  it("un día sin ventas es noticia para quien vende todos los días", () => {
    expect(elCeroEsNoticia(200)).toBe(true);
  });

  it("y es un martes cualquiera para quien vende 3 por semana", () => {
    // Sin esto, el cliente chico recibe "0 pedidos — posible caida del sitio"
    // de forma rutinaria. Es la alerta que más rápido enseña a ignorar el mail.
    expect(elCeroEsNoticia(3)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Y el detector completo, ejecutado
// ══════════════════════════════════════════════════════════════════════════

const snap = (o: Partial<MetricSnapshot>): MetricSnapshot => ({
  revenue: 0,
  orders: 0,
  grossProfit: 0,
  grossMargin: 0,
  adSpend: 0,
  metaSpend: 0,
  googleSpend: 0,
  roas: 0,
  cpa: 0,
  aov: 0,
  ...o,
});

describe("detectRuleBasedAnomalies con un cliente chico", () => {
  it("EL BUG: una semana floja de un cliente chico no genera ni una alerta", () => {
    // 7 órdenes → 4, y la facturación acompaña. Antes: HIGH "facturación cayó
    // 43 %". Ahora: silencio, que es lo correcto.
    const anterior = snap({ orders: 7, revenue: 70_000, aov: 10_000 });
    const actual = snap({ orders: 4, revenue: 40_000, aov: 10_000 });
    expect(detectRuleBasedAnomalies(actual, anterior)).toEqual([]);
  });

  it("una semana sin ventas tampoco, si nunca vende mucho", () => {
    const anterior = snap({ orders: 3, revenue: 30_000 });
    const actual = snap({ orders: 0, revenue: 0 });
    expect(detectRuleBasedAnomalies(actual, anterior)).toEqual([]);
  });
});

describe("detectRuleBasedAnomalies con un cliente grande", () => {
  it("sigue detectando la caída de facturación, igual que antes", () => {
    const anterior = snap({ orders: 300, revenue: 3_000_000, aov: 10_000 });
    const actual = snap({ orders: 170, revenue: 1_700_000, aov: 10_000 });
    const r = detectRuleBasedAnomalies(actual, anterior);
    expect(r.some((a) => a.metric === "revenue" && a.priority === "HIGH")).toBe(true);
  });

  it("y un día en cero le sigue saltando como emergencia", () => {
    const anterior = snap({ orders: 200, revenue: 2_000_000 });
    const actual = snap({ orders: 0, revenue: 0 });
    const r = detectRuleBasedAnomalies(actual, anterior);
    expect(r.some((a) => a.metric === "orders" && a.priority === "HIGH")).toBe(true);
  });

  it("el spike de facturación sigue saliendo como oportunidad", () => {
    const anterior = snap({ orders: 200, revenue: 2_000_000, aov: 10_000 });
    const actual = snap({ orders: 340, revenue: 3_400_000, aov: 10_000 });
    const r = detectRuleBasedAnomalies(actual, anterior);
    expect(r.some((a) => a.type === "OPPORTUNITY")).toBe(true);
  });

  it("el margen sólo se evalúa si hay costos cargados, como ya era", () => {
    const base = { orders: 300, revenue: 3_000_000, aov: 10_000 };
    const anterior = snap({ ...base, grossMargin: 40, cogsCoverage: 100 });
    const sinCostos = snap({ ...base, grossMargin: 10, cogsCoverage: 0 });
    const conCostos = snap({ ...base, grossMargin: 10, cogsCoverage: 100 });

    expect(detectRuleBasedAnomalies(sinCostos, anterior).some((a) => a.metric === "grossMargin")).toBe(false);
    expect(detectRuleBasedAnomalies(conCostos, anterior).some((a) => a.metric === "grossMargin")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// La plata no es un conteo (revisión del 2026-09-13)
// ══════════════════════════════════════════════════════════════════════════
// La regla de "el gasto en ads subió y la facturación no acompañó" pasaba por
// `esCambioCreible` con las ÓRDENES como base. O sea que se silenciaba sola
// justo en el caso que existe para avisar: gastar de más vendiendo poquito.
describe("suba de gasto publicitario", () => {
  it("no pide volumen de órdenes: el gasto no tiene ruido de Poisson", () => {
    // 2 órdenes. Con el criterio de conteo esto no disparaba NUNCA.
    const anterior = snap({ orders: 3, revenue: 30_000, aov: 10_000, adSpend: 50_000, metaSpend: 50_000 });
    const actual = snap({ orders: 2, revenue: 20_000, aov: 10_000, adSpend: 150_000, metaSpend: 150_000 });
    const r = detectRuleBasedAnomalies(actual, anterior);
    expect(r.some((a) => a.metric === "adSpend")).toBe(true);
  });

  it("el primer día de la primera campaña no es una anomalía", () => {
    // De $0 a $80.000: el cálculo de porcentaje devuelve 100, pero no hay con
    // qué comparar. Avisarle a alguien que recién arranca que "gastó 100 % más
    // sin que crezca la facturación" es falso y es el peor momento.
    const anterior = snap({ orders: 40, revenue: 400_000, aov: 10_000, adSpend: 0 });
    const actual = snap({ orders: 40, revenue: 400_000, aov: 10_000, adSpend: 80_000, metaSpend: 80_000 });
    expect(detectRuleBasedAnomalies(actual, anterior).some((a) => a.metric === "adSpend")).toBe(false);
  });

  it("si la facturación acompaña, no hay nada que avisar", () => {
    const anterior = snap({ orders: 3, revenue: 30_000, aov: 10_000, adSpend: 50_000 });
    const actual = snap({ orders: 6, revenue: 90_000, aov: 15_000, adSpend: 150_000 });
    expect(detectRuleBasedAnomalies(actual, anterior).some((a) => a.metric === "adSpend")).toBe(false);
  });

  it("la función pura: sin gasto previo no hay porcentaje que valga", () => {
    expect(esSubaDeGastoCreible(100, 40, 0)).toBe(false);
    expect(esSubaDeGastoCreible(100, 40, -5)).toBe(false);
    expect(esSubaDeGastoCreible(null, 40, 1000)).toBe(false);
    expect(esSubaDeGastoCreible(Infinity, 40, 1000)).toBe(false);
  });

  it("la función pura: respeta el umbral de negocio y nada más", () => {
    expect(esSubaDeGastoCreible(39, 40, 1000)).toBe(false);
    expect(esSubaDeGastoCreible(40, 40, 1000)).toBe(true);
    expect(esSubaDeGastoCreible(300, 40, 1)).toBe(true);
  });
});

// Regression cases for undefined percentages and denominators.
describe("comparaciones definidas por métrica", () => {
 it("no inventa crecimiento porcentual desde facturación cero", () => {
  const previous = snap({ orders: 100, revenue: 0 });
  const current = snap({ orders: 100, revenue: 10000 });
  expect(detectRuleBasedAnomalies(current, previous).some(a => a.metric === "revenue")).toBe(false);
 });
 it("sin pedidos no interpreta AOV cero como una caída del ticket", () => {
  const previous = snap({ orders: 100, revenue: 10000, aov: 100 });
  const current = snap({ orders: 0, revenue: 0, aov: 0 });
  const results = detectRuleBasedAnomalies(current, previous);
  expect(results.some(a => a.metric === "aov")).toBe(false);
  expect(results.some(a => a.metric === "orders")).toBe(true);
 });
 it("sin inversión actual no interpreta ROAS cero como menor eficiencia", () => {
  const previous = snap({ orders: 100, adConversions: 100, adSpend: 1000, roas: 5 });
  const current = snap({ orders: 100, adSpend: 0, roas: 0 });
  expect(detectRuleBasedAnomalies(current, previous).some(a => a.metric === "roas")).toBe(false);
 });
 it("con inversión y volumen mantiene la alerta de ROAS", () => {
  const previous = snap({ orders: 100, adConversions: 100, adSpend: 1000, roas: 5 });
  const current = snap({ orders: 100, adConversions: 100, adSpend: 1000, roas: 1 });
  expect(detectRuleBasedAnomalies(current, previous).some(a => a.metric === "roas")).toBe(true);
 });
 it.each([NaN, Infinity, -1])("no calcula caída porcentual con facturación inválida %s", revenue => {
  expect(detectRuleBasedAnomalies(snap({ orders: 100, revenue }), snap({ orders: 100, revenue: 1000 })).some(a => a.metric === "revenue")).toBe(false);
 });
 it("no afirma que revenue no acompaña cuando su medición no está disponible", () => {
  expect(detectRuleBasedAnomalies(snap({ orders: 100, revenue: NaN, adSpend: 3000 }), snap({ orders: 100, revenue: 1000, adSpend: 1000 })).some(a => a.metric === "adSpend")).toBe(false);
 });
 it("con cero ventas medido en ambos períodos mantiene alerta de gasto", () => {
  expect(detectRuleBasedAnomalies(snap({ adSpend: 3000 }), snap({ adSpend: 1000 })).some(a => a.metric === "adSpend")).toBe(true);
 });
});