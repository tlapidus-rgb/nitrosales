# Sesion 21 — Campaigns Resumen cockpit + Break-even ROAS (Fase 1 completa)

**Fecha:** 2026-04-14
**Status:** Fase 1 desplegada en `main` · Fase 2 pausada a pedido para demo de cliente

---

## TL;DR para la demo

Ahora `/campaigns` es un **cockpit "Resumen"** (bajo el paraguas "Marketing & Adquisicion") con un banner de salud que compara el **Blended ROAS VTEX** contra el **Break-even ROAS**. El cliente ve de un vistazo si esta ganando o perdiendo plata con los ads.

Meta Overview y Google Overview tienen un **chip de salud** arriba + el KPI "ROAS" muestra el break-even como subtitle.

**Key insight para mostrar al cliente:** Los ads de Meta/Google mandan trafico a la tienda propia (VTEX), no a MercadoLibre. Por eso el calculo solo usa revenue VTEX; MELI queda aparte como "organico no atribuible". Eso le da al cliente un numero honesto de si sus ads estan pagando los costos fijos + variables + ellos mismos.

---

## Que se construyo

### 1. `/campaigns` redisenado como "Resumen" cockpit

- **Banner de salud publicitaria** con semaforo:
  - Verde: Blended ROAS >= BE × 1.5 → "Rentable con margen"
  - Ambar: BE <= ROAS < BE × 1.5 → "En zona de equilibrio"
  - Rojo: ROAS < BE → "Perdiendo plata"
  - Gauge visual con linea vertical marcando el break-even
- **8 KPIs top:** Inversion ads · Revenue VTEX · Rev. atribuido · Blended ROAS · Break-even · MELI (organico) · Conversiones · nCAC
- **Bloque "Plataformas vs Realidad (VTEX)":** compara lo que dicen Meta/Google vs ventas reales de VTEX, muestra brecha de atribucion
- **Chart ROAS diario** con linea punteada de break-even superpuesta
- **Platform comparison** (Meta vs Google) con ROAS coloreado segun BE
- **Tabla de campanas** con ROAS coloreado segun BE (ya no hardcoded a 3x)

### 2. Meta Overview (`/campaigns/meta`)

- Chip compacto de salud break-even en el header
- KPI "ROAS" ahora muestra `BE 2.85x · CM 35%` como subtitle

### 3. Google Overview (`/campaigns/google`)

- Misma logica: chip en header + subtitle en KPI "ROAS"

### 4. Formula de Break-even ROAS (lo que tenes que poder explicar)

```
Margen de contribucion (VTEX) = (Rev − COGS − Shipping − PlatformFees − PaymentFees) / Rev
Break-even ROAS = 1 / Margen de contribucion
```

**Ej:** si el margen de contribucion es 30%, el BE ROAS es 3.33x. Es decir, necesitas 3.33 pesos de venta por cada peso de ads para no perder plata.

**Scope VTEX-only:** solo usa ventas de VTEX (tienda directa) porque los ads mandan ahi. MELI tiene su propio trafico organico del marketplace. Payment fees se escalan proporcional a la participacion VTEX del total.

---

## Archivos nuevos / modificados

**Nuevos:**
- `src/lib/hooks/useBreakeven.ts` — hook reutilizable que fetchea P&L y calcula BE
- `src/components/campaigns/BreakevenChip.tsx` — chip compacto + helper `roasColorClass`

**Modificados:**
- `src/app/(app)/campaigns/page.tsx` — reescrito como Resumen cockpit
- `src/app/(app)/campaigns/meta/page.tsx` — chip + subtitle en KPI ROAS
- `src/app/(app)/campaigns/google/page.tsx` — chip + subtitle en KPI ROAS

Todo pusheado a `main` y deployado en `nitrosales.vercel.app`.

---

## Errores que pase en esta sesion (y como los resolvi)

1. **ENOSPC en el shell:** la sandbox de bash quedo rota todo el dia (`ENOSPC: no space left on device, mkdir /sessions/.../tmp/claude-6488`). Workaround: use Read/Write/Edit directamente y Tomy pusheo desde su terminal.

2. **Import path:** use `@/lib/prisma` cuando este repo usa `@/lib/db/client`. Build failed. Fix inmediato.

3. **Blended ROAS 71x (sin sentido):** el primer draft usaba `pnl.summary.revenue` (MELI + VTEX). Como MELI tiene trafico organico del marketplace, inflaba el ROAS. **Fix:** separar por `pnl.bySource`, usar solo VTEX para el numerador, MELI como KPI aparte.

---

## Que quedo PARA LA PROXIMA SESION (Fase 2)

El usuario paro aca porque se va a una demo. Cuando volvamos, son 3 tracks independientes (elegir uno para arrancar):

### Track A: Creativos Lab (Meta + Google separados)
- Separar creativos por plataforma con previews visuales
- Thumbnails/videos de Meta, assets/extensiones de Google
- Analisis de performance creativa + deteccion de fatiga
- **Prioridad alta** segun el brief original del usuario

### Track B: Google Ads split por tipo
- Dividir en Search / Shopping / PMax / Display
- Metricas especificas: IS, QS, Search Terms, Shopping feed health

### Track C: Meta Ads Placements + Audiencias
- Breakdowns por placement (Feed/Stories/Reels)
- Breakdowns por audiencia (LAL / retargeting / cold)
- Insights de donde mejor convierte

### Tambien pendiente de antes (SKU-first ingestion):
- Refactorear `cron/ml-sync/route.ts` (bulk SQL INSERT ON CONFLICT)
- Refactorear `webhooks/vtex/orders/route.ts`
- Usar el helper `upsertProductBySku` ya creado

---

## Notas tecnicas utiles para proxima sesion

- El hook `useBreakeven(dateFrom, dateTo)` expone: `breakevenRoas`, `contributionMargin`, `realRevenue` (VTEX only), `totalRevenue` (MELI + VTEX), `loading`
- El componente `BreakevenChip` ya es reutilizable — sirve para cualquier pantalla nueva (ej. Creativos Lab)
- El helper `roasColorClass(roas, breakeven)` unifica el coloreo verde/ambar/rojo en toda la app
- La API `/api/metrics/pnl` retorna `bySource: [{source: "MELI"|"VTEX", revenue, cogs, shipping, platformFee, ...}]` — usar siempre que necesites separar canales
- Organizacion ID: `cmmmga1uq0000sb43w0krvvys`

---

## Scripts de referencia para la demo

Si el cliente pregunta: "¿por que el ROAS que reportan las plataformas (ej. 18x) no coincide con mi realidad?"

**Respuesta:** Hay tres niveles de verdad:

1. **ROAS reportado por plataforma (Meta / Google):** lo que Meta/Google se atribuyen por su pixel. Suele estar inflado por atribucion last-click y ventana de 7 dias.
2. **Blended ROAS:** revenue real de tu tienda / inversion publicitaria total. Incluye el efecto halo de los ads sobre las ventas organicas.
3. **Break-even ROAS:** el minimo que necesitas para no perder plata. Depende de TU margen de contribucion.

Un ROAS reportado de 18x + Blended 3x + Break-even 3.3x = estas **apenas perdiendo plata** aunque la plataforma diga lo contrario.
