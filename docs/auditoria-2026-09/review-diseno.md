# Auditoría de Diseño y UX — NitroSales

**Commit auditado:** `9ad4616d` (= `origin/main` = producción, nitrosales.vercel.app)
**Fecha:** 2026-09-02
**Alcance:** solo lectura. 82 páginas bajo `src/app/(app)/`, 12 rutas fuera del grupo, 78 componentes.
**Vara de medir:** `UI_VISION_NITROSALES.md`, `design-appstack-enterprise.local.md`, `DESIGN-AUDIT-2026-08-24.local.md`, tokens `--ent-*` en `globals.css` + `tailwind.config.js`.

---

## 0. Contexto: qué se midió y contra qué

La migración "design-enterprise" (~34 commits, de `4137bdee` a `df0288e1`) definió un contrato claro:

- Neutros **cálidos** (`--ent-*`: ink `#1C1B18`, canvas `#FBFAF7`, surface `#F5F3EE`, hairline `#E5E1D8`).
- Un solo acento: verde apagado `#2F9153`, **solo-status, nunca fills**.
- Cero gradientes decorativos, cero glow, cero orbes, cero dark full-page.
- Geist + Geist Mono. Radios 8/12/16. Sombras planas (`shadow-ent-xs` / `shadow-ent-soft`).
- 5 primitivas compartidas en `src/components/enterprise/ui.tsx`: Button, Card, Badge, Stat, LivePulse.

**El resultado es real y verificable dentro de `src/app/(app)/`:** el barrido slate/cool-gray funcionó. Conté **0 ocurrencias** de `*-slate-*` y **0** de `*-gray-*` en las 82 páginas del grupo `(app)` + componentes. Las 155 que sobreviven viven todas **afuera** del grupo (`/login`, `/print/*`, `/i/*`, `/control/*`, `/accept-invite`, `/unauthorized`).

**Pero la migración se detuvió en tres fronteras que el barrido nunca cruzó**, y esas tres fronteras son exactamente donde vive el mayor riesgo de negocio:

1. **El perímetro** (login, onboarding, invitaciones, prints) — todo lo que el cliente ve **antes** de entrar al panel, y lo que exporta para mostrarle a terceros.
2. **Los estados no-felices** (cargando, vacío, error, parcial) — el terreno donde el producto miente.
3. **El nivel semántico** (qué significa verde/rojo, qué es un KPI, qué es una card) — se cambiaron los colores, no las abstracciones: hay **16 implementaciones distintas de KPI card** y **4 sistemas de card** conviviendo.

Los hallazgos van por severidad. **CRITICAL** = el usuario toma una decisión equivocada o no puede completar una tarea.

---

# CRITICAL

## C-1 — El indicador "EN VIVO" del top-bar está hardcodeado: miente en todas las pantallas

**Severidad:** CRITICAL
**Archivo:** `src/app/(app)/layout.tsx:414`
**Primitiva:** `src/components/enterprise/ui.tsx:96-116`

```tsx
<LivePulse status="LIVE" />
```

El único "chiche" que Tomy pidió (`design-appstack-enterprise.local.md`, feedback #2: *"un puntito titilando que muestre que el píxel mide en vivo"*) está cableado a `"LIVE"` como literal. No consume `liveStatus` ni `pixelHealth` — que **sí existen** y llegan por API (`pixelData.liveStatus.status`, usado en `src/app/(app)/pixel/analytics/page.tsx:730`).

**Qué ve el usuario concretamente:** en las 82 pantallas del panel, arriba a la derecha, una píldora verde con un halo pulsante y el texto **"EN VIVO"**. Si el pixel de Arredo se cayó hace tres días, si el snippet nunca se instaló, si el cliente está mirando un período sin un solo evento — la píldora sigue verde, sigue pulsando y sigue diciendo "EN VIVO". El único indicador de salud del producto es un adorno. Es peor que no tener indicador: instala confianza donde no la hay.

**Agravante:** en `/pixel/analytics` conviven **dos** indicadores de "vivo" a 40px de distancia — el falso del top-bar (verde `#2F9153`, píldora, pulsante) y el real de la página (`bg-emerald-50` / `text-emerald-700`, "Pixel activo", estático, `pixel/analytics/page.tsx:730-736`). Dos verdes distintos, dos formas distintas, dos fuentes de verdad distintas, y solo uno es verdad.

---

## C-2 — El dashboard principal no puede mostrar un error: nunca lo intenta

**Severidad:** CRITICAL
**Archivos:**
- `src/app/(app)/dashboard/page.tsx:445` — `const [error, setError] = useState("")`
- `src/app/(app)/dashboard/page.tsx:544` — `setError("")` (única llamada en todo el archivo)
- `src/app/(app)/dashboard/page.tsx:1173-1175` — el banner de error
- `src/app/(app)/dashboard/page.tsx:570, 578, 587` — `.catch(() => null)` en cada fetch

`setError` se llama **una sola vez en las 1542 líneas del archivo, y es para vaciarlo**. El banner rojo de la línea 1174 es código muerto: `error` nunca puede ser distinto de `""`.

Los ~25 fetches del dashboard (métricas, trends, productos, clientes, P&L, más uno por widget) hacen `.catch(() => null)`. Un 500, un timeout de la API de órdenes (documentado en `CLAUDE.md` REGLA #3b como causa histórica de página en blanco), un pool de conexiones saturado: todo se convierte silenciosamente en `null`.

**Qué ve el usuario concretamente:** nada. Literalmente nada que le diga que algo falló. Ver C-3 para qué aparece en su lugar.

---

## C-3 — "Sin datos" y "falló la carga" se renderizan como skeleton infinito

**Severidad:** CRITICAL
**Archivo:** `src/components/dashboard/WidgetFormats.tsx:211, 254, 290, 319-320, 386-387, 445-446, 528-529`

Ocho lugares donde una colección vacía se pinta como esqueleto de carga:

```tsx
// :445 (FormatDonut) y :528 (FormatList)
{items.length === 0 ? (
  <div className="h-[260px] w-full dash-skeleton" />
) : ( ... )}

// :319 (FormatMiniLine) y :386 (FormatMiniBar)
{series.length === 0 ? (<div className="h-full w-full dash-skeleton" />) : ...}

// :211 (FormatKpi), :254 (FormatBigNumber), :290 (FormatSparkline)
{data ? (<p className="text-2xl ...">{animatedValue}</p>) : (<div className="h-7 w-24 dash-skeleton" />)}
```

`dash-skeleton` (`src/components/dashboard/DashboardStyles.tsx:371-381`) es un shimmer **infinito** (`animation: dashShimmer 1.6s ease-in-out infinite`). No tiene estado terminal.

**Qué ve el usuario concretamente:** tres escenarios distintos producen exactamente la misma pantalla —

- Un cliente recién onboardeado, con 0 pedidos: **grilla de rectángulos grises brillando para siempre.**
- Un cliente con datos pero cuya API de productos tardó 12s y explotó: **los mismos rectángulos grises brillando para siempre.**
- Un cliente cuyo período seleccionado no tiene ventas: **los mismos rectángulos.**

No hay copy, no hay ícono, no hay "todavía no hay datos", no hay "no pudimos cargar esto", no hay botón de reintentar. El cliente se queda mirando y asume que sigue cargando. A los 5 minutos recarga. A la tercera vez, llama.

**Contraste que prueba que se sabe hacer bien:** `src/app/(app)/pixel/analytics/page.tsx:889` hace exactamente lo correcto — `channels.length === 0 ? <div>No hay datos de canales para este período</div>`. La capacidad existe; no se aplicó en la pantalla principal.

---

## C-4 — `/nitropixel` presenta ceros de error como si fueran el dato real

**Severidad:** CRITICAL
**Archivo:** `src/app/(app)/nitropixel/page.tsx:100-106`, `:171`, `:376-380`

```tsx
const events   = data?.asset.totalEvents ?? 0;
const visitors = data?.asset.totalVisitors ?? 0;
const revenue  = data?.asset.attributedRevenue ?? 0;
const valueUsd = data?.asset.estimatedAssetValueUsd ?? 0;
const daysAlive = data?.asset.daysAlive ?? 0;
```

Cuando el fetch falla, `data` queda `null`, **pero la página se renderiza entera igual** con todos los ceros. El error se muestra en `:378`, al final del scroll, en `text-red-400/70` — que sobre `#FBFAF7` da **2,65:1 de contraste (y todavía menos al 70% de opacidad)**: es texto rojo pálido casi invisible, debajo del fold.

**Qué ve el usuario concretamente:** la página se ve *normal*, completa, con su layout intacto, y dice:

> **VALORACIÓN ESTIMADA**
> **US$0**
>
> Eventos totales: **0** · Visitantes: **0** · Identificados: **0**
> **0 días vivo**
> *Cada evento lo hace más fuerte. Cada conversión, más valioso.*

Un cliente que abre esto concluye que su pixel está muerto, o que NitroSales no vale nada. La única señal de que fue un fallo de red está tres pantallas más abajo, en rojo transparente.

Este es el caso canónico del "dashboard que miente en cero", y es la pantalla que el sidebar marca como el **activo principal del producto** (`layout.tsx:53`, badge "ASSET", primer ítem del primer grupo).

---

## C-5 — La pantalla de carga app-wide sigue siendo un agujero negro animado

**Severidad:** CRITICAL
**Archivo:** `src/components/OnboardingGate.tsx:57-59` y `:77-110` (`AuroraLoader`)

`DESIGN-AUDIT-2026-08-24.local.md` marcó esto como CRITICAL #1 y se arregló `layout.tsx:246` (`bg-canvas` + `PageLoader`). Pero **`OnboardingGate` envuelve todo el layout** (`layout.tsx:250`) y corre *después*:

```tsx
if (!loaded) {
  return <AuroraLoader />;   // :57-59
}
```

`AuroraLoader` es `position: fixed; inset: 0; z-index: 9999; background: "#0A0A0F"` con **dos blobs radiales de 45vw y 50vw** (naranja `rgba(255,94,26,.25)` y púrpura `rgba(168,85,247,.20)`), `filter: blur(100px)` / `blur(110px)`, animados en loop infinito de 12s y 14s. Sin `prefers-reduced-motion`.

**Qué ve el usuario concretamente:** en **cada** carga en frío y **cada** F5 de **cualquier** página del panel, la secuencia es:

1. `PageLoader` sobrio sobre canvas hueso (correcto),
2. → **pantalla completa negra `#0A0A0F` con dos auroras naranja/púrpura girando** mientras resuelve `/api/me/onboarding/state`,
3. → el panel claro cálido.

Tres identidades visuales en dos segundos. Es literalmente el "agujero negro a pantalla completa app-wide" del audit anterior: se arregló el síntoma en `layout.tsx` y quedó la causa un nivel más arriba en el árbol. Y encima cuesta GPU: dos blobs de ~50vw con `blur(100px)` animándose es de lo más caro que se le puede pedir a un compositor.

---

## C-6 — Todo el perímetro (login, onboarding, invitación) quedó en el diseño viejo

**Severidad:** CRITICAL
**Archivos:**
- `src/app/login/page.tsx:32` y `:79`
- `src/app/forgot-password/page.tsx:~30`
- `src/app/reset-password/page.tsx:~30`
- `src/components/OnboardingOverlay.tsx:94`, `:190-219`
- `src/app/accept-invite/page.tsx` (`bg-slate-50`, 29 clases slate)
- `src/app/unauthorized/page.tsx` (`bg-slate-50`, 13 clases slate)

`login/page.tsx:32`:
```tsx
className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,94,26,0.16),_transparent_40%),linear-gradient(180deg,#09090f_0%,#0f111a_100%)] ..."
```
`login/page.tsx:79`:
```tsx
className="w-full rounded-2xl bg-gradient-to-r from-[#FF5E1A] via-[#ff6f32] to-[#ff8a5b] py-3 font-semibold text-white ..."
```

Un botón con **gradiente naranja fluo** — el anti-patrón #8 explícito de `UI_VISION_NITROSALES.md` §9 ("Botones con gradientes fluo") y lo primero que la migración eliminó del panel.

`OnboardingOverlay.tsx:190-219` (`AuroraBackground`): fondo `#0A0A0F` con **tres orbes** — naranja `rgba(255,94,26,.30)` blur 100px, púrpura `rgba(168,85,247,.25)` blur 110px, rosa `rgba(236,72,153,.18)` blur 120px — más una viñeta radial negra al 50%, todos animados en loops de 22s/28s/30s.

**Qué ve el usuario concretamente — el recorrido completo de un cliente nuevo de Arredo, día 1:**

| Paso | Lo que ve |
|---|---|
| 1. `/login` | Fondo casi negro azulado con aurora naranja. Botón con gradiente naranja→salmón. Label **"Password"** en inglés. Pie: *"NitroSales v0.1.0"*. |
| 2. Onboarding | Pantalla completa negra con **tres orbes** naranja/púrpura/rosa flotando, barra de progreso con gradiente naranja fluo. |
| 3. Panel | Hueso cálido `#FBFAF7`, near-monocromo, Geist, verde apagado. |
| 4. Invitar a un colega → `/accept-invite` | Vuelve al **slate frío** `bg-slate-50` del sistema anterior al anterior. |
| 5. Sin permiso → `/unauthorized` | `bg-slate-50` otra vez. |

Cuatro sistemas visuales en cinco pantallas. El test de `UI_VISION_NITROSALES.md` §1 es *"lo muestro en una mesa con inversores y se quedan callados mirando"*. La primera pantalla de la demo — el login — es de un producto distinto al que se está demostrando.

**Bonus de copy roto:** `login/page.tsx:42` dice *"La primera pantalla después de entrar es NitroPixel."* Es falso desde `2b14de25`: `src/app/page.tsx:32` hace `redirect(landingPathForAllowedSections(allowed))`, que para un usuario normal es `/dashboard`.

---

# HIGH

## H-1 — Solo 9 de 58 pantallas usan el loader unificado; el resto muestra `<p>Cargando…</p>`

**Severidad:** HIGH
**Componente correcto:** `src/components/PageLoader.tsx` (impecable: `role="status"`, `aria-live`, `sr-only`, `motion-reduce:animate-none`)

El commit `1ee306ca` ("design: unificar los spinner full-page a `<PageLoader>` (feedback Tomy)") llegó a **9 archivos**. La realidad hoy:

| Patrón de carga | Ocurrencias | Archivos |
|---|---|---|
| `<PageLoader />` (el correcto) | — | 9 |
| Texto plano "Cargando…" / "Cargando..." | **81** | **58** |
| `animate-spin` propio | 49 | 18 |
| `dash-skeleton` / `animate-pulse` | 130 | — |

`UI_VISION_NITROSALES.md` §9, prohibido #13: *"Loading states con `<p>Cargando...</p>` — siempre skeleton shimmer"*. Muestras:

- `src/app/(app)/aura/pagos/page.tsx:301,316` — `<div className="p-12 text-center text-sm">Cargando...</div>`
- `src/app/(app)/bondly/clientes/page.tsx:573` — `Cargando…`
- `src/app/(app)/admin/onboardings/page.tsx:177` — `<div style={{textAlign:"center",padding:60,color:"#6B685F"}}>Cargando…</div>`
- `src/app/(app)/competitors/page.tsx:836` — `<p className="text-ink-40 py-8">Cargando datos de publicidad...</p>`
- `src/components/SectionGuard.tsx:46-53` — **el guard compartido**, que envuelve secciones enteras, tampoco usa `PageLoader`: usa `<Loader2 className="animate-spin" /> Cargando…`

Y ni siquiera los puntos suspensivos son consistentes: **20** usan `…` (U+2026), **8** usan `...`.

**Qué ve el usuario concretamente:** navegar el producto es ver el mismo evento (esperar) representado de cuatro maneras distintas según en qué pantalla esté: un anillo fino gris, un `Loader2` de lucide girando, un texto centrado, o rectángulos brillando. La sensación de "una sola app" se rompe en cada transición.

---

## H-2 — 16 implementaciones distintas de "KPI card" en el mismo producto

**Severidad:** HIGH

| # | Implementación | Archivo:línea | Radio | Sombra | Tamaño del número | Color del delta |
|---|---|---|---|---|---|---|
| 1 | `Stat` (primitiva oficial) | `src/components/enterprise/ui.tsx:70` | — | — | `text-[1.7rem]` medium | `text-accent` / `text-ink-40` |
| 2 | `FormatKpi` | `src/components/dashboard/WidgetFormats.tsx:195` | `.dash-card` 16px | 3 capas | `text-2xl` bold | `text-accent` / `text-rose-500` |
| 3 | `FormatBigNumber` | `WidgetFormats.tsx:233` | `.dash-card` | 3 capas | `text-[44px]` bold | ídem |
| 4 | `KpiCard` (barrel `@/components/dashboard`) | `src/components/dashboard/KpiCard.tsx:31` | `.dash-card` | 3 capas | `text-xl lg:text-2xl` bold | **`text-emerald-600` / `text-red-500`** |
| 5 | `KpiTile` | `src/components/bondly/primitives.tsx:98` | propio | propio | propio | propio |
| 6 | `KpiTile` (otra) | `src/app/(app)/bondly/clientes/[id]/page.tsx:725` | — | — | — | — |
| 7 | `KpiTile` (tercera) | `src/app/(app)/bondly/senales/page.tsx:385` | — | — | — | — |
| 8 | `KpiCard` local | `src/app/(app)/competitors/page.tsx:1071` | — | — | — | — |
| 9 | `KpiCard` local | `src/app/(app)/aura/pagos/page.tsx:482` | — | — | — | — |
| 10 | `KpiCardPremium` | `src/app/(app)/alertas/reglas/page.tsx:560` | — | — | — | — |
| 11 | KPI inline | `src/app/(app)/pixel/analytics/page.tsx:800-820` | `cardStyle` local | `cardShadow` local | `text-2xl` bold | `pctColor()` local |
| 12 | `Counter` | `src/app/(app)/nitropixel/page.tsx:398` | `rounded-xl` (12px) | ninguna | `text-2xl lg:text-3xl` bold | — |
| 13 | `MetricCard` | `src/app/(app)/sinapsis/page.tsx:791` | — | — | — | — |
| 14-16 | `KpiCard`/`StatCard` | `src/app/admin/page.tsx:152`, `src/app/admin/usage/page.tsx:431`, `src/app/control/page.tsx:263` | — | — | — | — |

Y en paralelo, **4 sistemas de "card"**:

| Sistema | Definición | Radio | Boundary |
|---|---|---|---|
| `<Card>` primitiva | `enterprise/ui.tsx:34` | `rounded-2xl` | `border-hairline` + `shadow-ent-xs` (1 capa) |
| `.dash-card` | `DashboardStyles.tsx:45-56` | `1rem` | borde `rgba(28,27,24,.06)` + **3 capas de sombra** + lift `-2px` en hover |
| `cardStyle` local | `pixel/canales/page.tsx:22-23`, `pixel/analytics/page.tsx` | `rounded-xl` | borde + `0 1px 2px rgba(28,27,24,.04)` |
| `THEME.bgCard` | 15 objetos `THEME` locales en Aura | variable | variable |

**Qué ve el usuario concretamente:** el mismo dato (facturación del período) se ve distinto según por dónde llegó. En `/dashboard` es un número `text-2xl` bold en una card con sombra de tres capas que se levanta 2px al pasar el mouse, con delta verde `#2F9153`. En `/campaigns` es `text-xl` bold en la misma card pero con delta **`emerald-600`** — otro verde. En `/pixel/analytics` es `text-2xl` bold en una card **sin sombra** que hace `hover:scale-[1.02]`. En `/nitropixel` es `text-3xl` bold en una card de radio 12px sin sombra ni hover. Nada de esto es percibido conscientemente por el cliente; se percibe como "esto no está terminado".

---

## H-3 — El texto secundario del producto no llega a AA — y son 1.489 usos

**Severidad:** HIGH

Ratios reales calculados sobre los tokens de `globals.css:32-42`:

| Par | Ratio | Veredicto WCAG |
|---|---|---|
| `ink` `#1C1B18` / canvas `#FBFAF7` | **16,50:1** | AA ✅ |
| `ink-60` `#6B685F` / canvas | **5,34:1** | AA ✅ |
| **`ink-40` `#83807A` / canvas** | **3,77:1** | ❌ falla AA (4.5:1) para texto normal |
| `ink-40` / blanco | **3,94:1** | ❌ falla AA |
| `ink-40` / surface-2 `#EDEAE3` | **3,28:1** | ❌ falla AA |
| **`accent` `#2F9153` / canvas** | **3,80:1** | ❌ falla AA como texto |
| `accent` sobre `accent-soft` (verde 10% en blanco `#EAF4EE`) | **3,53:1** | ❌ falla — y se usa a 10px |
| **`live-amber` `#C98A1A` / canvas** | **2,82:1** | ❌ falla incluso el 3:1 de UI |
| `hairline` `#E5E1D8` / canvas | **1,25:1** | ❌ (bordes: mínimo 3:1) |
| `surface` (sidebar) vs canvas | **1,06:1** | prácticamente invisible |

Volumen del problema:

- **1.489** usos de `text-ink-40` en `(app)` + componentes.
- De esos, **612** están en la misma línea que un tamaño ≤11px.
- **964** usos de `text-[8px]`, `text-[9px]` o `text-[10px]` en total (758 de ellos `text-[10px]`, 125 `text-[9px]`).

**Casos puntuales concretos:**

- `src/components/enterprise/ui.tsx:113` — el label **"EN VIVO"** es `text-[10px]` `text-accent` sobre `bg-accent-soft` = **3,53:1 a 10 píxeles**. El elemento más visible del top-bar es el menos legible.
- `src/components/enterprise/ui.tsx:117,121` — el estado **"Activo"** usa `bg-live-amber` (**2,82:1**). Un usuario con visión media no distingue "Activo" (ámbar) de "Sin datos" (gris `ink-40`, 3,77:1): dos estados de negocio opuestos separados por 1 punto de contraste.
- `src/app/(app)/nitropixel/page.tsx:186-190` — `text-[8px]` con `tracking-[0.25em]` en `text-ink-40`. Ocho píxeles, con tracking abierto, al 3,77:1.

**Qué ve el usuario concretamente:** Tomy tiene ~30 años y una pantalla buena. Sus clientes son gerentes de ecommerce que miran esto ocho horas por día, muchos con más de 45. Todo el detalle contextual del producto — el "vs período anterior", el "2.487 de 3.100 órdenes web", la unidad de cada número, el estado de cada canal — está escrito en el gris más claro del sistema, en el cuerpo más chico del sistema. La jerarquía funciona (se ve el número grande), pero el **significado** del número es lo que se pierde.

---

## H-4 — `/nitropixel`: la mitad de la página no tiene borde ni fondo (artefacto de find/replace)

**Severidad:** HIGH
**Archivo:** `src/app/(app)/nitropixel/page.tsx:223-224, 262-263, 282-283, 316-317, 361-362`

```tsx
background: "rgba(229,225,216,0.04)",
border: "1px solid rgba(229,225,216,0.18)",
```

`#E5E1D8` es el token **hairline** — un beige claro. Estos valores vienen del sistema dark, donde eran `rgba(255,255,255,.04)` sobre casi-negro: ahí un 4% de blanco sí construye una superficie. La migración cambió el hex y **dejó el alpha**. Sobre canvas `#FBFAF7`, un beige al 4% es matemáticamente indistinguible del fondo, y un borde beige al 18% da **~1,05:1**.

Alcance del patrón: **28 ocurrencias en 6 archivos** —

| Archivo | Ocurrencias |
|---|---|
| `src/app/(app)/nitropixel/page.tsx` | 10 |
| `src/app/(app)/pixel/page.tsx` | 9 |
| `src/app/(app)/bondly/clientes/[id]/page.tsx` | 6 |
| `src/app/(app)/bondly/ltv/page.tsx` | 1 |
| `src/app/(app)/bondly/clientes/page.tsx` | 1 |
| `src/app/(app)/aura/inicio/page.tsx` | 1 |

**Qué ve el usuario concretamente en `/nitropixel`:** de las seis cajas de la página, cuatro **no existen visualmente**. El gráfico de crecimiento a 30 días, el "STREAM EN VIVO" con los últimos 10 eventos, el panel de "FUENTES · 7 DÍAS" y el footer flotan sueltos sobre el fondo hueso, sin contenedor. Solo las dos cards de arriba (`bg-elevated` / `bg-surface`, tokens correctos) se leen como cards. Es exactamente la queja que `UI_VISION_NITROSALES.md` §5 llama *"el error #1 de Claude"*: **"no se nota bien dónde está, no contrasta"**.

**El caso más grave del patrón** es `src/app/(app)/pixel/page.tsx:476`:
```tsx
<button onClick={fetchData} className="mt-4 px-4 py-2 rounded-lg text-sm text-ink"
  style={{ background: "rgba(229,225,216,0.15)", border: "1px solid rgba(229,225,216,0.3)" }}>
  Reintentar
</button>
```
Es el botón **"Reintentar"** del estado de error de Atribución. Sobre el fondo `#FBFAF7` de la línea 473, es invisible salvo por el texto. **El usuario está en una pantalla de error y el único botón que lo saca de ahí no se ve.** Y el título del error (`:472`) es `text-red-400` = **2,65:1**.

---

## H-5 — `/aura/paletas`: un laboratorio dark neón está publicado y accesible en producción

**Severidad:** HIGH
**Archivo:** `src/app/(app)/aura/paletas/page.tsx:71, 94, 117, 129-130, 140`

Vive dentro del grupo `(app)`, o sea que renderiza **con el sidebar y el top-bar del producto real**. No está en el nav, pero no tiene `SectionGuard`, no está en el matcher de `src/middleware.ts:98-115`, y responde a cualquier usuario logueado con acceso a Aura.

```tsx
bgPage: "radial-gradient(ellipse at top, #1a0b2e 0%, #0a0514 100%)",   // ELECTRIC VIOLET
bgPage: "radial-gradient(ellipse at top, #0a0a0a 0%, #000000 100%)",    // NEO ACID
accentGradient: "linear-gradient(135deg, #ff6bde 0%, #b33dff 50%, #00d9ff 100%)",  // CREATOR GRADIENT
```
Más `boxShadow: 0 0 8px ${color}88` (`:565`) y orbes radiales (`:187, :195, :407`).

**Qué ve el usuario concretamente:** una pantalla completamente negra con paletas llamadas "NEO ACID", "ELECTRIC VIOLET" y "CREATOR GRADIENT", con glows de neón y gradientes magenta→cian, dentro del mismo chrome del panel enterprise. Es el "antes" que la migración vino a matar, todavía servido en producción, dos meses después de que `DESIGN-AUDIT-2026-08-24.local.md` lo listara como *"rutas obsoletas a considerar sacar"*.

---

## H-6 — `/design-preview`: la maqueta del rediseño está pública, sin login, con cifras de un cliente real

**Severidad:** HIGH
**Archivo:** `src/app/design-preview/page.tsx` (159 líneas)

Está en `src/app/`, **no** en `src/app/(app)/` → no pasa por el gate de sesión de `layout.tsx:242-247`. Y no está en el matcher de `middleware.ts:98-115` → no pasa por el RBAC. Es **públicamente accesible sin autenticación**.

Su encabezado (`:1-3`) dice: *"Contenido realista (data de TeVe), sin data real / sin fetch"*. Lo que renderiza (`:79-96`):

> Revenue atribuido **$406,5M** (+52,3%) · ROAS blended **4,2x** · Órdenes **2.487** (+60,5%) · Inversión **$96,7M**
> Órdenes en vivo: `#48213` Meta Ads $142.900 · `#48212` Google Ads $89.500 · `#48210` Directo $54.200

**Qué ve cualquiera con el link:** una pantalla de Atribución de NitroSales, con branding real, con cifras que se leen como las de un cliente identificable, sin ninguna marca de "demo". Aunque los números sean inventados, están presentados como reales y con un cliente nombrado en el código fuente. Es una filtración de aspecto comercial esperando a que alguien encuentre la URL.

**Ironía relevante para el veredicto:** esta página *es* el design system aplicado correctamente — es el único lugar del repo donde se usan las cinco primitivas (`Button`, `Card`, `CardHeader`, `CardBody`, `Badge`, `Stat`, `LivePulse`) juntas y bien. La versión de producción de la misma pantalla (`/pixel`) no se le parece.

---

## H-7 — 231 gradientes y 496 clases de la paleta vieja siguen vivos en pantallas del nav

**Severidad:** HIGH

El barrido `df0288e1`/`fa6e93c6` eliminó slate y gray de `(app)` (0 ocurrencias, confirmado). Lo que quedó:

| Familia | Ocurrencias en `(app)` + componentes |
|---|---|
| `*-emerald-*` | **358** |
| `*-blue/violet/fuchsia/purple/cyan/indigo/teal-*` | **131** |
| Gradientes (`bg-gradient-to-*`, `linear-gradient(`, `radial-gradient(`) | **231** |
| Hex hardcodeado total | **2.483** |
| ...de los cuales son la paleta **nueva** escrita a mano | **875** |

**Los peores archivos, todos con ítem en el sidebar:**

| Archivo | Paleta legacy | Gradientes |
|---|---|---|
| `src/app/(app)/seo/page.tsx` | 87 | 12 |
| `src/app/(app)/finanzas/costos/page.tsx` | 53 | — |
| `src/app/(app)/campaigns/creatives/page.tsx` | 48 | — |
| `src/app/(app)/campaigns/page.tsx` | 36 | — |
| `src/app/(app)/competitors/page.tsx` | 32 | — |
| `src/app/(app)/bondly/ltv/page.tsx` | 27 | 3 |
| `src/app/(app)/aura/inicio/page.tsx` | — | **26** |

Ejemplos representativos:

- `src/app/(app)/seo/page.tsx:234-237` — un mapa de tonos completo: `emerald`, `blue`, `violet`, cada uno con `bg`, `border`, `icon`, `chip`, `ring`. Es el sistema de color anterior, intacto, en una página del nav.
- `src/app/(app)/finanzas/costos/page.tsx:63-66` — categorías de costo por color: `text-teal-600` / `text-indigo-600` / `text-violet-600` / `text-blue-600`, con barras `#14b8a6`, `#6366f1`, `#a855f7`, `#3b82f6`.
- `src/app/(app)/pixel/analytics/page.tsx:~880` — `bg-orange-400` como uno de los tres tramos de la barra de ponderación de atribución, y el badge de veredicto usa `bg-red-50/text-red-700`, `bg-amber-50/text-amber-700`, `bg-emerald-50/text-emerald-700` en vez de los tokens.

**El caso más visible es el `/dashboard`.** `src/app/(app)/dashboard/page.tsx:91-...` define 46 widgets con **siete `catColor` distintos**:

| Color | Usos | Categoría |
|---|---|---|
| `#059669` emerald-600 | 12 | Ventas |
| `#7c3aed` violet-600 | 9 | Marketing |
| `#f59e0b` amber-500 | 7 | — |
| `#0284c7` sky-600 | 5 | — |
| `#d97706` amber-600 | 4 | — |
| `#db2777` pink-600 | 2 | — |
| `#16a34a` green-600 | 2 | — |

Y se renderizan como punto + label uppercase en el header de **cada card** (`WidgetFormats.tsx:133-144`), con `boxShadow: 0 0 0 3px ${categoryColor}22` — un halo de color.

**Qué ve el usuario concretamente:** la pantalla principal del producto — la que se abre con el café — es una grilla de 9-12 cards, cada una con un punto de color y una etiqueta en mayúsculas verde, violeta, ámbar, celeste, rosa. El arcoíris de categorías que la migración vino a eliminar sigue intacto, y está en la primera pantalla. Es también el contraejemplo directo de "monocromo + 1 acento usado <2%".

---

## H-8 — 21 páginas sin `<h1>`, incluida la principal

**Severidad:** HIGH

66 `<h1>` para 82 páginas. Sin `<h1>`:

```
/dashboard        /nitropixel      /products        /competitors     /rentabilidad
/finanzas/costos  /finanzas/estado /memory          /chat
/settings (index) /settings/api-keys   /settings/billing   /settings/integraciones
/settings/organizacion  /settings/seguridad  /settings/team  /settings/team/permisos
+ los 5 redirects (correcto que no lo tengan)
```

Y donde sí hay `<h1>`, el tamaño contradice la jerarquía: `src/app/(app)/pixel/page.tsx:508` tiene el título de la página de Atribución como `<h1 className="text-sm font-semibold">` — **14 píxeles**. `UI_VISION_NITROSALES.md` §6 especifica `text-2xl font-semibold tracking-tight` para título principal de página.

**Qué ve el usuario concretamente:** un usuario de lector de pantalla que salta por encabezados no encuentra dónde empieza el contenido en la pantalla principal. Un usuario vidente, en `/dashboard`, no tiene ningún elemento que diga qué pantalla está mirando: el único identificador es el ítem resaltado del sidebar y el nombre de la organización en el top-bar.

---

## H-9 — Los formularios no tienen labels asociados y el foco de teclado está apagado

**Severidad:** HIGH

| Métrica | Valor |
|---|---|
| `<input>` en `(app)` + componentes | **223** |
| `<select>` | **73** |
| `<label>` | 134 |
| **`htmlFor`** | **3** |
| `outline-none` sin `focus-visible`/`ring` en la misma línea | **152** |

O sea: 131 de los 134 `<label>` son texto suelto encima de un campo, sin relación programática. Ejemplo denso, `src/app/(app)/aura/campanas/nueva/page.tsx:293-460` — el formulario de crear campaña, ~20 campos (nombre, fechas, comisiones, tiers), todos `className="... outline-none ..."` con `style={INPUT_STYLE}` y ninguno con `id`/`htmlFor`.

**Qué ve el usuario concretamente:** navegando ese formulario con Tab, **no hay ningún indicador visible de dónde está el foco**. El `outline-none` mata el anillo nativo del navegador y no se repone nada. El usuario tabula a ciegas y escribe la comisión en el campo equivocado. En un formulario que define cuánto se le paga a un creador, eso es un error con consecuencia monetaria.

**Contraejemplo que muestra que el patrón correcto existe:** `src/app/(app)/pixel/canales/page.tsx:26` define
```tsx
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hairline focus-visible:ring-offset-1";
```
con el comentario *"Foco de teclado visible (el reset global suprime el outline nativo)"*. La solución está escrita, en una página, y no se propagó. (Y usa `ring-hairline` = 1,25:1 de contraste, así que ni siquiera esa es del todo visible.)

---

## H-10 — `globals.css` no tiene `prefers-reduced-motion`, y el que existe se activa solo en Bondly

**Severidad:** HIGH
**Archivos:** `src/app/globals.css` (completo, 356 líneas), `src/components/bondly/primitives.tsx:52-75`

`UI_VISION_NITROSALES.md` §4 Ley 5 dice textualmente: *"Respect `prefers-reduced-motion` SIEMPRE. No es opcional. Es accesibilidad."* y da el bloque `*, *::before, *::after` exacto a pegar.

`globals.css` **no lo tiene**. Lo que hay es una implementación por página: 12 archivos con su propio `@media (prefers-reduced-motion: reduce)`, cubriendo solo sus propias clases.

Y hay un bug estructural: `src/components/bondly/primitives.tsx:52-75` (`BondlyKeyframes`) inyecta vía `<style jsx global>` la regla universal `*, *::before, *::after { animation-duration: .01ms !important }`. Al ser `global` en Next, aplica a **todo el documento mientras el componente esté montado** — o sea, solo mientras el usuario está en una página de Bondly.

**Qué ve el usuario concretamente:** un usuario con "reducir movimiento" activado en su sistema operativo (vestibular, migrañosos, epilepsia fotosensible) ve todas las animaciones del producto — el shimmer infinito de los skeletons, el pulso del `LivePulse`, los stagger de entrada, los blobs del `AuroraLoader` — **excepto** cuando entra a Bondly, donde de golpe todo se congela; y vuelven cuando sale. El respeto por su configuración depende de en qué sección esté parado.

Volumen de movimiento sin guard: **176** referencias a `animate-ping` / `animate-pulse` / `infinite` fuera de `dash-skeleton`.

---

## H-11 — 39 `alert()` y `confirm()` nativos, varios en acciones destructivas de plata

**Severidad:** HIGH
**Prohibido explícito:** `UI_VISION_NITROSALES.md` §9 #14

39 llamadas en 14 archivos, 11 de ellos en pantallas de cliente:

| Archivo:línea | Llamada |
|---|---|
| `src/app/(app)/aura/pagos/page.tsx:153` | `confirm("¿Cancelar este pago?")` |
| `src/app/(app)/aura/pagos/page.tsx:171` | `confirm("Eliminar este pago definitivamente?")` ← sin `¿` de apertura |
| `src/app/(app)/aura/pagos/page.tsx:164,178,195,928` | `alert(...)` para errores |
| `src/app/(app)/aura/creadores/[id]/CampaignsPanel.tsx:109` | `confirm("¿Finalizar la campaña "X"? Sus datos pasan al histórico y no se podrá reactivar.")` |
| `src/app/(app)/pixel/analytics/page.tsx:2359` | `confirm("Borrar esta inversión?")` ← sin `¿` |
| `src/app/(app)/settings/team/page.tsx`, `settings/team/permisos`, `settings/api-keys` | varios |
| `src/components/OrgSwitcher.tsx` | cambio de organización |

**Qué ve el usuario concretamente:** hace clic en "Eliminar pago" y aparece un cuadro gris del sistema operativo con el texto *"nitrosales.vercel.app dice: Eliminar este pago definitivamente?"* y botones "Aceptar"/"Cancelar" en el idioma del navegador. Rompe la ilusión del producto en el momento exacto de máxima ansiedad — una acción irreversible sobre dinero. Y como es `confirm()`, no hay forma de mostrar cuánto es el pago, a quién, ni de diferenciar visualmente lo destructivo de lo benigno.

---

# MEDIUM

## M-1 — 159 tooltips nativos `title=` y dos sistemas de tooltip propios

**Severidad:** MEDIUM
**Prohibido:** `UI_VISION_NITROSALES.md` §9 #15

- **159** atributos `title="..."` en `(app)` + componentes. Ejemplo: `src/app/(app)/pixel/page.tsx:~516` — `title="Cambiar modelo y ventanas en Configuración"` en el chip principal del header de Atribución. Aparece después de ~1s, en la tipografía del sistema operativo, sin control de estilo, y no existe en mobile.
- Existe `src/components/ui/TooltipPortal.tsx` — **excelente** (portal al body, escapa stacking contexts y `overflow:hidden`, `role="tooltip"`, `tabIndex={0}`, `onFocus`/`onBlur`, reposicionamiento con clamp a viewport, cierre en scroll). Está documentado con el bug que resolvió (2026-07-21, con capturas).
- Se usa en **2 archivos**: `pixel/analytics/page.tsx` y `pixel/page.tsx`.
- En paralelo hay **18** tooltips hechos a mano con `group-hover:opacity-100` en 14 archivos — incluido `pixel/analytics/page.tsx:~885`, o sea **la misma página usa los dos sistemas**, y el hecho a mano tiene exactamente el bug de stacking context que `TooltipPortal` fue creado para resolver.

Limitaciones de `TooltipPortal` que también valen: no emite `aria-describedby` (un lector de pantalla enfocando el ícono no oye nada) y solo responde a `mouseenter`/`focus` — **en tablet y mobile, tocar el ícono ⓘ no hace nada**. Y los tooltips son el principal mecanismo de explicación para un público no técnico: `pixel/analytics/page.tsx:774` explica en castellano llano qué es "Revenue Atribuido". Ese contenido, que es de lo mejor del producto, es inaccesible desde un teléfono.

---

## M-2 — La arquitectura de información de NitroPixel se contradice con las URLs

**Severidad:** MEDIUM
**Archivo:** `src/app/(app)/layout.tsx:26-32` y `:49-57`

```tsx
const PIXEL_CHILDREN = [
  { href: "/pixel/analytics", label: "Analytics" },
  { href: "/pixel", label: "Atribución" },
  { href: "/pixel/canales", label: "Canales" },
  { href: "/pixel/journeys", label: "Journeys" },
  { href: "/pixel/configuracion", label: "Configuración" },
];
// ...
{ href: "/nitropixel", label: "NitroPixel", premium: { badge: "ASSET", ... } }
```

El sidebar muestra **NitroPixel** como padre con cinco hijos indentados. El padre va a `/nitropixel`; los cinco hijos van a `/pixel/*`. Dos árboles de URL para un solo árbol de navegación.

Peor: los dos no comparten diseño. `/nitropixel` es una pantalla de gamificación —"VALORACIÓN ESTIMADA US$…", "NIVEL DEL ACTIVO", "3 **XP**", "**EVOLVING** ∞", "STREAM EN VIVO", una barra de progreso donde `width: Math.max(8, level)%` usa el nivel crudo como porcentaje (`:202`), y *"Cada evento lo hace más fuerte. Cada conversión, más valioso."* Las cinco hijas son pantallas de analytics sobrio.

Y las cifras no conversan: `/nitropixel:171` muestra la valuación en **dólares** (`formatUSD`) mientras `:213` muestra el revenue del mismo activo en **pesos** (`formatARS`), en la misma pantalla, sin explicar el tipo de cambio.

**Qué ve el usuario concretamente:** hace clic en "NitroPixel" esperando ver su pixel, y encuentra un tamagotchi con nivel, XP y valuación en dólares. Hace clic en "Analytics", justo debajo, y encuentra una consola de atribución. No hay forma de saber que son el mismo producto salvo por el sidebar.

**Nota de IA menor:** el sidebar mezcla labels con y sin tilde — "Campanas" (`:144`), "Reputacion" (`:192`), "Configuracion" (`:222`) conviven con "Atribución", "Configuración", "Señales".

---

## M-3 — El copy del producto pierde tildes de forma sistemática

**Severidad:** MEDIUM

**43** strings visibles sin tilde. Y el foco está donde más se ve: **45 de los 46 títulos de widget** del `/dashboard` (`src/app/(app)/dashboard/page.tsx:91-...`) no llevan tilde.

| Lo que dice | Lo que debería decir | Ubicación |
|---|---|---|
| Facturacion | Facturación | `dashboard/page.tsx:91` |
| Tasa Conversion | Tasa de conversión | `:100` |
| Distribucion por Canal / Estado / Dispositivo | Distribución… | `:112, 114, 116` |
| Top Categorias | Top categorías | `:108` |
| Inversion Ads / Inversion por Plataforma | Inversión… | `:120` |
| Posicion Promedio / CTR Organico / Clics Organicos | Posición / Orgánico | SEO widgets |
| Margen Bruto | (ok) | — |
| "Ordenes facturadas" | "Órdenes facturadas" | `:336` |
| "Trafico web (GA4)" | "Tráfico web" | `:339` |
| "Click-through rate organico" | "CTR orgánico" | `:354` |
| "Keywords posicion 1-10" | "Palabras clave en posición 1-10" | `:355` |
| "Sin ventas 60+ dias" | "Sin ventas hace 60+ días" | `:368` |
| "Ordenes con canal identificado" | "Órdenes con canal identificado" | `:374` |
| "Visitantes unicos pixel" | "Visitantes únicos" | `:375` |
| "Despues de gastos" | "Después de gastos" | `:364` |
| "7 dias / 30 dias / 90 dias" | "7 días…" | `:466-468` |
| "Modo edicion" | "Modo edición" | `:1168` |
| "Ordenes Atribuidas" | "Órdenes atribuidas" | `pixel/analytics/page.tsx:786` |

También dentro del texto de los tooltips (que son largos y por lo demás muy buenos): `pixel/analytics/page.tsx:~825` — *"las plataformas (Meta, Google) **tambien** reportan en last-click — usar otra **metrica romperia** la comparacion. Los **modulos** Funnel y Conversion por Canal … pueden mostrar **numeros** distintos."*

Y capitalización inconsistente en el mismo catálogo: `"Facturacion Diaria"` vs `"Facturacion diaria"`, `"Inversion Ads"` vs `"Inversion en ads"` — probables widgets duplicados.

**Qué ve el usuario concretamente:** un dashboard donde 45 de 46 títulos están mal escritos en español. No es un detalle estético: para un producto que se vende a empresas argentinas como herramienta seria de decisión, escribir "Facturacion" y "Ordenes" durante ocho horas al día comunica descuido. Es lo primero que nota alguien que no entiende de tecnología pero sí de idioma.

---

## M-4 — Jerga en inglés y de producto expuesta a un cliente no técnico

**Severidad:** MEDIUM

Términos sin traducir ni explicar, en pantallas de cliente:

| Término | Dónde |
|---|---|
| **Password** (label del login) | `src/app/login/page.tsx:60` |
| Last Click / First Click / Linear / Nitro | `src/app/(app)/pixel/page.tsx:30-36` (`MODEL_LABELS`) — 4 de 5 en inglés, la quinta ("Precisión") en español |
| Revenue, Spend, ROAS, AOV, Blended | `pixel/analytics/page.tsx:772-800`, dashboard, campaigns |
| Journeys, Funnel, Truth Score, Coverage | sidebar + `/pixel/analytics` |
| "Powered by NitroPixel" | `pixel/analytics/page.tsx:726` |
| XP, EVOLVING, STREAM EN VIVO, Customer Journeys | `nitropixel/page.tsx:171-190, 238, 145` |
| Deals, Briefings, Payout, Always On, Overview | módulo Aura |
| Ad Sets / Ad Groups | `campaigns/meta:1002`, `campaigns/google:1222` |

**Qué ve el usuario concretamente:** Tomy es fundador no técnico y sus clientes tampoco lo son. El producto pide elegir entre "Last Click", "First Click", "Linear" y "Nitro" sin decir en criollo qué significa cada uno — el `MODEL_DESCRIPTIONS` (`:37-41`) *sí* tiene la explicación buena en castellano ("100% del crédito al último canal antes de la compra"), pero el label sigue en inglés, o sea que la decisión se toma sobre la etiqueta incomprensible y la explicación queda en segundo plano.

**Positivo a preservar:** los `tooltip` de `/pixel/analytics:774-798` son excelentes microcopy — explican *qué es*, *qué NO es*, y por qué el número puede diferir de Meta. Ese es el estándar; el resto del producto no lo alcanza.

---

## M-5 — Las primitivas oficiales se usan en 11 archivos de ~110; el resto tiene su propio sistema

**Severidad:** MEDIUM

`src/components/enterprise/ui.tsx` (Button, Card, CardHeader, CardBody, Badge, Stat, LivePulse) está importado por:

```
(app)/bondly/ltv     (app)/bondly/overview     (app)/bondly/senales
(app)/chat           (app)/layout.tsx          (app)/pixel/journeys
(app)/pixel/page     (app)/products            design-preview
components/dashboard/DateRangeFilter           components/enterprise/Sidebar
```

Once. En paralelo:

- **15 objetos `THEME` locales** (`grep -c "^const THEME = {"`), 14 de ellos en Aura, copiados con drift: unos tienen `accent`, otros no; `danger: "#b91c1c"` está hardcodeado en 8 de ellos; algunos suman `#047857` (emerald-800) como **segundo verde de éxito** junto al accent `#2F9153`.
- **18 archivos** con `cardStyle` / `cardShadow` propios.
- `src/components/enterprise/Sidebar.tsx` existe, pero `layout.tsx` renderiza su propio sidebar inline (`:293-390`). El único importador del componente es `src/app/design-preview/page.tsx:4`. **El sidebar "oficial" es el que nadie usa.**

Herencia visible de la migración a medias — `src/app/(app)/aura/deals/page.tsx:~120`:
```tsx
pink:   "rgb(var(--ent-accent))",
purple: "rgb(var(--ent-ink-40))",
cyan:   "rgb(var(--ent-ink-40))",
gradient:     "rgb(var(--ent-ink))",
gradientText: "rgb(var(--ent-ink))",
```
Se migraron los valores dejando el vocabulario viejo. El código sigue diciendo `THEME.pink` y `THEME.gradientText` para pintar ink cálido sólido. Funciona, pero el próximo que toque el archivo va a leer "gradient" y va a asumir que hay uno.

---

## M-6 — Código muerto y variantes duplicadas que quedaron de la migración

**Severidad:** MEDIUM

| Qué | Archivo | Estado |
|---|---|---|
| `VisualTutorials 2.tsx` (1.100 líneas, con espacio en el nombre) | `src/components/VisualTutorials 2.tsx` | Duplicado de sistema de archivos, commiteado, **0 importadores** |
| `BondlyAuroras` | `src/components/bondly/primitives.tsx:84-86` | Devuelve `null` "para no romper imports". **0 importadores externos** |
| `enterprise/Sidebar.tsx` | — | Solo lo usa `/design-preview` |
| `KpiCard` / `WeeklySummary` / `OrdersHero` | `src/components/dashboard/`, `src/components/orders/` | Importados solo vía el barrel; `KpiCard` compite con 15 implementaciones más |
| Keyframes neutralizados a inertes | `src/app/(app)/layout.tsx:265-281` | `pixelGlow`, `pixelBreath`, `pixelOrbit`, `pixelOrbitReverse` — 4 `@keyframes` que no hacen nada, inyectados en **todas** las páginas para no romper `BrandLogo` |
| Zonas muertas | `src/app/(app)/aura/inicio/page.tsx:2971` | `{false && (<>…` — bloque desactivado dentro de un archivo de 3.047 líneas |
| Comentario obsoleto | `src/app/(app)/layout.tsx:417` | *"Aurum + NitroPixel routes get full-bleed **dark canvas**"* — ya no hay dark canvas; las 7 ramas del ternario devuelven todas `bg-canvas` |
| Tokens legacy vivos | `src/app/globals.css:10-22` | `--nitro-bg: #0A0A0A`, `--nitro-gradient` naranja→rojo→amarillo, todavía usados por `.btn-nitro` (`:230`), `.nitro-card::before` (`:198`), `.glow-orange` (`:221`) |
| `.light-canvas` con la paleta anterior | `src/app/globals.css:307-355` | Redefine `--nitro-text2: #6B7280`, `--nitro-muted: #9CA3AF` (**2,54:1**), `--nitro-border: #E2E5EA` — el sistema **cool-gray** que el barrido eliminó de las clases, todavía vivo como CSS |
| `body` en dark | `src/app/globals.css:47-53` | `background-color: var(--nitro-bg)` = `#0A0A0A`. Todo el chrome claro se pinta encima; cualquier hueco de layout muestra negro |
| Ruido global | `src/app/globals.css:56-65` | `body::before` con `feTurbulence` a `z-index: 9999` sobre **toda** la app — grain, explícitamente descartado en `design-appstack-enterprise.local.md` §"Descartar" |
| `@ts-nocheck` | 290 archivos | Incluye `src/app/(app)/pixel/canales/page.tsx:1`, `src/components/PixelInstallBanner.tsx:1`, `src/components/bondly/primitives.tsx:1` |

---

## M-7 — Archivos que superan por 3-4× el límite de 800 líneas

**Severidad:** MEDIUM

`~/.claude/rules/ecc/common/coding-style.md` fija 200-400 típico, **800 máximo**. **37 archivos** lo superan:

| Líneas | Archivo |
|---|---|
| 3.047 | `src/app/(app)/aura/inicio/page.tsx` |
| 2.674 | `src/app/(app)/finanzas/costos/page.tsx` |
| 2.634 | `src/app/(app)/seo/page.tsx` |
| 2.554 | `src/app/(app)/alertas/reglas/page.tsx` |
| 2.479 | `src/app/(app)/pixel/analytics/page.tsx` |
| 2.478 | `src/app/(app)/products/page.tsx` |
| 2.413 | `src/components/OnboardingOverlay.tsx` |
| 2.199 | `src/app/(app)/bondly/ltv/page.tsx` |
| … | 29 más entre 800 y 2.010 |

**Por qué es un hallazgo de diseño y no solo de código:** estos archivos son precisamente los que concentran los hallazgos anteriores. `seo/page.tsx` tiene 87 clases de paleta vieja porque nadie puede auditar 2.634 líneas de JSX. Cada barrido de diseño los saltea, y la deuda visual se acumula ahí. La correlación entre "archivo grande" y "archivo con más restos de migración" en esta auditoría es casi perfecta.

---

## M-8 — Performance percibida: 75 de 82 páginas son client-side, y `/products` trae el catálogo entero

**Severidad:** MEDIUM

- **75 de 82** páginas de `(app)` son `"use client"`. Las 7 restantes son redirects. Incluso `layout.tsx` es cliente, con las 8 secciones de `NAV_GROUPS` (≈200 líneas de datos + paths SVG) enviadas en el bundle.
- `src/app/(app)/products/page.tsx:471` — `fetch("/api/metrics/products?from=…&to=…")` sin `limit`, sin paginación de servidor. La paginación es client-side: `:619` `sortedFiltered.slice(s, s + ITEMS_PER_PAGE)` con `ITEMS_PER_PAGE = 30` (`:463`). Para un catálogo tipo Arredo, eso es traer todo a memoria para mostrar 30.
- **99** `<ResponsiveContainer>` de Recharts, todos en componentes cliente, muchos renderizando con `series` vacío (ver C-3).
- `src/app/(app)/dashboard/page.tsx:1177-1182` — el skeleton de carga es `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` con 9 ítems, pero el layout real es el sistema de slots configurable del usuario. **El esqueleto no tiene la forma del contenido** → salto de layout garantizado en cada carga.
- `src/app/(app)/nitropixel/page.tsx:90` — `setInterval(load, 20_000)` que no se pausa con `document.hidden`, re-renderizando la página completa cada 20s aunque la pestaña esté en segundo plano.

---

## M-9 — Los estados especiales de `SectionGuard` usan una paleta ajena, y su loader no es el unificado

**Severidad:** MEDIUM
**Archivo:** `src/components/SectionGuard.tsx:46-53, 59-73`

El estado `LOCKED_INTEGRATION` (`:75-104`) está **muy bien**: tokens correctos, copy claro en castellano rioplatense (*"Conectá Meta Ads para ver esta sección… volvé acá y la vas a ver activa"*), CTA primario, lista de las demás integraciones faltantes. Es el mejor empty state del producto.

Pero al lado:
- `:46-53` — el loading usa `<Loader2 className="animate-spin" /> Cargando…`, no `PageLoader`. El guard **compartido** rompe la unificación.
- `:59-73` — el estado `MAINTENANCE` está entero en `amber-200 / amber-50 / amber-100 / amber-600 / amber-900` de Tailwind, no en `live-amber` ni en tokens.
- `:107-112` — el fallback dice *"Estado desconocido."* al usuario final. Es un mensaje de desarrollador.

---

## M-10 — `PixelInstallBanner` se puede descartar para siempre; después el producto muestra ceros sin explicación

**Severidad:** MEDIUM
**Archivo:** `src/components/PixelInstallBanner.tsx:40-45, 57`

```tsx
const dismiss = () => {
  localStorage.setItem(`nitropixel-banner-dismissed-${status.orgId}`, "true");
  setDismissed(true);
};
// ...
if (!status || status.isInstalled || dismissed) return null;
```

Sin expiración, sin re-aparición.

**Qué ve el usuario concretamente:** un cliente cierra el banner el día 1 "para verlo después", nunca instala el snippet, y a partir de ahí `/nitropixel`, `/pixel`, `/pixel/analytics`, `/pixel/canales` y `/pixel/journeys` — cinco pantallas del sidebar, todo el producto estrella — le muestran ceros y skeletons infinitos **sin una sola pista** de que la causa es que falta pegar un script. Combinado con C-1 (la píldora que dice "EN VIVO" arriba) y C-4 (los ceros de `/nitropixel`), el producto le está diciendo activamente que todo está bien y que sus datos son cero.

---

# LOW

## L-1 — Íconos: 159 SVG inline conviven con lucide-react
`UI_VISION_NITROSALES.md` §8: *"NitroSales usa exclusivamente lucide-react"*. 110 archivos importan lucide; **159 `<svg>` a mano** en 35 archivos. Los peores están donde más se ven: `src/app/(app)/layout.tsx:52-224` (los 15 íconos del sidebar como paths crudos), `src/app/(app)/pixel/analytics/page.tsx:777-798` (los 4 íconos del KPI strip), `src/app/(app)/pixel/page.tsx:~518` (el engranaje del header). Estos paths son Heroicons v2 — el segundo ítem de la lista de prohibidos.

## L-2 — `hover` que no hace nada
- `src/app/(app)/pixel/analytics/page.tsx:626` — `className="... bg-ink text-white ... hover:bg-ink ..."` en el botón "Reintentar": el hover pinta el mismo color.
- `src/app/(app)/pixel/analytics/page.tsx:~897` — `className="text-ink-60 hover:text-ink-60"` en el link "Cambiar ponderación".

## L-3 — `hover:scale-[1.02]` en cards de datos
`src/app/(app)/pixel/analytics/page.tsx:802` — las 4 cards del KPI strip escalan al pasar el mouse. `design-appstack-enterprise.local.md` §Micro-interacciones es explícito: *"Hover = shift sutil de fondo, no glow"*, y *"en un dashboard Operate la data se ESCANEA"*. Escalar texto tabular produce reflow y difuminado del subpíxel: el número se pone borroso justo cuando el usuario lo apunta.

## L-4 — Sombras de modal heredadas del dark mode
`src/app/(app)/pixel/page.tsx:1543` — `boxShadow: "0 20px 60px rgba(0,0,0,0.5)"` sobre un panel `rgba(245,243,238,0.95)`. Un 50% de negro puro bajo una superficie clara da un halo sucio; el sistema tiene `shadow-ent-soft` para esto.

## L-5 — Modelo de foco del sidebar de baja visibilidad
`src/app/(app)/layout.tsx:~350` — `focus-visible:ring-accent/40 focus-visible:ring-offset-surface`. El accent al 40% sobre surface (`#F5F3EE`) queda por debajo del 3:1 mínimo para indicadores no textuales. El foco de teclado del elemento de navegación principal es casi invisible.

## L-6 — Enlaces internos con `<a>` en vez de `<Link>`
2 casos: `src/app/(app)/pixel/analytics/page.tsx:~897` y `src/components/AdsAuthBanner.tsx`. Producen recarga completa de página: se ve el flash blanco y se vuelve a disparar toda la cadena `PageLoader → AuroraLoader → app` de C-5.

## L-7 — Signos de apertura de interrogación faltantes
`src/app/(app)/aura/pagos/page.tsx:171` — `"Eliminar este pago definitivamente?"`; `src/app/(app)/pixel/analytics/page.tsx:2359` — `"Borrar esta inversión?"`. Otros `confirm()` del mismo archivo sí los llevan.

## L-8 — Tablas sin contenedor de scroll horizontal
3 archivos con `<table>` y sin `overflow-x-auto`: `src/app/(app)/admin/onboardings/page.tsx`, `src/app/(app)/influencers/applications/page.tsx`, `src/components/orders/CouponsCard.tsx`. Los dos primeros son internos; `CouponsCard` es de cliente y va dentro de `/orders`. (El resto del producto está bien: 46 wrappers de scroll para 52 tablas, y solo 14 `grid-cols-N` fijos sin prefijo responsive.)

## L-9 — Exportaciones a PDF con la paleta anterior
`src/app/print/escenarios/[id]/page.tsx` (55 clases slate) y `src/app/print/fiscal/page.tsx` (26). Son las vistas que el cliente imprime y le muestra a su contador o a su directorio: llevan el branding de NitroSales en el sistema visual que ya no existe.

## L-10 — Landing pública de creadores sin migrar
`src/app/i/[slug]/[code]/page.tsx` — 133 clases de paleta legacy, 42 de ellas slate/gray. Es la página pública que un creador de Aura recibe por link: la superficie más externa del producto, en el diseño más viejo.

---

# Resumen

## (a) Tabla de hallazgos

| ID | Severidad | Hallazgo | Ancla principal |
|---|---|---|---|
| C-1 | CRITICAL | "EN VIVO" hardcodeado app-wide | `(app)/layout.tsx:414` |
| C-2 | CRITICAL | El dashboard no puede mostrar errores (`setError` nunca se llama) | `(app)/dashboard/page.tsx:445,544,1173` |
| C-3 | CRITICAL | Vacío y error se pintan como skeleton infinito (8 sitios) | `dashboard/WidgetFormats.tsx:445,528,319,386` |
| C-4 | CRITICAL | `/nitropixel` muestra US$0 / 0 eventos / 0 días como dato real | `(app)/nitropixel/page.tsx:100-106,378` |
| C-5 | CRITICAL | Loader dark con auroras a pantalla completa en cada carga | `OnboardingGate.tsx:57,77-110` |
| C-6 | CRITICAL | Login + onboarding + invitación sin migrar (4 sistemas en 5 pantallas) | `login/page.tsx:32,79`; `OnboardingOverlay.tsx:190-219` |
| H-1 | HIGH | 81 loaders de texto plano vs 9 `PageLoader` | 58 archivos; `SectionGuard.tsx:46` |
| H-2 | HIGH | 16 KPI cards + 4 sistemas de Card | tabla en H-2 |
| H-3 | HIGH | `ink-40` = 3,77:1 × 1.489 usos; 964 textos ≤10px | `globals.css:38`; `enterprise/ui.tsx:113,117` |
| H-4 | HIGH | Fondos/bordes invisibles por alpha heredado del dark (28×) | `nitropixel/page.tsx:223`; `pixel/page.tsx:476` |
| H-5 | HIGH | `/aura/paletas` dark neón vivo en producción | `aura/paletas/page.tsx:71,94,117` |
| H-6 | HIGH | `/design-preview` público sin auth con cifras de cliente | `design-preview/page.tsx` |
| H-7 | HIGH | 231 gradientes, 358 emerald, 7 catColors en el dashboard | `dashboard/page.tsx:91+`; `seo/page.tsx:234` |
| H-8 | HIGH | 21 páginas sin `<h1>`; `<h1>` de Atribución a 14px | `pixel/page.tsx:508` |
| H-9 | HIGH | 3 `htmlFor` para 223 inputs; 152 `outline-none` sin foco | `aura/campanas/nueva/page.tsx:293-460` |
| H-10 | HIGH | Sin `prefers-reduced-motion` global; el que hay solo vive en Bondly | `globals.css`; `bondly/primitives.tsx:52-75` |
| H-11 | HIGH | 39 `alert()`/`confirm()` nativos en flujos de dinero | `aura/pagos/page.tsx:153,171` |
| M-1 | MEDIUM | 159 `title=` + 2 sistemas de tooltip; sin acceso táctil | `TooltipPortal.tsx` (2 usos) |
| M-2 | MEDIUM | `/nitropixel` vs `/pixel/*`: IA contradictoria + USD/ARS mezclados | `layout.tsx:26-32`; `nitropixel:171,213` |
| M-3 | MEDIUM | 45 de 46 títulos del dashboard sin tildes | `dashboard/page.tsx:91+` |
| M-4 | MEDIUM | Jerga en inglés sin traducir para público no técnico | `pixel/page.tsx:30-36`; `login:60` |
| M-5 | MEDIUM | Primitivas usadas en 11/110 archivos; 15 `THEME` locales | `enterprise/ui.tsx` |
| M-6 | MEDIUM | Código muerto y tokens legacy (11 ítems) | `globals.css:10-22,307-355`; `VisualTutorials 2.tsx` |
| M-7 | MEDIUM | 37 archivos >800 líneas (máx. 3.047) | `aura/inicio/page.tsx` |
| M-8 | MEDIUM | 75/82 páginas cliente; `/products` sin paginación de servidor | `products/page.tsx:471` |
| M-9 | MEDIUM | `SectionGuard`: loader propio, amber ajeno, "Estado desconocido." | `SectionGuard.tsx:46,59,107` |
| M-10 | MEDIUM | Banner del pixel descartable para siempre | `PixelInstallBanner.tsx:40,57` |
| L-1…L-10 | LOW | Íconos, hovers muertos, sombras dark, prints, landing pública | ver sección LOW |

**Totales: 6 CRITICAL · 11 HIGH · 10 MEDIUM · 10 LOW.**

## (b) Veredicto sobre la migración

> **La migración de diseño está terminada en un ~65%: consiguió el barrido cromático dentro de `src/app/(app)/` (0 slate, 0 gray en 82 páginas, tokens `--ent-*` como fuente única) pero no cruzó ninguna de sus tres fronteras — el perímetro sin autenticar (login/onboarding/invitación/prints, 4 sistemas visuales en 5 pantallas), los estados no-felices (vacío = error = cargando = el mismo shimmer infinito) y el nivel semántico (16 KPI cards, 4 sistemas de Card, 5 loaders, 231 gradientes, 358 emerald y 875 hex de la paleta *nueva* escritos a mano en vez de tokens).**

Base del 65%, verificable:

| Dimensión | Estado | Evidencia |
|---|---|---|
| Tokens definidos y bien construidos | **100%** | `globals.css:24-43` + `tailwind.config.js` con `rgb(var()/<alpha>)` |
| Barrido cromático dentro de `(app)` | **~90%** | 0 slate / 0 gray; quedan 358 emerald + 131 blue-family |
| Barrido fuera de `(app)` | **~10%** | login/onboarding/accept-invite/unauthorized/print/i sin tocar |
| Adopción de primitivas | **~10%** | 11 de ~110 archivos importan `enterprise/ui.tsx` |
| Unificación de loaders | **~13%** | 9 `PageLoader` vs 58 archivos con "Cargando" a mano |
| Estados vacío / error | **~15%** | bien en `/pixel/analytics` y `SectionGuard`; roto en `/dashboard` y `/nitropixel` |
| Accesibilidad (contraste, foco, labels) | **~25%** | `ink-40` 3,77:1 × 1.489; 3 `htmlFor` / 223 inputs; sin reduced-motion global |
| Consistencia de copy en español | **~40%** | 45/46 títulos del dashboard sin tilde; inglés sin traducir |
| Eliminación de gradientes/glow/dark | **~70%** | heroes de finanzas y overlays de Aura sí se limpiaron; quedan 231 gradientes + `/aura/paletas` + el perímetro |

Los diez commits de barrido optimizaron lo que `grep` puede encontrar: nombres de clases de Tailwind. Todo lo que no es una clase de Tailwind — un alpha heredado, un `?? 0`, un `status="LIVE"` literal, un archivo fuera de `(app)`, un `THEME` local, un `<p>Cargando</p>` — sobrevivió intacto. Y la nota metodológica del propio audit de agosto ya lo advertía: *"NO grep de clases — leer JSX… los misses históricos usan hex hardcodeado invisible al scan"*. Se siguió esa advertencia para el audit, no para la remediación.

## (c) Las 5 cosas que arreglaría primero con un solo día

1. **Que el producto deje de mentir cuando no tiene datos** *(~3h — resuelve C-1, C-2, C-3, C-4)*
   Tres cambios acoplados: (a) `layout.tsx:414` — pasarle a `LivePulse` el `liveStatus` real y borrar el badge emerald duplicado de `pixel/analytics:730-736`; (b) crear un `<EmptyState>` y un `<ErrorState>` y reemplazar los 8 `dash-skeleton` de `WidgetFormats.tsx` (`:211,254,290,319,386,445,528`), más llamar `setError` de verdad en los `.catch` de `dashboard/page.tsx:570,578,587`; (c) en `nitropixel/page.tsx:100-106`, si `data === null` mostrar el estado de error **en lugar** de la página, no debajo. Es el único ítem que cambia decisiones de negocio y el que genera los tickets de soporte.

2. **Cerrar el perímetro visual** *(~3h — resuelve C-5, C-6, H-6, H-5)*
   `OnboardingGate.tsx:57` → `<PageLoader minHeight="100vh" />` sobre `bg-canvas` (borra el `AuroraLoader` entero); `login` / `forgot-password` / `reset-password` → canvas hueso + botón `bg-ink` (borrar el gradiente de `login:79`); `OnboardingOverlay:190-219` → borrar `AuroraBackground`; `accept-invite` y `unauthorized` → `bg-slate-50` → `bg-canvas`. Y borrar `/design-preview` y `/aura/paletas` del repo. Es el mayor cambio de percepción por hora invertida, y arregla el test del pitch a inversores.

3. **Subir el piso de legibilidad** *(~1h — resuelve la mitad de H-3)*
   Un cambio en `globals.css:38`: `--ent-ink-40` de `#83807A` a ~`#6F6C65` (llega a 4,6:1 sobre canvas) — y con eso los 1.489 usos pasan a cumplir AA de una. Además subir `--ent-amber` de `#C98A1A` (2,82:1) a ~`#8A5E12`, y en `enterprise/ui.tsx:113` llevar "EN VIVO" de `text-[10px]` a `text-[11px]` con el accent oscurecido. Un archivo, cuatro líneas, todo el producto legible.

4. **Un solo estado de carga y un solo `prefers-reduced-motion`** *(~2h — resuelve H-1, H-10)*
   Pegar el bloque `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { … } }` de `UI_VISION_NITROSALES.md` §4 Ley 5 en `globals.css` (y sacar el de `bondly/primitives.tsx:52-75`, que hoy lo aplica global de forma intermitente). Después, un find/replace de los 81 `"Cargando…"` a `<PageLoader label="…" />`, empezando por `SectionGuard.tsx:46` que es compartido.

5. **Las tildes del dashboard y los diálogos de dinero** *(~1,5h — resuelve M-3 y lo peor de H-11)*
   Corregir los 46 `title:` y los `sub:` de `dashboard/page.tsx:91-375` + los quick ranges de `:466-468` + "Modo edicion" de `:1168`. Y reemplazar por un modal propio los 6 `confirm()`/`alert()` de `aura/pagos/page.tsx:153,164,171,178,195,928` — que son cancelar, eliminar y restaurar pagos a creadores. Lo primero es lo que un fundador no técnico nota en dos segundos; lo segundo es donde un cuadro gris del navegador destruye la credibilidad en el momento exacto de decidir sobre plata.

*(Si sobrara media hora al final: cambiar los 7 `catColor` de `dashboard/page.tsx:91+` a `ink-40` con el accent solo para la categoría activa. Es un solo find/replace y saca el arcoíris de la primera pantalla del producto.)*

---

*Auditoría read-only. No se modificó ningún archivo del repositorio.*
