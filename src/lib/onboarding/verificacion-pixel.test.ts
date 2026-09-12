import { describe, it, expect } from "vitest";
import { evaluarPixel, VENTANA_RECIENTE_MIN } from "./verificacion-pixel";

// ══════════════════════════════════════════════════════════════════════════
// E-14 — el checkbox que no verificaba nada
// ══════════════════════════════════════════════════════════════════════════
// El wizard tiene un "ya pegué el snippet" que el backend descarta, así que un
// cliente puede completar el alta entera sin haber instalado el pixel.
//
// Lo que hace viable verificarlo acá: el usuario del wizard YA pertenece a una
// organización, así que el snippet que copia es real y los eventos pueden llegar
// mientras completa el alta.
// ══════════════════════════════════════════════════════════════════════════

describe("cuando está andando", () => {
  it("eventos recientes = confirmado", () => {
    const r = evaluarPixel({ hayEventosRecientes: true, huboEventosAlgunaVez: true });
    expect(r.estado).toBe("recibiendo");
    expect(r.confirmado).toBe(true);
    expect(r.detalle).toMatch(/eventos tuyos/i);
  });

  it("alcanza con que haya llegado alguno: no se cuentan, se pregunta si hay", () => {
    expect(evaluarPixel({ hayEventosRecientes: true, huboEventosAlgunaVez: true }).confirmado).toBe(true);
  });
});

describe("instalado pero sin tráfico ahora", () => {
  it("llegó antes = sigue estando confirmado", () => {
    // Es información real: el snippet está puesto. Que no haya visitas en este
    // momento no lo desinstala.
    const r = evaluarPixel({ hayEventosRecientes: false, huboEventosAlgunaVez: true });
    expect(r.estado).toBe("recibio-antes");
    expect(r.confirmado).toBe(true);
  });

  it("y lo explica sin que parezca un problema", () => {
    const r = evaluarPixel({ hayEventosRecientes: false, huboEventosAlgunaVez: true });
    expect(r.detalle).toContain("normal");
  });
});

describe("sin señal — lo que el mensaje NO puede decir", () => {
  const r = evaluarPixel({ hayEventosRecientes: false, huboEventosAlgunaVez: false });

  it("no está confirmado", () => {
    expect(r.estado).toBe("sin-senal");
    expect(r.confirmado).toBe(false);
  });

  it("NO afirma que el pixel no está instalado", () => {
    // No lo sabemos. Una tienda recién abierta puede no tener una sola visita, y
    // decirle "no está instalado" es echarle la culpa por no tener tráfico. Es
    // la misma disciplina que el piso de volumen de E-24: no afirmar más de lo
    // que el dato sostiene.
    expect(r.titulo.toLowerCase()).not.toContain("no está instalado");
    expect(r.detalle).toContain("Puede ser");
  });

  it("ofrece las dos explicaciones posibles, no una", () => {
    expect(r.detalle).toMatch(/nadie haya entrado/i);
    expect(r.detalle).toMatch(/<head>/);
  });

  it("y dice que puede seguir igual: lo inconcluso no bloquea", () => {
    // La lección de E-13, que rompió el alta dos veces por trabar a alguien con
    // una verificación que no concluyó.
    expect(r.detalle).toMatch(/seguir con el alta/i);
  });

  it("da un paso concreto para reintentar", () => {
    expect(r.detalle).toMatch(/abrir tu tienda/i);
  });
});

describe("la ventana", () => {
  it("es corta: el cliente acaba de pegar el snippet", () => {
    // 48 h es lo correcto para el semáforo del admin y lo inútil acá.
    expect(VENTANA_RECIENTE_MIN).toBeLessThanOrEqual(60);
  });

  it("y aparece en el mensaje, para que se entienda qué se miró", () => {
    const r = evaluarPixel({ hayEventosRecientes: true, huboEventosAlgunaVez: true });
    expect(r.detalle).toContain(String(VENTANA_RECIENTE_MIN));
  });
});

describe("ningún mensaje usa jerga", () => {
  it("lo lee un cliente, no un técnico", () => {
    const casos = [
      evaluarPixel({ hayEventosRecientes: true, huboEventosAlgunaVez: true }),
      evaluarPixel({ hayEventosRecientes: false, huboEventosAlgunaVez: true }),
      evaluarPixel({ hayEventosRecientes: false, huboEventosAlgunaVez: false }),
    ];
    for (const c of casos) {
      const texto = `${c.titulo} ${c.detalle}`.toLowerCase();
      for (const palabra of ["orgid", "endpoint", "query", "timestamp", "payload"]) {
        expect(texto, `usa "${palabra}"`).not.toContain(palabra);
      }
    }
  });
});
