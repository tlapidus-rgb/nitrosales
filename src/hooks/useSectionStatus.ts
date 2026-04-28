"use client";

// ══════════════════════════════════════════════════════════════
// useSectionStatus
// ══════════════════════════════════════════════════════════════
// Hook que pollea /api/me/section-status y devuelve el mapa de
// status por sección. Cachea en módulo para evitar refetch en
// cada componente (el hook lo comparte entre instancias).
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";

export type SectionStatus = "ACTIVE" | "LOCKED_INTEGRATION" | "MAINTENANCE" | "LOADING";

interface SectionStatusMap {
  [key: string]: { status: SectionStatus; missing: string[] };
}

let cachedData: { sections: SectionStatusMap; connected: string[]; fetchedAt: number } | null = null;
let inflight: Promise<any> | null = null;
const CACHE_TTL_MS = 30_000; // 30s

async function fetchSectionStatus(): Promise<{ sections: SectionStatusMap; connected: string[] }> {
  const now = Date.now();
  if (cachedData && now - cachedData.fetchedAt < CACHE_TTL_MS) {
    return { sections: cachedData.sections, connected: cachedData.connected };
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const r = await fetch("/api/me/section-status", { cache: "no-store" });
      const data = await r.json();
      if (data?.ok) {
        cachedData = {
          sections: data.sections || {},
          connected: data.connected || [],
          fetchedAt: Date.now(),
        };
      }
      return cachedData || { sections: {}, connected: [] };
    } catch {
      return { sections: {}, connected: [] };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function invalidateSectionStatusCache() {
  cachedData = null;
}

export function useSectionStatus(sectionKey?: string) {
  const [data, setData] = useState<{ sections: SectionStatusMap; connected: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSectionStatus().then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (sectionKey) {
    const entry = data?.sections?.[sectionKey];
    return {
      status: (entry?.status || (loading ? "LOADING" : "ACTIVE")) as SectionStatus,
      missing: entry?.missing || [],
      connected: data?.connected || [],
      loading,
    };
  }

  return {
    sections: data?.sections || {},
    connected: data?.connected || [],
    loading,
  };
}
