import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { selfFetchBaseUrl, selfFetchHeaders } from "@/lib/self-fetch";

// ══════════════════════════════════════════════════════════════════════════
// Un deployment de PREVIEW no puede pegarle a PRODUCCIÓN
// ══════════════════════════════════════════════════════════════════════════
// INCIDENTE REAL (2026-09-06). Probando la branch `fix/expansion-gate-e0` en su
// preview, el paso `reconcile` de `sync/chain` corrió CONTRA PRODUCCIÓN:
// desactivó 12 productos y repuntó 730 order items en la base de prod.
//
// Causa: siete rutas armaban la URL para llamarse a sí mismas así:
//     const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai";
// `NEXTAUTH_URL` está configurada en Vercel para **All Environments** con el
// valor de producción, y el fallback también es producción. Así que el preview
// salía a producción aunque Neon le hubiera creado su propia base.
//
// Esto invalidaba la premisa de "probamos en preview antes de mergear": para
// cualquier camino que se auto-invoque (crons encadenados, runner de backfill,
// trigger de sync), preview NO estaba aislado.
// ══════════════════════════════════════════════════════════════════════════

const PROD = "https://app.nitrosales.ai";
const ORIGIN_PREVIEW = "https://nitrosales-41q1xaje3-tlapidus-rgbs-projects.vercel.app";

const guardado = { ...process.env };
beforeEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  process.env.NEXTAUTH_URL = PROD;
});
afterEach(() => {
  process.env = { ...guardado };
});

describe("selfFetchBaseUrl — producción", () => {
  it("usa NEXTAUTH_URL, que es lo que evita el 401 de Deployment Protection", () => {
    // Cuando dispara Vercel Cron, el origin del request es la URL del deployment,
    // que está protegida. Por eso producción NO usa el origin. (R-C14)
    process.env.VERCEL_ENV = "production";
    expect(selfFetchBaseUrl("https://nitrosales-abc123.vercel.app")).toBe(PROD);
  });

  it("sin NEXTAUTH_URL cae al origin antes que a un literal", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.NEXTAUTH_URL;
    expect(selfFetchBaseUrl("https://app.nitrosales.ai")).toBe(PROD);
  });
});

describe("selfFetchBaseUrl — preview (el bug)", () => {
  it("EL BUG: con la lógica vieja, preview salía a producción", () => {
    // Así se armaba antes en las 7 rutas. Se deja escrito para que se vea por qué
    // el fix no es cosmético.
    const logicaVieja = process.env.NEXTAUTH_URL || PROD;
    expect(logicaVieja).toBe(PROD);
  });

  it("con el origin del preview, se queda en el preview", () => {
    process.env.VERCEL_ENV = "preview";
    expect(selfFetchBaseUrl(ORIGIN_PREVIEW)).toBe(ORIGIN_PREVIEW);
  });

  it("SIN origin (crons que no tienen request), usa la URL del propio deployment", () => {
    // Es el caso de `backfill-runner` y `post-backfill-finalize`: no le pasan
    // origin. Antes caían al literal de producción — el más peligroso de todos,
    // porque son los que disparan backfills masivos.
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_BRANCH_URL = "nitrosales-git-fix-expansion.vercel.app";
    expect(selfFetchBaseUrl()).toBe("https://nitrosales-git-fix-expansion.vercel.app");
  });

  it("cae a VERCEL_URL si no hay VERCEL_BRANCH_URL", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "nitrosales-41q1xaje3.vercel.app";
    expect(selfFetchBaseUrl()).toBe("https://nitrosales-41q1xaje3.vercel.app");
  });

  it("NUNCA devuelve producción en preview, pase lo que pase", () => {
    process.env.VERCEL_ENV = "preview";
    // Ni con NEXTAUTH_URL apuntando a prod y sin ninguna otra señal…
    process.env.VERCEL_BRANCH_URL = "preview-x.vercel.app";
    expect(selfFetchBaseUrl()).not.toBe(PROD);
    expect(selfFetchBaseUrl(ORIGIN_PREVIEW)).not.toBe(PROD);
  });
});

describe("selfFetchBaseUrl — local", () => {
  it("sin señales de Vercel, usa localhost", () => {
    delete process.env.NEXTAUTH_URL;
    expect(selfFetchBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("selfFetchHeaders", () => {
  it("manda el bypass cuando el secreto está configurado", () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "xxx";
    expect(selfFetchHeaders()).toEqual({ "x-vercel-protection-bypass": "xxx" });
  });

  it("sin secreto no manda nada (local no lo necesita)", () => {
    expect(selfFetchHeaders()).toBeUndefined();
  });
});

describe("GUARD — ninguna ruta vuelve a hardcodear el dominio de producción", () => {
  // Sólo se busca `baseUrl`, que es la convención del repo para "URL a la que me
  // llamo a mí mismo". `appUrl` está exento a propósito: se usa para armar LINKS
  // dentro de mails (control-alerts, influencer-summary), y ahí apuntar a
  // producción es lo correcto — a un cliente no le podés mandar un link a un
  // preview efímero.
  it("ninguna ruta arma un `baseUrl` de self-fetch apuntando a producción", async () => {
    const { readdirSync, statSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raiz = join(process.cwd(), "src", "app", "api");
    const malos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (e === "route.ts") {
          const src = readFileSync(p, "utf8");
          if (
            src.includes(
              'const baseUrl = process.env.NEXTAUTH_URL || "https://app.nitrosales.ai"'
            )
          ) {
            malos.push(p.replace(process.cwd(), ""));
          }
        }
      }
    };
    recorrer(join(raiz, "cron"));
    recorrer(join(raiz, "sync"));
    expect(malos, `estas rutas le pegarían a producción desde un preview:\n${malos.join("\n")}`).toEqual([]);
  });
});
