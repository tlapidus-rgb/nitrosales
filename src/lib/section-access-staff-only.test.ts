import { describe, it, expect } from "vitest";
import { isPathAllowed, isStaffOnlyApiPath, requiredSectionForPath } from "./section-access";

// ══════════════════════════════════════════════════════════════════════════
// R-C05 — el middleware dejaba pasar a cualquier usuario logueado hacia
// /api/admin/* y /api/backfill/*
// ══════════════════════════════════════════════════════════════════════════
// Ninguno de los dos prefijos estaba en API_SECTION_PREFIXES, así que
// `requiredSectionForPath` devolvía null → `isPathAllowed` devolvía true. Un
// MEMBER de cualquier organización atravesaba el gate hacia las 154 rutas admin,
// y lo único que lo frenaba era el `isInternalUser()` de cada handler — que 50
// de esas 154 no tienen.
//
// La mitad delicada de este arreglo no es bloquear: es NO romper.
//   · el panel de canales (`/pixel/canales`) le pega a /api/admin/channel-rules
//     y /api/admin/channels-breakdown siendo cliente, no staff;
//   · los crons y los self-fetch server-to-server no llevan token, así que el
//     middleware ni los evalúa (se cubre en middleware-staff-gate.test.ts).
// ══════════════════════════════════════════════════════════════════════════

/** Un MEMBER común de una org cliente: ve su sección y nada de staff. */
const cliente = {
  isApi: true,
  isStaff: false,
  allowedSections: ["dashboard", "pixel"],
  writableSections: ["dashboard", "pixel"],
};

describe("R-C05 — /api/admin y /api/backfill son staff-only", () => {
  const rutasAdmin = [
    "/api/admin/usage",
    "/api/admin/reconcile",
    "/api/admin/reattribute",
    "/api/admin/clientes",
    "/api/admin/orgs-list",
    "/api/admin/view-as-org",
    "/api/admin/users/abc/reset-password",
    "/api/backfill/vtex",
    "/api/backfill/runner",
  ];

  it.each(rutasAdmin)("un cliente logueado NO entra a %s", (pathname) => {
    expect(isPathAllowed({ ...cliente, pathname, method: "GET" })).toBe(false);
  });

  it("tampoco por POST", () => {
    expect(
      isPathAllowed({ ...cliente, pathname: "/api/admin/reattribute", method: "POST" }),
    ).toBe(false);
  });

  it("el staff sigue entrando a todo", () => {
    for (const pathname of rutasAdmin) {
      expect(
        isPathAllowed({
          pathname,
          method: "POST",
          isApi: true,
          isStaff: true,
          allowedSections: undefined,
          writableSections: undefined,
        }),
      ).toBe(true);
    }
  });

  it("el prefijo matchea por segmento, no por substring", () => {
    // Que no se cuele nada por parecerse, ni se bloquee algo que sólo empieza igual.
    expect(isStaffOnlyApiPath("/api/admin")).toBe(true);
    expect(isStaffOnlyApiPath("/api/admin/usage")).toBe(true);
    expect(isStaffOnlyApiPath("/api/administracion")).toBe(false);
    expect(isStaffOnlyApiPath("/api/backfilling")).toBe(false);
  });

  it("no toca rutas que no son de admin", () => {
    expect(isStaffOnlyApiPath("/api/metrics/orders")).toBe(false);
    expect(isStaffOnlyApiPath("/api/pixel/event")).toBe(false);
    expect(isStaffOnlyApiPath("/dashboard")).toBe(false);
  });
});

describe("R-C05 — es fail-CLOSED, a diferencia del resto del archivo", () => {
  // Los dos fail-open de `isPathAllowed` existen para no lockear a alguien con un
  // JWT viejo. Acá no: "no sé si sos staff" no puede resolverse como "pasá".
  it("un token sin snapshot de secciones tampoco entra", () => {
    expect(
      isPathAllowed({
        pathname: "/api/admin/usage",
        method: "GET",
        isApi: true,
        isStaff: false,
        allowedSections: undefined,
        writableSections: undefined,
      }),
    ).toBe(false);
  });

  it("y un token sin writableSections tampoco puede escribir", () => {
    expect(
      isPathAllowed({
        pathname: "/api/admin/reconcile",
        method: "POST",
        isApi: true,
        isStaff: false,
        allowedSections: ["dashboard"],
        writableSections: undefined,
      }),
    ).toBe(false);
  });

  it("el fail-open de las rutas normales queda INTACTO", () => {
    // No es un descuido: es la regla que evita lockear a un usuario legítimo
    // mientras su JWT rota. Si esto se vuelve `false`, es la tarea R-C05 paso 3,
    // y va DESPUÉS de R-C09 (que rota el secreto e invalida todas las sesiones).
    expect(
      isPathAllowed({
        pathname: "/api/aura/creators",
        method: "GET",
        isApi: true,
        isStaff: false,
        allowedSections: undefined,
        writableSections: undefined,
      }),
    ).toBe(true);
  });
});

describe("R-C05 — lo que NO se puede romper: el panel de canales del cliente", () => {
  // `/pixel/canales` es self-service desde el pivot v2. Le pega a dos rutas que
  // viven bajo /api/admin sólo por historia. Un gate ciego a /api/admin le apaga
  // el panel de canales a Arredo y a TeVe Compras.
  const rutasDelPanel = ["/api/admin/channel-rules", "/api/admin/channels-breakdown"];

  it.each(rutasDelPanel)("%s NO es staff-only", (pathname) => {
    expect(isStaffOnlyApiPath(pathname)).toBe(false);
  });

  it.each(rutasDelPanel)("%s se resuelve a la sección pixel", (pathname) => {
    expect(requiredSectionForPath(pathname)).toBe("pixel");
  });

  it("un cliente CON la sección pixel entra y puede escribir", () => {
    for (const pathname of rutasDelPanel) {
      expect(isPathAllowed({ ...cliente, pathname, method: "GET" })).toBe(true);
    }
    // POST = conectar un origen a un canal desde el panel.
    expect(
      isPathAllowed({ ...cliente, pathname: "/api/admin/channel-rules", method: "POST" }),
    ).toBe(true);
    expect(
      isPathAllowed({ ...cliente, pathname: "/api/admin/channel-rules", method: "DELETE" }),
    ).toBe(true);
  });

  it("un cliente SIN la sección pixel no entra — el gate por sección sigue mandando", () => {
    const sinPixel = { ...cliente, allowedSections: ["dashboard"], writableSections: ["dashboard"] };
    expect(
      isPathAllowed({ ...sinPixel, pathname: "/api/admin/channel-rules", method: "GET" }),
    ).toBe(false);
  });

  it("un cliente con pixel de sólo lectura no puede escribir reglas", () => {
    const soloLectura = { ...cliente, writableSections: ["dashboard"] };
    expect(
      isPathAllowed({ ...soloLectura, pathname: "/api/admin/channel-rules", method: "GET" }),
    ).toBe(true);
    expect(
      isPathAllowed({ ...soloLectura, pathname: "/api/admin/channel-rules", method: "POST" }),
    ).toBe(false);
  });

  it("la excepción es sólo esas dos rutas, no todo lo que empiece parecido", () => {
    expect(isStaffOnlyApiPath("/api/admin/channel-rules-setup")).toBe(true);
  });
});

describe("R-C05 — rutas revisadas y deliberadamente NO gateadas", () => {
  it("el ingest público del pixel no se gatea por sección", () => {
    // Lo llama el navegador del visitante en el sitio del cliente, sin sesión.
    // Mapearlo a una sección no es un arreglo, es un error de concepto.
    expect(requiredSectionForPath("/api/pixel/event")).toBeNull();
    expect(requiredSectionForPath("/api/pixel/script")).toBeNull();
  });

  it("los webhooks tampoco", () => {
    // Los llaman VTEX y MercadoLibre con su propia key, no un usuario.
    expect(requiredSectionForPath("/api/webhooks/vtex/orders")).toBeNull();
  });

  it("los flujos SELF de settings y dashboard siguen abiertos", () => {
    // Gatear /api/settings o /api/dashboard en grueso rompe cambiar la propia
    // contraseña y aceptar una invitación. Ver el comentario en el archivo.
    expect(requiredSectionForPath("/api/settings/security/password")).toBeNull();
    expect(requiredSectionForPath("/api/dashboard/preferences")).toBeNull();
  });
});
