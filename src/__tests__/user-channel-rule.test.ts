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
    expect(userRuleId("org1", "meta ads")).toBe("usr-org1-meta-ads");
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
