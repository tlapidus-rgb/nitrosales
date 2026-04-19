"use client";

/**
 * AlertsBadge — Fase 8d
 * ─────────────────────────────────────────────────────────────
 * Badge pequeño que muestra el count de alertas críticas +
 * atención del user. Se monta al lado del NavItem "Alertas" en
 * el sidebar principal.
 *
 * Fetch a /api/alerts cada 60 segundos (poll liviano).
 */

import { useEffect, useState } from "react";

export default function AlertsBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/alerts?limit=1", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const critical = json.countsBySeverity?.critical ?? 0;
        const warning = json.countsBySeverity?.warning ?? 0;
        if (active) setCount(critical + warning);
      } catch {
        /* silent */
      }
    };
    load();
    const interval = setInterval(load, 60_000); // 1 min poll
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (count === null || count === 0) return null;

  return (
    <span
      className="ml-auto inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums leading-4"
      style={{
        minWidth: 18,
        height: 18,
        background: count > 10 ? "#dc2626" : "#f59e0b",
        color: "white",
        boxShadow:
          count > 10
            ? "0 0 10px rgba(220,38,38,0.5)"
            : "0 0 8px rgba(245,158,11,0.4)",
      }}
      title={`${count} alertas sin resolver`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
