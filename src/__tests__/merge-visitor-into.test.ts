import { describe, it, expect, vi } from "vitest";
import { mergeVisitorInto } from "@/lib/pixel/identity";

// ══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — el merge de visitantes movía eventos pero NO atribuciones
// ══════════════════════════════════════════════════════════════════════════
// Bug encontrado por la auditoría (2026-07-22): el merge (identifyVisitor) hacía
// 4 escrituras SUELTAS y:
//   1. Movía los eventos del absorbido al sobreviviente, pero NO las
//      PixelAttribution. `PixelAttribution.visitorId` es FK sin onDelete
//      (Restrict), así que el `delete()` del absorbido TIRABA cuando tenía
//      atribuciones. Los eventos ya se habían movido → visitante FANTASMA
//      (0 eventos, en la tabla, atribuciones colgando).
//   2. No invalidaba el first_source del sobreviviente, que hereda eventos más
//      viejos: bajo FIRST CLICK su primer toque puede cambiar, pero el batch
//      usa ON CONFLICT DO NOTHING y nunca lo recalcula → canal viejo permanente.
//
// No se puede integration-testear: el merge usa Prisma y el harness es PGlite
// crudo (sin cliente Prisma). Lo que SÍ se puede fijar es la ORQUESTACIÓN: que
// las atribuciones se muevan, que el first_source de ambos se borre, y que el
// delete vaya al final. Un `tx` falso registra la secuencia de llamadas.
// ══════════════════════════════════════════════════════════════════════════

interface Call {
  op: string;
  arg: any;
}

/** `tx` falso que registra cada operación en orden. */
function fakeTx() {
  const calls: Call[] = [];
  const rec = (op: string) => (arg: any) => {
    calls.push({ op, arg });
    return Promise.resolve({ count: 1 });
  };
  const rawCalls: any[][] = [];
  const tx: any = {
    pixelVisitorAlias: { upsert: rec("alias.upsert") },
    pixelEvent: { updateMany: rec("event.updateMany") },
    pixelAttribution: { updateMany: rec("attribution.updateMany") },
    pixelVisitor: { update: rec("visitor.update"), delete: rec("visitor.delete") },
    $executeRawUnsafe: (...a: any[]) => {
      calls.push({ op: "raw", arg: a });
      rawCalls.push(a);
      return Promise.resolve(1);
    },
  };
  return { tx, calls, rawCalls };
}

const visitor = (over: Partial<any> = {}): any => ({
  id: "cuid_x",
  visitorId: "uuid_x",
  organizationId: "org1",
  totalSessions: 1,
  totalPageViews: 2,
  deviceTypes: ["desktop"],
  clickIds: null,
  phone: null,
  ...over,
});

describe("mergeVisitorInto — orquestación del merge atómico", () => {
  it("MUEVE las atribuciones del absorbido al sobreviviente (el fix)", async () => {
    const { tx, calls } = fakeTx();
    const absorbed = visitor({ id: "absorbed", organizationId: "org1" });
    const survivor = visitor({ id: "survivor", organizationId: "org1" });

    await mergeVisitorInto(tx, absorbed, survivor);

    const attr = calls.find((c) => c.op === "attribution.updateMany");
    expect(attr).toBeTruthy();
    expect(attr!.arg.where.visitorId).toBe("absorbed");
    expect(attr!.arg.data.visitorId).toBe("survivor");
  });

  it("borra el first_source y el no_source de AMBOS visitantes", async () => {
    const { tx, rawCalls } = fakeTx();
    await mergeVisitorInto(
      tx,
      visitor({ id: "absorbed", organizationId: "org1" }),
      visitor({ id: "survivor", organizationId: "org1" })
    );

    const fs = rawCalls.find((a) => /pixel_visitor_first_source/.test(a[0]));
    const ns = rawCalls.find((a) => /pixel_visitor_no_source/.test(a[0]));
    expect(fs).toBeTruthy();
    expect(ns).toBeTruthy();
    // params: org, survivor.id, absorbed.id — los dos visitantes.
    expect(fs!.slice(1)).toEqual(["org1", "survivor", "absorbed"]);
    expect(ns!.slice(1)).toEqual(["org1", "survivor", "absorbed"]);
  });

  it("el delete del absorbido va DESPUÉS de mover eventos y atribuciones", async () => {
    const { tx, calls } = fakeTx();
    await mergeVisitorInto(
      tx,
      visitor({ id: "absorbed" }),
      visitor({ id: "survivor" })
    );

    const order = calls.map((c) => c.op);
    const iEvents = order.indexOf("event.updateMany");
    const iAttr = order.indexOf("attribution.updateMany");
    const iDelete = order.indexOf("visitor.delete");
    // Sin este orden, el delete falla por FK o borra datos aún referenciados.
    expect(iDelete).toBeGreaterThan(iEvents);
    expect(iDelete).toBeGreaterThan(iAttr);
    // Y el delete es la ÚLTIMA operación.
    expect(iDelete).toBe(order.length - 1);
  });

  it("acumula sesiones y page views, y crea el alias del viejo id", async () => {
    const { tx, calls } = fakeTx();
    const absorbed = visitor({ id: "absorbed", visitorId: "uuid_viejo", totalSessions: 3, totalPageViews: 5 });
    const survivor = visitor({ id: "survivor", totalSessions: 2, totalPageViews: 4 });

    await mergeVisitorInto(tx, absorbed, survivor);

    const alias = calls.find((c) => c.op === "alias.upsert");
    expect(alias!.arg.where.oldVisitorId).toBe("uuid_viejo");
    const upd = calls.find((c) => c.op === "visitor.update");
    expect(upd!.arg.data.totalSessions).toBe(5);
    expect(upd!.arg.data.totalPageViews).toBe(9);
  });

  it("el phone recién provisto se usa sólo si ninguno de los dos lo tiene", async () => {
    const { tx, calls } = fakeTx();
    await mergeVisitorInto(
      tx,
      visitor({ id: "absorbed", phone: null }),
      visitor({ id: "survivor", phone: null }),
      { newPhone: "+5491100000000" }
    );
    const upd = calls.find((c) => c.op === "visitor.update");
    expect(upd!.arg.data.phone).toBe("+5491100000000");
  });
});
