import { describe, it, expect } from "vitest";
import { analizarHook } from "./orders-broadcaster";

// ══════════════════════════════════════════════════════════════════════════
// E-33 — que el hook exista NO alcanza
// ══════════════════════════════════════════════════════════════════════════
// Sin Orders Broadcaster no llega una sola orden nueva: el cliente queda con lo
// que trajo el backfill y nada más, indistinguible de un alta exitosa. Ya rompió
// a TeVe Compras entero (0 de 8 órdenes atribuidas).
//
// VTEX guarda UN SOLO hook por cuenta y la URL lleva `?org=<orgId>`. Hay dos
// formas de tenerlo configurado y mal, y la segunda es peor y silenciosa.
// ══════════════════════════════════════════════════════════════════════════

const ORG = "cmod6ns420047dlnth544px9c"; // TeVe Compras
const OTRA = "cmohl80fx009j1sdusurp7fbj"; // Arredo
const BUENA = `https://app.nitrosales.ai/api/webhooks/vtex/orders?org=${ORG}&key=xxx`;

describe("el camino feliz", () => {
  it("hook nuestro, con el org correcto → registrado", () => {
    const r = analizarHook(BUENA, ORG);
    expect(r.veredicto).toBe("ok");
    expect(r.registrado).toBe(true);
    expect(r.orgEnLaUrl).toBe(ORG);
    expect(r.queHacer).toBe("");
  });

  it("el orden de los parámetros no importa", () => {
    expect(analizarHook(`https://app.nitrosales.ai/h?key=x&org=${ORG}`, ORG).registrado).toBe(true);
  });
});

describe("sin hook", () => {
  it("no hay nada configurado", () => {
    const r = analizarHook(null, ORG);
    expect(r.veredicto).toBe("sin-hook");
    expect(r.registrado).toBe(false);
    expect(r.queHacer).toContain("ninguna orden nueva");
  });

  it("string vacío o en blanco cuenta como sin hook", () => {
    expect(analizarHook("", ORG).veredicto).toBe("sin-hook");
    expect(analizarHook("   ", ORG).veredicto).toBe("sin-hook");
    expect(analizarHook(undefined, ORG).veredicto).toBe("sin-hook");
  });
});

describe("EL CASO TEVE COMPRAS: hook sin ?org=", () => {
  it("existe, apunta a nosotros, y no sirve", () => {
    const r = analizarHook("https://app.nitrosales.ai/api/webhooks/vtex/orders?key=xxx", ORG);
    expect(r.veredicto).toBe("sin-org");
    expect(r.registrado).toBe(false);
    expect(r.queHacer).toContain("no se pueden atribuir");
  });

  it("un `org=` vacío tampoco cuenta", () => {
    expect(analizarHook("https://app.nitrosales.ai/h?org=&key=x", ORG).veredicto).toBe("sin-org");
  });

  it("y `organization=` no es `org=`", () => {
    // Un parámetro parecido no alcanza: el webhook lee `org`.
    expect(analizarHook(`https://app.nitrosales.ai/h?organization=${ORG}`, ORG).veredicto).toBe(
      "sin-org",
    );
  });
});

describe("EL CASO QUE NADIE MIRABA: hook con el org de otro cliente", () => {
  // El endpoint de debug chequeaba que hubiera un `?org=` y no que fuera EL
  // correcto. Es el que se vuelve probable justo cuando entran clientes:
  // alcanza con copiar el curl del alta anterior y olvidarse de cambiar el id.
  it("las órdenes de este cliente se están contando como del otro", () => {
    const r = analizarHook(`https://app.nitrosales.ai/h?org=${OTRA}&key=x`, ORG);
    expect(r.veredicto).toBe("org-ajena");
    expect(r.registrado).toBe(false);
    expect(r.orgEnLaUrl).toBe(OTRA);
  });

  it("dice de quién son las órdenes ahora, que es lo que hay que ir a arreglar", () => {
    const r = analizarHook(`https://app.nitrosales.ai/h?org=${OTRA}`, ORG);
    expect(r.queHacer).toContain(OTRA);
    // Lo que importa es que diga que hay DOS clientes con los números mal, no
    // sólo el que estamos mirando. `toContain` era sensible a mayúsculas y el
    // texto arranca la oración con "Los dos".
    expect(r.queHacer).toMatch(/los dos/i);
  });
});

describe("hook que apunta a otro lado", () => {
  it("un dominio ajeno no nos llega", () => {
    const r = analizarHook(`https://otroproveedor.com/hook?org=${ORG}`, ORG);
    expect(r.veredicto).toBe("dominio-ajeno");
    expect(r.registrado).toBe(false);
  });

  it("avisa que pisarlo es destructivo antes de sugerir pisarlo", () => {
    // VTEX guarda UN solo hook por cuenta: configurarlo borra el que está. Si
    // el cliente tiene otra integración viva, la rompemos.
    const r = analizarHook("https://erp-del-cliente.com/vtex", ORG);
    expect(r.queHacer).toContain("un solo hook");
    expect(r.queHacer).toContain("antes de pisarlo");
  });

  it("recorta una URL larga para que el mensaje siga siendo legible", () => {
    const larga = "https://" + "x".repeat(200) + ".com/hook";
    expect(analizarHook(larga, ORG).queHacer).toContain("…");
  });
});

describe("detalles que muerden", () => {
  it("acepta nuestro otro dominio", () => {
    expect(analizarHook(`https://algo.99media.com.ar/h?org=${ORG}`, ORG).registrado).toBe(true);
  });

  it("un org url-encodeado se compara decodificado", () => {
    expect(analizarHook(`https://app.nitrosales.ai/h?org=${encodeURIComponent(ORG)}`, ORG).registrado).toBe(
      true,
    );
  });

  it("no se confunde con un org que empieza igual", () => {
    // Sin el corte en `&`, un prefijo podría dar un falso OK.
    const r = analizarHook(`https://app.nitrosales.ai/h?org=${ORG}xyz`, ORG);
    expect(r.veredicto).toBe("org-ajena");
  });

  it("el fragmento no se come el org", () => {
    expect(analizarHook(`https://app.nitrosales.ai/h?org=${ORG}#algo`, ORG).registrado).toBe(true);
  });
});
