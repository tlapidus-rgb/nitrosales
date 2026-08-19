import { describe, it, expect } from "vitest";
import {
  buildUserChannelRule,
  userRuleId,
  UserRuleError,
} from "@/lib/pixel/user-channel-rule";

// PIVOT v2: el usuario conecta un origen crudo con SU canal. La regla es
// source EXACT = codigo → canal, de la org.
describe("buildUserChannelRule — mapeo self-service del usuario", () => {
  it("arma la regla de la org con match exacto sobre el source en minúscula", () => {
    const r = buildUserChannelRule({
      organizationId: "org1",
      source: "IconMarketing",
      channel: "Email Marketing",
    });
    expect(r.organizationId).toBe("org1");
    expect(r.source).toEqual({ match: "exact", pattern: "iconmarketing" });
    expect(r.channel).toBe("Email Marketing"); // el nombre del usuario, tal cual
    expect(r.priority).toBe(5); // gana sobre las globales
  });

  it("id estable por (org, source): re-mapear ACTUALIZA en vez de duplicar", () => {
    const a = buildUserChannelRule({ organizationId: "org1", source: "icomm", channel: "X" });
    const b = buildUserChannelRule({ organizationId: "org1", source: "ICOMM", channel: "Y" });
    expect(a.id).toBe(b.id); // mismo id → el POST hace upsert
    // slug legible de prefijo + hash de 8 hex de sufijo (unicidad).
    expect(userRuleId("org1", "meta ads")).toMatch(/^usr-org1-meta-ads-[0-9a-f]{8}$/);
  });

  it("colisión de id: sources que slugifican igual NO comparten id (fix)", () => {
    // `google.ads`/`google-ads`/`google_ads` → mismo slug 'google-ads' pero son
    // orígenes DISTINTOS. Antes colisionaban (uno pisaba al otro en el upsert).
    const ids = new Set([
      userRuleId("o", "google.ads"),
      userRuleId("o", "google-ads"),
      userRuleId("o", "google_ads"),
    ]);
    expect(ids.size).toBe(3); // los 3 distintos
    // ...pero el MISMO crudo sigue dando el MISMO id (upsert estable).
    expect(userRuleId("o", "google.ads")).toBe(userRuleId("o", "GOOGLE.ADS"));
  });

  it("colisión de medium: '' (sin utm_medium) vs 'directo' NO comparten id (fix)", () => {
    expect(userRuleId("o", "google", "")).not.toBe(userRuleId("o", "google", "directo"));
  });

  it("valida: source y channel obligatorios y no vacíos", () => {
    expect(() => buildUserChannelRule({ organizationId: "o", source: "", channel: "X" })).toThrow(UserRuleError);
    expect(() => buildUserChannelRule({ organizationId: "o", source: "s", channel: "  " })).toThrow(UserRuleError);
    expect(() => buildUserChannelRule({ organizationId: "", source: "s", channel: "X" })).toThrow(UserRuleError);
  });

  it("rechaza valores absurdamente largos", () => {
    expect(() =>
      buildUserChannelRule({ organizationId: "o", source: "x".repeat(200), channel: "X" })
    ).toThrow(UserRuleError);
  });
});

// Grano (source, medium) — pedido de Tomy: "google" viene de Google Ads (medium cpc)
// Y Google Orgánico (medium organic); con source solo son indistinguibles. La regla
// puede scopearse a source+medium para agarrar SOLO una variante.
describe("buildUserChannelRule — grano (source, medium)", () => {
  it("con medium → regla source+medium (match exacto en minúscula)", () => {
    const r = buildUserChannelRule({ organizationId: "org1", source: "Google", channel: "Google Ads", medium: "CPC" });
    expect(r.source).toEqual({ match: "exact", pattern: "google" });
    expect(r.medium).toEqual({ match: "exact", pattern: "cpc" });
  });

  it("sin medium → regla source-only (sin condición de medium)", () => {
    const r = buildUserChannelRule({ organizationId: "org1", source: "google", channel: "X" });
    expect(r.medium).toBeUndefined();
  });

  it("medium '' (sin utm_medium) es un valor legítimo → SÍ crea condición de medium", () => {
    const r = buildUserChannelRule({ organizationId: "org1", source: "google", channel: "Google Orgánico", medium: "" });
    expect(r.medium).toEqual({ match: "exact", pattern: "" });
  });

  it("ids distintos por medium → (google,cpc), (google,organic), (google source-only), (google,'') NO colisionan", () => {
    const ads = buildUserChannelRule({ organizationId: "org1", source: "google", channel: "Ads", medium: "cpc" });
    const org = buildUserChannelRule({ organizationId: "org1", source: "google", channel: "Org", medium: "organic" });
    const bare = buildUserChannelRule({ organizationId: "org1", source: "google", channel: "Any" });
    const empty = buildUserChannelRule({ organizationId: "org1", source: "google", channel: "Empty", medium: "" });
    expect(new Set([ads.id, org.id, bare.id, empty.id]).size).toBe(4); // los 4 distintos
    expect(bare.id).toMatch(/^usr-org1-google-[0-9a-f]{8}$/); // source-only: slug + hash
  });

  it("userRuleId: mismo (org, source, medium) → mismo id (upsert); distinto medium → distinto", () => {
    expect(userRuleId("org1", "google", "cpc")).toBe(userRuleId("org1", "GOOGLE", "CPC"));
    expect(userRuleId("org1", "google", "cpc")).not.toBe(userRuleId("org1", "google", "organic"));
    expect(userRuleId("org1", "google", null)).toMatch(/^usr-org1-google-[0-9a-f]{8}$/); // source-only
  });

  it("valida: medium demasiado largo tira UserRuleError", () => {
    expect(() =>
      buildUserChannelRule({ organizationId: "o", source: "s", channel: "X", medium: "m".repeat(200) })
    ).toThrow(UserRuleError);
  });
});
