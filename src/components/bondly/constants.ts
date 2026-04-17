// ═══════════════════════════════════════════════════════════════════
// Bondly · constants.ts
// Biblia visual: gradients, easing, tier + segment configs, channel colors.
// Todo lo que se comparte entre páginas del módulo Bondly (clientes, ltv,
// audiencias, etc) vive acá. No agregar lógica — solo tokens.
// ═══════════════════════════════════════════════════════════════════
import {
  Users,
  Crown,
  Heart,
  Sparkles,
  AlertTriangle,
  Moon,
  UserX,
  UserCheck,
  Activity,
  Star,
  ShoppingCart,
  Repeat,
} from "lucide-react";

// ─── Easing & gradients ────────────────────────────────────────────
export const ES = "cubic-bezier(0.16, 1, 0.3, 1)";
export const BONDLY_GRAD =
  "linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)";
export const GOLD_GRAD =
  "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)";
export const VIP_GRAD =
  "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)";

// ─── Tier config (icon + accent + glow) ────────────────────────────
export type BondlyTierKey =
  | "VIP"
  | "Loyal"
  | "Regular"
  | "New"
  | "At Risk"
  | "Dormant"
  | "Anonymous";

export const TIER_CONFIG: Record<
  string,
  { icon: any; accent: string; glow: string; label: string }
> = {
  VIP: {
    icon: Crown,
    accent: "#a855f7",
    glow: "rgba(168,85,247,0.35)",
    label: "VIP",
  },
  Loyal: {
    icon: Heart,
    accent: "#ec4899",
    glow: "rgba(236,72,153,0.30)",
    label: "LEAL",
  },
  Regular: {
    icon: Users,
    accent: "#6366f1",
    glow: "rgba(99,102,241,0.25)",
    label: "REGULAR",
  },
  New: {
    icon: Sparkles,
    accent: "#06b6d4",
    glow: "rgba(6,182,212,0.30)",
    label: "NUEVO",
  },
  "At Risk": {
    icon: AlertTriangle,
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.35)",
    label: "EN RIESGO",
  },
  Dormant: {
    icon: Moon,
    accent: "#94a3b8",
    glow: "rgba(148,163,184,0.25)",
    label: "DORMIDO",
  },
  Anonymous: {
    icon: UserX,
    accent: "#64748b",
    glow: "rgba(100,116,139,0.20)",
    label: "ANÓNIMO",
  },
};

// ─── Quick segment config (chips de la fila Clientes) ──────────────
export const QUICK_SEGMENT_CONFIG: Record<
  string,
  { icon: any; gradient: string; solid: string; label: string }
> = {
  all: {
    icon: Users,
    gradient: "linear-gradient(135deg, #475569 0%, #1e293b 100%)",
    solid: "#1e293b",
    label: "Todos",
  },
  browsing_now: {
    icon: Activity,
    gradient: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
    solid: "#06b6d4",
    label: "Navegando ahora",
  },
  anonymous: {
    icon: UserX,
    gradient: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
    solid: "#64748b",
    label: "Anónimos",
  },
  identified: {
    icon: UserCheck,
    gradient: "linear-gradient(135deg, #10b981 0%, #0891b2 100%)",
    solid: "#10b981",
    label: "Identificados",
  },
  new_7d: {
    icon: Sparkles,
    gradient: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    solid: "#06b6d4",
    label: "Nuevos 7d",
  },
  vip: {
    icon: Crown,
    gradient: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
    solid: "#a855f7",
    label: "VIP",
  },
  champions: {
    icon: Star,
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f97316 100%)",
    solid: "#f59e0b",
    label: "Champions",
  },
  cart_abandoned: {
    icon: ShoppingCart,
    gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
    solid: "#f97316",
    label: "Carrito abandonado",
  },
  reappeared: {
    icon: Repeat,
    gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    solid: "#10b981",
    label: "Reaparecidos",
  },
  at_risk: {
    icon: AlertTriangle,
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    solid: "#f59e0b",
    label: "En riesgo",
  },
  dormant: {
    icon: Moon,
    gradient: "linear-gradient(135deg, #64748b 0%, #334155 100%)",
    solid: "#64748b",
    label: "Dormidos",
  },
};

// ─── Channel colors (para barra de canales, sparklines, etc) ───────
export const CHANNEL_COLORS: Record<string, string> = {
  meta: "#1877f2",
  google: "#4285f4",
  tiktok: "#25f4ee",
  organic: "#10b981",
  direct: "#64748b",
  referral: "#a855f7",
  email: "#f59e0b",
  whatsapp: "#25d366",
  other: "#94a3b8",
};
