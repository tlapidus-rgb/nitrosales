// ══════════════════════════════════════════════════════════════════════════
// dependency-cruiser — Fase 1.5 (domainización, boundary lint)
// ══════════════════════════════════════════════════════════════════════════
// S1 del docs/FASE-1.5-SPEC.md: MEDIR el grafo real antes de mover nada.
// Ambas reglas arrancan en `severity: "warn"` — NO rompen el build todavía.
// El ratchet a "error" (por dominio ya migrado) es S5, y solo después de que
// S4 lleve los ciclos a 0.
//
// Uso: npm run cruise   (o node_modules/.bin/depcruise src --config .dependency-cruiser.js)
// ══════════════════════════════════════════════════════════════════════════

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment:
        "Dependencia circular. ROMPE el build (S5, tras S4 dejar el grafo en 0). " +
        "Cualquier ciclo nuevo falla el preview de Vercel.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-domain-deep",
      comment:
        "Un dominio (src/domains/X) solo puede importar OTRO dominio por su barrel " +
        "(src/domains/Y/index.ts), nunca sus archivos internos. Mantiene las fronteras. " +
        "No dispara hasta que S2/S3 creen src/domains/.",
      severity: "warn",
      from: { path: "^src/domains/([^/]+)/" },
      to: {
        path: "^src/domains/([^/]+)/",
        pathNot: [
          "^src/domains/$1/", // mismo dominio: OK
          "^src/domains/[^/]+/index\\.(ts|tsx)$", // importar un barrel: OK
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.(test|spec)\\.(ts|tsx)$" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    },
  },
};
