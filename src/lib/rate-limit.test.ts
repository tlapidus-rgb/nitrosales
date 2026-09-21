import { describe, it, expect } from "vitest";
import { crearLimitador } from "./rate-limit";

// ══════════════════════════════════════════════════════════════════════════
// Utilidad local en memoria; la admisión de creadores se prueba por separado.
// ══════════════════════════════════════════════════════════════════════════
// El reloj se inyecta en todas las llamadas, así que no hace falta `vi.useFakeTimers`
// ni esperar: la ventana se recorre moviendo el número.
// ══════════════════════════════════════════════════════════════════════════

describe("crearLimitador", () => {
  it("deja pasar exactamente `maxIntentos` y corta en el siguiente", () => {
    const lim = crearLimitador(3, 60_000);
    expect(lim.superado("a", 1000)).toBe(false); // 1
    expect(lim.superado("a", 1001)).toBe(false); // 2
    expect(lim.superado("a", 1002)).toBe(false); // 3
    expect(lim.superado("a", 1003)).toBe(true); // 4 → corta
    expect(lim.superado("a", 1004)).toBe(true);
  });

  it("cada identidad tiene su propio presupuesto", () => {
    const lim = crearLimitador(1, 60_000);
    expect(lim.superado("a", 1000)).toBe(false);
    expect(lim.superado("a", 1001)).toBe(true);
    // `b` no gastó nada.
    expect(lim.superado("b", 1002)).toBe(false);
  });

  it("la ventana es fija: al agotarla hay que esperarla entera", () => {
    const lim = crearLimitador(2, 60_000);
    lim.superado("a", 0);
    lim.superado("a", 0);
    expect(lim.superado("a", 59_999)).toBe(true);
    // Justo al cumplirse la ventana, arranca de cero.
    expect(lim.superado("a", 60_000)).toBe(false);
  });

  it("acertar la clave borra el registro", () => {
    // El caso real: alguien tipea mal tres veces y a la cuarta acierta. No tiene
    // que arrastrar el gasto al próximo login.
    const lim = crearLimitador(5, 60_000);
    lim.superado("a", 0);
    lim.superado("a", 1);
    lim.superado("a", 2);
    expect(lim.restantes("a", 3)).toBe(2);
    lim.olvidar("a");
    expect(lim.restantes("a", 4)).toBe(5);
  });

  it("`restantes` no baja de cero", () => {
    const lim = crearLimitador(1, 60_000);
    lim.superado("a", 0);
    lim.superado("a", 1);
    lim.superado("a", 2);
    expect(lim.restantes("a", 3)).toBe(0);
  });

  it("no crece sin límite: descarta las identidades más viejas", () => {
    // Sin este tope, un atacante que rota IPs llena el Map hasta tumbar el
    // proceso — otra forma de DoS, servida por la defensa contra el DoS.
    const lim = crearLimitador(5, 60_000, 10);
    for (let i = 0; i < 50; i++) lim.superado(`ip-${i}`, 1000);
    // Las últimas siguen contando; lo que importa es que la memoria esté acotada
    // y que el limitador siga funcionando.
    expect(lim.superado("ip-49", 1001)).toBe(false);
    expect(lim.restantes("ip-49", 1002)).toBeLessThan(5);
  });

  it("las entradas vencidas se limpian solas", () => {
    const lim = crearLimitador(1, 1000);
    lim.superado("a", 0);
    // Muy después de la ventana: la entrada de `a` ya no debería contar.
    expect(lim.superado("b", 999_999)).toBe(false);
    expect(lim.restantes("a", 999_999)).toBe(1);
  });
});
