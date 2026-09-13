import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// E-23 — /api/chat no puede volver a quedar sin techo
// ══════════════════════════════════════════════════════════════════════════
// Aurum es el unico componente con costo variable del producto, y el modo DEEP
// (Opus, 8 rondas de tools) lo elige el cliente desde la UI. Sin la cuota, el
// unico techo del gasto es la buena fe de quien lo usa.
//
// Esta ruta no se puede testear de punta a punta sin pegarle a la API de
// Anthropic, asi que la red es leer la fuente — como en el webhook de VTEX.
// ══════════════════════════════════════════════════════════════════════════

const RUTA = join(process.cwd(), "src/app/api/chat/route.ts");
const fuente = readFileSync(RUTA, "utf8");
const codigo = fuente
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("la cuota esta cableada", () => {
  it("importa `evaluarCuota` y el lector de consumo", () => {
    expect(codigo).toContain("evaluarCuota");
    expect(codigo).toContain("consumoActualDe");
    expect(codigo).toMatch(/from\s+"@\/lib\/aurum\/cuota"/);
  });

  it("corta con 429 cuando la cuota no permite", () => {
    // 429 y no 500: es un limite, no un error del servidor. Un 500 haria que
    // el cliente reintente y empeore justo el caso que esto viene a frenar.
    expect(codigo).toMatch(/if \(!cuota\.permitido\)/);
    expect(codigo).toContain("status: 429");
  });

  it("el modelo sale del modo EFECTIVO, no del que pidio el cliente", () => {
    // Si `cfg` saliera del modo pedido, la degradacion no ahorraria un peso:
    // diria "te bajamos a FLASH" y llamaria a Opus igual.
    expect(codigo).toContain("const mode = cuota.modoEfectivo");
    expect(codigo).toContain("const cfg = MODE_CONFIG[mode]");
    expect(codigo).not.toMatch(/const cfg = MODE_CONFIG\[modoPedido\]/);
  });

  it("la cuota se evalua DESPUES de resolver la organizacion", () => {
    // Es por organizacion: sin `org.id` no hay a quien cobrarle el consumo.
    const posOrg = codigo.indexOf("const org = await getOrganization()");
    const posCuota = codigo.indexOf("evaluarCuota({");
    expect(posOrg).toBeGreaterThan(-1);
    expect(posCuota).toBeGreaterThan(-1);
    expect(posCuota).toBeGreaterThan(posOrg);
  });
});

describe("no degrada en silencio", () => {
  it("la respuesta lleva el modo pedido y el estado de la cuota", () => {
    // Sin esto el usuario ve respuestas mas cortas y culpa al producto en vez
    // del tope. Es el patron que venimos arreglando toda la branch.
    expect(codigo).toContain("modoPedido,");
    expect(codigo).toMatch(/cuota: \{/);
    expect(codigo).toContain("degradado: cuota.degradado");
    expect(codigo).toContain("aviso: cuota.motivo");
  });
});

describe("el chequeo no puede tumbar el asistente", () => {
  it("la lectura del consumo va con catch a fail-open", () => {
    // Bloquear el producto porque una query de telemetria fallo es peor que el
    // gasto que evita. Misma regla que E-13 para las credenciales.
    expect(codigo).toMatch(/consumoActualDe\(org\.id\)\.catch\(/);
    expect(codigo).toContain("usdDelMes: null");
  });
});
