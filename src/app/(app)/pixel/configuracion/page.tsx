"use client";

// ══════════════════════════════════════════════════════════════
// /pixel/configuracion — Configuración de NitroPixel (S60)
// ══════════════════════════════════════════════════════════════
// Subsección de NitroPixel para que el cliente:
//  1) Construya URLs con UTMs correctas para sus campañas (Stories,
//     Bio, TV con QR, Email, WhatsApp, etc).
//  2) Vea la guía de tagueo recomendado por canal.
//
// Sin tagueo correcto, todo el tráfico que no tenga integración cae
// como "Directo" en el dashboard. Esta sección le da la herramienta
// para evitar eso.
// ══════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";

const PRESETS: Array<{
  label: string;
  source: string;
  medium: string;
  description: string;
}> = [
  { label: "Instagram — Stories (link sticker)", source: "instagram", medium: "stories", description: "Link sticker en historia" },
  { label: "Instagram — Bio link", source: "instagram", medium: "bio", description: "Link de la bio" },
  { label: "Instagram — Reels", source: "instagram", medium: "reels", description: "Caption del reel" },
  { label: "Facebook — Post orgánico", source: "facebook", medium: "social", description: "Post en feed" },
  { label: "TikTok — Bio link", source: "tiktok", medium: "bio", description: "Link de la bio" },
  { label: "WhatsApp — Mensaje", source: "whatsapp", medium: "chat", description: "Mensaje directo o estado" },
  { label: "Email — Newsletter", source: "email", medium: "newsletter", description: "Newsletter masiva" },
  { label: "Email — Carrito abandonado", source: "email", medium: "cart-abandonment", description: "Recordatorio de carrito" },
  { label: "TV — QR code", source: "tv", medium: "qr", description: "QR en spot televisivo" },
  { label: "Radio — Mención", source: "radio", medium: "mention", description: "URL leída al aire" },
  { label: "Vía pública — Cartel", source: "ooh", medium: "billboard", description: "QR o URL en cartel" },
  { label: "Podcast — Mención", source: "podcast", medium: "mention", description: "URL leída en podcast" },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function PixelConfigPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [presetIdx, setPresetIdx] = useState(0);
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  const preset = PRESETS[presetIdx];
  const finalUrl = useMemo(() => {
    if (!baseUrl) return "";
    const params = new URLSearchParams();
    params.set("utm_source", preset.source);
    params.set("utm_medium", preset.medium);
    if (campaign.trim()) params.set("utm_campaign", slugify(campaign));
    if (content.trim()) params.set("utm_content", slugify(content));
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}${params.toString()}`;
  }, [baseUrl, preset, campaign, content]);

  const handleCopy = () => {
    if (!finalUrl) return;
    navigator.clipboard.writeText(finalUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[#fbfbfd] to-[#f4f5f8]">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Configuración de NitroPixel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Construí URLs con UTMs para que el dashboard atribuya correctamente cada canal sin
            integración (Stories, TV, email, etc).
          </p>
        </div>

        {/* Constructor de UTMs */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Constructor de URL</h2>
          <p className="text-xs text-gray-500 mb-4">
            Pegá tu URL, elegí dónde la vas a publicar y armá un nombre de campaña. Te genera la
            URL final lista para copiar.
          </p>

          <div className="space-y-4">
            {/* URL base */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">URL de la página</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://tutienda.com/promocion"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none"
              />
            </div>

            {/* Preset */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">¿Dónde la vas a publicar?</label>
              <select
                value={presetIdx}
                onChange={(e) => setPresetIdx(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none bg-white"
              >
                {PRESETS.map((p, i) => (
                  <option key={i} value={i}>{p.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">{preset.description}</p>
            </div>

            {/* Campaign + Content */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre de la campaña</label>
                <input
                  type="text"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  placeholder="Día de la madre 2026"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none"
                />
                {campaign && (
                  <p className="text-[11px] text-gray-400 mt-1">→ <code>{slugify(campaign)}</code></p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Variante <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Reel A"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 outline-none"
                />
                {content && (
                  <p className="text-[11px] text-gray-400 mt-1">→ <code>{slugify(content)}</code></p>
                )}
              </div>
            </div>

            {/* URL final */}
            <div className="pt-2">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">URL final</label>
              {finalUrl ? (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 group relative">
                  <code className="text-xs text-gray-700 break-all block pr-20">{finalUrl}</code>
                  <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 px-3 py-1 text-xs font-medium bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors"
                  >
                    {copied ? "Copiado ✓" : "Copiar"}
                  </button>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 border border-dashed border-gray-200">
                  <p className="text-xs text-gray-400 italic">Empezá completando los campos de arriba</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Guía de tagueo */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Guía rápida de tagueo</h2>
          <p className="text-xs text-gray-500 mb-4">
            Formatos recomendados por canal. Usalos como referencia.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Canal</th>
                  <th className="text-left px-3 py-2 font-medium">utm_source</th>
                  <th className="text-left px-3 py-2 font-medium">utm_medium</th>
                  <th className="text-left px-3 py-2 font-medium">Cuándo usar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PRESETS.map((p, i) => (
                  <tr key={i} className="text-gray-700">
                    <td className="px-3 py-2 font-medium">{p.label}</td>
                    <td className="px-3 py-2"><code className="bg-gray-50 px-1.5 py-0.5 rounded">{p.source}</code></td>
                    <td className="px-3 py-2"><code className="bg-gray-50 px-1.5 py-0.5 rounded">{p.medium}</code></td>
                    <td className="px-3 py-2 text-gray-500">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Por qué importa */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-amber-900 mb-2">¿Por qué taguear con UTMs?</h3>
          <ul className="text-xs text-amber-800 space-y-1 list-disc pl-5">
            <li>
              Instagram y otras apps strippean el referrer cuando el visitor hace click.
              Sin UTMs, ese tráfico aparece como <strong>"Directo"</strong> en el dashboard.
            </li>
            <li>
              Para canales offline (TV, radio, OOH), no hay forma de identificar el origen
              salvo que el cliente escanee un QR o tipee una URL con UTMs.
            </li>
            <li>
              Con UTMs consistentes, el dashboard muestra qué canal trae más ventas y con
              qué ROAS — sin esto las decisiones de inversión son a ciegas.
            </li>
          </ul>
        </div>

        <div className="text-center py-4">
          <p className="text-[11px] text-gray-300">
            NitroPixel — Configuración. Arma URLs con UTMs para tagueo consistente multi-canal.
          </p>
        </div>
      </div>
    </div>
  );
}
