"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  children?: { href: string; label: string }[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    href: "/products",
    label: "Productos",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  {
    href: "/orders",
    label: "Ordenes",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  },
  {
    href: "/campaigns",
    label: "Campanas",
    icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z",
    children: [
      { href: "/campaigns", label: "Overview" },
      { href: "/campaigns/meta", label: "Meta Ads" },
      { href: "/campaigns/google", label: "Google Ads" },
    ],
  },
  {
    href: "/customers",
    label: "Clientes",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  },
  {
    href: "/chat",
    label: "Chat IA",
    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  },
  {
    href: "/settings",
    label: "Configuracion",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-nitro-bg flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-nitro-orange animate-pulse-live" />
          <p className="text-nitro-text2 font-mono text-sm tracking-wider uppercase">Cargando</p>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    router.push("/login");
    return null;
  }

  function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    fetch("/api/sync/trigger", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setSyncResult(data.ok ? "ok" : "error");
        setTimeout(() => setSyncResult(null), 3000);
      })
      .catch(() => setSyncResult("error"))
      .finally(() => setSyncing(false));
  }

  return (
    <div className="min-h-screen bg-nitro-bg flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-nitro-bg2 flex flex-col transition-transform duration-500 ease-nitro lg:translate-x-0 lg:static border-r border-nitro-border ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-nitro-border">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: "var(--nitro-gradient)" }}
            >
              <span className="text-nitro-bg">N</span>
            </div>
            <span className="font-headline text-lg tracking-tight text-white">
              NITRO<span style={{ color: "var(--nitro-orange)" }}>SALES</span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const hasChildren = item.children && item.children.length > 0;
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ease-nitro ${
                    isActive
                      ? "bg-white/5 text-white"
                      : "text-nitro-text2 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <span
                      className="absolute left-0 w-[3px] h-5 rounded-r-full"
                      style={{ background: "var(--nitro-gradient)" }}
                    />
                  )}
                  <svg
                    className={`w-5 h-5 flex-shrink-0 transition-colors duration-300 ${
                      isActive ? "text-nitro-orange" : "text-nitro-muted group-hover:text-nitro-text2"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                  {item.href === "/chat" && (
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-nitro-green animate-pulse-live" />
                      <span className="text-[10px] text-nitro-muted font-mono uppercase tracking-widest">
                        AI
                      </span>
                    </span>
                  )}
                </Link>
                {/* Sub-items */}
                {hasChildren && isActive && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {item.children!.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                            childActive
                              ? "text-nitro-orange bg-white/5"
                              : "text-nitro-muted hover:text-nitro-text2 hover:bg-white/5"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-4 py-4 border-t border-nitro-border">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-nitro-bg"
              style={{ background: "var(--nitro-gradient)" }}
            >
              {(session.user.name || session.user.email || "U")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-nitro-text2 truncate">{session.user.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full text-xs text-nitro-muted hover:text-nitro-orange py-1.5 px-2 rounded-lg hover:bg-white/5 transition-all duration-300 ease-nitro text-left"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="glass border-b border-nitro-border px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <svg
                className="w-5 h-5 text-nitro-text2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-medium text-nitro-text2">El Mundo del Juguete</span>
            <span className="flex items-center gap-1.5 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-nitro-green animate-pulse-live" />
              <span className="font-mono text-[10px] text-nitro-muted uppercase tracking-widest">
                Live
              </span>
            </span>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-medium transition-all duration-300 ease-nitro ${
              syncing
                ? "bg-nitro-card text-nitro-muted cursor-not-allowed"
                : syncResult === "ok"
                ? "bg-nitro-green/10 text-nitro-green border border-nitro-green/20"
                : syncResult === "error"
                ? "bg-nitro-err/10 text-nitro-err border border-nitro-err/20"
                : "bg-nitro-card text-nitro-orange border border-nitro-border hover:border-nitro-orange/30 hover:shadow-[0_0_20px_rgba(255,94,26,0.1)]"
            }`}
          >
            {syncing
              ? "Sincronizando..."
              : syncResult === "ok"
              ? "\u2713 Sincronizado"
              : syncResult === "error"
              ? "\u26A0 Error"
              : "\u21BB Sincronizar datos"}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 bg-[#F7F8FA]">{children}</main>
      </div>
    </div>
  );
}
