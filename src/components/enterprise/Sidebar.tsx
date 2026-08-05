// ══════════════════════════════════════════════════════════════════════════
// Design system "enterprise" — Sidebar sobrio, SIEMPRE EXPANDIDO
// ══════════════════════════════════════════════════════════════════════════
// Feedback de Tomy: el sidebar hoy "da sensación de vacío / le faltan cosas"
// porque esconde los hijos hasta clickear. Solución (su instinto): mostrar la
// jerarquía ya puesta. Patrón Notion + Linear: secciones con header-eyebrow,
// hijos siempre visibles, indent + guía hairline, activo = fill + barrita verde.
// Cero glow, cero acordeón, cero orbe. Ver design-appstack-enterprise.local.md.
// ══════════════════════════════════════════════════════════════════════════
"use client";

import { LivePulse } from "@/components/enterprise/ui";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// ── Icon set minimal (un solo stroke, currentColor) ─────────────────────────
const paths: Record<string, string> = {
  gauge: "M12 13a2 2 0 100-4 2 2 0 000 4zm0 0l3-3M5 18a8 8 0 1114 0",
  chart: "M4 19V5m0 14h16M8 15v-3m4 3V9m4 6v-5",
  target: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 4a5 5 0 100 10 5 5 0 000-10zm0 4a1 1 0 100 2 1 1 0 000-2z",
  link: "M9 15l6-6M10 6l1-1a4 4 0 015 5l-1 1M14 18l-1 1a4 4 0 01-5-5l1-1",
  route: "M6 19a2 2 0 100-4 2 2 0 000 4zm12-10a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 003-3V9",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7.3 7.3 0 00-2-1.2l-.4-2.5H9.4L9 6a7.3 7.3 0 00-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 000 2.4l-2 1.5 2 3.4 2.3-1a7.3 7.3 0 002 1.2l.4 2.5h4.2l.4-2.5a7.3 7.3 0 002-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z",
  bag: "M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 016 0v2",
  box: "M12 3l8 4v10l-8 4-8-4V7l8-4zm0 0v18m8-14l-8 4-8-4",
  bell: "M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zm3 4a3 3 0 006 0",
  users: "M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2m10-16a4 4 0 110 8 4 4 0 010-8zm6 16v-2a4 4 0 00-3-3.9",
};
function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={cx("w-4 h-4 shrink-0", className)} aria-hidden="true">
      <path d={paths[name] || paths.box} />
    </svg>
  );
}

export type NavItem = { label: string; href: string; icon: string };
export type NavGroup = { label: string; items: NavItem[] };

export function Sidebar({ groups, active, org = "TeVe Compras" }: { groups: NavGroup[]; active: string; org?: string }) {
  return (
    <aside className="w-[248px] shrink-0 h-full flex flex-col bg-surface border-r border-hairline font-geist">
      {/* Brand */}
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-hairline">
        <div className="w-7 h-7 rounded-lg bg-ink text-white grid place-items-center font-semibold text-[13px] tracking-tight">N</div>
        <span className="text-[14px] font-semibold text-ink tracking-[-.02em]">NitroSales</span>
      </div>

      {/* Nav — grupos siempre expandidos */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5">
        {groups.map((g) => (
          <div key={g.label} className="mb-5">
            <div className="px-2.5 pb-1.5 font-geistmono text-[10px] font-medium uppercase tracking-[.11em] text-ink-40">{g.label}</div>
            <div className="relative pl-1.5">
              <span className="absolute left-[13px] top-1 bottom-1 w-px bg-hairline-2" aria-hidden="true" />
              {g.items.map((it) => {
                const on = it.href === active;
                return (
                  <a
                    key={it.href}
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "group relative flex items-center gap-2.5 pl-5 pr-2.5 h-8 rounded-lg text-[13px] font-medium transition-colors duration-150 ease-ent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
                      on ? "bg-white text-ink shadow-ent-xs" : "text-ink-60 hover:bg-white/70 hover:text-ink"
                    )}
                  >
                    {on && <span className="absolute left-2 top-2 bottom-2 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                    <Icon name={it.icon} className={on ? "text-ink" : "text-ink-40 group-hover:text-ink-60"} />
                    <span className="truncate tracking-[-.01em]">{it.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: estado del píxel en vivo + org */}
      <div className="border-t border-hairline px-4 py-3 flex items-center justify-between gap-2">
        <LivePulse status="LIVE" />
        <span className="font-geistmono text-[10px] text-ink-40 truncate">{org}</span>
      </div>
    </aside>
  );
}
