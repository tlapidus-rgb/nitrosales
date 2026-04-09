export function formatARS(n: number) {
  return "$ " + Math.round(n).toLocaleString("es-AR");
}

// Tanda 7.10 — formatCompact ahora usa coma decimal (es-AR) para
// ser consistente con el resto del dashboard. También oculta el ".0"
// cuando es redondo (ej: "322M" en vez de "322,0M") para limpiar.
export function formatCompact(n: number) {
  const format = (val: number, suffix: string) => {
    const rounded = val.toFixed(1);
    const clean = rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded.replace(".", ",");
    return clean + suffix;
  };
  if (Math.abs(n) >= 1_000_000) return format(n / 1_000_000, "M");
  if (Math.abs(n) >= 1_000) return format(n / 1_000, "K");
  return n.toLocaleString("es-AR");
}

export function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
