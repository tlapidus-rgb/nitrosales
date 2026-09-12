import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// E-29 — el componente no puede volver a tener su propia definicion de "listo"
// ══════════════════════════════════════════════════════════════════════════
// `OnboardingOverlay.tsx` tiene @ts-nocheck y el repo no tiene stack de testing
// de React, asi que la unica red sobre este componente es leer su fuente.
//
// Lo que se cuida es el patron que causo el bug: habia DOS definiciones de
// "que plataformas viajan al backend" —la de la barra de progreso y la del
// submit— y por eso la barra podia decir 100% sobre una lista vacia. Es el
// mismo #VARIABLE-CON-DOS-DUENOS de toda esta branch.
// ══════════════════════════════════════════════════════════════════════════

const RUTA = join(process.cwd(), "src/components/OnboardingOverlay.tsx");
const fuente = readFileSync(RUTA, "utf8");
const codigo = fuente
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("la regla vive en un solo lugar", () => {
  it("el componente importa `evaluarWizard`", () => {
    expect(codigo).toContain("evaluarWizard");
    expect(codigo).toMatch(/from\s+"@\/lib\/onboarding\/listo-para-enviar"/);
  });

  it("el boton se habilita con `estado.listo`, NO con el porcentaje", () => {
    // `globalCompletion === 100` era el bug: saltear las seis plataformas da
    // 100% de decisiones tomadas y cero plataformas conectadas.
    expect(codigo).toContain("disabled={submitting || !estado.listo}");
    expect(codigo).not.toMatch(/disabled=\{submitting \|\| globalCompletion/);
  });

  it("el submit no reimplementa las validaciones a mano", () => {
    expect(codigo).toContain("if (!estado.listo)");
    expect(codigo).not.toContain('setError(`Falta decidir sobre');
    expect(codigo).not.toContain('setError(`Completá todos los campos de');
  });

  it("lo que se manda sale de `estado.aEnviar`, no de un filtro propio", () => {
    // Esta es LA linea que impedia que las dos definiciones driftearan.
    expect(codigo).toContain("estado.aEnviar.map");
    expect(codigo).not.toMatch(/usePlatforms[\s\S]{0,80}filter\([\s\S]{0,40}NITROPIXEL/);
  });
});

describe("la barra no vuelve a decir que un alta vacia esta completa", () => {
  it("se pone verde con `estado.listo`, no al llegar a 100%", () => {
    expect(codigo).not.toMatch(/globalCompletion === 100 \? ACCENT_GREEN/);
    expect(codigo).toMatch(/estado\.listo \? ACCENT_GREEN/);
  });

  it("y el label ya no dice 'Completitud general'", () => {
    // Medía decisiones, no completitud del alta. El nombre era la mitad del
    // engaño: 100% de "completitud general" se lee como "ya está".
    //
    // Contra `codigo` y no contra `fuente`: el comentario que explica el
    // cambio cita el label viejo. Tercera vez que piso esto en la branch
    // (#S61-EL-TEST-DE-SOURCE-LEE-MIS-PROPIOS-COMENTARIOS) — la regla ya
    // estaba escrita y aun asi use la variable equivocada, asi que las dos
    // variables deberian llamarse distinto de como se llaman.
    expect(codigo).not.toContain("Completitud general");
  });
});
