import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { esOrgIdValido, orgIdDeLaQuery } from "./org-id-seguro";

// ══════════════════════════════════════════════════════════════════════════
// Inyección SQL por `?orgId=` en los endpoints de métricas
// ══════════════════════════════════════════════════════════════════════════
// Encontrado en la revisión de seguridad del 2026-09-07. `/api/metrics/orders`
// tomaba el `?orgId=` crudo de la querystring y lo interpolaba entre comillas
// simples dentro de `$queryRawUnsafe`, en 53 lugares:
//
//     WHERE "organizationId" = '${ORG_ID}'
//
// Con la clave de admin (que además está publicada en `vercel.json`), un
// `orgId` que cerrara la comilla alcanzaba la base entera, de los 4 clientes.
//
// El arreglo valida el formato en el borde. Estos casos son los que definen si
// esa validación sirve: lo que importa no es que acepte los ids buenos, sino
// que no exista NINGÚN valor aceptado capaz de escapar de una comilla SQL.
// ══════════════════════════════════════════════════════════════════════════

const IDS_REALES = [
  "cmohl80fx009j1sdusurp7fbj", // Arredo
  "cmod6ns420047dlnth544px9c", // TeVe Compras
  "cmmmga1uq0000sb43w0krvvys", // El Mundo del Juguete
];

describe("acepta los ids que existen de verdad", () => {
  it.each(IDS_REALES)("%s es válido", (id) => {
    expect(esOrgIdValido(id)).toBe(true);
    expect(orgIdDeLaQuery(id)).toBe(id);
  });
});

describe("ningún valor aceptado puede escapar de una comilla SQL", () => {
  const ATAQUES = [
    "' OR '1'='1",
    "x' UNION SELECT current_setting('is_superuser') --",
    "'; DROP TABLE orders; --",
    "cmohl80fx009j1sdusurp7fbj' OR 1=1 --",
    "' --",
    "''",
    "a'||(SELECT version())||'",
    "cmohl80fx009j1sdusurp7fbj; DELETE FROM orders",
  ];

  it.each(ATAQUES)("rechaza %s", (v) => {
    expect(esOrgIdValido(v)).toBe(false);
    expect(orgIdDeLaQuery(v)).toBeNull();
  });

  it("ningún valor aceptado contiene un caracter con significado en SQL", () => {
    // La garantía de fondo, dicha como propiedad y no como lista de ataques:
    // el juego de caracteres permitido no incluye comilla, punto y coma, guion,
    // barra, espacio ni nada que pueda cerrar un literal o abrir un comentario.
    const peligrosos = ["'", '"', ";", "-", "/", "*", "\\", " ", "\t", "\n", "(", ")", "%", "="];
    for (const c of peligrosos) {
      expect(esOrgIdValido("cmohl80fx009j1sdusurp7f" + c)).toBe(false);
    }
  });
});

describe("rechaza lo que no es un id", () => {
  it.each([
    ["vacío", ""],
    ["corto", "abc"],
    ["larguísimo", "a".repeat(200)],
    ["con mayúsculas", "CMOHL80FX009J1SDUSURP7FBJ"],
    ["con guiones (uuid)", "550e8400-e29b-41d4-a716-446655440000"],
    ["con acentos", "cmohl80fx009j1sdusurp7fbñ"],
  ])("rechaza %s", (_n, v) => {
    expect(esOrgIdValido(v)).toBe(false);
  });

  it("null y undefined dan null, no explotan", () => {
    expect(orgIdDeLaQuery(null)).toBeNull();
    expect(orgIdDeLaQuery(undefined)).toBeNull();
    expect(esOrgIdValido(null)).toBe(false);
    expect(esOrgIdValido(123)).toBe(false);
  });
});

describe("los tres endpoints lo usan", () => {
  const RUTAS = [
    "src/app/api/metrics/orders/route.ts",
    "src/app/api/metrics/pixel/route.ts",
    "src/app/api/metrics/products/route.ts",
  ];

  it.each(RUTAS)("%s valida el ?orgId= antes de usarlo", (p) => {
    const src = readFileSync(join(process.cwd(), p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("orgIdDeLaQuery");
    // Y que no quede el `searchParams.get("orgId")` crudo yendo a una variable
    // que después toca SQL.
    expect(src).not.toMatch(/const queryOrgId\s*=\s*_?(?:url|searchParams)/);
  });
});
