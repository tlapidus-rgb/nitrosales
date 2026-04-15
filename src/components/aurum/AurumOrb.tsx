"use client";
// @ts-nocheck

import React from "react";

/**
 * AurumOrb — la esfera dorada viva con anillo orbital tipo Saturno.
 *
 * TRUCO 3D: el anillo se divide en dos mitades usando clip-path, para
 * que la mitad "de atrás" del anillo quede OCLUIDA por la bola dorada
 * (z-index 0), y la mitad "de adelante" pase POR ENCIMA (z-index 2).
 * La bola queda sandwiched en z-index 1. Así el anillo se siente
 * realmente alrededor de la esfera como en Saturno.
 *
 *   Stack de capas:
 *     z=0  Pulse ring (aura difusa exterior)
 *     z=0  Mitad POSTERIOR del anillo (clip: top half)
 *     z=1  Orb dorado + highlight
 *     z=2  Mitad FRONTAL del anillo (clip: bottom half)
 *     z=3  Partícula extra de "thinking" si loading
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

  const orbInner = size - Math.max(6, Math.round(size / 6));

  // Reusable ring element (el aro + su rotación).
  // Se renderiza dos veces: una en el contenedor back (clip top),
  // otra en el contenedor front (clip bottom).
  const RingShape = ({ withMainParticle, withSecondaryParticle }: any) => (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        borderRadius: "50%",
        border: `${ringBorder}px solid rgba(251,191,36,0.55)`,
        boxShadow:
          "0 0 10px rgba(251,191,36,0.35), inset 0 0 6px rgba(251,191,36,0.25)",
        transform: "rotateX(72deg) rotateZ(-18deg)",
        animation: `aurumSaturnSpin ${ringSpeed}s linear infinite`,
      }}
    >
      {withMainParticle && (
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
      )}
      {withSecondaryParticle && !tiny && (
        <div
          className="absolute rounded-full"
          style={{
            width: p2,
            height: p2,
            bottom: -(p2 / 2),
            left: "22%",
            background: "radial-gradient(circle, #fffbeb, #fbbf24)",
            boxShadow: "0 0 8px rgba(251,191,36,0.8)",
          }}
        />
      )}
    </div>
  );

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Pulse ring exterior — aura difusa (z=0) */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          zIndex: 0,
          background:
            "radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(217,119,6,0.15) 40%, transparent 70%)",
          filter: "blur(6px)",
          animation: `aurumPulseRing ${pulseSpeed}s ease-in-out infinite`,
        }}
      />

      {/* ── Mitad POSTERIOR del anillo (va DETRÁS del orb) ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          zIndex: 0,
          left: ringInsetX,
          right: ringInsetX,
          top: ringInsetY,
          bottom: ringInsetY,
          // clip-path recorta la mitad de abajo del bounding box,
          // dejando solo la parte superior visible — que después
          // de rotateX(72deg) corresponde al "fondo" del anillo.
          clipPath: "inset(0 0 50% 0)",
          WebkitClipPath: "inset(0 0 50% 0)",
        }}
      >
        <RingShape withMainParticle withSecondaryParticle={false} />
      </div>

      {/* Orb principal (z=1, entre las dos mitades del anillo) */}
      <div
        className="relative rounded-full"
        style={{
          zIndex: 1,
          width: orbInner,
          height: orbInner,
          background:
            "radial-gradient(circle at 30% 25%, #fffbeb 0%, #fef3c7 22%, #fde68a 45%, #fbbf24 68%, #d97706 92%)",
          boxShadow:
            "inset 0 -4px 10px rgba(120,53,15,0.4), inset 0 3px 6px rgba(255,255,255,0.55), 0 0 18px rgba(251,191,36,0.55), 0 0 42px rgba(217,119,6,0.35)",
          animation: `aurumBreath ${breathSpeed}s ease-in-out infinite`,
        }}
      />

      {/* Highlight del orb (z=1, omitido en tiny) */}
      {!tiny && (
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            zIndex: 1,
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

      {/* ── Mitad FRONTAL del anillo (va DELANTE del orb) ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          zIndex: 2,
          left: ringInsetX,
          right: ringInsetX,
          top: ringInsetY,
          bottom: ringInsetY,
          // clip-path recorta la mitad de arriba, dejando solo la
          // parte inferior — que tras rotateX(72deg) es el "frente".
          clipPath: "inset(50% 0 0 0)",
          WebkitClipPath: "inset(50% 0 0 0)",
        }}
      >
        <RingShape withMainParticle={false} withSecondaryParticle />
      </div>

      {/* Partícula extra tipo loader cuando está thinking */}
      {thinking && !tiny && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 3, animation: "aurumOrbit 2.8s linear infinite" }}
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
