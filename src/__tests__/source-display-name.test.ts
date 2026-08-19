import { describe, it, expect } from "vitest";
import { sourceDisplayName, mediumAxisLabel } from "@/lib/pixel/source-display-name";

// El label del eje pago/orgánico DERIVA del canal resuelto (metodología 2-ejes)
// → nunca contradice al canal. Bug que arreglaba: meta·trafico mostraba "Orgánico"
// al lado del canal "Meta Ads".
describe("mediumAxisLabel — el canal resuelto manda sobre el medium", () => {
  it("canal 'Ads' → 'Ads' aunque el medium diga otra cosa", () => {
    expect(mediumAxisLabel("Meta Ads", "trafico")).toBe("Ads"); // ← el bug de Tomy
    expect(mediumAxisLabel("Google Ads", "organic")).toBe("Ads"); // el canal gana
    expect(mediumAxisLabel("TikTok Ads", "video")).toBe("Ads");
  });
  it("canal 'Orgánico' → 'Orgánico'", () => {
    expect(mediumAxisLabel("Facebook Orgánico", "trafico")).toBe("Orgánico");
    expect(mediumAxisLabel("Instagram Orgánico", "video")).toBe("Orgánico");
  });
  it("sin canal (origen no mapeado) → hint por medium", () => {
    expect(mediumAxisLabel(null, "cpc")).toBe("Ads");
    expect(mediumAxisLabel(null, "trafico")).toBe("Orgánico");
    expect(mediumAxisLabel(null, "")).toBe("Directo");
  });
  it("canal que no es Ads/Orgánico (Email, GoCuotas…) → hint por medium", () => {
    expect(mediumAxisLabel("Email", "newsletter")).toBe("Newsletter");
  });
});

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
