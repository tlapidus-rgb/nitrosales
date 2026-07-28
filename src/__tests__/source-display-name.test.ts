import { describe, it, expect } from "vitest";
import { sourceDisplayName } from "@/lib/pixel/source-display-name";

// PIVOT v2 (Tomy): la plataforma muestra el origen con nombre limpio; el usuario
// lo mapea a su canal. Este helper es SÓLO presentación del nombre.
describe("sourceDisplayName — nombre legible del origen crudo", () => {
  it("capitaliza el código simple (el ejemplo de Tomy)", () => {
    expect(sourceDisplayName("icommarketing")).toBe("Icommarketing");
    expect(sourceDisplayName("blue")).toBe("Blue");
    expect(sourceDisplayName("perfil")).toBe("Perfil");
  });

  it("separa por - _ . y espacio, capitaliza cada palabra", () => {
    expect(sourceDisplayName("facebook-chat")).toBe("Facebook Chat");
    expect(sourceDisplayName("wa_mkt")).toBe("Wa Mkt");
    expect(sourceDisplayName("meta-story")).toBe("Meta Story");
    expect(sourceDisplayName("omni-mkt")).toBe("Omni Mkt");
  });

  it("preserva el casing de siglas/marcas conocidas", () => {
    expect(sourceDisplayName("tv")).toBe("TV");
    expect(sourceDisplayName("gocuotas")).toBe("GoCuotas");
    expect(sourceDisplayName("tiktok")).toBe("TikTok");
    expect(sourceDisplayName("cace")).toBe("CACE");
    expect(sourceDisplayName("whatsapp")).toBe("WhatsApp");
  });

  it("dominios: capitaliza el nombre, deja el TLD", () => {
    expect(sourceDisplayName("chatgpt.com")).toBe("ChatGPT.com");
    expect(sourceDisplayName("copilot.com")).toBe("Copilot.com");
  });

  it("vacío o nulo → 'Sin origen'", () => {
    expect(sourceDisplayName("")).toBe("Sin origen");
    expect(sourceDisplayName(null)).toBe("Sin origen");
    expect(sourceDisplayName("   ")).toBe("Sin origen");
  });

  it("es determinista y no rompe con basura", () => {
    expect(sourceDisplayName("a")).toBe("A");
    expect(typeof sourceDisplayName("▒▒garbage")).toBe("string");
  });
});
