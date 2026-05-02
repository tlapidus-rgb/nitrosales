"use client";

// ══════════════════════════════════════════════════════════════
// AttributionSettings — config completa de atribucion
// ══════════════════════════════════════════════════════════════
// Vive en /pixel/configuracion. Centraliza:
//   1) Modelo de atribucion (Nitro / Last / First / Linear / Precisión)
//   2) Pesos de Precisión (sliders + inputs numericos + locks)
//   3) Ventana de atribucion por defecto (7/14/30/60 dias)
//   4) Ventanas por canal (override del default, 1-90 dias)
//
// S60 EXT-2 BIS+++: naming "por defecto", logos reales (no emojis), tilde
// "Precisión", input numerico editable junto al slider, badge "Hereda/
// Custom" en ventanas por canal, tooltips por modelo.
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { ChannelLogo } from "@/components/pixel/ChannelLogo";

const MODELS: Array<{
  id: string;
  label: string;
  description: string;
  example: string;
  isCustom?: boolean;
}> = [
  {
    id: "NITRO",
    label: "Nitro",
    description: "Pondera según rol del canal: último > primero > intermedios. Recomendado para multi-touch.",
    example: "Si un cliente vio Instagram → Google → compró: Instagram se lleva 30%, Google 40%, intermedios 30%.",
  },
  {
    id: "LAST_CLICK",
    label: "Last Click",
    description: "100% del crédito al último canal antes de la compra. Estándar de Google/Meta.",
    example: "Si vio Instagram → Google → compró: Google se lleva 100%.",
  },
  {
    id: "FIRST_CLICK",
    label: "First Click",
    description: "100% del crédito al primer canal que trajo al cliente.",
    example: "Si vio Instagram → Google → compró: Instagram se lleva 100%.",
  },
  {
    id: "LINEAR",
    label: "Linear",
    description: "El crédito se reparte en partes iguales entre todos los canales del recorrido.",
    example: "Si vio Instagram → Google → Email → compró: cada uno se lleva 33%.",
  },
  {
    id: "CUSTOM",
    label: "Precisión",
    description: "Tus propios pesos para primer / intermedios / último clic. Control total.",
    example: "Si valorás más el descubrimiento, podés dar 50% al primer clic, 20% intermedios, 30% al último.",
    isCustom: true,
  },
];

const VALID_GLOBAL_WINDOWS = [7, 14, 30, 60];

const CHANNELS: Array<{ id: string; label: string }> = [
  { id: "meta", label: "Meta Ads" },
  { id: "google", label: "Google" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "direct", label: "Directo" },
  { id: "organic", label: "Orgánico" },
  { id: "referral", label: "Referido" },
  { id: "bing", label: "Bing" },
];

type Settings = {
  attributionModel: string;
  weights: { first: number; last: number; middle: number };
  attributionWindowDays: number;
  channelWindows: Record<string, number | null>;
};

const DEFAULTS: Settings = {
  attributionModel: "NITRO",
  weights: { first: 30, last: 40, middle: 30 },
  attributionWindowDays: 30,
  channelWindows: {},
};

export function AttributionSettings() {
  const [original, setOriginal] = useState<Settings>(DEFAULTS);
  const [draft, setDraft] = useState<Settings>(DEFAULTS);
  const [locked, setLocked] = useState<Record<string, boolean>>({ first: false, middle: false, last: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings/attribution")
      .then((r) => r.json())
      .then((d) => {
        const next: Settings = {
          attributionModel: d.attributionModel || "NITRO",
          weights: d.weights || DEFAULTS.weights,
          attributionWindowDays: d.attributionWindowDays || 30,
          channelWindows: d.channelWindows || {},
        };
        setOriginal(next);
        setDraft(next);
      })
      .catch(() => setError("No pude cargar la configuración. Recargá la página."))
      .finally(() => setLoading(false));
  }, []);

  const isCustom = draft.attributionModel === "CUSTOM";
  const weightsSum = draft.weights.first + draft.weights.middle + draft.weights.last;
  const weightsValid = !isCustom || weightsSum === 100;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(original);

  const handleSlider = (key: "first" | "middle" | "last", val: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    const newW = { ...draft.weights, [key]: clamped };
    const others = (["first", "middle", "last"] as const).filter((k) => k !== key && !locked[k]);
    const lockedSum = (["first", "middle", "last"] as const)
      .filter((k) => k !== key && locked[k])
      .reduce((s, k) => s + newW[k], 0);
    const remaining = 100 - clamped - lockedSum;
    if (others.length > 0 && remaining >= 0) {
      const oSum = others.reduce((s, k) => s + newW[k], 0);
      if (oSum > 0) {
        let dist = 0;
        others.forEach((k, i) => {
          if (i === others.length - 1) newW[k] = remaining - dist;
          else { newW[k] = Math.round((newW[k] / oSum) * remaining); dist += newW[k]; }
        });
      } else {
        const share = Math.round(remaining / others.length);
        others.forEach((k, i) => { newW[k] = i === others.length - 1 ? remaining - share * (others.length - 1) : share; });
      }
    }
    setDraft({ ...draft, weights: newW });
  };

  const setChannelWindow = (channel: string, daysOrNull: number | null) => {
    const newCw = { ...draft.channelWindows };
    if (daysOrNull === null) delete newCw[channel];
    else newCw[channel] = daysOrNull;
    setDraft({ ...draft, channelWindows: newCw });
  };

  const save = async () => {
    if (!weightsValid) { setError("Los pesos de Precisión deben sumar 100%."); return; }
    setSaving(true); setError(null);
    try {
      const cleanCw: Record<string, number | null> = {};
      for (const [ch, v] of Object.entries(draft.channelWindows)) {
        if (v !== null && v !== draft.attributionWindowDays) cleanCw[ch] = v;
        else cleanCw[ch] = null;
      }
      const modelToPersist = draft.attributionModel === "CUSTOM" ? "NITRO" : draft.attributionModel;
      const res = await fetch("/api/settings/attribution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributionModel: modelToPersist,
          first: draft.weights.first,
          last: draft.weights.last,
          middle: draft.weights.middle,
          attributionWindowDays: draft.attributionWindowDays,
          channelWindows: cleanCw,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const next: Settings = {
        attributionModel: d.attributionModel || draft.attributionModel,
        weights: d.weights || draft.weights,
        attributionWindowDays: d.attributionWindowDays || draft.attributionWindowDays,
        channelWindows: d.channelWindows || {},
      };
      setOriginal(next); setDraft(next);
      setSavedAt(Date.now());
    } catch {
      setError("No pude guardar los cambios. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="text-sm text-gray-400">Cargando configuración...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── 1) Modelo de atribucion ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Modelo de atribución</h2>
        <p className="text-xs text-gray-500 mb-4">
          Define cómo se reparte el crédito de cada venta entre los canales por los que pasó el cliente.
          Cambiarlo afecta todos los reportes del dashboard.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {MODELS.map((m) => {
            const active = draft.attributionModel === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setDraft({ ...draft, attributionModel: m.id })}
                className={`text-left p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                  active && m.isCustom
                    ? "border-violet-500 bg-violet-50/60 shadow-sm"
                    : active
                      ? "border-cyan-500 bg-cyan-50/60 shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                title={m.example}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      active ? (m.isCustom ? "bg-violet-500" : "bg-cyan-500") : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm font-semibold text-gray-900">{m.label}</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">{m.description}</p>
                <p className="text-[10px] text-gray-400 italic leading-snug pt-1 border-t border-gray-100">
                  {m.example}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 2) Pesos de Precisión (solo si CUSTOM) ─── */}
      {isCustom && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Pesos de Precisión</h2>
          <p className="text-xs text-gray-500 mb-4">
            Definí qué porcentaje del crédito se lleva cada momento del recorrido del cliente.
            Total debe sumar 100%. Podés mover el slider o escribir el número directo.
          </p>
          <div className="space-y-4">
            {(["first", "middle", "last"] as const).map((k) => {
              const label = k === "first" ? "Primer clic" : k === "middle" ? "Intermedios" : "Último clic";
              const color = k === "first" ? "#06b6d4" : k === "middle" ? "#8b5cf6" : "#f97316";
              return (
                <div key={k} className="flex items-center gap-3">
                  <div className="w-32 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-xs font-medium text-gray-700">{label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocked((p) => ({ ...p, [k]: !p[k] }))}
                    className="text-[10px] px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                    title={locked[k] ? "Desbloquear" : "Bloquear este peso"}
                  >
                    {locked[k] ? "🔒" : "🔓"}
                  </button>
                  <div className="flex-1 relative">
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full" style={{ width: `${draft.weights[k]}%`, background: color }} />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={draft.weights[k]}
                      onChange={(e) => handleSlider(k, Number(e.target.value))}
                      disabled={locked[k]}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.weights[k]}
                      onChange={(e) => {
                        const v = e.target.value === "" ? 0 : Number(e.target.value);
                        if (!isNaN(v)) handleSlider(k, v);
                      }}
                      disabled={locked[k]}
                      className="w-14 px-1.5 py-1 border border-gray-200 rounded-md text-sm font-semibold tabular-nums text-right outline-none focus:border-cyan-500 disabled:bg-gray-50 disabled:text-gray-400"
                      style={{ color: locked[k] ? undefined : color }}
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">Total</span>
              <span className={`text-sm font-bold tabular-nums ${weightsValid ? "text-emerald-600" : "text-red-500"}`}>
                {weightsSum}% {weightsValid ? "✓" : "(debe ser 100%)"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── 3) Ventana de atribución por defecto ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Ventana de atribución por defecto</h2>
        <p className="text-xs text-gray-500 mb-4">
          Cuántos días antes de la compra se considera que un canal influyó en la venta.
          Esta es la <strong>ventana base</strong> — todos los canales la heredan a menos que les definas
          una ventana específica más abajo.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {VALID_GLOBAL_WINDOWS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDraft({ ...draft, attributionWindowDays: d })}
              className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                draft.attributionWindowDays === d
                  ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {/* ─── 4) Ventanas por canal ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Ventanas por canal</h2>
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Override</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Cada canal usa la <strong>ventana por defecto ({draft.attributionWindowDays} días)</strong> a
          menos que le definas una específica. Ej: email puede tener 60 días (ciclos largos) mientras
          TikTok mantiene 7 (impulsivo).
        </p>
        <div className="space-y-2">
          {CHANNELS.map((ch) => {
            const override = draft.channelWindows[ch.id] ?? null;
            const isOverride = override !== null;
            return (
              <div key={ch.id} className="flex items-center gap-3 py-1.5">
                <div className="w-44 flex items-center gap-2.5">
                  <ChannelLogo source={ch.id} size={26} />
                  <span className="text-xs font-medium text-gray-800">{ch.label}</span>
                </div>
                <div className="flex-1" />
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                    isOverride
                      ? "bg-violet-100 text-violet-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {isOverride ? `Custom · ${override}d` : `Hereda · ${draft.attributionWindowDays}d`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChannelWindow(ch.id, null)}
                    className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${
                      !isOverride
                        ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    Por defecto
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={override ?? ""}
                    placeholder="Custom"
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v === null) setChannelWindow(ch.id, null);
                      else if (v >= 1 && v <= 90) setChannelWindow(ch.id, v);
                    }}
                    className={`w-20 px-2 py-1 border rounded-md text-xs text-center tabular-nums outline-none transition-all ${
                      isOverride
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-gray-200 text-gray-500"
                    }`}
                  />
                  <span className="text-[11px] text-gray-400 w-8">días</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Footer: save ─── */}
      <div className="sticky bottom-4 bg-white rounded-2xl border border-gray-200 p-4 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-500">{error}</span>}
          {savedAt && Date.now() - savedAt < 4000 && (
            <span className="text-xs text-emerald-600 font-medium">✓ Cambios guardados</span>
          )}
          {!error && !savedAt && isDirty && (
            <span className="text-xs text-amber-600 font-medium">Cambios sin guardar</span>
          )}
          {!error && !isDirty && !savedAt && (
            <span className="text-xs text-gray-400">Sin cambios pendientes</span>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || !weightsValid || saving}
          className={`px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all ${
            isDirty && weightsValid && !saving
              ? "bg-cyan-600 hover:bg-cyan-700 shadow"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
