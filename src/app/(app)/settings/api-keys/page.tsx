// @ts-nocheck
"use client";

/**
 * /settings/api-keys — Fase 7 QA productivo
 * ─────────────────────────────────────────────────────────────
 * Gestion de tokens de API para integrar NitroSales con herramientas
 * externas (Zapier, n8n, scripts propios).
 *
 *   - Lista tokens activos (solo prefix visible + scopes + last used).
 *   - Crear nuevo: modal con name + scopes + expiresInDays.
 *   - Al crear, modal one-shot muestra el token completo UNA VEZ.
 *   - Revocar (soft delete con revokedAt).
 */

import React, { useEffect, useState } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  AlertTriangle,
  Gauge,
} from "lucide-react";

const ES = "cubic-bezier(0.16, 1, 0.3, 1)";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string } | null;
}

const AVAILABLE_SCOPES = [
  { value: "read:orders", label: "Leer órdenes" },
  { value: "read:customers", label: "Leer clientes" },
  { value: "read:products", label: "Leer productos" },
  { value: "read:finanzas", label: "Leer P&L y finanzas" },
  { value: "read:ads", label: "Leer campañas ads" },
  { value: "read:metrics", label: "Leer métricas" },
  { value: "write:manual-costs", label: "Escribir costos manuales" },
  { value: "write:scenarios", label: "Escribir escenarios" },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealedToken, setRevealedToken] = useState<{
    token: string;
    key: ApiKey;
  } | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/api-keys");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setKeys(json.keys ?? []);
    } catch (e: any) {
      showToast(e.message, "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const handleRevoke = async (k: ApiKey) => {
    if (
      !confirm(
        `¿Revocar la API key "${k.name}"? Cualquier integración usándola dejará de funcionar inmediatamente.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/settings/api-keys/${k.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast(`"${k.name}" revocada`);
      load();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

  const fmtDate = (iso: string | null): string => {
    if (!iso) return "Nunca";
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `Hace ${Math.max(1, mins)}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `Hace ${days}d`;
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-600" />
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                API Keys
              </h2>
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              Tokens para que Zapier, n8n o tus propios scripts consulten data
              de NitroSales. Cada token tiene scopes limitados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            style={{ transition: `all 160ms ${ES}` }}
          >
            <Plus className="h-3.5 w-3.5" />
            Crear API Key
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <Gauge className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <div className="text-[11px] text-slate-600 leading-relaxed">
            <strong>Rate limits:</strong> 1.000 requests/hora · 10K requests/día
            por token. Upgrade a Pro multiplica por 10.
          </div>
        </div>
      </div>

      {/* Lista de keys */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/50"
            />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/30 p-10 text-center">
          <KeyRound className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-4 text-sm font-semibold text-slate-700">
            Sin API keys todavía
          </h3>
          <p className="mt-1 text-[12px] text-slate-500">
            Creá la primera para empezar a integrar NitroSales con otras
            herramientas.
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Crear primera API Key
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k.id}
              className="rounded-2xl border border-slate-200 bg-white p-4"
              style={{
                boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-semibold tracking-tight text-slate-900">
                      {k.name}
                    </h3>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      {k.prefix}…
                    </code>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                    <span>
                      Creada:{" "}
                      <span className="font-medium text-slate-700">
                        {fmtDate(k.createdAt)}
                      </span>
                      {k.createdBy && ` por ${k.createdBy.name ?? k.createdBy.email}`}
                    </span>
                    <span>
                      Último uso:{" "}
                      <span className="font-medium text-slate-700">
                        {fmtDate(k.lastUsedAt)}
                      </span>
                    </span>
                    {k.expiresAt && (
                      <span>
                        Expira:{" "}
                        <span className="font-medium text-slate-700">
                          {new Date(k.expiresAt).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                    )}
                  </div>
                  {k.scopes && k.scopes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-600"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(k)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                  Revocar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <CreateKeyModal
          onClose={() => setCreateOpen(false)}
          onCreated={({ token, key }) => {
            setCreateOpen(false);
            setRevealedToken({ token, key });
            load();
          }}
        />
      )}

      {/* Revealed token modal (one-shot) */}
      {revealedToken && (
        <RevealedTokenModal
          token={revealedToken.token}
          apiKey={revealedToken.key}
          onClose={() => setRevealedToken(null)}
          onCopy={() => showToast("Token copiado")}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: toast.kind === "ok" ? "#10b981" : "#ef4444",
              boxShadow:
                toast.kind === "ok"
                  ? "0 0 8px rgba(16,185,129,0.7)"
                  : "0 0 8px rgba(239,68,68,0.7)",
              animation: "pulseDotKey 1.4s ease-in-out infinite",
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
        @keyframes pulseDotKey {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal: crear API key
// ─────────────────────────────────────────────────────────────
function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: { token: string; key: ApiKey }) => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read:metrics"]);
  const [expiresInDays, setExpiresInDays] = useState<string>("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const toggleScope = (s: string) => {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes,
          expiresInDays: Number(expiresInDays) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onCreated({ token: json.token, key: json.apiKey });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-700" />
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                Crear API Key
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700">
                Nombre (para identificarla después)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                placeholder="Ej: Zapier producción"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-700">
                Permisos (scopes)
              </label>
              <div className="mt-1.5 grid grid-cols-1 gap-1.5">
                {AVAILABLE_SCOPES.map((s) => {
                  const active = scopes.includes(s.value);
                  return (
                    <label
                      key={s.value}
                      className="flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition"
                      style={{
                        borderColor: active
                          ? "rgba(15,23,42,0.25)"
                          : "rgba(226,232,240,1)",
                        background: active ? "rgba(15,23,42,0.02)" : "white",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleScope(s.value)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      <span className="text-[11px] font-mono text-slate-600">
                        {s.value}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-500">
                        {s.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-slate-700">
                Expiración
              </label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
              >
                <option value="0">Nunca expira</option>
                <option value="30">30 días</option>
                <option value="90">90 días</option>
                <option value="365">1 año</option>
              </select>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!name || scopes.length === 0 || submitting}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {submitting ? "Creando…" : "Crear"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal one-shot: mostrar token recién creado
// ─────────────────────────────────────────────────────────────
function RevealedTokenModal({
  token,
  apiKey,
  onClose,
  onCopy,
}: {
  token: string;
  apiKey: ApiKey;
  onClose: () => void;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      onCopy();
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.5) 50%, transparent 100%)",
          }}
        />
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: "rgba(245,158,11,0.10)",
                color: "#d97706",
                border: "1px solid rgba(245,158,11,0.22)",
              }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                Copiá tu token ahora
              </h3>
              <p className="mt-1 text-[12px] text-amber-700 leading-relaxed">
                <strong>Por seguridad no te lo vamos a volver a mostrar.</strong>{" "}
                Guardalo en tu manager de passwords o en el config de la
                herramienta que lo va a usar.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {apiKey.name}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[12px] text-slate-900">
                {token}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-[11px] font-semibold shadow-sm transition ${
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Ya lo guardé, cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
