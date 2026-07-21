import { describe, it, expect } from "vitest";
import { decideNextCall } from "@/lib/pixel/first-source-progress";

// ══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — auditoría 2026-07-21
// ══════════════════════════════════════════════════════════════════════════
// `refresh-pixel-first-source` estuvo desagendado 5 semanas y la dimensión
// quedó congelada. Al hacerlo incremental aparecieron dos modos de fallar
// simétricos que estos tests fijan:
//   · cortar de más → visitantes sin first_source, en silencio (el agujero).
//   · no cortar     → el cron loopea hasta el maxDuration.
// El caso filoso es `pending`: el cursor NO avanza a propósito (hay que
// rebarrer las orgs), así que la regla vieja "cursor quieto ⇒ cortar" corta mal.
// ══════════════════════════════════════════════════════════════════════════

describe("decideNextCall", () => {
  it("done:true corta", () => {
    expect(decideNextCall({ ok: true, done: true }, 0)).toEqual({
      action: "stop",
      reason: "done",
    });
  });

  it("ok:false corta", () => {
    expect(decideNextCall({ ok: false, error: "boom" }, 2)).toEqual({
      action: "stop",
      reason: "error",
    });
  });

  it("respuesta nula o indefinida corta (fetch fallido)", () => {
    expect(decideNextCall(null, 0).action).toBe("stop");
    expect(decideNextCall(undefined, 0).action).toBe("stop");
  });

  it("avanza el cursor cuando quedan orgs por barrer", () => {
    expect(decideNextCall({ ok: true, done: false, nextOrgCursor: 3 }, 1)).toEqual({
      action: "continue",
      nextCursor: 3,
    });
  });

  it("corta si el cursor no avanza y NO hay cola (anti-loop clásico)", () => {
    expect(decideNextCall({ ok: true, done: false, nextOrgCursor: 1 }, 1)).toEqual({
      action: "stop",
      reason: "cursor-stuck",
    });
  });

  it("corta si nextOrgCursor viene null sin cola", () => {
    expect(decideNextCall({ ok: true, done: false, nextOrgCursor: null }, 4).action).toBe(
      "stop"
    );
  });

  // ── El caso que motivó extraer esto ──────────────────────────────────────
  it("con pending SIGUE aunque el cursor no avance — sin esto quedaba cola sin procesar", () => {
    const d = decideNextCall(
      { ok: true, done: false, pending: true, processedThisCall: 50_000, nextOrgCursor: 0 },
      0
    );
    expect(d).toEqual({ action: "continue", nextCursor: 0 });
  });

  it("con pending pero SIN progreso corta — si no insertó a nadie, no va a insertar", () => {
    expect(
      decideNextCall(
        { ok: true, done: false, pending: true, processedThisCall: 0, nextOrgCursor: 0 },
        0
      )
    ).toEqual({ action: "stop", reason: "no-progress" });
  });

  it("con pending y nextOrgCursor ausente vuelve a 0 (rebarrido completo)", () => {
    expect(
      decideNextCall({ ok: true, done: false, pending: true, processedThisCall: 10 }, 7)
    ).toEqual({ action: "continue", nextCursor: 0 });
  });

  it("done gana sobre pending (no debería pasar, pero no queremos loop infinito)", () => {
    expect(
      decideNextCall(
        { ok: true, done: true, pending: true, processedThisCall: 10 },
        0
      ).action
    ).toBe("stop");
  });

  it("una secuencia realista termina: 2 orgs, la segunda con cola, y cierra", () => {
    const responses = [
      { ok: true, done: false, nextOrgCursor: 1 },
      { ok: true, done: false, pending: true, processedThisCall: 50_000, nextOrgCursor: 0 },
      { ok: true, done: true },
    ];
    let cursor = 0;
    let calls = 0;
    for (const r of responses) {
      calls++;
      const d = decideNextCall(r, cursor);
      if (d.action === "stop") break;
      cursor = d.nextCursor;
    }
    expect(calls).toBe(3);
  });
});
