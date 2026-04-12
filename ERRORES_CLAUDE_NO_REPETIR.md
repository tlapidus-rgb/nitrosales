# ERRORES_CLAUDE_NO_REPETIR.md — Errores que Claude NO debe volver a cometer

> **Instrucción**: Claude DEBE leer este archivo al inicio de cada sesión.
> Cada error está documentado con causa raíz y la regla que lo previene.
> Si Claude comete un error que ya está acá, es una falla grave de proceso.

> **Última actualización: 2026-04-12 — Sesión 18**

---

## Error #1 — Field mismatch entre API y frontend

**Cuándo pasó**: Sesión 18, deploy de Phase 2 Analytics
**Síntoma**: Página en blanco (client-side exception)
**Causa raíz**: El API devolvía `device` pero el frontend esperaba `deviceType`. Lo mismo con `url`/`pageUrl` y `pageViews`/`views`.

### Regla
**Antes de consumir datos de un endpoint en el frontend, verificar los nombres EXACTOS de los campos que devuelve la query SQL.** No asumir que el campo se llama como el type de TypeScript. Abrir el endpoint, leer la query, confirmar el alias SQL, y usar ese nombre (o mapearlo explícitamente con fallback).

**Patrón correcto**:
```ts
const devices = rawDevices.map((d: any) => ({
  deviceType: d.deviceType || d.device || "unknown",  // ← fallback explícito
  count: Number(d.count) || 0,
}));
```

---

## Error #2 — Zona nueva sin try-catch crashea toda la página

**Cuándo pasó**: Sesión 18, deploy de Phase 2 Analytics
**Síntoma**: Página en blanco por un error en una sola zona nueva
**Causa raíz**: Las 3 zonas nuevas no tenían try-catch. Un error en una zona mataba todo el render.

### Regla
**Cada zona del dashboard DEBE estar envuelta en un IIFE con try-catch** que retorne `null` en caso de error. Nunca agregar una zona "suelta" al JSX.

**Patrón correcto**:
```tsx
{(() => {
  try {
    // ... zona completa ...
    return <div>...</div>;
  } catch {
    return null;
  }
})()}
```

---

## Error #3 — COUNT(*) en vez de COUNT(DISTINCT) para métricas de páginas

**Cuándo pasó**: Sesión 18, query de Top Pages
**Síntoma**: Checkout aparecía con más "visitas" que Home (imposible)
**Causa raíz**: `COUNT(*)` cuenta eventos, no visitantes. Checkout tiene múltiples eventos por usuario (pasos del checkout), inflando el número.

### Regla
**Para métricas de "páginas visitadas" o "tráfico por página", siempre usar `COUNT(DISTINCT visitorId)`.** `COUNT(*)` solo es correcto cuando queremos contar eventos totales explícitamente.

---

## Error #4 — regexp_replace con backslash en Prisma template literals

**Cuándo pasó**: Sesión 18, rewrite de query Top Pages
**Síntoma**: HTTP 500 al llamar al API
**Causa raíz**: `regexp_replace(url, '\?.*', '')` — JavaScript consume el `\` en el template literal antes de que llegue a PostgreSQL. PostgreSQL recibe `?.*` sin escape, regex inválida.

### Regla
**NUNCA usar `regexp_replace` con caracteres escapados dentro de `Prisma.$queryRaw` con template literals.** Usar alternativas que no requieran regex:

```sql
-- ❌ ROTO en Prisma template literals
regexp_replace(pe."pageUrl", '\?.*', '')

-- ✅ CORRECTO — sin regex
SPLIT_PART(pe."pageUrl", '?', 1)
```

Si absolutamente necesitás regex en Prisma, usar `Prisma.sql` con `Prisma.raw()` para el string de regex (y testearlo).

---

## Error #5 — SQL LIMIT bajo + agrupación en frontend = pocos resultados

**Cuándo pasó**: Sesión 18, Top Pages mostraba solo 4 resultados
**Síntoma**: Solo aparecían 4 páginas en vez de 5-6
**Causa raíz**: SQL tenía `LIMIT 10`, pero el frontend agrupaba URLs por label simplificado (ej: `/producto/123?color=azul` y `/producto/123?color=rojo` → misma label). 10 rows SQL se colapsaban a 4 labels.

### Regla
**Si el frontend agrupa/simplifica resultados del SQL, el LIMIT del SQL debe ser significativamente mayor** que la cantidad final deseada. Regla de pulgar: `LIMIT` = 3x a 5x del número final esperado.

---

## Error #6 — URLs encoded sin decodificar en la UI

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: Paths mostraban `1%20a%203%20a%C3%B1os` en vez de `1 A 3 Años`
**Causa raíz**: Las URLs en la DB están URL-encoded. El frontend las mostraba raw.

### Regla
**Siempre aplicar `decodeURIComponent()` (envuelto en try-catch) antes de mostrar cualquier URL o path al usuario.** Los datos de la DB vienen encoded.

```ts
try { path = decodeURIComponent(path); } catch { /* usar raw */ }
```

---

## Error #7 — Mostrar product IDs numéricos como nombre de página

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: Aparecía "726" como nombre de página
**Causa raíz**: Paths como `/726` son IDs de producto en VTEX. Sin tratamiento, el número aparece como label.

### Regla
**Paths que son solo dígitos (`/^\d+$/`) son IDs de producto.** Mostrarlos como `Producto #726` o filtrarlos si no aportan valor.

---

## Error #8 — Checkout como "página de contenido" en métricas de tráfico

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: `/checkout` aparecía como top page, con más eventos que Home
**Causa raíz**: Checkout es transaccional (múltiples eventos por visita), no es una "página de contenido" que el usuario browseó.

### Regla
**Excluir `/checkout%` de queries de "top pages" y "páginas más visitadas".** Checkout es un flujo transaccional, no content. Incluirlo distorsiona las métricas de navegación.

```sql
AND pe."pageUrl" NOT LIKE '%/checkout%'
```

---

## Error #9 — Fix atrapado en staging, nunca llegó a main (histórico)

**Cuándo pasó**: Sesiones 9-10
**Síntoma**: Pérdida de 1,600 órdenes MELI durante 6 días
**Causa raíz**: El fix del webhook estaba en staging pero main seguía con el código roto. El modelo de branches era innecesariamente complejo.

### Regla
**Todo va directo a `main`. No existen branches extra** (ver CLAUDE.md, modelo vigente desde sesión 11).

---

## Error #10 — Query con JOIN a tabla grande + CAST en columna mixta

**Cuándo pasó**: Sesión 16, query de provincias
**Síntoma**: Timeout de la API → página en blanco
**Causa raíz**: `LEFT JOIN customers` sobre 60K+ orders + `CAST(LEFT(postalCode,4) AS int)` sobre postalCodes que pueden ser alfanuméricos (`B1754BCD`).

### Regla
**NO hacer JOIN a tablas grandes en queries analíticas. NO usar CAST sobre columnas que pueden tener datos mixtos.** Si necesitás datos de otra tabla, usar query separada y cruzar en JS. Comparaciones de texto para postalCode.

---

## Error #11 — Payment gateway aparece como canal de tráfico

**Cuándo pasó**: Sesión 17-18, gocuotas en analytics
**Síntoma**: "gocuotas" aparecía como fuente de tráfico con revenue atribuido
**Causa raíz**: El referrer del pixel capturaba `gocuotas.com` como fuente cuando el usuario volvía del gateway de pago. Estos no son canales de adquisición.

### Regla
**Mantener y expandir la lista PAYMENT_GATEWAY_SOURCES** para filtrar gateways de pago de los datos de atribución. Filtrar en el response del API, no en las queries (para no perder datos históricos).

```ts
const PAYMENT_GATEWAY_SOURCES = [
  "gocuotas", "mercadopago", "payway", "decidir", "mobbex",
  "todopago", "paypal", "stripe", /* ... */
];
```

---

## Error #12 — Tarea programada de Claude Desktop olvidada

**Cuándo pasó**: Sesiones previas
**Síntoma**: Pestañas del navegador se abrían solas mostrando JSON crudo de endpoints de sync
**Causa raíz**: Una tarea programada de Claude Desktop ("Inventory sync runner", cron `*/5`) creada para completar el sync inicial nunca se desactivó.

### Regla
**Cuando aparezcan comportamientos inexplicables en el navegador, verificar PRIMERO `list_scheduled_tasks`** antes de buscar bugs en el código. Y cuando se cree una tarea temporal, documentar y planificar su desactivación.

---

_Fin del archivo. Claude: si estás por cometer algo que se parece a uno de estos errores, PARÁ y releé la regla._
