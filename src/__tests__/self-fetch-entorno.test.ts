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

describe("GUARD — el origin no puede venir de un header que manda el cliente", () => {
  // R-05 (2026-09-15). El arreglo del incidente del 2026-09-06 hizo que cada
  // ruta resolviera su origen real con
  // `selfFetchBaseUrl(req.headers.get("origin"))`.
  //
  // `Origin` es un header que manda el navegador: **lo controla quien hace el
  // request**. Y en no-producción `selfFetchBaseUrl` hace `if (origin) return
  // origin` sin validar nada. Un staff logueado que abriera una página hostil
  // hacía que el server se auto-invocara contra el host del atacante, con
  // `ADMIN_API_KEY` en la querystring.
  //
  // `req.nextUrl.origin` deriva del Host, que Vercel valida antes de rutear —
  // y es lo que el JSDoc de `selfFetchBaseUrl` documentó desde el principio.
  // Seis de los ocho call sites pasaban otra cosa.
  it("nadie le pasa a selfFetchBaseUrl un header del request", async () => {
    const { readdirSync, statSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const malos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (e === "route.ts") {
          const src = readFileSync(p, "utf8")
            .split(/\r?\n/)
            .filter((l) => {
              const t = l.trim();
              return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
            })
            .join("\n");
          if (/selfFetchBaseUrl\s*\(\s*req\.headers\.get/.test(src)) {
            malos.push(p.replace(process.cwd(), ""));
          }
        }
      }
    };
    recorrer(join(process.cwd(), "src", "app", "api"));
    expect(
      malos,
      `estas rutas dejan que el cliente elija a qué host se auto-invoca el server:\n${malos.join("\n")}`,
    ).toEqual([]);
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
          // Se leen SIN comentarios. Tercera vez en esta branch que un test
          // termina leyendo mi propia prosa: `submit-wizard` menciona
          // `fetch()` dentro de un JSDoc que explica otra cosa, y el guard lo
          // marcaba como si se auto-invocara. Ver #S61 en
          // ERRORES_CLAUDE_NO_REPETIR.md.
          //
          // El filtro es por LINEA y no un regex de bloque, porque ese se
          // comeria tambien un /* que viva adentro de un string. Alcanza: los
          // comentarios de bloque de este repo son JSDoc, con un asterisco
          // por linea.
          //
          // Y el // se filtra solo al PRINCIPIO de la linea, nunca en el
          // medio: cortar en el primer // partiria la URL de produccion justo
          // a la mitad y el guard dejaria de ver el dominio que vino a buscar.
          const src = readFileSync(p, "utf8")
            .split(/\r?\n/)
            .filter((l) => {
              const t = l.trim();
              return !(
                t.startsWith("//") ||
                t.startsWith("/*") ||
                t.startsWith("*")
              );
            })
            .join("\n");
          // Antes esto buscaba la línea EXACTA, y `??` en vez de `||`, comillas
          // simples o un salto de línea de Prettier la evadían — así se le
          // escapó `api/insights/route.ts`, que tenía el bug partido en dos
          // líneas.
          //
          // El criterio ahora es SEMÁNTICO, no de nombre de variable: se marca
          // un archivo sólo si (a) menciona el dominio de producción, (b) lo
          // combina con una variable de entorno —o sea, arma una URL base— y
          // (c) hace un `fetch` con ella.
          //
          // Ese (c) es lo que distingue el bug de los casos legítimos:
          // `settings/team/invitations` arma un link para un MAIL —y ahí
          // apuntar a producción es lo correcto, a un cliente no le mandás un
          // link a un preview efímero— y `alerts` deriva del `host` real del
          // request. Ninguno de los dos se auto-invoca.
          const nombraProd = /https:\/\/app\.nitrosales\.ai/.test(src);
          const armaUrlBase = /(NEXTAUTH_URL|VERCEL_URL)\s*(\|\||\?\?)/.test(src);
          // Cualquier `fetch`, sin mirar cómo se llama la variable. Los que se
          // auto-invocan usan nombres distintos (`runnerUrl`, `bootUrl`,
          // `baseUrl`), y atarse a uno fue lo que hizo que este guard fuera
          // ciego durante toda la branch.
          const hayFetch = /\bfetch(JSON)?\s*\(/.test(src);
          if (nombraProd && armaUrlBase && hayFetch) {
            malos.push(p.replace(process.cwd(), ""));
          }
        }
      }
    };
    // Se barre el árbol ENTERO, no una lista de directorios.
    //
    // Antes sólo miraba `cron` y `sync`. Una revisión encontró **cinco rutas en
    // `admin/` con el bug vivo**, y dos de ellas disparan el `backfill-runner`
    // — o sea que aprobar un backfill desde un preview corría el runner contra
    // producción. Exactamente el incidente que este archivo narra arriba.
    //
    // La lección: un guard que escanea una lista escrita a mano protege la
    // lista, no el problema.
    recorrer(raiz);
    expect(malos, `estas rutas le pegarían a producción desde un preview:\n${malos.join("\n")}`).toEqual([]);
  });
});
