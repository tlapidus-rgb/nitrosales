"use client";

// ══════════════════════════════════════════════════════════════════════════
// TooltipPortal — burbuja de ayuda que NO puede quedar tapada
// ══════════════════════════════════════════════════════════════════════════
// EL PROBLEMA (reportado 2026-07-21 con capturas):
//   Los tooltips de los iconos de info quedaban DEBAJO de las cards vecinas.
//   No era falta de z-index: los tenían en `z-50`.
//
//   La causa es un stacking context. Las cards del dashboard llevan
//   `.stagger-card { animation: fadeInUp ... both }`, y una animación crea un
//   contexto de apilamiento propio. Dentro de él, `z-50` sólo compite contra los
//   hermanos DE ESA CARD — la card entera sigue teniendo z-index auto, así que
//   cualquier card posterior en el DOM se dibuja encima, tooltip incluido.
//   Subir el z-index no arregla nada: el número no puede escapar del contexto.
//   Lo mismo con `overflow: hidden` de un ancestro, que además lo recorta.
//
// LA SOLUCIÓN: renderizar la burbuja en un PORTAL al `body`, posicionada con
// `position: fixed` a partir del rect del disparador. Al no ser descendiente de
// la card, ningún stacking context ni overflow de la página la afecta. Es
// inmune por construcción, no por ajustar números.
//
// Además evita el efecto dominó de "le subo el z-index a este y ahora tapa a
// aquel", que es como estas cosas terminan en una guerra de z-index.
// ══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 8; // separación entre el icono y la burbuja
const MARGIN = 8; // margen mínimo contra el borde de la ventana

interface Coords {
  left: number;
  top: number;
  /** true = la burbuja quedó DEBAJO del disparador (no había espacio arriba). */
  below: boolean;
}

export interface TooltipPortalProps {
  /** El disparador (el icono). Recibe el hover/focus. */
  children: React.ReactNode;
  /** Contenido de la burbuja. */
  content: React.ReactNode;
  /** Ancho de la burbuja en px. */
  width?: number;
  /** Clases de la burbuja (colores, tipografía). El posicionamiento lo maneja esto. */
  bubbleClassName?: string;
  bubbleStyle?: React.CSSProperties;
}

export function TooltipPortal({
  children,
  content,
  width = 240,
  bubbleClassName = "",
  bubbleStyle,
}: TooltipPortalProps) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  // El portal sólo puede montarse en el cliente: en SSR no hay `document`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    // Centrado sobre el disparador, pero sin salirse de la ventana. Sin esto,
    // un icono pegado al borde derecho manda media burbuja fuera de pantalla.
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN));

    // Por defecto va arriba; si no entra, se voltea abajo. Es el caso de los
    // iconos de la primera fila de cards, que no tienen espacio por encima.
    const spaceAbove = r.top;
    const below = spaceAbove < 120;
    const top = below ? r.bottom + GAP : r.top - GAP;

    setCoords({ left, top, below });
  }, [width]);

  const open = useCallback(() => place(), [place]);
  const close = useCallback(() => setCoords(null), []);

  // Al hacer scroll o redimensionar, la burbuja quedaría flotando en el lugar
  // viejo (es `fixed`, no sigue al disparador). Se cierra: más simple y más
  // predecible que recalcular en cada frame.
  useEffect(() => {
    if (!coords) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [coords, close]);

  return (
    <>
      <span
        ref={triggerRef}
        className="relative inline-flex items-center align-middle cursor-help"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        tabIndex={0}
      >
        {children}
      </span>
      {mounted && coords
        ? createPortal(
            <div
              role="tooltip"
              className={bubbleClassName}
              style={{
                position: "fixed",
                left: coords.left,
                top: coords.top,
                width,
                // Debajo de modales (z-50 en este repo) pero encima de cualquier
                // card. Al vivir en el body no compite con stacking contexts.
                zIndex: 60,
                transform: coords.below ? undefined : "translateY(-100%)",
                pointerEvents: "none",
                ...bubbleStyle,
              }}
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
