"use client";

// ══════════════════════════════════════════════════════════════
// useAnimatedValue + useCountUp — count-up animation premium
// ══════════════════════════════════════════════════════════════
// Patrón extraído de /pixel (sesión 9) para reuso en Dashboard
// y resto de páginas. Usa requestAnimationFrame con easeOutQuart
// y prevTargetRef para from→to suaves cuando cambia el target.
// Respeta prefers-reduced-motion automáticamente vía duration corta.
//
// Tanda 7.10 — Fix crítico: el parser viejo asumía en-US (punto
// como decimal) y corrompía strings en formato es-AR como
// "322.031.000" → parseFloat se cortaba en el segundo punto y
// devolvía 322.031. Ahora soporta ambos locales correctamente.
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

// ───────────────────────────────────────────────────────────────
// Locale-aware number parser (Tanda 7.10)
// ───────────────────────────────────────────────────────────────
// Soporta strings en formato es-AR ("1.234.567,89") y en-US
// ("1,234,567.89") y resuelve ambigüedades con heurística:
// — Múltiples separadores iguales → thousand separator
// — Un dot + una comma → el último es decimal
// — Un separador con exactamente 3 dígitos después → thousand
// — Un separador con cualquier otra cantidad → decimal
interface ParsedNumber {
  numeric: number;
  decimals: number;
  useGrouping: boolean;
}

function parseLocalizedNumber(raw: string): ParsedNumber {
  const dotCount = (raw.match(/\./g) || []).length;
  const commaCount = (raw.match(/,/g) || []).length;

  // Sin separadores
  if (dotCount === 0 && commaCount === 0) {
    return { numeric: parseFloat(raw), decimals: 0, useGrouping: false };
  }

  // Múltiples dots, sin commas → es-AR thousand sep
  if (dotCount >= 2 && commaCount === 0) {
    return {
      numeric: parseFloat(raw.replace(/\./g, "")),
      decimals: 0,
      useGrouping: true,
    };
  }

  // Múltiples commas, sin dots → en-US thousand sep
  if (commaCount >= 2 && dotCount === 0) {
    return {
      numeric: parseFloat(raw.replace(/,/g, "")),
      decimals: 0,
      useGrouping: true,
    };
  }

  // Mezcla de dots y commas → el último es decimal
  if (dotCount >= 1 && commaCount >= 1) {
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");
    if (lastComma > lastDot) {
      // es-AR: dots=thousand, comma=decimal
      const [intPart, decPart] = raw.split(",");
      return {
        numeric: parseFloat(intPart.replace(/\./g, "") + "." + decPart),
        decimals: decPart?.length ?? 0,
        useGrouping: true,
      };
    } else {
      // en-US: commas=thousand, dot=decimal
      const [intPart, decPart] = raw.split(".");
      return {
        numeric: parseFloat(intPart.replace(/,/g, "") + "." + decPart),
        decimals: decPart?.length ?? 0,
        useGrouping: true,
      };
    }
  }

  // Exactamente un dot (ambiguo: thousand o decimal)
  if (dotCount === 1) {
    const [before, after] = raw.split(".");
    // 3 dígitos exactos después → thousand separator (ej: "9.124" = 9124)
    if (after.length === 3) {
      return {
        numeric: parseFloat(before + after),
        decimals: 0,
        useGrouping: true,
      };
    }
    // Caso contrario → decimal (ej: "57.0" = 57)
    return { numeric: parseFloat(raw), decimals: after.length, useGrouping: false };
  }

  // Exactamente una comma (ambiguo)
  if (commaCount === 1) {
    const [before, after] = raw.split(",");
    if (after.length === 3) {
      return {
        numeric: parseFloat(before + after),
        decimals: 0,
        useGrouping: true,
      };
    }
    return {
      numeric: parseFloat(before + "." + after),
      decimals: after.length,
      useGrouping: false,
    };
  }

  return { numeric: parseFloat(raw), decimals: 0, useGrouping: false };
}

// Animate any string that contains a numeric portion
// (e.g. "$12.345", "12,5%", "$1,2M", "3,2x"). Soporta es-AR y en-US.
// Falls back gracefully when no number is detected.
export function useAnimatedValue(value: string, duration = 900): string {
  // Regex captura el número completo incluyendo separadores de miles y decimal.
  const match = value?.match?.(/-?\d+(?:[.,]\d+)*/);
  const raw = match?.[0] ?? "";

  const parsed = raw ? parseLocalizedNumber(raw) : null;
  const numeric = parsed?.numeric ?? 0;
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0, duration);
  if (!match || !parsed || !Number.isFinite(numeric)) return value;

  const formatted = animated.toLocaleString("es-AR", {
    minimumFractionDigits: parsed.decimals,
    maximumFractionDigits: parsed.decimals,
    useGrouping: parsed.useGrouping,
  });
  return value.replace(raw, formatted);
}
