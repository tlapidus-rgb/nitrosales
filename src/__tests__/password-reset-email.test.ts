import { describe, expect, it } from "vitest";
import { normalizeEmailLocale, passwordResetEmail } from "@/lib/email/templates";

describe("password reset email localization", () => {
  it("normalizes browser locale to es/en", () => {
    expect(normalizeEmailLocale("es-AR")).toBe("es");
    expect(normalizeEmailLocale("en-US")).toBe("en");
    expect(normalizeEmailLocale("fr-FR")).toBe("es");
  });

  it("renders Spanish and English variants", () => {
    const es = passwordResetEmail("Juan", "https://example.com/reset", "es");
    const en = passwordResetEmail("John", "https://example.com/reset", "en");

    expect(es.subject).toContain("NitroSales");
    expect(en.subject).toContain("NitroSales");
    expect(es.html).toContain("Crear nueva contraseña");
    expect(en.html).toContain("Create new password");
  });
});