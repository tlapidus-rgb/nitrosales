"use client";
// @ts-nocheck

import React from "react";

/**
 * AurumOrb — la esfera dorada viva con anillo orbital tipo Saturno.
 *
 * Anatomía (de atrás hacia adelante):
 *   1. Pulse ring exterior (blur)
 *   2. Orb principal con gradiente radial + highlight
 *   3. Anillo Saturno inclinado rotando
 *   4. Partícula orbitando el anillo (2 en orbs grandes)
 *   5. Partícula extra de "thinking" en el tope cuando está cargando
 *
 * Escalas: para tamaños chicos (<24px) ocultamos detalles finos
 * (partícula secundaria del anillo, highlight) para que no se apelmace.
 */
export function AurumOrb({
  size = 52,
  thinking = false,
}: {
  size?: number;
  thinking?: boolean;
}) {
  const tiny = size < 24;
  const ringSpeed = thinking ? 3.2 : 6;
  const breathSpeed = thinking ? 1.6 : 3.5;
  const pulseSpeed = thinking ? 1.4 : 3;

  // Grosor del anillo proporcional al size
  const ringBorder = Math.max(1, Math.round(size / 40));
  // Extensión del anillo más allá del orb (lo que lo hace tipo Saturno)
  const ringInsetX = tiny ? "-18%" : "-16%";
  const ringInsetY = tiny ? "-28%" : "-22%";

  // Tamaños de partículas
  const p1 = Math.max(3, Math.round(size / 10));
  const p2 = Math.max(2, Math.round(size / 14));

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Pulse ring exterior — aura difusa */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(217,119,6,0.15) 40%, transparent 70%)",
          filter: "blur(6px)",
          animation: `aurumPulseRing ${pulseSpeed}s ease-in-out infinite`,
        }}
      />

      {/* Orb principal */}
      <div
        className="relative rounded-full"
        style={{
          width: size - Math.max(6, Math.round(size / 6)),
          height: size - Math.max(6, Math.round(size / 6)),
          background:
            "radial-gradient(circle at 30% 25%, #fffbeb 0%, #fef3c7 22%, #fde68a 45%, #fbbf24 68%, #d97706 92%)",
          boxShadow:
            "inset 0 -4px 10px rgba(120,53,15,0.4), inset 0 3px 6px rgba(255,255,255,0.55), 0 0 18px rgba(251,191,36,0.55), 0 0 42px rgba(217,119,6,0.35)",
          animation: `aurumBreath ${breathSpeed}s ease-in-out infinite`,
        }}
      />

      {/* Highlight (omitido en tiny para no ensuciar) */}
      {!tiny && (
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: size * 0.26,
            height: size * 0.18,
            top: size * 0.2,
            left: size * 0.24,
            background:
              "radial-gradient(ellipse, rgba(255,255,255,0.85), transparent 65%)",
            filter: "blur(2px)",
          }}
        />
      )}

      {/* ── Anillo orbital tipo Saturno ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: ringInsetX,
          right: ringInsetX,
          top: ringInsetY,
          bottom: ringInsetY,
          borderRadius: "50%",
          border: `${ringBorder}px solid rgba(251,191,36,0.55)`,
          boxShadow:
            "0 0 10px rgba(251,191,36,0.35), inset 0 0 6px rgba(251,191,36,0.25)",
          transform: "rotateX(72deg) rotateZ(-18deg)",
          animation: `aurumSaturnSpin ${ringSpeed}s linear infinite`,
        }}
      >
        {/* Partícula principal viajando sobre el anillo (arriba) */}
        <div
          className="absolute rounded-full"
          style={{
            width: p1,
            height: p1,
            top: -(p1 / 2 + 1),
            left: "50%",
            marginLeft: -(p1 / 2),
            background:
              "radial-gradient(circle, #fffbeb, #fbbf24 60%, #d97706)",
            boxShadow:
              "0 0 10px rgba(251,191,36,0.9), 0 0 22px rgba(217,119,6,0.55)",
          }}
        />
        {/* Partícula secundaria (solo en orbs no-tiny) */}
        {!tiny && (
          <div
            className="absolute rounded-full"
            style={{
              width: p2,
              height: p2,
              bottom: -(p2 / 2),
              left: "22%",
              background:
                "radial-gradient(circle, #fffbeb, #fbbf24)",
              boxShadow: "0 0 8px rgba(251,191,36,0.8)",
            }}
          />
        )}
      </div>

      {/* Partícula extra tipo loader cuando está thinking (solo en no-tiny) */}
      {thinking && !tiny && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ animation: "aurumOrbit 2.8s linear infinite" }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 4,
              height: 4,
              top: 2,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#fef3c7",
              boxShadow: "0 0 8px rgba(251,191,36,0.9)",
            }}
          />
        </div>
      )}

      {/* Keyframes locales — se dedupican por nombre si ya existen globalmente */}
      <style jsx global>{`
        @keyframes aurumSaturnSpin {
          from { transform: rotateX(72deg) rotateZ(-18deg); }
          to   { transform: rotateX(72deg) rotateZ(342deg); }
        }
        @keyframes aurumPulseRing {
          0%,100% { transform: scale(1);   opacity: 0.85; }
          50%     { transform: scale(1.12); opacity: 1; }
        }
        @keyframes aurumBreath {
          0%,100% { transform: scale(1);    filter: brightness(1); }
          50%     { transform: scale(1.035); filter: brightness(1.08); }
        }
        @keyframes aurumOrbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default AurumOrb;
