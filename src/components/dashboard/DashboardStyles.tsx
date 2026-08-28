"use client";

// ══════════════════════════════════════════════════════════════
// DashboardStyles — keyframes + utility classes scoped `dash-*`
// ══════════════════════════════════════════════════════════════
// Enterprise sobrio (warm-neutral + acento verde solo-status). Sin
// auroras, prism ni gradientes decorativos: superficies planas,
// sombras ink cálidas. Easing cubic-bezier(0.16,1,0.3,1).
// Respeta prefers-reduced-motion.
// ══════════════════════════════════════════════════════════════

export default function DashboardStyles() {
  return (
    <style>{`
      @keyframes dashFadeUp {
        from { opacity: 0; transform: translateY(8px) scale(0.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes dashShimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }

      .dash-fade-up {
        animation: dashFadeUp 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .dash-stagger > * {
        animation: dashFadeUp 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .dash-stagger > *:nth-child(1)  { animation-delay: 0ms; }
      .dash-stagger > *:nth-child(2)  { animation-delay: 50ms; }
      .dash-stagger > *:nth-child(3)  { animation-delay: 100ms; }
      .dash-stagger > *:nth-child(4)  { animation-delay: 150ms; }
      .dash-stagger > *:nth-child(5)  { animation-delay: 200ms; }
      .dash-stagger > *:nth-child(6)  { animation-delay: 250ms; }
      .dash-stagger > *:nth-child(7)  { animation-delay: 300ms; }
      .dash-stagger > *:nth-child(8)  { animation-delay: 350ms; }
      .dash-stagger > *:nth-child(9)  { animation-delay: 400ms; }
      .dash-stagger > *:nth-child(10) { animation-delay: 450ms; }
      .dash-stagger > *:nth-child(11) { animation-delay: 500ms; }
      .dash-stagger > *:nth-child(12) { animation-delay: 550ms; }
      .dash-stagger > *:nth-child(n+13) { animation-delay: 600ms; }

      /* Card — boundary sobrio (hairline + sombra ink cálida) */
      .dash-card {
        background: #ffffff;
        border: 1px solid rgba(28, 27, 24, 0.06);
        border-radius: 1rem;
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.04),
          0 8px 24px -12px rgba(28, 27, 24, 0.10),
          0 22px 40px -28px rgba(28, 27, 24, 0.08);
        transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1),
                    border-color 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .dash-card:hover {
        transform: translateY(-2px);
        border-color: rgba(28, 27, 24, 0.10);
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.05),
          0 14px 32px -14px rgba(28, 27, 24, 0.16),
          0 28px 50px -28px rgba(28, 27, 24, 0.14);
      }

      /* Hero header — superficie plana, sin auroras ni prism */
      .dash-hero {
        position: relative;
        overflow: hidden;
        border-radius: 1.25rem;
        background: #ffffff;
        border: 1px solid rgba(28, 27, 24, 0.06);
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.04),
          0 12px 32px -16px rgba(28, 27, 24, 0.12),
          0 28px 60px -32px rgba(28, 27, 24, 0.10);
      }
      .dash-hero::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        background: rgba(229, 225, 216, 1);
      }
      .dash-hero-inner {
        position: relative;
        z-index: 1;
      }

      /* Chart card refinements */
      .dash-chart-card .recharts-cartesian-axis-tick text {
        fill: #83807A;
        font-size: 11px;
        font-feature-settings: "tnum";
      }
      .dash-chart-card .recharts-cartesian-axis-line,
      .dash-chart-card .recharts-cartesian-axis-tick-line {
        stroke: rgba(28, 27, 24, 0.05);
      }
      .dash-chart-card .recharts-cartesian-grid-horizontal line,
      .dash-chart-card .recharts-cartesian-grid-vertical line {
        stroke: rgba(28, 27, 24, 0.06);
      }
      .dash-chart-card .recharts-default-tooltip {
        background: rgba(255, 255, 255, 0.96) !important;
        border: 1px solid rgba(28, 27, 24, 0.08) !important;
        border-radius: 12px !important;
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.04),
          0 12px 32px -12px rgba(28, 27, 24, 0.18),
          0 24px 48px -24px rgba(28, 27, 24, 0.14) !important;
        padding: 10px 14px !important;
      }
      .dash-chart-card .recharts-tooltip-label {
        color: #6B685F !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 4px !important;
      }
      .dash-chart-card .recharts-tooltip-item {
        color: #1C1B18 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        font-feature-settings: "tnum";
        padding: 2px 0 !important;
      }
      .dash-chart-card .recharts-legend-item-text {
        color: #6B685F !important;
        font-size: 11px !important;
        font-weight: 500 !important;
      }

      /* Add Widget dashed slot */
      .dash-add-slot {
        border: 1.5px dashed rgba(28, 27, 24, 0.15);
        border-radius: 1rem;
        background: #ffffff;
        transition: all 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .dash-add-slot:hover {
        border-color: rgba(28, 27, 24, 0.32);
        background: #ffffff;
        transform: translateY(-1px);
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.04),
          0 8px 24px -12px rgba(28, 27, 24, 0.10);
      }

      /* Toast — ink sólido cálido */
      .dash-toast {
        background: #1C1B18;
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 10px 18px;
        font-size: 13px;
        font-weight: 500;
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.06) inset,
          0 12px 32px -12px rgba(0, 0, 0, 0.4),
          0 24px 48px -24px rgba(0, 0, 0, 0.3);
        animation: dashFadeUp 320ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* Modal sheet */
      .dash-sheet {
        background: #ffffff;
        border-radius: 1.25rem 1.25rem 0 0;
        border: 1px solid rgba(28, 27, 24, 0.08);
        border-bottom: none;
        box-shadow:
          0 -1px 0 rgba(28, 27, 24, 0.04),
          0 -16px 40px -16px rgba(28, 27, 24, 0.18),
          0 -32px 60px -32px rgba(28, 27, 24, 0.14);
        animation: dashSheetUp 360ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes dashSheetUp {
        from { transform: translateY(24px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* Centered modal variant — full rounded, balanced shadow */
      .dash-sheet.dash-sheet--centered {
        border-radius: 1.25rem;
        border: 1px solid rgba(28, 27, 24, 0.08);
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.04),
          0 24px 60px -24px rgba(28, 27, 24, 0.28),
          0 48px 96px -48px rgba(28, 27, 24, 0.20);
        animation: dashSheetCenter 360ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes dashSheetCenter {
        from { transform: translateY(12px) scale(0.985); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }

      /* ── Per-card filter system ── */
      @keyframes dashFilterPop {
        from { opacity: 0; transform: translateY(-6px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes dashFilterSheetUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Popover (desktop) — renderizado via portal con position fixed.
         El componente calcula top/left a partir del bounding rect del
         trigger, así escapa stacking contexts y overflows de las cards. */
      .dash-filter-popover {
        position: fixed;
        top: 0;
        left: 0;
        margin: 0;
        z-index: 70;
        width: 304px;
        max-width: calc(100vw - 32px);
        padding: 16px;
        background: #ffffff;
        border: 1px solid rgba(28, 27, 24, 0.06);
        border-radius: 16px;
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.04),
          0 12px 32px -16px rgba(28, 27, 24, 0.20),
          0 28px 56px -32px rgba(28, 27, 24, 0.18);
        animation: dashFilterPop 240ms cubic-bezier(0.16, 1, 0.3, 1);
        transform-origin: top right;
      }

      /* Mobile: bottom sheet — overrides inline coords via !important */
      @media (max-width: 639px) {
        .dash-filter-popover {
          position: fixed !important;
          top: auto !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          margin: 0;
          width: 100% !important;
          max-width: 100% !important;
          max-height: 80vh;
          overflow-y: auto;
          padding: 20px 18px 28px;
          border-radius: 24px 24px 0 0;
          border: 1px solid rgba(28, 27, 24, 0.08);
          border-bottom: none;
          z-index: 70;
          animation: dashFilterSheetUp 320ms cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow:
            0 -1px 0 rgba(28, 27, 24, 0.04),
            0 -16px 40px -20px rgba(28, 27, 24, 0.22),
            0 -32px 64px -40px rgba(28, 27, 24, 0.20);
        }
      }

      .dash-filter-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(28, 27, 24, 0.42);
        z-index: 55;
        animation: dashFadeUp 260ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      /* Segmented control (≤4 options) */
      .dash-filter-segmented {
        display: flex;
        align-items: stretch;
        padding: 3px;
        background: #EDEAE3;
        border-radius: 10px;
        gap: 2px;
      }
      .dash-filter-pill {
        flex: 1 1 0;
        min-width: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 8px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 500;
        color: #6B685F;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
        white-space: nowrap;
      }
      .dash-filter-pill:hover:not(.is-active) {
        color: #1C1B18;
        background: rgba(255, 255, 255, 0.6);
      }
      .dash-filter-pill.is-active {
        background: #1C1B18;
        color: #ffffff;
        box-shadow:
          0 1px 0 rgba(28, 27, 24, 0.06),
          0 4px 12px -6px rgba(28, 27, 24, 0.30);
      }

      /* Dropdown select (5+ options) */
      .dash-filter-select {
        appearance: none;
        -webkit-appearance: none;
        width: 100%;
        padding: 8px 32px 8px 12px;
        background: #ffffff;
        border: 1px solid rgba(28, 27, 24, 0.10);
        border-radius: 10px;
        font-size: 12px;
        font-weight: 500;
        color: #1C1B18;
        cursor: pointer;
        transition: border-color 180ms cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1);
        font-family: inherit;
      }
      .dash-filter-select:hover {
        border-color: rgba(28, 27, 24, 0.18);
      }
      .dash-filter-select:focus {
        outline: none;
        border-color: #1C1B18;
        box-shadow: 0 0 0 3px rgba(28, 27, 24, 0.08);
      }
      .dash-filter-select-chevron {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 14px;
        height: 14px;
        color: #83807A;
        pointer-events: none;
      }

      /* Active filter chips (debajo del título de la card) */
      .dash-filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px 2px 8px;
        background: #F5F3EE;
        border: 1px solid rgba(28, 27, 24, 0.08);
        border-radius: 999px;
        font-size: 10px;
        font-weight: 500;
        color: #6B685F;
        cursor: pointer;
        transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
        line-height: 1.4;
      }
      .dash-filter-chip:hover {
        background: #EDEAE3;
        color: #1C1B18;
        border-color: rgba(28, 27, 24, 0.16);
      }

      /* Card needs position:relative so popover can anchor */
      .dash-card,
      .dash-chart-card {
        position: relative;
      }

      /* Skeleton shimmer */
      .dash-skeleton {
        background: linear-gradient(
          90deg,
          rgba(28, 27, 24, 0.04) 0%,
          rgba(28, 27, 24, 0.08) 50%,
          rgba(28, 27, 24, 0.04) 100%
        );
        background-size: 200% 100%;
        animation: dashShimmer 1.6s ease-in-out infinite;
        border-radius: 8px;
      }

      @media (prefers-reduced-motion: reduce) {
        .dash-fade-up,
        .dash-stagger > *,
        .dash-skeleton,
        .dash-toast,
        .dash-sheet,
        .dash-filter-popover,
        .dash-filter-backdrop {
          animation: none !important;
          transition: none !important;
        }
        .dash-card,
        .dash-add-slot {
          transition: none !important;
        }
      }
    `}</style>
  );
}
