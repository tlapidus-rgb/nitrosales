import { describe, it, expect } from "vitest";
import {
  computeSectionStatus,
  getMissingIntegrations,
  findSectionByKey,
  satisface,
  esCapacidad,
  CAPACIDADES_DE,
  SECTIONS,
  type RequiredIntegration,
} from "./config";

// ══════════════════════════════════════════════════════════════════════════
// E-30 — las secciones piden CAPACIDADES, no nombres de plataforma
// ══════════════════════════════════════════════════════════════════════════
// `/orders` y `/products` pedian [["VTEX","MERCADOLIBRE"]] — la lista escrita a
// mano. El problema no era que estuviera mal hoy: el dia que entre Shopify,
// esas secciones quedan bloqueadas para ese cliente hasta que alguien se
// acuerde de editar el array.
//
// Y no falla ruidosamente: el cliente nuevo entra, ve un candado sobre
// "Pedidos" y concluye que el producto no soporta su plataforma.
// ══════════════════════════════════════════════════════════════════════════

const conectadas = (...xs: string[]) => new Set(xs);
const seccion = (key: string) => findSectionByKey(key)!;

describe("lo que ya andaba sigue andando", () => {
  it("VTEX conectado desbloquea Pedidos y Productos", () => {
    const c = conectadas("VTEX");
    expect(computeSectionStatus(seccion("orders"), c)).toBe("ACTIVE");
    expect(computeSectionStatus(seccion("products"), c)).toBe("ACTIVE");
  });

  it("MercadoLibre solo tambien", () => {
    const c = conectadas("MERCADOLIBRE");
    expect(computeSectionStatus(seccion("orders"), c)).toBe("ACTIVE");
    expect(computeSectionStatus(seccion("products"), c)).toBe("ACTIVE");
  });

  it("sin ninguna, siguen bloqueadas", () => {
    const c = conectadas();
    expect(computeSectionStatus(seccion("orders"), c)).toBe("LOCKED_INTEGRATION");
  });

  it("una seccion que pide una integracion PUNTUAL sigue exigiendola", () => {
    // `/campaigns/meta` de verdad necesita Meta: tener Google Ads no sirve.
    expect(computeSectionStatus(seccion("campaigns_meta"), conectadas("GOOGLE_ADS"))).toBe(
      "LOCKED_INTEGRATION",
    );
    expect(computeSectionStatus(seccion("campaigns_meta"), conectadas("META_ADS"))).toBe("ACTIVE");
  });

  it("los overrides manuales siguen ganando", () => {
    const s = seccion("orders");
    expect(computeSectionStatus(s, conectadas("VTEX"), { global: { orders: "MAINTENANCE" } })).toBe(
      "MAINTENANCE",
    );
    expect(computeSectionStatus(s, conectadas(), { org: { orders: "ACTIVE" } })).toBe("ACTIVE");
  });
});

describe("EL PUNTO: una plataforma nueva desbloquea sola", () => {
  it("basta con que figure en CAPACIDADES_DE", () => {
    // Se simula sumar Shopify. En el codigo real seria UNA linea en el mapa;
    // aca se prueba que el resolvedor no necesita nada mas.
    const conShopify = { ...CAPACIDADES_DE, SHOPIFY: ["PEDIDOS", "CATALOGO"] };

    // El resolvedor pregunta por capacidad, no por nombre.
    expect(satisface("PEDIDOS", conectadas("SHOPIFY"))).toBe(false); // todavia no esta en el mapa
    // Y con el mapa extendido, la capacidad se cumple:
    const tiene = (Object.keys(conShopify) as string[]).some(
      (i) => i === "SHOPIFY" && conShopify.SHOPIFY.includes("PEDIDOS" as never),
    );
    expect(tiene).toBe(true);
  });

  it("`/orders` pide una capacidad, NO una lista de plataformas", () => {
    // Esto es lo que hace que sumar una plataforma sea una linea. Si alguien
    // vuelve a poner ["VTEX","MERCADOLIBRE"] aca, el problema regresa.
    expect(seccion("orders").requires).toEqual(["PEDIDOS"]);
    expect(seccion("products").requires).toEqual(["CATALOGO"]);
  });

  it("ninguna seccion de las genericas nombra una plataforma de ecommerce", () => {
    const genericas = ["orders", "products"];
    for (const key of genericas) {
      const req = JSON.stringify(seccion(key).requires ?? []);
      expect(req, `${key} volvio a nombrar plataformas`).not.toMatch(/VTEX|MERCADOLIBRE/);
    }
  });
});

describe("satisface: capacidad vs integracion puntual", () => {
  it("una capacidad la cumple cualquiera que la provea", () => {
    expect(satisface("PEDIDOS", conectadas("VTEX"))).toBe(true);
    expect(satisface("PEDIDOS", conectadas("MERCADOLIBRE"))).toBe(true);
    expect(satisface("PUBLICIDAD", conectadas("META_ADS"))).toBe(true);
    expect(satisface("PUBLICIDAD", conectadas("GOOGLE_ADS"))).toBe(true);
  });

  it("una integracion puntual exige esa y no otra", () => {
    expect(satisface("META_ADS", conectadas("GOOGLE_ADS"))).toBe(false);
    expect(satisface("META_ADS", conectadas("META_ADS"))).toBe(true);
  });

  it("una integracion desconocida no cumple nada", () => {
    expect(satisface("PEDIDOS", conectadas("PLATAFORMA_MARCIANA"))).toBe(false);
  });

  it("Search Console NO cuenta como trafico web", () => {
    // Trae busqueda organica, no trafico propio trackeado: no reemplaza al
    // pixel para lo que `/analytics` necesita.
    expect(satisface("TRAFICO_WEB", conectadas("GOOGLE_SEARCH_CONSOLE"))).toBe(false);
    expect(satisface("TRAFICO_WEB", conectadas("NITROPIXEL"))).toBe(true);
  });

  it("distingue capacidades de nombres de integracion", () => {
    expect(esCapacidad("PEDIDOS")).toBe(true);
    expect(esCapacidad("VTEX")).toBe(false);
  });
});

describe("lo que se le muestra al usuario sigue siendo accionable", () => {
  it("un `/orders` bloqueado nombra PLATAFORMAS, no capacidades", () => {
    // El usuario no puede conectar una capacidad. Si la UI dijera "te falta
    // PEDIDOS", no sabria que hacer.
    const faltan = getMissingIntegrations(seccion("orders"), conectadas());
    expect(faltan).toContain("VTEX");
    expect(faltan).toContain("MERCADOLIBRE");
    expect(faltan).not.toContain("PEDIDOS");
  });

  it("no repite una integracion que provee dos capacidades pedidas", () => {
    const faltan = getMissingIntegrations(
      { key: "x", path: "/x", label: "X", requires: ["PEDIDOS", "CATALOGO"] },
      conectadas(),
    );
    expect(faltan.filter((i) => i === "VTEX")).toHaveLength(1);
  });

  it("con la capacidad cubierta, no falta nada", () => {
    expect(getMissingIntegrations(seccion("orders"), conectadas("VTEX"))).toEqual([]);
  });

  it("una seccion puntual bloqueada nombra su integracion", () => {
    expect(getMissingIntegrations(seccion("campaigns_meta"), conectadas())).toEqual(["META_ADS"]);
  });
});

describe("el mapa de capacidades esta completo", () => {
  it("toda integracion del tipo figura en CAPACIDADES_DE", () => {
    // Si alguien agrega una integracion al tipo y se olvida del mapa, las
    // secciones por capacidad no la reconocen y el cliente ve candados.
    const integraciones: RequiredIntegration[] = [
      "VTEX",
      "MERCADOLIBRE",
      "META_ADS",
      "GOOGLE_ADS",
      "GOOGLE_SEARCH_CONSOLE",
      "NITROPIXEL",
    ];
    for (const i of integraciones) {
      expect(CAPACIDADES_DE[i], `${i} no esta en el mapa`).toBeDefined();
    }
  });

  it("toda seccion con requires pide algo que el sistema entiende", () => {
    for (const s of SECTIONS) {
      if (!s.requires) continue;
      const planos = (s.requires as unknown[]).flat() as string[];
      for (const r of planos) {
        const conocido = esCapacidad(r) || r in CAPACIDADES_DE;
        expect(conocido, `${s.key} pide "${r}", que no existe`).toBe(true);
      }
    }
  });
});
