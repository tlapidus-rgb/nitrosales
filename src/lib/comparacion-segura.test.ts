import { describe, it, expect } from "vitest";
import { igualSeguro, coincideConAlguna } from "./comparacion-segura";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ══════════════════════════════════════════════════════════════════════════
// La primitiva que sostiene las dos puertas del sistema
// ══════════════════════════════════════════════════════════════════════════
// `coincideConAlguna` es lo único que decide si entra un request al webhook de
// órdenes de VTEX (`webhook-key.ts`) y si entra a cualquier endpoint admin o
// cron (`admin-key.ts`). Las dos puertas, la misma función.
//
// Y no tenía un solo test propio. Se probaba de rebote, desde los tests de sus
// dos consumidores, que es exactamente la forma de que un cambio acá parezca
// cubierto sin estarlo: los dos consumidores pasan sus casos felices y ninguno
// prueba los bordes de la comparación.
//
// Lo que se prueba acá es la propiedad que importa: **fail-closed**. Ninguna
// combinación de vacíos, nulos o tipos raros puede abrir una puerta.
//
// ── SOBRE LOS TRES CHEQUEOS DE LARGO (leer antes de "mejorar" esto) ──────
// `coincideConAlguna` tiene tres filtros de vacío: uno sobre la candidata, uno
// sobre la actual y uno sobre la anterior. **Son redundantes entre sí**, y eso
// se midió: sacar cualquiera de los tres por separado no cambia el resultado
// de ninguna entrada, porque los otros dos siguen atajando el caso. Son
// mutantes equivalentes, y ningún test puede distinguirlos.
//
// Sacarlos de a DOS sí se ve, y estos tests se ponen rojos. O sea que la
// propiedad —que un vacío nunca entre— está cubierta; lo que no se puede
// cubrir es cada `length > 0` por separado.
//
// Se dejan los tres igual: cada uno protege una rama distinta si mañana
// alguien reordena la función. Pero no hay que escribir tests persiguiendo
// esas tres mutaciones, porque no existe entrada que las distinga.
// ══════════════════════════════════════════════════════════════════════════

describe("igualSeguro", () => {
  it("dice que sí cuando son iguales", () => {
    expect(igualSeguro("abc123", "abc123")).toBe(true);
  });

  it("dice que no cuando difieren", () => {
    expect(igualSeguro("abc123", "abc124")).toBe(false);
  });

  it("no se rompe con largos distintos", () => {
    // Éste es el motivo de hashear antes de comparar. `timingSafeEqual` TIRA si
    // los buffers miden distinto, así que comparar los strings crudos convertía
    // "clave de otro largo" en una excepción en vez de un `false`. Y una
    // excepción adentro de un `if` de auth es una puerta que se comporta
    // distinto según lo que mandes: el mismo canal lateral que se venía a
    // cerrar, servido de otra forma.
    expect(igualSeguro("corta", "una-clave-mucho-mas-larga-que-la-otra")).toBe(false);
    expect(igualSeguro("", "x")).toBe(false);
    expect(igualSeguro("x", "")).toBe(false);
  });

  it("dos vacíos son iguales (por eso el vacío se filtra más arriba)", () => {
    // No es un bug de esta función: `"" === ""`. Pero explica por qué
    // `coincideConAlguna` descarta el vacío ANTES de llamarla — sin ese filtro,
    // una env sin setear volvería un bypass.
    expect(igualSeguro("", "")).toBe(true);
  });

  it("distingue mayúsculas y caracteres raros", () => {
    expect(igualSeguro("Clave", "clave")).toBe(false);
    expect(igualSeguro("clave ", "clave")).toBe(false);
    expect(igualSeguro("ñ", "n")).toBe(false);
    expect(igualSeguro("🔑", "🔑")).toBe(true);
  });
});

describe("coincideConAlguna — la clave actual", () => {
  it("entra con la clave actual", () => {
    expect(coincideConAlguna("la-actual", "la-actual", null)).toBe(true);
  });

  it("no entra con otra", () => {
    expect(coincideConAlguna("otra", "la-actual", null)).toBe(false);
  });
});

describe("coincideConAlguna — la ventana de rotación", () => {
  it("con ventana abierta, la anterior también entra", () => {
    expect(coincideConAlguna("la-vieja", "la-nueva", "la-vieja")).toBe(true);
    expect(coincideConAlguna("la-nueva", "la-nueva", "la-vieja")).toBe(true);
  });

  it("cerrada la ventana, la vieja deja de servir", () => {
    expect(coincideConAlguna("la-vieja", "la-nueva", null)).toBe(false);
  });
});

describe("la comparación es de tiempo constante — estructuralmente", () => {
  // ⚠️ ESTE BLOQUE ES UN GREP, Y ES A PROPÓSITO.
  //
  // Los casos de arriba afirman el booleano que devuelve la función. Eso está
  // bien, pero **no distingue** una comparación de tiempo constante de un
  // `===`: verificado por mutación, reemplazar `crypto.timingSafeEqual(ha, hb)`
  // por `a === b` deja los 15 casos en verde, más los de `admin-key` y
  // `webhook-key`. La primitiva puede perder su propiedad de seguridad sin que
  // se ponga rojo nada.
  //
  // Un canal lateral de timing no se puede medir de forma confiable en un unit
  // test —el ruido del scheduler tapa la diferencia—, así que la única defensa
  // barata es afirmar que la construcción sigue ahí.
  //
  // Es un test de forma, con todo lo que eso tiene de malo. Se acepta acá
  // porque la alternativa es no tener ninguna cobertura de la única propiedad
  // que justifica que este módulo exista.
  const fuente = readFileSync(
    join(process.cwd(), "src", "lib", "comparacion-segura.ts"),
    "utf8",
  );

  it("usa crypto.timingSafeEqual y no un ===", () => {
    expect(fuente).toMatch(/crypto\.timingSafeEqual\s*\(/);
  });

  it("hashea las dos puntas antes de comparar", () => {
    // Sin esto, `timingSafeEqual` tira cuando los largos difieren — y una
    // excepción adentro de un `if` de auth es una puerta que se comporta
    // distinto según lo que le mandes: el mismo canal lateral, por otra vía.
    // Además filtraría el largo del secreto.
    const hashes = fuente.match(/createHash\("sha256"\)/g) || [];
    expect(hashes.length, "las dos puntas se hashean").toBeGreaterThanOrEqual(2);
  });
});

describe("coincideConAlguna — fail-closed", () => {
  // Cada uno de estos casos, si devolviera `true`, sería una puerta abierta.
  it("una candidata vacía nunca entra", () => {
    expect(coincideConAlguna("", "la-actual", null)).toBe(false);
    // Ni siquiera contra una actual vacía, que es el caso de la env sin setear.
    expect(coincideConAlguna("", "", null)).toBe(false);
    expect(coincideConAlguna("", "", "")).toBe(false);
  });

  it("null y undefined nunca entran", () => {
    expect(coincideConAlguna(null, "la-actual", null)).toBe(false);
    expect(coincideConAlguna(undefined, "la-actual", null)).toBe(false);
  });

  it("una `anterior` vacía no abre ninguna puerta", () => {
    // `ADMIN_API_KEY_ANTERIOR=""` en Vercel es un accidente fácil: se borra el
    // valor y queda la variable. Si el vacío contara como clave válida, la
    // candidata vacía entraría por esa rama.
    expect(coincideConAlguna("", "la-actual", "")).toBe(false);
    expect(coincideConAlguna("cualquier-cosa", "la-actual", "")).toBe(false);
  });

  it("una `actual` vacía no vuelve válida a cualquier candidata", () => {
    expect(coincideConAlguna("cualquier-cosa", "", null)).toBe(false);
    // Pero si hay ventana abierta, la anterior sigue valiendo: es el estado
    // intermedio de una rotación mal hecha, no un bypass.
    expect(coincideConAlguna("la-vieja", "", "la-vieja")).toBe(true);
  });

  it("valores que no son strings nunca entran", () => {
    // Vienen de `searchParams.get()` y de headers, así que en teoría son string
    // o null. Pero un llamador con `any` —y este repo tiene 290 archivos con
    // `@ts-nocheck`— puede mandar cualquier cosa.
    for (const v of [0, 1, true, false, {}, [], NaN] as unknown[]) {
      expect(coincideConAlguna(v as string, "la-actual", null)).toBe(false);
    }
  });

  it("un prefijo de la clave correcta no alcanza", () => {
    expect(coincideConAlguna("la-actu", "la-actual", null)).toBe(false);
    expect(coincideConAlguna("la-actual-y-mas", "la-actual", null)).toBe(false);
  });
});
