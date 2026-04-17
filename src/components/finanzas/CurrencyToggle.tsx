// ═══════════════════════════════════════════════════════════════════
// CurrencyToggle
// ═══════════════════════════════════════════════════════════════════
// Toggle premium para cambiar entre USD / ARS nominal / ARS ajustado.
// Cuando el modo es USD, muestra un sub-selector (oficial / MEP / CCL /
// blue). La seleccion se persiste via el hook `useCurrencyView()`.
//
// Design:
//   - Pill container con border sutil y shadow multi-layer
//   - Active pill: gradient dorado (#fbbf24 -> #d97706)
//   - Transitions: 280ms cubic-bezier(0.16, 1, 0.3, 1)
//   - tabular-nums en los numeros
// ═══════════════════════════════════════════════════════════════════

"use client";

import { useCurrencyView, type CurrencyMode, type UsdSource } from "@/hooks/useCurrencyView";

const ES_TRANSITION = "cubic-bezier(0.16, 1, 0.3, 1)";

const MODE_OPTIONS: { value: CurrencyMode; label: string; caption: string }[] = [
  { value: "USD", label: "USD", caption: "dolarizado" },
  { value: "ARS", label: "ARS", caption: "nominal" },
  { value: "ARS_ADJ", label: "ARS ajustado", caption: "poder adquisitivo hoy" },
];

const SOURCE_OPTIONS: { value: UsdSource; label: string }[] = [
  { value: "oficial", label: "Oficial" },
  { value: "mep", label: "MEP" },
  { value: "ccl", label: "CCL" },
  { value: "blue", label: "Blue" },
];

function formatArs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(-2)}`;
}

export function CurrencyToggle() {
  const { mode, setMode, usdSource, setUsdSource, activeUsdRate, lastFxDate, lastIpcMonth, ready } =
    useCurrencyView();

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 16px",
        background: "#ffffff",
        border: "1px solid rgba(15,23,42,0.06)",
        borderRadius: 14,
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.12), 0 22px 40px -28px rgba(15,23,42,0.1)",
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(15,23,42,0.55)",
        }}
      >
        Moneda de visualización
      </div>

      {/* Main toggle */}
      <div
        style={{
          display: "inline-flex",
          gap: 4,
          padding: 4,
          background: "rgba(15,23,42,0.04)",
          borderRadius: 10,
        }}
      >
        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              style={{
                appearance: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 14px",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                letterSpacing: "-0.005em",
                background: active
                  ? "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)"
                  : "transparent",
                color: active ? "#ffffff" : "rgba(15,23,42,0.78)",
                boxShadow: active
                  ? "0 1px 2px rgba(217,119,6,0.2), 0 4px 12px -4px rgba(217,119,6,0.35)"
                  : "none",
                transition: `all 280ms ${ES_TRANSITION}`,
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "flex-start",
                lineHeight: 1.1,
              }}
            >
              <span style={{ fontSize: 13 }}>{opt.label}</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  opacity: active ? 0.95 : 0.55,
                  marginTop: 2,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {opt.caption}
              </span>
            </button>
          );
        })}
      </div>

      {/* USD source sub-selector */}
      {mode === "USD" && (
        <div
          style={{
            display: "inline-flex",
            gap: 4,
            padding: 3,
            background: "rgba(15,23,42,0.03)",
            borderRadius: 8,
            transition: `all 280ms ${ES_TRANSITION}`,
          }}
        >
          {SOURCE_OPTIONS.map((opt) => {
            const active = usdSource === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setUsdSource(opt.value)}
                style={{
                  appearance: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.01em",
                  background: active ? "#ffffff" : "transparent",
                  color: active ? "rgba(15,23,42,0.9)" : "rgba(15,23,42,0.55)",
                  boxShadow: active ? "0 1px 3px rgba(15,23,42,0.08)" : "none",
                  transition: `all 220ms ${ES_TRANSITION}`,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Caption: current rate / last updated */}
      <div
        style={{
          fontSize: 11,
          color: "rgba(15,23,42,0.5)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.4,
        }}
      >
        {!ready && <span>Cargando cotizaciones…</span>}
        {ready && mode === "USD" && activeUsdRate && (
          <span>
            Usando dólar {SOURCE_OPTIONS.find((s) => s.value === usdSource)?.label} ·{" "}
            <span style={{ color: "rgba(15,23,42,0.75)", fontWeight: 600 }}>
              $ {formatArs(activeUsdRate)}
            </span>{" "}
            · actualizado {formatDate(lastFxDate)}
          </span>
        )}
        {ready && mode === "USD" && !activeUsdRate && (
          <span>
            Sin cotización disponible. Ejecutar{" "}
            <code style={{ fontSize: 10, background: "rgba(15,23,42,0.06)", padding: "1px 4px", borderRadius: 3 }}>
              /api/cron/exchange-rates
            </code>
            .
          </span>
        )}
        {ready && mode === "ARS" && (
          <span>Valores nominales, tal cual se registraron.</span>
        )}
        {ready && mode === "ARS_ADJ" && (
          <span>
            Ajustado por IPC · base {formatDate(lastIpcMonth)} · equivale al poder adquisitivo de hoy.
          </span>
        )}
      </div>
    </div>
  );
}

export default CurrencyToggle;
