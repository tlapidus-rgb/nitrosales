"use client";

import { useState, useEffect } from "react";

// ══════════════════════════════════════════════════════════════
// UGC Library — Approved content for reuse
// ══════════════════════════════════════════════════════════════

const PLATFORM_ICONS: Record<string, string> = {
  INSTAGRAM: "📸",
  TIKTOK: "🎵",
  YOUTUBE: "▶️",
  OTHER: "🔗",
};

interface UGCItem {
  id: string;
  type: string;
  platform: string;
  contentUrl: string;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  influencer: { id: string; name: string; code: string; profileImage: string | null };
  briefing: { id: string; title: string } | null;
}

export default function UGCLibraryPage() {
  const [items, setItems] = useState<UGCItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/influencers/content?ugc=true")
      .then((r) => r.json())
      .then((d) => setItems(d.submissions || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = platformFilter
    ? items.filter((i) => i.platform === platformFilter)
    : items;

  const platforms = [...new Set(items.map((i) => i.platform))];

  const copyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <p className="text-gray-500 font-mono text-sm">Cargando UGC...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Biblioteca UGC</h1>
        <p className="text-sm text-gray-500 mt-1">
          Contenido aprobado de tus influencers, listo para reutilizar en ads y redes
          {items.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">({items.length} piezas)</span>
          )}
        </p>
      </div>

      {/* Platform filters */}
      {platforms.length > 1 && (
        <div className="flex gap-2">
          <button
            onClick={() => setPlatformFilter("")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !platformFilter ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Todos
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                platformFilter === p ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {PLATFORM_ICONS[p]} {p}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">🎨</p>
          <p className="text-gray-900 font-medium">Tu biblioteca UGC esta vacia</p>
          <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
            Cuando apruebes contenido de tus influencers y lo marques como UGC, va a aparecer aca como una galería lista para reutilizar en campañas
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
              {/* Thumbnail or placeholder */}
              {item.thumbnailUrl ? (
                <div className="aspect-video bg-gray-100 overflow-hidden">
                  <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                  <span className="text-4xl">{PLATFORM_ICONS[item.platform]}</span>
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.influencer.profileImage ? (
                      <img src={item.influencer.profileImage} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-[10px] font-bold">
                        {item.influencer.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-medium" style={{ color: "#111827" }}>{item.influencer.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">{item.platform}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600 font-medium">{item.type}</span>
                  </div>
                </div>

                {item.caption && (
                  <p className="text-xs text-gray-600 line-clamp-2">{item.caption}</p>
                )}

                {item.briefing && (
                  <span className="inline-block text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                    {item.briefing.title}
                  </span>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-gray-400">
                    {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("es-AR") : new Date(item.createdAt).toLocaleDateString("es-AR")}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => copyUrl(item.id, item.contentUrl)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-medium hover:bg-gray-200 transition-colors"
                    >
                      {copiedId === item.id ? "Copiado!" : "Copiar URL"}
                    </button>
                    <a
                      href={item.contentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-orange-100 text-orange-600 rounded-lg text-[10px] font-medium hover:bg-orange-200 transition-colors"
                    >
                      Ver →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
