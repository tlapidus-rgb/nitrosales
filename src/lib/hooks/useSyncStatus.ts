"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const STALE_MS = 30 * 60 * 1000; // 30 min
const POLL_INTERVAL_MS = 5_000; // 5s
const POLL_TIMEOUT_MS = 2.5 * 60 * 1000; // 2.5 min max polling

type Platform = "META_ADS" | "GOOGLE_ADS";
type TriggerKey = "META" | "GOOGLE";

const TRIGGER_MAP: Record<Platform, TriggerKey> = {
  META_ADS: "META",
  GOOGLE_ADS: "GOOGLE",
};

interface SyncStatus {
  /** ISO timestamp of last sync */
  lastSyncAt: string | null;
  /** Whether a background sync is currently running */
  isSyncing: boolean;
  /** Error message if sync failed */
  syncError: string | null;
  /** Trigger a manual sync */
  triggerSync: () => void;
  /** Callback to run when sync completes (for data refresh) */
  onSyncComplete: (cb: () => void) => void;
}

export function useSyncStatus(platform: Platform): SyncStatus {
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);
  const syncStartRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const checkStatus = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/sync/status");
      if (!res.ok) return null;
      const data = await res.json();
      const conn = data.connections?.[platform];
      const syncAt = conn?.lastSyncAt || null;
      if (mountedRef.current) setLastSyncAt(syncAt);
      return syncAt;
    } catch {
      return null;
    }
  }, [platform]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    const startTime = Date.now();
    pollRef.current = setInterval(async () => {
      // Timeout safety
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (mountedRef.current) {
          setIsSyncing(false);
          setSyncError("La sincronización tardó demasiado");
        }
        return;
      }

      const currentSync = await checkStatus();
      // Sync completed if lastSyncAt changed from what it was when we started
      if (currentSync && syncStartRef.current && currentSync !== syncStartRef.current) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (mountedRef.current) {
          setIsSyncing(false);
          setSyncError(null);
          onCompleteRef.current?.();
        }
      }
    }, POLL_INTERVAL_MS);
  }, [checkStatus]);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    const triggerKey = TRIGGER_MAP[platform];

    try {
      setIsSyncing(true);
      setSyncError(null);
      syncStartRef.current = lastSyncAt;

      const res = await fetch(`/api/sync/trigger?platform=${triggerKey}`, {
        method: "POST",
      });
      const data = await res.json();

      if (!data.ok) {
        setIsSyncing(false);
        setSyncError(data.error || "Error al iniciar sync");
        return;
      }

      if (!data.syncStarted) {
        // Sync was skipped (recently synced or locked)
        setIsSyncing(false);
        return;
      }

      // Sync started — poll for completion
      startPolling();
    } catch (err: any) {
      if (mountedRef.current) {
        setIsSyncing(false);
        setSyncError(err.message);
      }
    }
  }, [platform, isSyncing, lastSyncAt, startPolling]);

  // On mount: solo chequear lastSyncAt (NO auto-disparar sync).
  // Los datos los refrescan los crons (hourly + daily). El usuario
  // tiene un boton manual disponible via triggerSync() si necesita
  // forzar refresh.
  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSyncComplete = useCallback((cb: () => void) => {
    onCompleteRef.current = cb;
  }, []);

  return { lastSyncAt, isSyncing, syncError, triggerSync, onSyncComplete };
}
