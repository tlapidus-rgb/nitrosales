# NitroPixel · NitroScore — Estrategia de Exposición

**Estado:** Herramienta interna de NitroSales. NO se expone al cliente.
**Última actualización:** 2026-04-07
**Owner:** Tomy

---

## Decisión final

Después de iterar sobre exponer el NitroScore al cliente (con score crudo,
con checklist, con score gateado por umbral), la decisión es:

> **El NitroScore es una herramienta interna de diagnóstico, no un producto
> del cliente. Vive en `/admin` y solo lo ve el equipo de NitroSales.**

### Por qué

1. **Sin contexto, un número bajo se interpreta como falla del proveedor.**
   El cliente ve 62/100 y piensa "Nitro no funciona", aunque el 38% que falta
   sea 100% culpa de su Shopify mal configurado o falta de tráfico.
2. **Los clientes comparan.** "Yo tengo 87, vos 54" → el de 54 escribe enojado
   aunque su pixel esté midiendo perfecto para su volumen.
3. **El responsable emocional del número soy yo.** Cobro el fee, doy la cara.
4. **Internamente vale oro.** Como radar para priorizar a qué cliente
   intervenir, cuándo un fix técnico mío tuvo impacto, y qué webhooks rompen.
5. **Como producto del cliente, resta más que suma.**

---

## Arquitectura

### Sección `/admin` (gateada por allowlist de email)

Toda la cabina interna vive bajo `/admin/*`. Layout server-side
(`src/app/admin/layout.tsx`) gatea todo por `isInternalUser()` →
allowlist en `src/lib/feature-flags.ts`. Cualquier usuario fuera de
la allowlist (incluso logueado en NitroSales) recibe `notFound()` (404).

#### Páginas

| Ruta | Qué hace |
|---|---|
| `/admin` | Overview: KPIs agregados (clientes activos, alertas críticas, eventos 7d) y links rápidos |
| `/admin/clientes` | Tabla de todas las orgs con stats lightweight + badge de salud (green/yellow/red/gray) |
| `/admin/clientes/[orgId]` | Detalle por cliente: NitroScore desglosado, 5 palancas, sample sizes, money at risk, unlock steps |
| `/admin/alertas` | Lista priorizada de clientes con problemas detectables (CRITICAL / WARNING / INFO) |
| `/admin/usage` | Dashboard de consumo de Claude (tokens, modos, latencia, errores) — preexistente |

#### APIs

| Endpoint | Propósito |
|---|---|
| `GET /api/admin/clientes` | Listado de orgs con stats agregadas (último evento, eventos 7d, identified visitors, health) |
| `GET /api/admin/clientes/[orgId]` | Metadata + stats de una org puntual |
| `GET /api/admin/alertas` | Alertas detectadas: pixel caído, sin instalar, baja captura de identidad, sin compras |
| `GET /api/admin/usage` | Telemetría de Claude (preexistente, key-based) |
| `GET /api/nitropixel/data-quality-score?orgId={id}` | NitroScore para una org puntual (admin override; sin orgId usa la sesión) |

#### Categorías de alertas

| Categoría | Trigger | Severidad |
|---|---|---|
| `CRITICAL` | Sin eventos en últimas 24h pero tuvo antes | critical |
| `SETUP` | Sin eventos NUNCA (cliente no instaló) | info |
| `LOW_IDENTITY` | Org activa con <10% de visitors identificados (≥20 visitors) | warning |
| `NO_PURCHASES` | Tráfico ≥50 visitors pero 0 PURCHASE en 7d | warning |

### NitroScore (heurística)

5 palancas, ponderadas, con piso de medición (`measurementStart`) que
ignora completamente la data pre-fix:

| Palanca | Peso | Min samples |
|---|---|---|
| Click coverage | 25% | 20 page views |
| Identity richness | 25% | 10 visitors con email |
| Meta CAPI match | 20% | 5 PURCHASE events |
| Signal freshness | 15% | 10 touchpoints |
| Webhook reliability | 15% | 5 órdenes |

Si una palanca no tiene sample suficiente → estado `collecting`,
excluida del score. Score se renormaliza sobre las palancas con datos.
Si TODAS están collecting → score = `null` ("Recopilando datos").

`measurementStart = max(PIXEL_HEALTHY_FLOOR, firstPixelEventDate)` por org.
Para clientes nuevos esto es transparente (auto-usa el primer evento).
`PIXEL_HEALTHY_FLOOR = 2026-04-07` cubre cuentas legacy con data pre-fix.

---

## Cómo se accede

Solo emails en `INTERNAL_EMAILS` (en `src/lib/feature-flags.ts`) ven
cualquier cosa bajo `/admin/*`. Para sumar a alguien al equipo:

```ts
// src/lib/feature-flags.ts
const INTERNAL_EMAILS = new Set<string>([
  "tlapidus@99media.com.ar",
  "nuevo@miembro.com",  // ← agregar acá
]);
```

Es deliberadamente manual: te obliga a pensarlo antes de exponer.

## Qué NO existe

- ❌ `/nitropixel/quality` (eliminada — era la versión cliente)
- ❌ `/nitropixel/setup` (eliminada — era el checklist para cliente)

Si en el futuro decidís darle algún tipo de visibilidad al cliente
sobre la salud de su pixel, la decisión correcta probablemente sea:
- Email mensual con un diagnóstico curado por vos
- O un widget muy reducido en su dashboard ("3 acciones recomendadas")
- Nunca un score crudo

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cliente pide ver el score | Respuesta: "Te paso un diagnóstico curado" — vos lo derivas del admin |
| Internamente alguien comparte el link | Layout gate por email — devuelve 404 si no estás en allowlist |
| Queries del listado se vuelven lentas con muchos clientes | El listado usa stats lightweight (no recompute del NitroScore por org). El score completo solo se computa en la página de detalle, on-demand |
