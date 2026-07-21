import { describe, it, expect } from "vitest";
import {
  buildSilverOrdersUpsert,
  buildSilverOrdersBackfill,
} from "./silver-orders-transform";
import { ordersValidSql, ordersWebSql } from "@/domains/orders";

// ══════════════════════════════════════════════════════════════════════════
// El transform Bronze→Silver debe computar is_valid/is_web con la MISMA
// definición del contrato — no una copia a mano. Si esto rompe, Silver estaría
// por divergir del resto de la plataforma (el bug "12 vs 16" reaparecería).
// ══════════════════════════════════════════════════════════════════════════

describe("buildSilverOrdersUpsert — anti-drift con el contrato", () => {
  const sql = buildSilverOrdersUpsert();

  it("computa is_valid con el SQL EXACTO del contrato (ordersValidSql)", () => {
    expect(sql).toContain(`(${ordersValidSql("o")}) AS is_valid`);
  });

  it("computa is_web con el SQL EXACTO del contrato (ordersWebSql)", () => {
    expect(sql).toContain(`(${ordersWebSql("o")}) AS is_web`);
  });

  it("is_marketplace es la negación de is_web (misma fuente)", () => {
    expect(sql).toContain(`(NOT (${ordersWebSql("o")})) AS is_marketplace`);
  });

  it("es incremental (filtra por org + updatedAt) e idempotente (ON CONFLICT)", () => {
    expect(sql).toContain(`WHERE o."organizationId" = $1`);
    expect(sql).toContain(`o."updatedAt" >= $2::timestamptz`);
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
  });

  // ── REGRESIÓN (bug B1, auditoría 2026-07-21) ───────────────────────────────
  // La ventana filtraba por `orderDate`, pero el evento que hay que ver es el
  // CAMBIO DE ESTADO, y ese no mueve `orderDate` (el webhook lo escribe sólo en
  // el bloque `create`). Con la ventana vieja, una orden cancelada 10 días
  // después nunca volvía a entrar a Silver y el revenue de Gold sólo podía
  // corregirse hacia arriba. Si alguien vuelve a poner `orderDate` acá, el
  // agujero vuelve y no avisa.
  it("la VENTANA no puede volver a ser orderDate — ve cambios retroactivos de estado", () => {
    expect(sql).not.toContain(`o."orderDate" >= $2`);
  });

  it("sigue proyectando la fecha canónica orderDate, nunca createdAt", () => {
    // `orderDate` sigue siendo la fecha del hecho (la columna que se proyecta y
    // por la que agrupan los rollups); lo que cambió es por dónde se RECORTA.
    expect(sql).toContain(`o."orderDate"`);
    expect(sql).not.toContain(`o."createdAt"`);
  });

  it("enriquece device/traffic desde pixel con el MISMO COALESCE que el Bronze (tanda 5c)", () => {
    // device = orders.deviceType ?? pixel_visitors.deviceTypes[1]
    expect(sql).toContain(`COALESCE(o."deviceType", pv."deviceTypes"[1]) AS device_enriched`);
    // traffic = orders.trafficSource ?? primer touchpoint.source
    expect(sql).toContain(
      `COALESCE(o."trafficSource", att.touchpoints::jsonb->0->>'source') AS traffic_enriched`,
    );
    // la atribución elegida es la más reciente (igual que el DISTINCT ON del Bronze)
    expect(sql).toContain(`ORDER BY pa."createdAt" DESC`);
    expect(sql).toContain("LEFT JOIN pixel_visitors pv");
    // y se refrescan en el upsert (si no, quedarían congeladas)
    expect(sql).toContain("device_enriched = EXCLUDED.device_enriched");
    expect(sql).toContain("traffic_enriched = EXCLUDED.traffic_enriched");
  });
});

describe("buildSilverOrdersBackfill — fill inicial (toda la historia)", () => {
  const sql = buildSilverOrdersBackfill();

  it("usa los mismos flags del contrato que el upsert incremental", () => {
    expect(sql).toContain(`(${ordersValidSql("o")}) AS is_valid`);
    expect(sql).toContain(`(${ordersWebSql("o")}) AS is_web`);
  });

  it("NO filtra por org ni fecha (toda la historia, todas las orgs)", () => {
    // Nota: el backfill SÍ tiene un WHERE interno (el LATERAL que busca la
    // atribución más reciente para enriquecer device/traffic). Lo que no debe
    // haber es filtro por org/fecha sobre `o`.
    expect(sql).not.toContain(`WHERE o."organizationId"`);
    expect(sql).not.toContain("$1");
    expect(sql).not.toContain("$2");
  });

  it("sigue siendo idempotente (ON CONFLICT)", () => {
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
  });
});
