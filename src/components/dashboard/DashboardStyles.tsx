"use client";

// ══════════════════════════════════════════════════════════════
// DashboardStyles — keyframes + utility classes scoped `dash-*`
// ══════════════════════════════════════════════════════════════
// Mantiene el lenguaje visual hermano de NitroPixel (sesión 9) sin
// pisar las clases del Pixel. Easing curve cubic-bezier(0.16,1,0.3,1)
// ("easeOutExpo") como default Linear/Stripe-grade.
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
      @keyframes dashAuroraFloat {
        0%, 100% { transform: translate(0, 0) scale(1); }
        50% { transform: translate(2%, -1%) scale(1.04); }
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

      /* Multi-layer shadow card — premium boundary */
      .dash-card {
        background: #ffffff;
        border: 1px solid rgba(15, 23, 42, 0.06);
        border-radius: 1rem;
        box-shadow:
          0 1px 0 rgba(15, 23, 42, 0.04),
          0 8px 24px -12px rgba(15, 23, 42, 0.10),
          0 22px 40px -28px rgba(15, 23, 42, 0.08);
        transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
                    box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1),
                    border-color 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .dash-card:hover {
        transform: translateY(-2px);
        border-color: rgba(15, 23, 42, 0.10);
        box-shadow:
          0 1px 0 rgba(15, 23, 42, 0.05),
          0 14px 32px -14px rgba(15, 23, 42, 0.16),
          0 28px 50px -28px rgba(15, 23, 42, 0.14);
      }

      /* Hero header — auroras + prism delimiter */
      .dash-hero {
        position: relative;
        overflow: hidden;
        border-radius: 1.25rem;
        background: linear-gradient(180deg, #ffffff 0%, #fbfbfd 55%, #f4f5f8 100%);
        border: 1px solid rgba(15, 23, 42, 0.06);
        box-shadow:
          0 1px 0 rgba(15, 23, 42, 0.04),
          0 12px 32px -16px rgba(15, 23, 42, 0.12),
          0 28px 60px -32px rgba(15, 23, 42, 0.10);
      }
      .dash-hero::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 600px 220px at 12% 0%, rgba(249, 115, 22, 0.14), transparent 60%),
          radial-gradient(ellipse 540px 200px at 92% 100%, rgba(99, 102, 241, 0.16), transparent 60%),
          radial-gradient(ellipse 380px 160px at 60% 50%, rgba(6, 182, 212, 0.08), transparent 65%);
        filter: blur(40px);
        animation: dashAuroraFloat 14s ease-in-out infinite;
        pointer-events: none;
      }
      .dash-hero::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
        background: linear-gradient(90deg, #06b6d4 0%, #8b5cf6 50%, #f97316 100%);
        opacity: 0.85;
      }
      .dash-hero-inner {
        position: relative;
        z-index: 1;
      }

      /* Chart card refinements */
      .dash-chart-card .recharts-cartesian-axis-tick text {
        fill: #94a3b8;
        font-size: 11px;
        font-feature-settings: "tnum";
      }
      .dash-chart-card .recharts-cartesian-axis-line,
      .dash-chart-card .recharts-cartesian-axis-tick-line {
        stroke: rgba(15, 23, 42, 0.05);
      }
      .dash-chart-card .recharts-cartesian-grid-horizontal line,
      .dash-chart-card .recharts-cartesian-grid-vertical line {
        stroke: rgba(15, 23, 42, 0.06);
      }
      .dash-chart-card .recharts-default-tooltip {
        background: rgba(255, 255, 255, 0.96) !important;
        backdrop-filter: saturate(140%) blur(10px);
        -webkit-backdrop-filter: saturate(140%) blur(10px);
        border: 1px solid rgba(15, 23, 42, 0.08) !important;
        border-radius: 12px !important;
        box-shadow:
          0 1px 0 rgba(15, 23, 42, 0.04),
          0 12px 32px -12px rgba(15, 23, 42, 0.18),
          0 24px 48px -24px rgba(15, 23, 42, 0.14) !important;
        padding: 10px 14px !important;
      }
      .dash-chart-card .recharts-tooltip-label {
        color: #64748b !important;
        font-size: 11px !important;
        font-weight: 500 !important;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 4px !important;
      }
      .dash-chart-card .recharts-tooltip-item {
        color: #0f172a !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        font-feature-settings: "tnum";
        padding: 2px 0 !important;
      }
      .dash-chart-card .recharts-legend-item-text {
        color: #64748b !important;
        font-size: 11px !important;
        font-weight: 500 !important;
      }

      /* Add Widget dashed slot */
      .dash-add-slot {
        border: 1.5px dashed rgba(15, 23, 42, 0.15);
        border-radius: 1rem;
        background: linear-gradient(180deg, #ffffff 0%, #fbfbfd 100%);
        transition: all 220ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .dash-add-slot:hover {
        border-color: rgba(15, 23, 42, 0.32);
        background: #ffffff;
        transform: translateY(-1px);
        box-shadow:
          0 1px 0 rgba(15, 23, 42, 0.04),
          0 8px 24px -12px rgba(15, 23, 42, 0.10);
      }

      /* Premium toast */
      .dash-toast {
        background: linear-gradient(180deg, #0f172a 0%, #0a0f1c 100%);
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
        background: linear-gradient(180deg, #ffffff 0%, #fbfbfd 100%);
        border-radius: 1.25rem 1.25rem 0 0;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-bottom: none;
        box-shadow:
          0 -1px 0 rgba(15, 23, 42, 0.04),
          0 -16px 40px -16px rgba(15, 23, 42, 0.18),
          0 -32px 60px -32px rgba(15, 23, 42, 0.14);
        animation: dashSheetUp 360ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes dashSheetUp {
        from { transform: translateY(24px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* Skeleton shimmer */
      .dash-skeleton {
        background: linear-gradient(
          90deg,
          rgba(15, 23, 42, 0.04) 0%,
          rgba(15, 23, 42, 0.08) 50%,
          rgba(15, 23, 42, 0.04) 100%
        );
        background-size: 200% 100%;
        animation: dashShimmer 1.6s ease-in-out infinite;
        border-radius: 8px;
      }

      @media (prefers-reduced-motion: reduce) {
        .dash-fade-up,
        .dash-stagger > *,
        .dash-skeleton,
        .dash-hero::before,
        .dash-toast,
        .dash-sheet {
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
