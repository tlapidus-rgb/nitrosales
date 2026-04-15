"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * Contexto global para que cada página publique qué está mostrando,
 * y el FloatingAurum pueda responder preguntas contextuales.
 */

export type AurumPageContext = {
  // Identificador canónico. Ej: "seo.overview", "campaigns.google", etc.
  section: string;
  // Label human-readable que se muestra en el panel. Ej: "Panorama SEO".
  contextLabel: string;
  // Datos compactos de la página/sección. Deben ser JSON-serializables.
  contextData: any;
  // Sugerencias iniciales (chips) para arrancar la conversación.
  suggestions?: string[];
};

type AurumContextValue = {
  ctx: AurumPageContext | null;
  setPageContext: (v: AurumPageContext | null) => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  isOpen: boolean;
};

const AurumCtx = createContext<AurumContextValue | null>(null);

export function AurumProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<AurumPageContext | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const setPageContext = useCallback((v: AurumPageContext | null) => {
    setCtx(v);
  }, []);

  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);
  const togglePanel = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo<AurumContextValue>(
    () => ({ ctx, setPageContext, openPanel, closePanel, togglePanel, isOpen }),
    [ctx, setPageContext, openPanel, closePanel, togglePanel, isOpen]
  );

  return <AurumCtx.Provider value={value}>{children}</AurumCtx.Provider>;
}

export function useAurumContext() {
  const v = useContext(AurumCtx);
  if (!v) {
    // Soft fallback para que páginas no se rompan si no hay provider.
    return {
      ctx: null,
      setPageContext: () => {},
      openPanel: () => {},
      closePanel: () => {},
      togglePanel: () => {},
      isOpen: false,
    } as AurumContextValue;
  }
  return v;
}

/**
 * Hook para publicar el contexto de la página actual.
 * Se encarga de setear y limpiar al desmontar.
 */
export function useAurumPageContext(
  ctx: AurumPageContext | null,
  deps: any[] = []
) {
  const { setPageContext } = useAurumContext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    setPageContext(ctx);
    return () => setPageContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
