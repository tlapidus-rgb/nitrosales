"use client";

// ══════════════════════════════════════════════════════════════
// Admin Sidebar — fixed nav for /admin/*
// ══════════════════════════════════════════════════════════════

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS: Array<{
  label: string;
  href: string;
  icon: string;
  match: (path: string) => boolean;
}> = [
  {
    label: "Overview",
    href: "/admin",
    icon: "◇",
    match: (p) => p === "/admin",
  },
  {
    label: "Clientes",
    href: "/admin/clientes",
    icon: "◈",
    match: (p) => p.startsWith("/admin/clientes"),
  },
  {
    label: "Alertas",
    href: "/admin/alertas",
    icon: "◆",
    match: (p) => p.startsWith("/admin/alertas"),
  },
  {
    label: "Claude Usage",
    href: "/admin/usage",
    icon: "◉",
    match: (p) => p.startsWith("/admin/usage"),
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 border-r border-white/5 bg-[#070912] flex flex-col">
      {/* Brand */}
      <div className="px-6 py-6 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">N</span>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">NitroSales</div>
            <div className="text-[9px] font-mono tracking-[0.2em] text-cyan-400/70 uppercase">
              Admin Console
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4">
        <div className="text-[9px] font-mono tracking-[0.25em] text-white/30 uppercase px-3 mb-2">
          Cabina
        </div>
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition mb-0.5 ${
                active
                  ? "bg-cyan-500/10 text-cyan-100 border border-cyan-500/20"
                  : "text-white/60 hover:bg-white/[0.03] hover:text-white border border-transparent"
              }`}
            >
              <span className={`text-base ${active ? "text-cyan-300" : "text-white/40"}`}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/5">
        <Link
          href="/dashboard"
          className="text-[10px] font-mono tracking-wider text-white/40 hover:text-white/70 transition"
        >
          ← Volver a la app
        </Link>
      </div>
    </aside>
  );
}
