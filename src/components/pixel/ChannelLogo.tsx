// ══════════════════════════════════════════════════════════════
// ChannelLogo — logos SVG oficiales por canal (S60 EXT-2 BIS+++)
// ══════════════════════════════════════════════════════════════
// Renderiza un circulo con el color de marca del canal y un SVG blanco
// adentro. Antes vivia inline en /pixel/page.tsx — extraido aca para
// reusar en /pixel/configuracion (settings) y futuros componentes.
//
// Convencion: el componente acepta `source` (canonical, lowercase) y
// devuelve el avatar completo (circulo color + SVG blanco). Para casos
// donde solo necesitas el SVG, usar el sub-componente <ChannelLogoSvg/>.
// ══════════════════════════════════════════════════════════════

import React from "react";

type ChannelMeta = { color: string; label: string };

const CHANNEL_META: Record<string, ChannelMeta> = {
  meta: { color: "#1877F2", label: "Meta Ads" },
  facebook: { color: "#1877F2", label: "Facebook" },
  instagram: { color: "#E4405F", label: "Instagram" },
  google: { color: "#EA4335", label: "Google" },
  bing: { color: "#008373", label: "Bing" },
  tiktok: { color: "#69C9D0", label: "TikTok" },
  youtube: { color: "#FF0000", label: "YouTube" },
  linkedin: { color: "#0A66C2", label: "LinkedIn" },
  twitter: { color: "#1DA1F2", label: "Twitter" },
  whatsapp: { color: "#25D366", label: "WhatsApp" },
  email: { color: "#F59E0B", label: "Email" },
  direct: { color: "#22C55E", label: "Directo" },
  organic: { color: "#8B5CF6", label: "Orgánico" },
  referral: { color: "#EC4899", label: "Referido" },
};

export function getChannelMeta(source: string): ChannelMeta {
  const key = (source || "").toLowerCase();
  return CHANNEL_META[key] || { color: "#6B7280", label: source };
}

export function ChannelLogoSvg({ source, size = 14 }: { source?: string; size?: number }) {
  const s = (source || "").toLowerCase();
  const baseProps = { width: size, height: size, viewBox: "0 0 24 24", fill: "white", className: "flex-shrink-0" };
  const strokeProps = { width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const, stroke: "white", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "flex-shrink-0" };
  switch (s) {
    case "meta":
      return (<svg {...baseProps}><path d="M12 10.203c-1.047-1.45-2.183-2.403-3.64-2.403-2.16 0-4.36 2.1-4.36 5.2 0 2.1 1.1 4 3.1 4 1.6 0 2.7-.9 4.1-2.9l.8-1.2.8 1.2c1.4 2 2.5 2.9 4.1 2.9 2 0 3.1-1.9 3.1-4 0-3.1-2.2-5.2-4.36-5.2-1.457 0-2.593.953-3.64 2.403zm-1.44 2.197L9.2 14.3c-1 1.5-1.5 1.9-2.3 1.9-.9 0-1.5-.8-1.5-2.2 0-1.9 1-3.4 2.5-3.4.8 0 1.4.4 2.66 1.8zm2.88 0c1.26-1.4 1.86-1.8 2.66-1.8 1.5 0 2.5 1.5 2.5 3.4 0 1.4-.6 2.2-1.5 2.2-.8 0-1.3-.4-2.3-1.9l-1.36-1.9z"/></svg>);
    case "facebook":
      // F clasica de Facebook (no el loop de Meta)
      return (<svg {...baseProps}><path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.25-1.5 1.55-1.5h1.65V4.6c-.29-.04-1.27-.12-2.4-.12-2.38 0-4 1.45-4 4.12v2.3H7.6V14h2.7v8h3.2z"/></svg>);
    case "instagram":
      return (<svg {...baseProps}><path d="M12 2.982c2.937 0 3.285.011 4.445.064a6.087 6.087 0 012.042.379 3.408 3.408 0 011.265.823c.37.37.632.803.823 1.265.234.543.362 1.16.379 2.042.053 1.16.064 1.508.064 4.445s-.011 3.285-.064 4.445a6.087 6.087 0 01-.379 2.042 3.643 3.643 0 01-2.088 2.088 6.087 6.087 0 01-2.042.379c-1.16.053-1.508.064-4.445.064s-3.285-.011-4.445-.064a6.087 6.087 0 01-2.042-.379 3.408 3.408 0 01-1.265-.823 3.408 3.408 0 01-.823-1.265 6.087 6.087 0 01-.379-2.042C2.993 15.285 2.982 14.937 2.982 12s.011-3.285.064-4.445a6.087 6.087 0 01.379-2.042c.191-.462.452-.895.823-1.265a3.408 3.408 0 011.265-.823 6.087 6.087 0 012.042-.379C8.715 2.993 9.063 2.982 12 2.982zM12 1c-2.987 0-3.362.013-4.535.066a8.074 8.074 0 00-2.67.511 5.392 5.392 0 00-1.949 1.27 5.392 5.392 0 00-1.27 1.949 8.074 8.074 0 00-.51 2.67C1.013 8.638 1 9.013 1 12s.013 3.362.066 4.535a8.074 8.074 0 00.511 2.67 5.392 5.392 0 001.27 1.949 5.392 5.392 0 001.949 1.27 8.074 8.074 0 002.67.51C8.638 22.987 9.013 23 12 23s3.362-.013 4.535-.066a8.074 8.074 0 002.67-.511 5.625 5.625 0 003.218-3.218 8.074 8.074 0 00.511-2.67C22.987 15.362 23 14.987 23 12s-.013-3.362-.066-4.535a8.074 8.074 0 00-.511-2.67 5.392 5.392 0 00-1.27-1.949 5.392 5.392 0 00-1.949-1.27 8.074 8.074 0 00-2.67-.51C15.362 1.013 14.987 1 12 1zm0 5.351A5.649 5.649 0 1017.649 12 5.649 5.649 0 0012 6.351zm0 9.316A3.667 3.667 0 1115.667 12 3.667 3.667 0 0112 15.667zM18.804 5.34a1.44 1.44 0 10-1.44 1.44 1.44 1.44 0 001.44-1.44z"/></svg>);
    case "google":
      return (<svg {...baseProps}><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="rgba(255,255,255,0.85)"/><path d="M5.84 14.09A6.68 6.68 0 015.5 12c0-.72.13-1.43.34-2.09V7.07H2.18A11 11 0 001 12c0 1.77.43 3.44 1.18 4.93l3.66-2.84z" fill="rgba(255,255,255,0.7)"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="rgba(255,255,255,0.55)"/></svg>);
    case "tiktok":
      return (<svg {...baseProps}><path d="M16.6 5.82A4.278 4.278 0 0115.54 3h-3.09v12.4a2.592 2.592 0 01-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 004.3 1.38V7.3s-1.88.09-4.24-1.48z"/></svg>);
    case "bing":
      return (<svg {...baseProps}><path d="M5 3v16.5l4.06 2.3 7.94-4.03V13.5l-5.06-2.48L5 3zm4.06 12.52V8.44l4.94 2.43-4.94 4.65z"/></svg>);
    case "youtube":
      return (<svg {...baseProps}><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>);
    case "linkedin":
      return (<svg {...baseProps}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>);
    case "twitter":
    case "x":
      return (<svg {...baseProps}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>);
    case "whatsapp":
      return (<svg {...baseProps}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 1C5.935 1 1 5.935 1 12c0 1.94.508 3.762 1.395 5.34L1 23l5.812-1.364A10.95 10.95 0 0012 23c6.065 0 11-4.935 11-11S18.065 1 12 1zm0 20.1a9.06 9.06 0 01-4.63-1.27l-.33-.197-3.442.903.92-3.357-.216-.343A9.055 9.055 0 012.9 12c0-5.014 4.086-9.1 9.1-9.1S21.1 6.986 21.1 12s-4.086 9.1-9.1 9.1z"/></svg>);
    case "email":
      return (<svg {...strokeProps}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>);
    case "referral":
      return (<svg {...strokeProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
    case "organic":
      return (<svg {...strokeProps}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>);
    case "direct":
      return (<svg {...strokeProps}><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/></svg>);
    default:
      return <span className="font-bold text-white" style={{ fontSize: size * 0.7 }}>{(source || "?").charAt(0).toUpperCase()}</span>;
  }
}

export function ChannelLogo({
  source,
  size = 28,
  iconSize,
}: {
  source: string;
  size?: number;
  iconSize?: number;
}) {
  const meta = getChannelMeta(source);
  return (
    <span
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: meta.color }}
      title={meta.label}
    >
      <ChannelLogoSvg source={source} size={iconSize ?? Math.round(size * 0.55)} />
    </span>
  );
}
