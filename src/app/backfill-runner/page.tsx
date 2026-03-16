// ══════════════════════════════════════════════════════════════
// Backfill Runner — Auto-executes all phases sequentially
// ══════════════════════════════════════════════════════════════
// Route: /backfill-runner (public page, but backfill API is key-protected)
// Opens in browser, runs all batches automatically with visual progress.

"use client";

import React, { useState, useRef, useCallback } from "react";

const BACKFILL_KEY = "nitrosales-backfill-2024";
const API_BASE = "/api/backfill/vtex";

interface BatchResult {
  phase: string;
  batch: number;
  processed?: number;
  updated?: number;
  saved?: number;
  total?: number;
  totalProducts?: number;
  processedSoFar?: number;
  totalOrdersInMonth?: number;
  month?: string;
  done: boolean;
  message: string;
  errors?: string[];
  nextBatch?: number | null;
}

interface PhaseStatus {
  phase: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  currentBatch: number;
  totalBatches: number | null;
  processed: number;
  total: number;
  errors: string[];
  startedAt: Date | null;
  finishedAt: Date | null;
}

export default function BackfillRunnerPage() {
  const [phases, setPhases] = useState<PhaseStatus[]>([
    { phase: "catalog", label: "Catálogo de Productos (actualizar marcas y categorías)", status: "pending", currentBatch: 0, totalBatches: null, processed: 0, total: 0, errors: [], startedAt: null, finishedAt: null },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const abortRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString("es-AR");
    setLogs(prev => [...prev, `[${time}] ${msg}`]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const updatePhase = useCallback((phase: string, updates: Partial<PhaseStatus>) => {
    setPhases(prev => prev.map(p => p.phase === phase ? { ...p, ...updates } : p));
  }, []);

  const runBatch = async (phase: string, batch: number): Promise<BatchResult | null> => {
    const url = `${API_BASE}?phase=${phase}&batch=${batch}&key=${BACKFILL_KEY}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (e: any) {
      addLog(`❌ Error en ${phase} batch ${batch}: ${e.message}`);
      return null;
    }
  };

  const runPhase = async (phase: string) => {
    updatePhase(phase, { status: "running", startedAt: new Date() });
    addLog(`🚀 Iniciando fase: ${phase.toUpperCase()}`);

    let batch = 0;
    let consecutiveErrors = 0;

    while (!abortRef.current) {
      // Check if paused
      while (isPaused && !abortRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (abortRef.current) break;

      const result = await runBatch(phase, batch);

      if (!result) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          addLog(`⛔ 3 errores consecutivos en ${phase}. Abortando fase.`);
          updatePhase(phase, { status: "error", finishedAt: new Date() });
          return false;
        }
        addLog(`⚠️ Reintentando batch ${batch}...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      consecutiveErrors = 0;

      // Update phase status
      const processed = result.processedSoFar || result.processed || 0;
      const total = result.totalProducts || result.total || result.totalOrdersInMonth || 0;
      const errors = result.errors || [];

      updatePhase(phase, {
        currentBatch: batch,
        processed: phase === "orders" ? batch + 1 : processed,
        total: phase === "orders" ? 24 : total,
        errors: errors,
      });

      addLog(`✅ ${result.message}`);

      if (result.done) {
        updatePhase(phase, { status: "done", finishedAt: new Date() });
        addLog(`🎉 Fase ${phase.toUpperCase()} completada!`);
        return true;
      }

      batch = result.nextBatch ?? batch + 1;

      // Small delay between batches to be nice to the server
      await new Promise(r => setTimeout(r, 500));
    }

    return false;
  };

  const startBackfill = async () => {
    setIsRunning(true);
    abortRef.current = false;
    setLogs([]);
    addLog("═══════════════════════════════════════");
    addLog("  NITROSALES — Re-sync Catálogo (marcas y categorías)");
    addLog("═══════════════════════════════════════");

    const phaseOrder = ["catalog"];

    for (const phase of phaseOrder) {
      if (abortRef.current) break;
      const success = await runPhase(phase);
      if (!success && phase !== "orders") {
        addLog(`⚠️ Fase ${phase} falló. Continuando con la siguiente...`);
      }
    }

    addLog("═══════════════════════════════════════");
    addLog("  BACKFILL FINALIZADO");
    addLog("═══════════════════════════════════════");
    setIsRunning(false);
  };

  const stopBackfill = () => {
    abortRef.current = true;
    setIsRunning(false);
    addLog("⏹️ Backfill detenido por el usuario");
  };

  const formatDuration = (start: Date | null, end: Date | null) => {
    if (!start) return "—";
    const endTime = end || new Date();
    const diff = Math.floor((endTime.getTime() - start.getTime()) / 1000);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-blue-100 text-blue-800 border-blue-300";
      case "done": return "bg-green-100 text-green-800 border-green-300";
      case "error": return "bg-red-100 text-red-800 border-red-300";
      default: return "bg-gray-100 text-gray-600 border-gray-300";
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case "running": return "⏳";
      case "done": return "✅";
      case "error": return "❌";
      default: return "⏸️";
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "2rem", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#1e293b", margin: 0 }}>
            NitroSales — Re-sync Catálogo VTEX
          </h1>
          <p style={{ color: "#64748b", marginTop: "0.25rem" }}>
            Actualización de marcas y categorías para todos los productos (~28,861)
          </p>
        </div>

        {/* Controls */}
        <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.75rem" }}>
          {!isRunning ? (
            <button
              onClick={startBackfill}
              style={{
                padding: "0.75rem 2rem", background: "#4f46e5", color: "white",
                border: "none", borderRadius: "0.5rem", fontWeight: "600",
                cursor: "pointer", fontSize: "1rem"
              }}
            >
              ▶️ Iniciar Re-sync Catálogo
            </button>
          ) : (
            <button
              onClick={stopBackfill}
              style={{
                padding: "0.75rem 2rem", background: "#ef4444", color: "white",
                border: "none", borderRadius: "0.5rem", fontWeight: "600",
                cursor: "pointer", fontSize: "1rem"
              }}
            >
              ⏹️ Detener
            </button>
          )}
        </div>

        {/* Phase Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
          {phases.map((p) => (
            <div
              key={p.phase}
              className={getStatusColor(p.status)}
              style={{
                padding: "1rem 1.25rem", borderRadius: "0.75rem",
                border: "1px solid", display: "flex", alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ fontWeight: "600", fontSize: "1rem" }}>
                  {getStatusEmoji(p.status)} {p.label}
                </div>
                {p.status === "running" && (
                  <div style={{ fontSize: "0.85rem", marginTop: "0.25rem", opacity: 0.8 }}>
                    Batch {p.currentBatch} — {p.processed.toLocaleString()} / {p.total > 0 ? p.total.toLocaleString() : "?"} procesados
                  </div>
                )}
                {p.status === "done" && (
                  <div style={{ fontSize: "0.85rem", marginTop: "0.25rem", opacity: 0.8 }}>
                    {p.processed.toLocaleString()} procesados en {formatDuration(p.startedAt, p.finishedAt)}
                  </div>
                )}
              </div>
              {p.status !== "pending" && (
                <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                  {formatDuration(p.startedAt, p.status === "running" ? null : p.finishedAt)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Log Console */}
        <div style={{
          background: "#1e293b", borderRadius: "0.75rem", padding: "1rem",
          maxHeight: "400px", overflowY: "auto", fontFamily: "monospace",
          fontSize: "0.8rem", lineHeight: "1.6"
        }}>
          <div style={{ color: "#94a3b8", marginBottom: "0.5rem" }}>Logs:</div>
          {logs.length === 0 ? (
            <div style={{ color: "#475569" }}>Presioná "Iniciar Re-sync Catálogo" para comenzar...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} style={{ color: log.includes("❌") || log.includes("⛔") ? "#f87171" : log.includes("✅") || log.includes("🎉") ? "#4ade80" : log.includes("🚀") || log.includes("═") ? "#60a5fa" : "#e2e8f0" }}>
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Footer */}
        <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#94a3b8", textAlign: "center" }}>
          Podés dejar esta página abierta mientras corre. No cierres el navegador.
          <br />
          El proceso puede tardar entre 30 minutos y 2 horas dependiendo de la cantidad de datos.
        </div>
      </div>
    </div>
  );
}
