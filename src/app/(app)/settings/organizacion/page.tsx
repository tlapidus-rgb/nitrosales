// @ts-nocheck
"use client";

/**
 * /settings/organizacion — Fase 7c
 * ─────────────────────────────────────────────────────────────
 * Form para editar datos de la organizacion:
 *   - name (display name, ej "Arredo")
 *   - slug (URL-safe, ej "arredo")
 *   - whiteLabel.logoUrl (image upload → dataURL ≤ 150KB)
 *   - whiteLabel.primaryColor (hex, futuro override del accent)
 *   - whiteLabel.industry (Toys / Home / Fashion / etc.)
 *   - whiteLabel.timezone (IANA, default America/Argentina/Buenos_Aires)
 *   - whiteLabel.domain (custom domain preview, informativo)
 *
 * Layout: dos cards (Basicos + White-label) con save individual.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Image as ImageIcon,
  Palette,
  Clock,
  Globe,
  Save,
  Upload,
  Check,
  X,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

const INDUSTRIES = [
  "Toys",
  "Home & Decor",
  "Fashion",
  "Electronics",
  "Beauty",
  "Food & Beverage",
  "Sports",
  "Books",
  "Health",
  "Pet",
  "Otros",
];

const TIMEZONES = [
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { value: "America/Argentina/Cordoba", label: "Argentina (Córdoba)" },
  { value: "America/Santiago", label: "Chile (Santiago)" },
  { value: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { value: "America/Mexico_City", label: "México (CDMX)" },
];

interface OrgData {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  whiteLabel: {
    logoUrl: string | null;
    primaryColor: string | null;
    industry: string | null;
    timezone: string | null;
    domain: string | null;
  };
}

export default function OrganizacionPage() {
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState<string>("#0ea5e9");
  const [industry, setIndustry] = useState<string>("");
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [domain, setDomain] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/organization");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as OrgData;
      setData(json);
      setName(json.name);
      setSlug(json.slug);
      setLogoUrl(json.whiteLabel.logoUrl ?? null);
      setPrimaryColor(json.whiteLabel.primaryColor ?? "#0ea5e9");
      setIndustry(json.whiteLabel.industry ?? "");
      setTimezone(json.whiteLabel.timezone ?? "America/Argentina/Buenos_Aires");
      setDomain(json.whiteLabel.domain ?? "");
    } catch (e: any) {
      setToast({ msg: e.message || "Error cargando datos", kind: "err" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogoUpload = (file: File) => {
    if (file.size > 150_000) {
      showToast("El logo debe pesar menos de 150KB", "err");
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("Solo imágenes (PNG, JPG, SVG)", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const saveBasic = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast("Datos básicos guardados");
      await load();
    } catch (e: any) {
      showToast(e.message || "Error guardando", "err");
    } finally {
      setSaving(false);
    }
  };

  const saveWhiteLabel = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whiteLabel: {
            logoUrl,
            primaryColor,
            industry: industry || null,
            timezone,
            domain: domain || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast("Marca y preferencias guardadas");
      await load();
    } catch (e: any) {
      showToast(e.message || "Error guardando", "err");
    } finally {
      setSaving(false);
    }
  };

  const basicDirty = useMemo(() => {
    if (!data) return false;
    return name !== data.name || slug !== data.slug;
  }, [data, name, slug]);

  const whiteLabelDirty = useMemo(() => {
    if (!data) return false;
    return (
      (logoUrl ?? null) !== (data.whiteLabel.logoUrl ?? null) ||
      primaryColor !== (data.whiteLabel.primaryColor ?? "#0ea5e9") ||
      (industry || "") !== (data.whiteLabel.industry ?? "") ||
      timezone !== (data.whiteLabel.timezone ?? "America/Argentina/Buenos_Aires") ||
      (domain || "") !== (data.whiteLabel.domain ?? "")
    );
  }, [data, logoUrl, primaryColor, industry, timezone, domain]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50" />
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Card 1 — Básicos */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cyan-600" />
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Datos básicos
          </h2>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          El nombre aparece en los PDFs exportados y en la barra lateral.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Nombre" hint="Cómo se llama tu empresa.">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              placeholder="Ej: Arredo"
            />
          </FormField>
          <FormField
            label="Slug (URL)"
            hint="Se usa en URLs internas. Solo letras, números y guiones."
          >
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-slate-400">nitrosales.app/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={60}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                placeholder="arredo"
              />
            </div>
          </FormField>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Plan actual:{" "}
            <span className="font-semibold text-slate-700">{data?.plan}</span>
          </div>
          <button
            type="button"
            disabled={!basicDirty || saving}
            onClick={saveBasic}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ transition: `all 160ms ${ES}` }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando…" : "Guardar datos básicos"}
          </button>
        </div>
      </div>

      {/* Card 2 — White-label */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-violet-600" />
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Marca y preferencias
          </h2>
        </div>
        <p className="mt-1 text-[12px] text-slate-500">
          Personalizá cómo se ve NitroSales para tu equipo.
        </p>

        <div className="mt-4 space-y-5">
          <FormField label="Logo" hint="PNG o SVG, máx 150KB. Aparece arriba a la izquierda.">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden"
                style={{ transition: `all 160ms ${ES}` }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-6 w-6 text-slate-300" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
                  <Upload className="h-3.5 w-3.5" />
                  {logoUrl ? "Cambiar" : "Subir logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoUpload(f);
                    }}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl(null)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                  >
                    <X className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </FormField>

          <FormField
            label="Color principal"
            hint="Se usa en badges y acentos (preview visible en Pulso)."
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                maxLength={7}
                className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <div className="flex items-center gap-1.5">
                {["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#0f172a"].map(
                  (c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPrimaryColor(c)}
                      className="h-6 w-6 rounded-lg border-2 transition"
                      style={{
                        background: c,
                        borderColor: primaryColor.toLowerCase() === c ? c : "transparent",
                        boxShadow:
                          primaryColor.toLowerCase() === c
                            ? `0 0 0 2px ${c}33`
                            : "none",
                      }}
                      aria-label={c}
                    />
                  )
                )}
              </div>
            </div>
          </FormField>

          <FormField label="Industria" hint="Para recomendaciones específicas.">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              <option value="">— Seleccionar —</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                Zona horaria
              </span>
            }
            hint="Afecta vencimientos fiscales, reportes y alertas."
          >
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label={
              <span className="inline-flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                Dominio custom{" "}
                <span className="text-[10px] font-normal text-slate-400">
                  (informativo)
                </span>
              </span>
            }
            hint="Si querés tu app en un dominio propio, pasalo por acá y lo configuramos."
          >
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              maxLength={80}
              className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              placeholder="app.arredo.com"
            />
          </FormField>
        </div>

        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            disabled={!whiteLabelDirty || saving}
            onClick={saveWhiteLabel}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ transition: `all 160ms ${ES}` }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando…" : "Guardar marca"}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
          style={{
            boxShadow:
              "0 10px 40px -10px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.08)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: toast.kind === "ok" ? "#10b981" : "#ef4444",
              boxShadow:
                toast.kind === "ok"
                  ? "0 0 8px rgba(16,185,129,0.7)"
                  : "0 0 8px rgba(239,68,68,0.7)",
              animation: "pulseDot 1.4s ease-in-out infinite",
            }}
          />
          {toast.kind === "ok" ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <X className="h-3.5 w-3.5 text-rose-400" />
          )}
          {toast.msg}
        </div>
      )}

      <style jsx global>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-slate-700">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
