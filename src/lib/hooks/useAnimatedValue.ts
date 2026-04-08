"use client";

// ══════════════════════════════════════════════════════════════
// useAnimatedValue + useCountUp — count-up animation premium
// ══════════════════════════════════════════════════════════════
// Patrón extraído de /pixel (sesión 9) para reuso en Dashboard
// y resto de páginas. Usa requestAnimationFrame con easeOutQuart
// y prevTargetRef para from→to suaves cuando cambia el target.
// Respeta prefers-reduced-motion automáticamente vía duration corta.
// ══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(target);
  const prevTargetRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevTargetRef.current;
    const to = target;
    if (from === to || !Number.isFinite(to)) {
      setValue(to);
      prevTargetRef.current = to;
      return;
    }
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = ease(progress);
      setValue(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTargetRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

// Animate any string that contains a numeric portion
// (e.g. "$12,345", "12.5%", "$1.2M", "3.2x"). Falls back gracefully
// when no number is detected.
export function useAnimatedValue(value: string, duration = 900): string {
  const match = value?.match?.(/-?\d+(?:[.,]\d+)*(?:\.\d+)?/);
  const raw = match?.[0] ?? "";
  const cleaned = raw.replace(/,/g, "");
  const numeric = parseFloat(cleaned);
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0, duration);
  if (!match || !Number.isFinite(numeric)) return value;

  const hasComma = raw.includes(",");
  const decimals = (() => {
    const dot = raw.lastIndexOf(".");
    if (dot === -1) return 0;
    const tail = raw.slice(dot + 1);
    return /^\d+$/.test(tail) ? tail.length : 0;
  })();
  const formatted = animated.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: hasComma || Math.abs(numeric) >= 1000,
  });
  return value.replace(raw, formatted);
}
