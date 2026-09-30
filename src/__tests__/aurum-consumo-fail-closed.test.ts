import { beforeEach, describe, expect, it, vi } from "vitest";

// ══════════════════════════════════════════════════════════════════════════
// Consumo de Aurum: un contador ilegible NO es un gasto de $0
// ══════════════════════════════════════════════════════════════════════════
// El tope mensual sólo degrada DEEP a FLASH si sabe cuánto se gastó. Si la
// consulta del gasto del mes falla y alguien la "protege" con un
// `.catch(() => [])`, el costo sale $0, `evaluarCuota` ve 0 de 100 USD y deja
// pasar DEEP (Opus, 8 rondas) sin techo: el control de gasto falla ABIERTO,
// justo cuando la base anda mal y nadie está mirando.
//
// Hoy el error se propaga: `consumoActualDe` rechaza y `admitirAurum` no reserva
// nada (el route contesta 503). Nada lo afirmaba desde la consulta del mes: los
// tests de cuota prueban `evaluarCuota` con consumos ya armados, y los del chat
// rompen el LOCK, no esta consulta. Acá se rompe exactamente esa.
// ══════════════════════════════════════════════════════════════════════════

const m = vi.hoisted(() => ({ transaction: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $transaction: m.transaction } }));
import { consumoActualDe } from "@/lib/aurum/consumo-actual";
import { admitirAurum, LOCK_AURUM_SQL } from "@/lib/aurum/admision";
import { AURUM_DEL_MES_DE_UNA_ORG, AURUM_ULTIMO_MINUTO_DE_UNA_ORG } from "@/lib/costos/consultas";

const CAIDA = new Error("gasto del mes: connection terminated");

/** Base donde todo responde bien salvo la consulta del gasto mensual. */
function baseConGastoIlegible() {
  return {
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      if (sql === AURUM_DEL_MES_DE_UNA_ORG) throw CAIDA;
      if (sql === AURUM_ULTIMO_MINUTO_DE_UNA_ORG) return [{ n: 0 }];
      if (sql === LOCK_AURUM_SQL) return [];
      if (sql.includes("clock_timestamp()")) return [{ ahora: new Date("2026-09-15T12:00:00Z") }];
      throw new Error(`consulta inesperada: ${sql}`);
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = { ...baseConGastoIlegible(), aurumUsageLog: { create: m.create } };
    return fn(tx);
  });
});

describe("gasto mensual ilegible", () => {
  it("consumoActualDe propaga el error en vez de informar gasto 0", async () => {
    const db = baseConGastoIlegible();
    // Si esto resolviera, sería con `usdDelMes: 0` — el caso fail-open.
    await expect(consumoActualDe("org", new Date("2026-09-15T12:00:00Z"), db as any)).rejects.toBe(CAIDA);
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(AURUM_DEL_MES_DE_UNA_ORG, "org", expect.any(Date));
  });

  it("admitirAurum no admite DEEP ni reserva nada si no puede leer el gasto", async () => {
    await expect(admitirAurum("org", "DEEP", { topeUsdMensual: 100, consultasPorMinuto: 20 })).rejects.toBe(CAIDA);
    expect(m.create).not.toHaveBeenCalled();
  });
});
