import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EL_GATE_ESTA_CONECTADO } from "./suspension";
import {
  leerEstado,
  suspender,
  reactivar,
  debeSeguirIngiriendo,
  mensajeParaElCliente,
  CLAVE_EN_SETTINGS,
} from "./suspension";

// ══════════════════════════════════════════════════════════════════════════
// E-27 — suspender a un cliente que no paga
// ══════════════════════════════════════════════════════════════════════════
// Hoy las unicas opciones son dejarlo entrar o borrarle la cuenta, y entre esas
// dos hay un abismo. Un cliente que se atraso un mes no merece ninguna.
// ══════════════════════════════════════════════════════════════════════════

const datos = { motivo: "Factura de agosto impaga", porQuien: "axel@nitrosales.io" };

describe("leer el estado", () => {
  it("settings vacios = activa", () => {
    expect(leerEstado({}).activa).toBe(true);
    expect(leerEstado(null).activa).toBe(true);
    expect(leerEstado(undefined).activa).toBe(true);
  });

  it("una suspension bien formada se lee", () => {
    const s = suspender({}, { ...datos, ahora: new Date("2026-09-01T10:00:00Z") });
    const e = leerEstado(s);
    expect(e.activa).toBe(false);
    expect(e.suspension?.motivo).toBe("Factura de agosto impaga");
    expect(e.suspension?.desde).toBe("2026-09-01T10:00:00.000Z");
  });

  it("no pisa el resto de settings", () => {
    // `settings` guarda tambien roles custom, API keys e invitaciones.
    const s = suspender({ nitroWeights: { first: 30 }, apiKeys: ["a"] }, datos);
    expect(s.nitroWeights).toEqual({ first: 30 });
    expect(s.apiKeys).toEqual(["a"]);
  });
});

describe("FAIL-OPEN: un JSON roto no deja a nadie afuera", () => {
  // Un cliente que paga no puede quedar bloqueado de su propia aplicacion
  // porque un campo quedo mal escrito. Aca el modo de falla correcto es dejar
  // entrar, no trabar.
  it("sin motivo no es una suspension valida", () => {
    expect(leerEstado({ [CLAVE_EN_SETTINGS]: { desde: "x", porQuien: "y" } }).activa).toBe(true);
  });

  it("sin quien la aplico tampoco", () => {
    expect(leerEstado({ [CLAVE_EN_SETTINGS]: { desde: "x", motivo: "y" } }).activa).toBe(true);
  });

  it("con campos vacios tampoco", () => {
    expect(
      leerEstado({ [CLAVE_EN_SETTINGS]: { desde: "", motivo: "  ", porQuien: "z" } }).activa,
    ).toBe(true);
  });

  it("un valor que no es objeto no rompe", () => {
    expect(leerEstado({ [CLAVE_EN_SETTINGS]: "si" }).activa).toBe(true);
    expect(leerEstado({ [CLAVE_EN_SETTINGS]: [1, 2] }).activa).toBe(true);
    expect(leerEstado({ [CLAVE_EN_SETTINGS]: 42 }).activa).toBe(true);
  });
});

describe("reactivar", () => {
  it("borra la suspension y deja el resto", () => {
    const s = suspender({ nitroWeights: { first: 30 } }, datos);
    const r = reactivar(s);
    expect(leerEstado(r).activa).toBe(true);
    expect(r.nitroWeights).toEqual({ first: 30 });
  });

  it("BORRA la clave, no la deja en falso", () => {
    // Un registro de suspensiones viejas dentro de settings crece para siempre
    // y nadie lo mira.
    const r = reactivar(suspender({}, datos));
    expect(CLAVE_EN_SETTINGS in r).toBe(false);
  });

  it("reactivar algo que no estaba suspendido no rompe", () => {
    expect(leerEstado(reactivar({ otra: 1 })).activa).toBe(true);
  });
});

describe("LA DECISION QUE IMPORTA: suspender no corta la ingesta", () => {
  it("por defecto se sigue ingiriendo", () => {
    // Los webhooks de VTEX y MELI NO reintentan. Un dia sin ingerir es un
    // agujero que no se rellena nunca, ni pagando despues. Cortar la ingesta
    // convierte una suspension reversible en un dano permanente a sus datos.
    const e = leerEstado(suspender({}, datos));
    expect(e.activa).toBe(false);
    expect(debeSeguirIngiriendo(e)).toBe(true);
  });

  it("pero se puede cortar a proposito", () => {
    // Seguir ingiriendo a un cliente que no paga nos cuesta plata. Es una
    // decision de negocio, y por eso es explicita en vez de estar decidida.
    const e = leerEstado(suspender({}, { ...datos, cortarIngesta: true }));
    expect(debeSeguirIngiriendo(e)).toBe(false);
  });

  it("una org activa obviamente sigue ingiriendo", () => {
    expect(debeSeguirIngiriendo(leerEstado({}))).toBe(true);
  });
});

describe("el mensaje al cliente", () => {
  it("NO expone el motivo interno", () => {
    // El motivo puede decir "no pago la factura de agosto". Eso se habla, no se
    // muestra en una pantalla.
    const m = mensajeParaElCliente();
    expect(m).not.toMatch(/factura|impag|deuda|pag[oó]/i);
  });

  it("aclara que los datos estan intactos", () => {
    // Un cliente suspendido que cree que le borramos todo no vuelve.
    expect(mensajeParaElCliente()).toMatch(/datos están intactos|intactos/i);
  });

  it("dice que hacer", () => {
    expect(mensajeParaElCliente()).toMatch(/escribinos|contactanos/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// La suspensión se anota, pero todavía no se aplica
// ══════════════════════════════════════════════════════════════════════════
// El endpoint guarda el estado y contesta `ok: true`. Nadie lo lee: un cliente
// suspendido entra igual.
//
// Este test no pide que se conecte el gate — pide que el código **no mienta**
// mientras no esté conectado. `EL_GATE_ESTA_CONECTADO` es una constante escrita
// a mano, y esto verifica que diga la verdad: si alguien conecta el gate y se
// olvida de cambiarla (o la cambia sin conectar nada), esto se pone rojo.
describe("el gate de suspensión dice la verdad sobre sí mismo", () => {
  const RAIZ = process.cwd();

  /** Archivos que podrían leer el estado para cortar el acceso. */
  function todosLosFuentes(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        todosLosFuentes(p, out);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(p);
      }
    }
    return out;
  }

  it("nadie lee el estado todavía, y la constante lo refleja", () => {
    const propios = [
      join("src", "lib", "organizacion", "suspension.ts"),
      join("src", "app", "api", "admin", "orgs", "[orgId]", "suspension", "route.ts"),
    ];

    const lectores = todosLosFuentes(join(RAIZ, "src"))
      .filter((p) => !propios.some((q) => p.endsWith(q)))
      .filter((p) => {
        const src = readFileSync(p, "utf8")
          .split(/\r?\n/)
          .filter((l) => {
            const t = l.trim();
            return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
          })
          .join("\n");
        return /\bleerEstado\s*\(/.test(src);
      })
      .map((p) => p.replace(RAIZ, ""));

    // Si esto falla con lectores > 0, alguien conectó el gate: hay que poner
    // `EL_GATE_ESTA_CONECTADO = true` y sacar la advertencia de la respuesta.
    expect(
      lectores,
      `estos archivos ya leen el estado de suspensión:\n${lectores.join("\n")}`,
    ).toEqual([]);
    expect(EL_GATE_ESTA_CONECTADO).toBe(false);
  });
});
