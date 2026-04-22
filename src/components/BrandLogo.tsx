// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// BrandLogo — logos oficiales de las plataformas
// ══════════════════════════════════════════════════════════════
// VTEX, Meta, Google Ads, GSC: simple-icons (CC0 license).
// MercadoLibre: SVG oficial inline (handshake amarillo).
// Tomy confirmo tener licencia de uso (2026-04-21).
// ══════════════════════════════════════════════════════════════

import React from "react";

export type BrandKey =
  | "VTEX" | "MERCADOLIBRE" | "META_ADS" | "META_PIXEL" | "GOOGLE_ADS" | "GSC" | "NITROPIXEL"
  // Providers ecommerce (para el dropdown)
  | "ECOMMERCE" | "TIENDANUBE" | "SHOPIFY" | "WOOCOMMERCE" | "MAGENTO";

interface BrandLogoProps {
  brand: BrandKey;
  size?: number;
  className?: string;
}

export function BrandLogo({ brand, size = 24, className }: BrandLogoProps) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    xmlns: "http://www.w3.org/2000/svg",
    className,
  };

  switch (brand) {
    case "VTEX":
      return (
        <svg {...commonProps}>
          <path
            fill="#FF3366"
            d="M22.2027 1.7925H4.2812c-1.3897 0-2.2795 1.4698-1.6293 2.6917l1.7927 3.3773H1.1947a1.2 1.2 0 0 0-.5873.1537 1.1924 1.1924 0 0 0-.4356.421 1.1847 1.1847 0 0 0-.0342 1.1683l5.766 10.858c.1017.191.2537.3507.4399.4622a1.1996 1.1996 0 0 0 1.2326 0 1.1913 1.1913 0 0 0 .4398-.4623l1.566-2.933 1.9647 3.7006c.6914 1.3016 2.5645 1.304 3.2584.0038L23.7878 4.416c.635-1.1895-.2314-2.6235-1.5851-2.6235ZM14.1524 8.978l-3.8733 7.2533a.7932.7932 0 0 1-.2927.3074.7986.7986 0 0 1-.82 0 .7933.7933 0 0 1-.2927-.3074L5.0378 9.0086a.7883.7883 0 0 1 .0208-.7776.7933.7933 0 0 1 .2891-.281.7985.7985 0 0 1 .3906-.1033h7.7307a.7769.7769 0 0 1 .381.0998.7717.7717 0 0 1 .2823.2736.7672.7672 0 0 1 .02.758z"
          />
        </svg>
      );

    case "MERCADOLIBRE":
      // Logo oficial MercadoLibre (handshake amarillo). SVG oficial de
      // worldvectorlogo.com (CC0). viewBox recortado al simbolo (sin wordmark).
      return (
        <svg
          width={size}
          height={size}
          viewBox="1366 1394 96 68"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          <path
            fill="#2d3277"
            d="m1461.7 1427.5c0-17.1-21.3-31.1-47.6-31.1s-47.6 14-47.6 31.1v1.8c0 18.2 18.6 32.9 47.6 32.9 29.1 0 47.6-14.7 47.6-32.9z"
          />
          <path
            fill="#ffe600"
            d="m1459.8 1427.5c0 16.1-20.5 29.2-45.7 29.2s-45.7-13.1-45.7-29.2 20.5-29.2 45.7-29.2 45.7 13.1 45.7 29.2z"
          />
          <g fill="#fff">
            <path d="m1398.9 1418.3s-.5.5-.2.9c.7.9 2.9 1.4 5.2.9 1.3-.3 3.1-1.7 4.7-3 1.8-1.4 3.6-2.9 5.4-3.4 1.9-.6 3.1-.3 3.9-.1.9.3 1.9.9 3.6 2.1 3.1 2.3 15.7 13.3 17.9 15.2 1.7-.8 9.5-4.1 20.1-6.5-.9-5.6-4.3-10.8-9.5-15-7.2 3-16.1 4.6-24.8.4 0 0-4.7-2.2-9.4-2.1-6.9.2-9.8 3.1-13 6.3z" />
            <path d="m1438.9 1432.1c-.1-.1-14.8-12.9-18.1-15.4-1.9-1.4-3-1.8-4.1-2-.6-.1-1.4 0-2 .2-1.5.4-3.6 1.8-5.4 3.2-1.9 1.5-3.6 2.9-5.2 3.2-2.1.5-4.6-.1-5.7-.9-.5-.3-.8-.7-1-1.1-.4-1 .4-1.8.5-1.9l4-4.4 1.4-1.4c-1.3.2-2.5.5-3.7.8-1.5.4-2.9.8-4.3.8-.6 0-3.8-.5-4.4-.7-3.7-1-6.9-2-11.7-4.2-5.7 4.3-9.6 9.6-10.7 15.5.8.2 2.2.6 2.7.7 13 2.9 17 5.9 17.8 6.5.8-.9 1.9-1.4 3.2-1.4 1.4 0 2.7.7 3.5 1.8.7-.6 1.8-1.1 3.1-1.1.6 0 1.2.1 1.9.3 1.5.5 2.2 1.5 2.6 2.4.5-.2 1.1-.4 1.8-.4s1.4.2 2.2.5c2.4 1 2.8 3.4 2.6 5.2h.5c2.9 0 5.2 2.3 5.2 5.2 0 .9-.2 1.7-.6 2.4.8.4 2.7 1.4 4.5 1.2 1.4-.2 1.9-.6 2.1-.9.1-.2.3-.4.1-.6l-3.7-4.1s-.6-.6-.4-.8.6.1.9.3c1.9 1.6 4.1 3.9 4.1 3.9s.2.3 1 .5c.7.1 2 0 2.9-.7.2-.2.5-.4.6-.6.9-1.2-.1-2.4-.1-2.4l-4.3-4.8s-.6-.6-.4-.8.6.1.9.3c1.4 1.1 3.3 3.1 5.1 4.9.4.3 2 1.3 4.1-.1 1.3-.9 1.6-1.9 1.5-2.7-.1-1-.9-1.8-.9-1.8l-5.8-5.9s-.6-.5-.4-.8c.2-.2.6.1.9.3 1.9 1.6 6.9 6.2 6.9 6.2.1 0 1.8 1.3 4-.1.8-.5 1.3-1.2 1.3-2.1.1-1.3-1-2.2-1-2.2z" />
            <path d="m1410.6 1439.6c-.9 0-1.9.5-2 .5s0-.4.1-.6 1.3-3.8-1.6-5.1c-2.2-1-3.6.1-4 .6-.1.1-.2.1-.2 0 0-.6-.3-2.4-2.3-3-2.8-.9-4.5 1.1-5 1.8-.2-1.6-1.5-2.8-3.2-2.8-1.8 0-3.2 1.4-3.2 3.2s1.4 3.2 3.2 3.2c.9 0 1.6-.3 2.2-.9v.1c-.1.8-.4 3.7 2.6 4.8 1.2.5 2.2.1 3.1-.5.3-.2.3-.1.3.1-.1.7 0 2.3 2.3 3.2 1.7.7 2.7 0 3.3-.6.3-.3.4-.2.4.2.1 2.1 1.9 3.8 4 3.8 2.2 0 4-1.8 4-4s-1.8-4-4-4z" />
          </g>
          <path
            fill="#2d3277"
            d="m1439.5 1430.6c-4.5-3.9-14.9-13-17.8-15.1-1.6-1.2-2.7-1.9-3.7-2.1-.4-.1-1-.3-1.8-.3-.7 0-1.5.1-2.3.4-1.8.6-3.6 2-5.4 3.4l-.1.1c-1.6 1.3-3.3 2.6-4.6 2.9-.6.1-1.1.2-1.7.2-1.4 0-2.7-.4-3.2-1-.1-.1 0-.3.2-.5l4-4.3c3.1-3.1 6-6 12.8-6.2h.3c4.2 0 8.4 1.9 8.9 2.1 4 1.9 8 2.9 12.1 2.9 4.3 0 8.7-1.1 13.3-3.2-.5-.4-1.1-.9-1.6-1.3-4.1 1.8-7.9 2.6-11.7 2.6s-7.6-.9-11.3-2.7c-.2-.1-4.8-2.3-9.7-2.3h-.4c-5.7.1-8.9 2.1-11 3.9-2.1 0-3.9.6-5.5 1-1.4.4-2.7.7-3.9.7h-1.5c-1.4 0-8.4-1.7-13.9-3.9-.6.4-1.1.8-1.7 1.2 5.8 2.4 12.9 4.2 15.1 4.4.6 0 1.3.1 2 .1 1.5 0 2.9-.4 4.4-.8.9-.2 1.8-.5 2.7-.7l-.8.8-4 4.4c-.3.3-1 1.2-.6 2.2.2.4.6.8 1.1 1.2 1 .6 2.7 1.1 4.3 1.1.6 0 1.2-.1 1.7-.2 1.7-.4 3.5-1.8 5.3-3.3 1.5-1.2 3.6-2.7 5.2-3.2.5-.1 1-.2 1.5-.2h.4c1.1.1 2.1.5 4 1.9 3.3 2.5 18 15.3 18.1 15.4 0 0 .9.8.9 2.2 0 .7-.5 1.4-1.2 1.9-.6.4-1.3.6-1.9.6-1 0-1.7-.5-1.7-.5s-5.1-4.6-6.9-6.2c-.3-.3-.6-.5-.9-.5-.2 0-.3.1-.4.2-.3.4 0 .9.4 1.2l5.9 5.9s.7.7.8 1.6c0 1-.4 1.8-1.4 2.4-.7.5-1.4.7-2.1.7-.9 0-1.5-.4-1.7-.5l-.9-.8c-1.5-1.5-3.1-3.1-4.3-4-.3-.2-.6-.5-.9-.5-.1 0-.3 0-.4.2-.1.1-.2.4.1.9.1.2.3.3.3.3l4.3 4.8s.9 1.1.1 2l-.2.2-.4.4c-.7.6-1.7.7-2.1.7h-.6c-.4-.1-.7-.2-.9-.4-.2-.3-2.4-2.4-4.2-3.9-.2-.2-.5-.4-.8-.4-.1 0-.3.1-.4.2-.3.4.2 1 .4 1.2l3.7 4s0 .1-.1.3-.6.6-1.9.8h-.5c-1.4 0-2.8-.7-3.6-1.1.3-.7.5-1.5.5-2.3 0-3-2.4-5.4-5.4-5.4h-.2c.1-1.4-.1-4-2.8-5.1-.8-.3-1.5-.5-2.3-.5-.6 0-1.1.1-1.7.3-.6-1.1-1.5-1.9-2.7-2.3-.7-.2-1.3-.3-2-.3-1.1 0-2.1.3-3 1a4.6 4.6 0 0 0 -3.6-1.7c-1.2 0-2.4.5-3.2 1.3-1.1-.9-5.6-3.7-17.7-6.5-.6-.1-1.9-.5-2.7-.8-.1.6-.2 1.3-.3 2 0 0 2.2.5 2.7.6 12.3 2.7 16.4 5.6 17.1 6.1-.2.6-.3 1.2-.3 1.8 0 2.6 2.1 4.6 4.6 4.6.3 0 .6 0 .9-.1.4 1.9 1.6 3.3 3.5 4 .6.2 1.1.3 1.6.3.3 0 .7 0 1.1-.1.3.9 1.1 2 2.9 2.7.6.3 1.2.4 1.8.4.5 0 1-.1 1.4-.3.8 2 2.8 3.4 5 3.4 1.5 0 2.9-.6 3.9-1.7.9.5 2.7 1.4 4.6 1.4h.7c1.9-.2 2.7-1 3.1-1.5.1-.1.1-.2.2-.3.4.1.9.2 1.5.2 1 0 2-.3 3-1.1 1-.7 1.7-1.7 1.7-2.6.3.1.7.1 1 .1 1 0 2.1-.3 3.1-1 1.9-1.2 2.2-2.9 2.2-3.9.3.1.7.1 1 .1 1 0 2-.3 2.9-.9 1.2-.8 1.9-1.9 2-3.2.1-.9-.2-1.8-.6-2.6 3.2-1.4 10.4-4 19-6 0-.7-.1-1.3-.3-2-10.3 2.2-18 5.5-19.9 6.4zm-28.9 16.7c-2 0-3.6-1.6-3.7-3.6 0-.2 0-.6-.4-.6-.2 0-.3.1-.5.2-.4.4-1 .8-1.8.8-.4 0-.8-.1-1.2-.3-2.1-.9-2.2-2.3-2.1-2.9 0-.2 0-.3-.1-.4l-.1-.1h-.1c-.1 0-.2 0-.4.2-.6.4-1.2.6-1.8.6-.3 0-.7-.1-1-.2-2.8-1.1-2.6-3.7-2.4-4.5 0-.2 0-.3-.1-.4l-.2-.2-.2.2c-.6.5-1.3.8-2 .8-1.6 0-2.9-1.3-2.9-2.9s1.3-2.9 2.9-2.9c1.4 0 2.7 1.1 2.9 2.5l.1.8.4-.7c0-.1 1.2-1.9 3.4-1.8.4 0 .8.1 1.3.2 1.7.5 2 2.1 2 2.7 0 .4.3.4.3.4.1 0 .3-.1.3-.2.3-.3 1-.9 2.1-.9.5 0 1 .1 1.6.4 2.7 1.2 1.5 4.6 1.5 4.7-.2.6-.3.8 0 1h.2c.1 0 .3 0 .5-.1.4-.1.9-.3 1.4-.3 2 0 3.7 1.7 3.7 3.7.1 2.2-1.6 3.8-3.6 3.8z"
          />
        </svg>
      );

    case "META_ADS":
    case "META_PIXEL":
      // Logo oficial Meta (infinity blue)
      return (
        <svg {...commonProps}>
          <path
            fill="#0668E1"
            d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"
          />
        </svg>
      );

    case "GOOGLE_ADS":
      return (
        <svg {...commonProps}>
          <path
            fill="#4285F4"
            d="M3.9998 22.9291C1.7908 22.9291 0 21.1383 0 18.9293s1.7908-3.9998 3.9998-3.9998 3.9998 1.7908 3.9998 3.9998-1.7908 3.9998-3.9998 3.9998z"
          />
          <path
            fill="#FBBC04"
            d="M23.4641 16.9287L15.4632 3.072C14.3586 1.1587 11.9121.5028 9.9988 1.6074S7.4295 5.1585 8.5341 7.0718l8.0009 13.8567c1.1046 1.9133 3.5511 2.5679 5.4644 1.4646 1.9134-1.1046 2.568-3.5511 1.4647-5.4644z"
          />
          <path
            fill="#34A853"
            d="M7.5137 4.8438L1.5645 15.1484A4.5 4.5 0 0 1 4 14.4297c2.5597-.0075 4.6248 2.1585 4.4941 4.7148l3.2168-5.5723-3.6094-6.25c-.4499-.7793-.6322-1.6394-.5878-2.4784z"
          />
        </svg>
      );

    case "GSC":
      // Logo oficial Google Search Console (diseño 2023+): 2 capsulas verticales
      // (azul + verde) con lupa amarilla adelante y sector rojo dentro de la lupa.
      // Recreado basado en screenshot oficial adjuntado por Tomy (2026-04-22).
      // Colores de Google Brand: Blue #4285F4, Green #34A853, Yellow #FBBC04, Red #EA4335
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
        >
          {/* Barra azul (derecha, más alta) */}
          <rect x="62" y="8" width="28" height="80" rx="14" fill="#4285F4" />
          {/* Barra verde (centro) */}
          <rect x="36" y="22" width="26" height="66" rx="13" fill="#34A853" />
          {/* Lupa amarilla */}
          <circle cx="28" cy="54" r="20" fill="#FBBC04" />
          {/* Sector rojo dentro de la lupa (derecha) */}
          <path
            d="M 28 54 L 48 54 A 20 20 0 0 1 28 74 Z"
            fill="#EA4335"
          />
          {/* Mango de la lupa (diagonal hacia abajo-izquierda) */}
          <line
            x1="14"
            y1="68"
            x2="4"
            y2="86"
            stroke="#FBBC04"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </svg>
      );

    case "NITROPIXEL":
      // NitroPixel — orb animado (reusa las keyframes globales del app layout:
      // pixelOrbit, pixelOrbitReverse, pixelBreath). Si se usa fuera del app
      // layout, las animaciones no se ven pero el SVG se renderiza igual.
      return (
        <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              inset: "-4px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(6,182,212,0.25) 0%, transparent 70%)",
              animation: "pixelBreath 3s ease-in-out infinite",
            }}
          />
          <svg
            width={size}
            height={size}
            viewBox="0 0 200 200"
            xmlns="http://www.w3.org/2000/svg"
            style={{ position: "relative", filter: "drop-shadow(0 0 4px rgba(6,182,212,0.4))" }}
            className={className}
          >
            <defs>
              <radialGradient id={`npCore-${size}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#e0f7fa" stopOpacity="1" />
                <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.95" />
                <stop offset="80%" stopColor="#0e7490" stopOpacity="0.3" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g style={{ transformOrigin: "100px 100px", animation: "pixelOrbitReverse 18s linear infinite" }}>
              <circle cx="100" cy="100" r="88" fill="none" stroke="#06b6d4" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="5 8" />
              <circle cx="188" cy="100" r="4" fill="#22d3ee" opacity="0.9" />
            </g>
            <g style={{ transformOrigin: "100px 100px", animation: "pixelOrbit 12s linear infinite" }}>
              <circle cx="100" cy="100" r="68" fill="none" stroke="#8b5cf6" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 6" />
              <circle cx="32" cy="100" r="3.5" fill="#a855f7" opacity="0.8" />
            </g>
            <g style={{ transformOrigin: "100px 100px", animation: "pixelBreath 2.8s ease-in-out infinite" }}>
              <circle cx="100" cy="100" r="38" fill={`url(#npCore-${size})`} />
              <circle cx="100" cy="100" r="22" fill="#a5f3fc" opacity="0.9" />
              <circle cx="100" cy="100" r="12" fill="#ffffff" opacity="0.95" />
            </g>
          </svg>
        </div>
      );

    case "ECOMMERCE":
      // Mosaico 2x2 con los 4 logos principales de ecommerce — transmite
      // "multiples plataformas" en lugar del logo especifico de VTEX.
      return (
        <div
          style={{
            width: size,
            height: size,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: Math.max(1, size * 0.04),
            background: "linear-gradient(135deg, rgba(255,94,26,0.08), rgba(168,85,247,0.08))",
            borderRadius: size * 0.16,
            padding: size * 0.08,
            boxSizing: "border-box",
          }}
          className={className}
        >
          {/* VTEX (rosa) */}
          <div style={{ background: "#FF3366", borderRadius: size * 0.08, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: size * 0.22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>V</div>
          </div>
          {/* Tiendanube (celeste) */}
          <div style={{ background: "#0099E0", borderRadius: size * 0.08, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: size * 0.22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>TN</div>
          </div>
          {/* Shopify (verde lima) */}
          <div style={{ background: "#96BF48", borderRadius: size * 0.08, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: size * 0.22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>S</div>
          </div>
          {/* WooCommerce (morado) */}
          <div style={{ background: "#7F54B3", borderRadius: size * 0.08, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: size * 0.22, fontWeight: 900, color: "#fff", letterSpacing: "-0.03em" }}>W</div>
          </div>
        </div>
      );

    case "TIENDANUBE":
      // Tiendanube no tiene SVG en simple-icons. Uso su color oficial con
      // monograma "TN".
      return (
        <div
          style={{
            width: size,
            height: size,
            background: "linear-gradient(135deg, #0099E0, #007BBA)",
            borderRadius: size * 0.18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: size * 0.42,
            fontWeight: 900,
            letterSpacing: "-0.04em",
          }}
          className={className}
        >
          TN
        </div>
      );

    case "SHOPIFY":
      // SVG oficial Shopify (simple-icons, CC0)
      return (
        <svg {...commonProps}>
          <path
            fill="#95BF47"
            d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z"
          />
        </svg>
      );

    case "WOOCOMMERCE":
      // SVG oficial WooCommerce (simple-icons, CC0) — color morado
      return (
        <svg {...commonProps}>
          <path
            fill="#7F54B3"
            d="M.754 9.58a.754.754 0 00-.754.758v2.525c0 .42.339.758.758.758h3.135l1.431.799-.326-.799h2.373a.757.757 0 00.758-.758v-2.525a.757.757 0 00-.758-.758H.754zm2.709.445h.03c.065.001.124.023.179.067a.26.26 0 01.103.19.29.29 0 01-.033.16c-.13.239-.236.64-.322 1.199-.083.541-.114.965-.094 1.267a.392.392 0 01-.039.219.213.213 0 01-.176.12c-.086.006-.177-.034-.263-.124-.31-.316-.555-.788-.735-1.416-.216.425-.375.744-.478.957-.196.376-.363.568-.502.578-.09.007-.166-.069-.233-.228-.17-.436-.352-1.277-.548-2.524a.297.297 0 01.054-.222c.047-.064.116-.095.21-.102.169-.013.265.065.288.238.103.695.217 1.284.336 1.766l.727-1.387c.066-.126.15-.192.25-.199.146-.01.237.083.273.28.083.441.188.817.315 1.136.086-.844.233-1.453.44-1.828a.255.255 0 01.218-.147z"
          />
        </svg>
      );

    case "MAGENTO":
      // Magento — custom con su forma romboidal naranja (oficial).
      return (
        <svg {...commonProps}>
          <path
            fill="#EE672F"
            d="M12 0L1.607 6v12L12 24V6l-6.464 3.732V17.2L12 20.934l6.464-3.732V9.732L12 6V0z"
          />
        </svg>
      );

    default:
      return <div style={{ width: size, height: size, background: "#333", borderRadius: 4 }} />;
  }
}
