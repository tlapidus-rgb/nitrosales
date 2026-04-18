"use client";

// ═══════════════════════════════════════════════════════════════════
// WaterfallHero.tsx — Sub-fase 2a Fase 2
// ═══════════════════════════════════════════════════════════════════
// Waterfall premium custom-SVG (sin Recharts) que reemplaza el BarChart
// basico que existia en /finanzas/estado. Construye visualmente la
// cascada del P&L: cada barra parte del running total del anterior,
// subiendo para ingresos/subtotales y bajando para costos.
//
// Features 2a:
// - Stagger entrance 60ms per bar (cubic-bezier(0.16,1,0.3,1)).
// - Colores por tipo: positive (cyan→teal), negative (rose→amber),
//   subtotal (violet), total (verde si >=0, rose si <0).
// - Conector sutil dashed entre el top de una barra y el start de la
//   siguiente, reforzando la metafora cascada.
// - Hover sobre barra → tooltip flotante con valor + comparador vs
//   mes anterior (si previousValues presente).
// - prefers-reduced-motion: deshabilita animacion de entrada.
// - Paleta alineada a UI_VISION_NITROSALES.md (§4 Animaciones, §5
//   Contraste, §7 Componentes).
//
// NO incluye drill-down (es sub-fase 2b), NO toggle $/% (2c), NO
// agrupacion fijos/variables (2d), NO export (2e).
// ═══════════════════════════════════════════════════════════════════

import { useMemo, useState, useId } from "react";

export type WaterfallKind = "positive" | "negative" | "subtotal" | "total";

export interface WaterfallItem {
  /** Label corto mostrado bajo la barra (ej: "Revenue", "COGS", "Neto"). */
  name: string;
  /** Valor con signo. Positivo sube el running total, negativo lo baja. */
  value: number;
  /** Tipo semantico que determina color y si resetea el running total. */
  kind?: WaterfallKind;
}

export interface WaterfallHeroProps {
  /** Secuencia ordenada izquierda → derecha del P&L. */
  data: WaterfallItem[];
  /** Funcion de formato (ej: moneda con tri-currency view). */
  format?: (v: number) => string;
  /**
   * Valores del mes anterior alineados uno-a-uno a `data`.
   * Si provisto, el tooltip muestra delta y %.
   */
  previousValues?: (number | null | undefined)[];
  /** Altura del SVG en px (default 380). */
  height?: number;
  /** Texto accesible alternativo. */
  ariaLabel?: string;
}

const CHART_PADDING_TOP = 48; // espacio para valor arriba de la barra
const CHART_PADDING_BOTTOM = 56; // espacio para label + micro-axis
const BAR_MIN_WIDTH = 36;
const BAR_MAX_WIDTH = 96;
const BAR_GAP = 18;
const STAGGER_MS = 60;
const ANIM_DURATION_MS = 520;
const ES_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Formato fallback cuando no llega `format` (solo para safety). */
function defaultFormat(v: number): string {
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

type BarGeometry = {
  item: WaterfallItem;
  startValue: number; // nivel absoluto donde empieza (bottom de la barra)
  endValue: number; // nivel absoluto donde termina (top de la barra)
  lo: number; // min(startValue, endValue)
  hi: number; // max(startValue, endValue)
  kind: WaterfallKind;
  /** Index global en la serie, usado para stagger delay. */
  index: number;
};

/**
 * Construye la geometria del waterfall.
 * - Items `subtotal` y `total` NO mueven el running total; fijan su
 *   top al valor absoluto y el bottom a 0 (son barras desde el piso).
 * - Items `positive` y `negative` suman/restan al running total.
 */
function buildGeometry(data: WaterfallItem[]): BarGeometry[] {
  let running = 0;
  return data.map((item, i) => {
    const kind: WaterfallKind = item.kind ?? (item.value >= 0 ? "positive" : "negative");
    if (kind === "subtotal" || kind === "total") {
      // barra desde 0 al valor absoluto; no modifica running
      running = item.value;
      return {
        item,
        startValue: 0,
        endValue: item.value,
        lo: Math.min(0, item.value),
        hi: Math.max(0, item.value),
        kind,
        index: i,
      };
    }
    const start = running;
    const end = running + item.value;
    running = end;
    return {
      item,
      startValue: start,
      endValue: end,
      lo: Math.min(start, end),
      hi: Math.max(start, end),
      kind,
      index: i,
    };
  });
}

/** Colores y gradientes por tipo semantico (light mode premium). */
function getBarGradient(kind: WaterfallKind, isNegativeTotal: boolean): { from: string; to: string; stroke: string; label: string } {
  if (kind === "total") {
    return isNegativeTotal
      ? { from: "#fb7185", to: "#e11d48", stroke: "#be123c", label: "#881337" }
      : { from: "#34d399", to: "#059669", stroke: "#047857", label: "#065f46" };
  }
  if (kind === "subtotal") {
    return { from: "#a78bfa", to: "#7c3aed", stroke: "#6d28d9", label: "#5b21b6" };
  }
  if (kind === "positive") {
    return { from: "#22d3ee", to: "#0891b2", stroke: "#0e7490", label: "#155e75" };
  }
  // negative
  return { from: "#fdba74", to: "#f97316", stroke: "#c2410c", label: "#9a3412" };
}

function formatDelta(current: number, prev: number, format: (v: number) => string): { text: string; isBetter: boolean | null } {
  if (!Number.isFinite(prev) || prev === 0) {
    return { text: "sin comparable", isBetter: null };
  }
  const diff = current - prev;
  const pct = (diff / Math.abs(prev)) * 100;
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${format(diff)} (${sign}${pct.toFixed(1)}%)`,
    isBetter: diff > 0,
  };
}

export default function WaterfallHero({
  data,
  format = defaultFormat,
  previousValues,
  height = 380,
  ariaLabel = "Waterfall del estado de resultados",
}: WaterfallHeroProps) {
  const gradientId = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const geometry = useMemo(() => buildGeometry(data), [data]);

  // Dominios: el maximo absoluto entre todas las barras y el peak running.
  const { min, max } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const g of geometry) {
      if (g.lo < lo) lo = g.lo;
      if (g.hi > hi) hi = g.hi;
    }
    // padding visual del 8% para que la barra mas alta no toque el tope
    const range = hi - lo || 1;
    return { min: lo - range * 0.04, max: hi + range * 0.08 };
  }, [geometry]);

  // Layout: ancho responsivo fluido, calculamos por viewport del SVG.
  const count = geometry.length;
  const barWidth = Math.min(
    BAR_MAX_WIDTH,
    Math.max(BAR_MIN_WIDTH, 720 / count - BAR_GAP),
  );
  const chartWidth = count * (barWidth + BAR_GAP) + BAR_GAP;
  const chartHeight = height - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  // Convierte valor de data a y-coordinate del SVG (eje Y invertido).
  const domainRange = max - min || 1;
  const yFor = (v: number) => CHART_PADDING_TOP + (max - v) / domainRange * chartHeight;
  const zeroY = yFor(0);

  const hovered = hoveredIndex !== null ? geometry[hoveredIndex] : null;
  const hoveredValue = hovered ? hovered.item.value : 0;
  const hoveredPrev = hovered && previousValues ? previousValues[hovered.index] : undefined;

  return (
    <div
      className="relative w-full"
      style={{ minHeight: height }}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Aurora radial sutil — crea ambiente sin pesar visualmente */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
      >
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "-5%",
            width: "45%",
            height: "120%",
            background:
              "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 65%)",
            filter: "blur(50px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-10%",
            right: "-10%",
            width: "55%",
            height: "110%",
            background:
              "radial-gradient(circle, rgba(167,139,250,0.09) 0%, transparent 65%)",
            filter: "blur(55px)",
          }}
        />
      </div>

      {/* SVG waterfall — responsive via viewBox */}
      <svg
        className="relative w-full"
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ height, display: "block" }}
      >
        <defs>
          {geometry.map((g) => {
            const isNegTotal = g.kind === "total" && g.item.value < 0;
            const { from, to } = getBarGradient(g.kind, isNegTotal);
            return (
              <linearGradient
                key={`${gradientId}-${g.index}`}
                id={`${gradientId}-${g.index}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={from} stopOpacity="0.95" />
                <stop offset="100%" stopColor={to} stopOpacity="0.85" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Linea del cero si el dominio incluye 0 */}
        {min < 0 && max > 0 && (
          <line
            x1={BAR_GAP / 2}
            x2={chartWidth - BAR_GAP / 2}
            y1={zeroY}
            y2={zeroY}
            stroke="rgba(15,23,42,0.10)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* Conectores entre barras (linea punteada sutil de un top al siguiente start) */}
        {geometry.map((g, i) => {
          if (i === 0) return null;
          const prev = geometry[i - 1];
          // para subtotales/totales el conector parte del top de la anterior
          const fromX = BAR_GAP / 2 + (i - 1) * (barWidth + BAR_GAP) + barWidth;
          const toX = BAR_GAP / 2 + i * (barWidth + BAR_GAP);
          const prevTop = yFor(prev.endValue);
          const thisStart =
            g.kind === "subtotal" || g.kind === "total"
              ? yFor(g.endValue)
              : yFor(g.startValue);
          return (
            <line
              key={`conn-${i}`}
              x1={fromX}
              x2={toX}
              y1={prevTop}
              y2={thisStart}
              stroke="rgba(15,23,42,0.16)"
              strokeWidth={1}
              strokeDasharray="2 4"
              style={{
                opacity: 0,
                animation: `whConnectorIn ${ANIM_DURATION_MS}ms ${ES_EASING} ${i * STAGGER_MS}ms forwards`,
              }}
            />
          );
        })}

        {/* Barras */}
        {geometry.map((g) => {
          const x = BAR_GAP / 2 + g.index * (barWidth + BAR_GAP);
          const topY = yFor(g.hi);
          const bottomY = yFor(g.lo);
          const h = Math.max(2, bottomY - topY);
          const isNegTotal = g.kind === "total" && g.item.value < 0;
          const palette = getBarGradient(g.kind, isNegTotal);
          const isHovered = hoveredIndex === g.index;

          // Label del valor: se pone arriba si el top esta lejos del techo,
          // sino dentro de la barra.
          const valueLabelY = topY - 10;
          const showValueAbove = valueLabelY > CHART_PADDING_TOP + 4;

          return (
            <g
              key={`bar-${g.index}`}
              style={{
                transformBox: "fill-box",
                transformOrigin: `${x + barWidth / 2}px ${bottomY}px`,
                opacity: 0,
                animation: `whBarIn ${ANIM_DURATION_MS}ms ${ES_EASING} ${g.index * STAGGER_MS}ms forwards`,
              }}
              onMouseEnter={() => setHoveredIndex(g.index)}
              onMouseLeave={() => setHoveredIndex((c) => (c === g.index ? null : c))}
              onFocus={() => setHoveredIndex(g.index)}
              onBlur={() => setHoveredIndex((c) => (c === g.index ? null : c))}
              tabIndex={0}
              role="button"
              aria-label={`${g.item.name}: ${format(g.item.value)}`}
            >
              {/* barra propia */}
              <rect
                x={x}
                y={topY}
                width={barWidth}
                height={h}
                rx={6}
                ry={6}
                fill={`url(#${gradientId}-${g.index})`}
                stroke={palette.stroke}
                strokeOpacity={isHovered ? 0.85 : 0.25}
                strokeWidth={1}
                style={{
                  transition: `stroke-opacity 220ms ${ES_EASING}, filter 220ms ${ES_EASING}`,
                  filter: isHovered
                    ? "drop-shadow(0 6px 14px rgba(15,23,42,0.18))"
                    : "drop-shadow(0 2px 4px rgba(15,23,42,0.06))",
                }}
              />

              {/* Valor del item */}
              <text
                x={x + barWidth / 2}
                y={showValueAbove ? valueLabelY : topY + 16}
                textAnchor="middle"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  fill: showValueAbove ? palette.label : "#ffffff",
                  fontFeatureSettings: '"tnum" 1, "lnum" 1',
                  letterSpacing: "-0.01em",
                  pointerEvents: "none",
                }}
              >
                {format(g.item.value)}
              </text>

              {/* Nombre debajo */}
              <text
                x={x + barWidth / 2}
                y={height - CHART_PADDING_BOTTOM + 24}
                textAnchor="middle"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  fill: "#475569",
                  letterSpacing: "0.01em",
                  pointerEvents: "none",
                }}
              >
                {g.item.name}
              </text>

              {/* Chip de tipo para subtotales/totales */}
              {(g.kind === "subtotal" || g.kind === "total") && (
                <text
                  x={x + barWidth / 2}
                  y={height - CHART_PADDING_BOTTOM + 40}
                  textAnchor="middle"
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    fill: palette.label,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    pointerEvents: "none",
                  }}
                >
                  {g.kind === "total" ? "TOTAL" : "SUBTOTAL"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip flotante */}
      {hovered && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${((BAR_GAP / 2 + hovered.index * (barWidth + BAR_GAP) + barWidth / 2) / chartWidth) * 100}%`,
            top: 8,
            transform: "translateX(-50%)",
            minWidth: 180,
            maxWidth: 240,
            background:
              "linear-gradient(180deg, #ffffff 0%, #fbfbfd 100%)",
            border: "1px solid rgba(15,23,42,0.08)",
            borderRadius: 12,
            boxShadow:
              "0 1px 0 rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.24), 0 18px 40px -24px rgba(15,23,42,0.18)",
            padding: "10px 14px",
            zIndex: 10,
            backdropFilter: "saturate(140%) blur(12px)",
            WebkitBackdropFilter: "saturate(140%) blur(12px)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#64748b",
            }}
          >
            {hovered.item.name}
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              fontFeatureSettings: '"tnum" 1, "lnum" 1',
              letterSpacing: "-0.02em",
              color: "#0f172a",
              marginTop: 2,
            }}
          >
            {format(hoveredValue)}
          </div>
          {typeof hoveredPrev === "number" && Number.isFinite(hoveredPrev) && (
            (() => {
              const delta = formatDelta(hoveredValue, hoveredPrev, format);
              // semantica: para costos (negative) "isBetter true" (aumento) es PEOR
              const barIsCost = hovered.kind === "negative";
              const goodColor = "#059669";
              const badColor = "#e11d48";
              const neutralColor = "#64748b";
              let color = neutralColor;
              if (delta.isBetter !== null) {
                const isPositiveForBusiness = barIsCost ? !delta.isBetter : delta.isBetter;
                color = isPositiveForBusiness ? goodColor : badColor;
              }
              return (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color,
                    marginTop: 4,
                    fontFeatureSettings: '"tnum" 1',
                  }}
                >
                  vs periodo anterior: {delta.text}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Animaciones — respetando prefers-reduced-motion */}
      <style jsx>{`
        @keyframes whBarIn {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes whConnectorIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :global(g[style*="whBarIn"]),
          :global(line[style*="whConnectorIn"]) {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
