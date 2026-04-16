"use client";

import React from "react";
import {
  Globe, Mail, MessageCircle, Link2, Search, MousePointerClick, HelpCircle,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// SourceLogo — logos SVG inline world-class para fuentes de adquisición
// ═══════════════════════════════════════════════════════════════════
// Meta (gradient IG) · Google (4-color G) · TikTok (cyan/pink) · Email
// WhatsApp · Organic (Google con solo texto) · Direct · Referral · Other
// ═══════════════════════════════════════════════════════════════════

export type ChannelKey =
  | "meta"
  | "google"
  | "tiktok"
  | "email"
  | "whatsapp"
  | "organic"
  | "direct"
  | "referral"
  | "other"
  | null
  | undefined;

export const CHANNEL_LABEL: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  email: "Email",
  whatsapp: "WhatsApp",
  organic: "Orgánico",
  direct: "Directo",
  referral: "Referral",
  other: "Otro",
};

export const CHANNEL_TINT: Record<string, string> = {
  meta: "#833ab4",
  google: "#4285F4",
  tiktok: "#25F4EE",
  email: "#64748b",
  whatsapp: "#25D366",
  organic: "#10b981",
  direct: "#6366f1",
  referral: "#f97316",
  other: "#94a3b8",
};

interface Props {
  channel: ChannelKey;
  size?: number;
  className?: string;
  withLabel?: boolean;
  dense?: boolean; // mini pill mode
}

export function SourceLogo({ channel, size = 14, className = "", withLabel = false, dense = false }: Props) {
  const key = (channel || "other") as string;
  const label = CHANNEL_LABEL[key] || "Otro";
  const tint = CHANNEL_TINT[key] || "#94a3b8";

  const icon = (() => {
    switch (key) {
      case "meta": return <MetaLogo size={size} />;
      case "google": return <GoogleLogo size={size} />;
      case "tiktok": return <TikTokLogo size={size} />;
      case "email": return <Mail size={size} className="text-slate-500" />;
      case "whatsapp": return <WhatsAppLogo size={size} />;
      case "organic": return <Search size={size} style={{ color: CHANNEL_TINT.organic }} />;
      case "direct": return <MousePointerClick size={size} style={{ color: CHANNEL_TINT.direct }} />;
      case "referral": return <Link2 size={size} style={{ color: CHANNEL_TINT.referral }} />;
      default: return <Globe size={size} className="text-slate-400" />;
    }
  })();

  if (!withLabel) {
    return <span className={`inline-flex items-center justify-center ${className}`}>{icon}</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${dense ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} font-medium ${className}`}
      style={{
        background: `${tint}12`,
        color: tint,
        border: `1px solid ${tint}22`,
      }}
    >
      {icon}
      <span className="tracking-tight">{label}</span>
    </span>
  );
}

// ───────────── SVG logos ─────────────

export function MetaLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="metaGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffdd55" />
          <stop offset="25%" stopColor="#ff543e" />
          <stop offset="60%" stopColor="#c837ab" />
          <stop offset="100%" stopColor="#1e88e5" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="9" fill="url(#metaGrad)" />
      <path d="M18 10c-3.5 0-5 2.3-6 4.5-1-2.2-2.5-4.5-6-4.5-3.3 0-5 2.7-5 5.7 0 5.2 6 9.4 11 13.3 5-3.9 11-8.1 11-13.3 0-3-1.7-5.7-5-5.7z" fill="white" opacity="0" />
      <circle cx="18" cy="18" r="5.5" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="24.5" cy="11.5" r="1.2" fill="white" />
      <rect x="8.5" y="8.5" width="19" height="19" rx="5" stroke="white" strokeWidth="1.8" fill="none" />
    </svg>
  );
}

export function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function TikTokLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.6 5.82s-.23-1.82-.23-2.82h-3v13.65c0 1.58-1.28 2.86-2.86 2.86-1.58 0-2.86-1.28-2.86-2.86s1.28-2.86 2.86-2.86c.25 0 .48.03.71.09v-3.04c-.23-.04-.47-.06-.71-.06-3.24 0-5.87 2.63-5.87 5.87s2.63 5.87 5.87 5.87 5.87-2.63 5.87-5.87V9.12c1.14.77 2.51 1.22 3.99 1.22V7.3c0-.01-2.08-.07-3.77-1.48z"
        fill="#000" />
      <path d="M16.6 5.82s-.23-1.82-.23-2.82h-2.2v13.65c0 1.58-1.28 2.86-2.86 2.86-.5 0-.98-.13-1.39-.36 1.36-.2 2.4-1.37 2.4-2.78V3h-.81v13.65c0 1.58-1.28 2.86-2.86 2.86-.24 0-.47-.03-.69-.08a2.86 2.86 0 0 0 2.24 1.06c1.58 0 2.86-1.28 2.86-2.86V3h3c0 1 .23 2.82.23 2.82 1.69 1.41 3.77 1.47 3.77 1.48v-.74c-1.43-.11-2.67-.72-3.46-1.74z"
        fill="#25F4EE" />
      <path d="M16.6 5.82c-.79-1.02-.79-2.82-.79-2.82h-.01c0 1 .23 2.82.23 2.82 1.69 1.41 3.77 1.47 3.77 1.48v-.04c-1.49-.13-2.39-.64-3.2-1.44z"
        fill="#FE2C55" />
      <path d="M10.51 13.41c-1.41.2-2.48 1.4-2.48 2.85 0 .95.47 1.79 1.19 2.3a2.86 2.86 0 0 1-.5-1.62c0-1.45 1.07-2.65 2.48-2.85v-3.04c-.23-.04-.47-.06-.71-.06h-.16v3.03c.07 0 .13.01.18.02z"
        fill="#FE2C55" />
    </svg>
  );
}

export function WhatsAppLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.571-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.693.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.861 9.861 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}
