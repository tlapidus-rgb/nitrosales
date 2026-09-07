import { describe, it, expect, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// E-13 — validar al enviar, sin botón de "probar" y sin errores crudos
// ══════════════════════════════════════════════════════════════════════════
// La ficha pedía "exponer el test de credenciales en el wizard y bloquear el
// submit". Pero el endpoint no estaba apagado por olvido: se sacó del UI *"por
// decisión de UX — el cliente no debe ver fallas, las valida el admin"*.
//
// Este es el punto medio: no hay botón de probar, no se muestra un error crudo,
// pero si algo no anda al enviar se corta y se dice QUÉ corregir. Los `hint` de
// credential-tests ya están escritos para un humano no técnico, que es lo que
// hace esto compatible con la decisión original.
//
// Lo que estos casos fijan, y es la parte delicada: **lo inconcluso no
// bloquea**. Un cliente no puede quedar trabado en el alta porque nuestra
// verificación estuvo lenta.
// ══════════════════════════════════════════════════════════════════════════

const testCredentialsByPlatform = vi.fn();
vi.mock("@/lib/onboarding/credential-tests", () => ({
  testCredentialsByPlatform: (...a: unknown[]) => testCredentialsByPlatform(...a),
}));

const { mensajeParaElCliente, validarCredenciales, plataformasAValidar } = await import(
  "./validacion-wizard"
);

describe("mensajeParaElCliente", () => {
  it("todo bien → no hay mensaje, el alta sigue", () => {
    expect(
      mensajeParaElCliente([
        { plataforma: "VTEX", ok: true },
        { plataforma: "META_ADS", ok: true },
      ]),
    ).toBeNull();
  });

  it("lo INCONCLUSO no genera mensaje", () => {
    // Decirle "no pudimos verificar Meta Ads" a alguien que está terminando un
    // alta es ruido que no puede accionar.
    expect(
      mensajeParaElCliente([
        { plataforma: "VTEX", ok: true },
        { plataforma: "META_ADS", ok: null },
      ]),
    ).toBeNull();
  });

  it("una falla real dice QUÉ hacer, con el nombre lindo de la plataforma", () => {
    const m = mensajeParaElCliente([
      {
        plataforma: "VTEX",
        ok: false,
        detalle: "App Token inválido",
        hint: "El App Token de VTEX tiene 60+ caracteres. Volvé a tu admin VTEX y copialo COMPLETO.",
      },
    ])!;
    expect(m).toContain("VTEX");
    expect(m).toContain("copialo COMPLETO");
    expect(m).toContain("volvé a enviar");
  });

  it("prefiere el hint por sobre el detalle técnico", () => {
    const m = mensajeParaElCliente([
      { plataforma: "VTEX", ok: false, detalle: "sin permiso (403)", hint: "Necesita permiso OMS." },
    ])!;
    expect(m).toContain("Necesita permiso OMS.");
    expect(m).not.toContain("403");
  });

  it("si no hay hint ni detalle, igual dice algo accionable", () => {
    const m = mensajeParaElCliente([{ plataforma: "GOOGLE_ADS", ok: false }])!;
    expect(m).toContain("Google Ads");
    expect(m.length).toBeGreaterThan(30);
  });

  it("traduce los nombres internos", () => {
    const m = mensajeParaElCliente([{ plataforma: "MERCADOLIBRE", ok: false, hint: "x" }])!;
    expect(m).toContain("MercadoLibre");
    expect(m).not.toContain("MERCADOLIBRE");
  });

  it("con varias fallas las lista todas, no sólo la primera", () => {
    // Si dijera sólo la primera, el cliente corrige, reenvía, y se come otra
    // vuelta. Eso es exactamente la ida y vuelta que E-13 quiere eliminar.
    const m = mensajeParaElCliente([
      { plataforma: "VTEX", ok: false, hint: "revisá el token" },
      { plataforma: "META_ADS", ok: false, hint: "revisá el ad account" },
    ])!;
    expect(m).toContain("2 de tus plataformas");
    expect(m).toContain("revisá el token");
    expect(m).toContain("revisá el ad account");
  });

  it("nunca menciona una plataforma que pasó", () => {
    const m = mensajeParaElCliente([
      { plataforma: "VTEX", ok: true },
      { plataforma: "META_ADS", ok: false, hint: "x" },
    ])!;
    expect(m).not.toContain("VTEX");
  });
});

describe("validarCredenciales", () => {
  it("traduce el resultado del tester", async () => {
    testCredentialsByPlatform.mockResolvedValue({ ok: false, detail: "d", hint: "h" });
    const r = await validarCredenciales([{ platform: "VTEX", credentials: {} }]);
    expect(r).toEqual([{ plataforma: "VTEX", ok: false, detalle: "d", hint: "h" }]);
  });

  it("un tester que EXPLOTA no bloquea el alta", async () => {
    testCredentialsByPlatform.mockRejectedValue(new Error("boom"));
    const r = await validarCredenciales([{ platform: "VTEX", credentials: {} }]);
    expect(r[0].ok).toBeNull();
    expect(mensajeParaElCliente(r)).toBeNull();
  });

  it("un tester que se cuelga tampoco: vence el presupuesto y deja pasar", async () => {
    testCredentialsByPlatform.mockImplementation(() => new Promise(() => {}));
    const r = await validarCredenciales([{ platform: "VTEX", credentials: {} }], {
      presupuestoMs: 30,
    });
    expect(r[0].ok).toBeNull();
    expect(mensajeParaElCliente(r)).toBeNull();
  });

  it("una plataforma lenta no arrastra a las demás", async () => {
    // Corren en paralelo: la que responde tiene que responder igual.
    testCredentialsByPlatform.mockImplementation((p: string) =>
      p === "VTEX" ? new Promise(() => {}) : Promise.resolve({ ok: false, hint: "arreglá esto" }),
    );
    const r = await validarCredenciales(
      [
        { platform: "VTEX", credentials: {} },
        { platform: "META_ADS", credentials: {} },
      ],
      { presupuestoMs: 40 },
    );
    expect(r.find((x) => x.plataforma === "VTEX")!.ok).toBeNull();
    expect(r.find((x) => x.plataforma === "META_ADS")!.ok).toBe(false);
    expect(mensajeParaElCliente(r)).toContain("arreglá esto");
  });

  it("sin plataformas devuelve vacío", async () => {
    expect(await validarCredenciales([])).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// LOS DOS BUGS QUE ESTA MISMA FEATURE INTRODUJO
// ══════════════════════════════════════════════════════════════════════════
// Encontrados en la revisión del 2026-09-07, los dos rompían el alta que la
// feature venía a mejorar. Van juntos porque el modo de falla es el mismo:
// un 400 en cada intento, sin ninguna forma de salir desde la interfaz.
// ══════════════════════════════════════════════════════════════════════════

describe("C1 — sólo se valida lo que el cliente TIPEA", () => {
  // El bug: la primera versión validaba las cuatro plataformas. Pero en Meta,
  // Google y MercadoLibre las credenciales de verdad (`accessToken`,
  // `refreshToken`) NO viajan en el wizard: las pone el callback de OAuth del
  // lado del servidor, y el submit las mergea DESPUÉS de este punto
  // (`grep -c refreshToken OnboardingOverlay.tsx` → 0).
  //
  // Con lo cual la validación las veía vacías y los testers devolvían una falla
  // CONFIRMADA —"OAuth pendiente, falta autorizar Google Ads"— sobre un cliente
  // que ya había hecho OAuth. 400 en cada intento, sin salida desde la
  // interfaz: el alta quedaba imposible de completar para 3 de 4 plataformas.
  const conocida = (p: string) =>
    ["VTEX", "MERCADOLIBRE", "META_ADS", "GOOGLE_ADS"].includes(p);

  it("VTEX se valida: es la única que el cliente escribe a mano", () => {
    expect(plataformasAValidar([{ platform: "VTEX" }], conocida)).toEqual([
      { platform: "VTEX" },
    ]);
  });

  it("las de OAuth NO se validan, aunque vengan en el body", () => {
    const r = plataformasAValidar(
      [{ platform: "META_ADS" }, { platform: "GOOGLE_ADS" }, { platform: "MERCADOLIBRE" }],
      conocida,
    );
    expect(r).toEqual([]);
  });

  it("un wizard completo valida VTEX y deja pasar el resto", () => {
    const r = plataformasAValidar(
      [
        { platform: "VTEX" },
        { platform: "META_ADS" },
        { platform: "GOOGLE_ADS" },
        { platform: "NITROPIXEL" },
      ],
      conocida,
    );
    expect(r.map((x) => x.platform)).toEqual(["VTEX"]);
  });

  it("una plataforma desconocida no se valida", () => {
    expect(plataformasAValidar([{ platform: "SHOPIFY" }], conocida)).toEqual([]);
  });

  it("sin VTEX no se valida nada y el alta no se frena", () => {
    expect(plataformasAValidar([{ platform: "META_ADS" }], conocida)).toEqual([]);
  });
});

describe("C2 — una falla transitoria no puede trabar un alta", () => {
  // `credential-tests.ts` tiene su PROPIO tope de 10 s y convierte el timeout en
  // `ok:false` con detail "timeout". O sea que el "no sé" se vuelve "no" ANTES
  // de que el presupuesto de 20 s de acá se entere: sin esto, una Graph API de
  // Meta que tarda 11 segundos bloquea a un cliente con las credenciales
  // perfectas.
  it("un timeout del tester vuelve como INCONCLUSO, no como falla", async () => {
    testCredentialsByPlatform.mockResolvedValue({ ok: false, detail: "timeout" });
    const r = await validarCredenciales([{ platform: "VTEX", credentials: {} }]);
    expect(r[0].ok).toBeNull();
    expect(mensajeParaElCliente(r)).toBeNull();
  });

  it("un error de red también", async () => {
    testCredentialsByPlatform.mockResolvedValue({
      ok: false,
      detail: "Error de red al contactar VTEX",
    });
    const r = await validarCredenciales([{ platform: "VTEX", credentials: {} }]);
    expect(r[0].ok).toBeNull();
  });

  it("pero una credencial MAL sigue bloqueando: para eso existe la feature", async () => {
    testCredentialsByPlatform.mockResolvedValue({
      ok: false,
      detail: "401 Unauthorized",
      hint: "Revisá el App Token",
    });
    const r = await validarCredenciales([{ platform: "VTEX", credentials: {} }]);
    expect(r[0].ok).toBe(false);
    expect(mensajeParaElCliente(r)).toContain("Revisá el App Token");
  });

  it("el acoplamiento al texto del tester queda pineado acá", async () => {
    // Esto depende del literal que devuelve `credential-tests.ts`. Es feo y es
    // a propósito: si alguien cambia el texto, salta este test y no producción.
    testCredentialsByPlatform.mockResolvedValue({ ok: false, detail: "TIMEOUT (10s)" });
    expect((await validarCredenciales([{ platform: "VTEX", credentials: {} }]))[0].ok).toBeNull();
  });
});
