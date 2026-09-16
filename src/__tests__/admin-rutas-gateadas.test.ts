import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { readdirSync } from "fs";

// ══════════════════════════════════════════════════════════════════════════
// Toda página bajo /admin y /control tiene que tener un guard de staff arriba
// ══════════════════════════════════════════════════════════════════════════
// Encontrado el 2026-09-06 haciendo R-C05: `src/app/admin/layout.tsx` gatea por
// `isInternalUser()` todo lo que cuelga de `src/app/admin/*`, pero
// `/admin/onboardings` vive en `src/app/(app)/admin/onboardings/` — otro grupo
// de rutas, otra cadena de layouts, sin guard. Desde la URL los dos `/admin` se
// ven como uno solo, y por eso el agujero pasó desapercibido.
//
// Este test no mira UNA ruta: recorre el árbol y exige que cada página bajo un
// segmento `admin` o `control` tenga un layout con guard en alguno de sus
// ancestros. Si mañana alguien agrega `src/app/(loquesea)/admin/x/page.tsx`,
// falla acá y no en producción.
// ══════════════════════════════════════════════════════════════════════════

const APP = join(process.cwd(), "src", "app");

/** Segmentos de URL reales: los grupos `(x)` no cuentan como ruta. */
function segmentosDeUrl(rel: string): string[] {
  return rel
    .split(/[\/]/)
    .slice(0, -1)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
}

/**
 * El archivo sin comentarios.
 *
 * Sin esto, un layout que sólo MENCIONA `isInternalUser` —en un TODO, o en un
 * comentario explicando que todavía falta ponerlo— contaba como gateado. Es el
 * mismo error que ya apareció tres veces en esta branch: el test leyendo prosa
 * en vez de código (#S61 en ERRORES_CLAUDE_NO_REPETIR.md).
 */
function sinComentarios(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
    })
    .join("\n");
}

function tieneGuardDeStaff(archivo: string): boolean {
  if (!existsSync(archivo)) return false;
  const src = sinComentarios(readFileSync(archivo, "utf8"));
  // ⚠️ NO ALCANZA CON QUE APAREZCA: el resultado tiene que CORTAR.
  //
  // Antes esto era `src.includes("isInternalUser")`. Verificado por
  // mutación: cambiando `if (!allowed) notFound()` por `void allowed`, el
  // test quedaba **verde** con el layout completamente abierto. Y un archivo
  // que sólo importa el helper también contaba.
  //
  // Se pide la llamada Y una salida que corte. Lo sólido de verdad sería
  // renderizar el layout con `isInternalUser` mockeado en `false` y exigir
  // que tire — pero eso necesita el stack de React, y esto ya distingue el
  // caso que importa.
  const llama = /\b(isInternalUser|isStaffUser)\s*\(/.test(src);
  const corta = /\b(notFound|redirect|forbidden|unauthorized)\s*\(/.test(src);
  return llama && corta;
}

/** Recorre de la carpeta de la página hacia arriba buscando un layout con guard. */
function algunAncestroGatea(rel: string): boolean {
  const partes = rel.split(/[\/]/).slice(0, -1);
  for (let i = partes.length; i > 0; i--) {
    const dir = join(APP, ...partes.slice(0, i));
    if (tieneGuardDeStaff(join(dir, "layout.tsx"))) return true;
  }
  return false;
}

/** Todas las page.tsx bajo src/app, con ruta relativa a APP. */
function todasLasPaginas(dir = APP, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...todasLasPaginas(join(dir, e.name), r));
    else if (e.name === "page.tsx") out.push(r);
  }
  return out;
}

const paginas = todasLasPaginas().filter((rel) => {
  const segs = segmentosDeUrl(rel);
  return segs.includes("admin") || segs.includes("control");
});

describe("páginas internas bajo /admin y /control", () => {
  it("hay páginas para revisar (si esto falla, el glob se rompió)", () => {
    expect(paginas.length).toBeGreaterThan(0);
  });

  it.each(paginas)("%s tiene un layout con guard de staff en algún ancestro", (rel) => {
    expect(algunAncestroGatea(rel)).toBe(true);
  });
});
