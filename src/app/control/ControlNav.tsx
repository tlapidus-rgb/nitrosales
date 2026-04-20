// @ts-nocheck
"use client";

// ══════════════════════════════════════════════════════════════
// Top nav del Centro de Control
// ══════════════════════════════════════════════════════════════

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Users, Inbox, LogOut } from "lucide-react";

const ITEMS = [
  { href: "/control", label: "Inicio", icon: Activity, exact: true },
  { href: "/control/clientes", label: "Clientes", icon: Users },
  { href: "/control/onboardings", label: "Onboardings", icon: Inbox },
];

export default function ControlNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        background: "rgba(10,10,11,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1F1F23",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
      }}
    >
      {/* Brand */}
      <Link
        href="/control"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          marginRight: 40,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "linear-gradient(135deg, #FF5E1A 0%, #FF8C4A 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.02em",
          }}
        >
          N
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", lineHeight: 1 }}>
            Centro de Control
          </div>
          <div style={{ fontSize: 10, color: "#6B7280", marginTop: 2 }}>
            Panel interno · Tomy
          </div>
        </div>
      </Link>

      {/* Nav items */}
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 500,
                color: active ? "#fff" : "#A1A1AA",
                background: active ? "#1F1F23" : "transparent",
                textDecoration: "none",
                transition: "all 120ms",
              }}
            >
              <Icon size={14} />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Exit to product */}
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 7,
          fontSize: 12,
          fontWeight: 500,
          color: "#71717A",
          textDecoration: "none",
          border: "1px solid #27272A",
        }}
      >
        <LogOut size={12} />
        Salir al producto
      </Link>
    </nav>
  );
}
