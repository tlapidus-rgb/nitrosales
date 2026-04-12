# UI_VISION_NITROSALES.md — La biblia visual de NitroSales

> **INSTRUCCIÓN OBLIGATORIA**: Claude DEBE leer este archivo COMPLETO antes de tocar cualquier elemento visual, layout, animación, color o componente UI de NitroSales. Si Claude está por hacer un cambio de UI sin haber leído esto, está violando la regla.

> Este documento captura la visión, ambición y criterio estético de Tomy Lapidus (fundador de NitroSales) para la plataforma. Tomy NO es desarrollador, pero tiene un ojo entrenado para detectar lo que se ve "barato" vs "world-class". Su estándar es altísimo y no negocia.

---

## 1. La ambición — el norte que nunca se baja

NitroSales no es "una app más para vendedores online". Es **el dashboard que un fundador de ecommerce abre todas las mañanas y siente que está manejando una nave espacial**. La sensación tiene que ser:

- **"Esto cuesta caro"** — aunque no lo cueste. Cada pixel tiene que transmitir que detrás hay ingeniería y diseño obsesivo.
- **"Esto es de Silicon Valley"** — el benchmark mental no es Tiendanube ni VTEX Admin. Es Linear, Stripe, Vercel, Notion, Arc Browser, Raycast, Superhuman.
- **"Yo (Tomy) puedo mostrar esto en una mesa con inversores y no me da vergüenza"** — más aún: lo muestro y se quedan callados mirando.
- **"Si lo veo en mobile en el subte, sigue siendo hermoso"** — nada de "responsivo de compromiso".

**El benchmark NO es competidores LATAM.** Es el top 1% de SaaS global. Si algo se ve como Tiendanube admin, está mal. Si algo se ve como un dashboard de Stripe, está cerca. Si se ve como Linear, está bien.

---

## 2. Referencias de calidad — los nombres que importan

Cuando Tomy dice "world-class", "unicorn-grade", "premium", "moderno e innovador", está pensando en estos productos específicos:

| Producto | Qué tomar de él |
|---|---|
| **Linear** | Easing curves perfectas, transitions sub-200ms, command palette (Cmd+K), tipografía exquisita, micro-interacciones que se sienten físicas |
| **Stripe Dashboard** | Light mode premium, contraste sutil pero firme, datos densos sin sentirse cargado, gráficos que respiran |
| **Vercel Dashboard** | Dark mode elegante, gradientes sutiles, estado de deployments con iconos vivos, monospace como acento |
| **Notion** | Tipografía generosa, espacios en blanco como herramienta, hover states sutiles |
| **Arc Browser** | Gradientes "auroras" (radiales blureados), colores que se sienten vivos sin saturar |
| **Raycast** | Densidad informativa con ritmo perfecto, atajos visibles, shortcuts |
| **Superhuman** | Velocidad percibida (todo se siente instantáneo), animaciones que confirman acciones |
| **Cron / Notion Calendar** | Layout matemático, alineaciones perfectas |

**Si Claude no conoce alguno de estos productos, debe asumir que su criterio NO está calibrado y pedir más contexto antes de proponer una UI.**

---

## 3. Light vs Dark — cuándo cada uno

Esto NO es preferencia arbitraria. Cada modo tiene su lugar lógico:

### LIGHT MODE — para las páginas "consumidor del dato"
Estas son las páginas que Tomy y sus usuarios miran todo el día para tomar decisiones. Light mode da claridad, lectura rápida, sensación de "panel limpio profesional".

**Aplicar light mode en:**
- `/analytics` (NitroPixel Analytics) — el dashboard principal de datos first-party
- `/products` — gestión de catálogo
- `/orders` — listado de órdenes
- `/customers` — vista de clientes
- Cualquier página de métricas, reportes, listados, configuración del usuario

**Paleta light:**
- Fondo base: blanco puro `#ffffff` o gradiente muy sutil `#ffffff → #fbfbfd → #f4f5f8`
- Fondo de cards: `#ffffff` con border `rgba(15,23,42,0.06)` y shadow multi-layer
- Texto principal: `#0f172a` (slate-900)
- Texto secundario: `#64748b` (slate-500)
- Acentos vivos: cyan `#06b6d4`, violet `#8b5cf6`, naranja `#f97316`, indigo `#6366f1`
- **Nunca**: grises planos sin shadow, fondos `#f0f0f0` chatos, borders `#ddd` de Bootstrap

### DARK MODE — para las páginas "cabina interna" y "marca"
Dark mode es para cuando la página es **internal tools**, **cabina del operador**, o cuando el branding necesita transmitir "esto es serio, esto es poder".

**Aplicar dark mode en:**
- `/admin/*` — el admin console interno (cabina de operación de Tomy)
- Hero sections de marca / landing
- Páginas de "configuración avanzada" / "developer tools"
- Modales de alta importancia (alertas críticas, confirmaciones destructivas)

**Paleta dark:**
- Fondo base: `#05070d` (casi negro azulado, NO `#000000`) o `#0a0e1a`
- Cards: `rgba(255,255,255,0.04)` con border `rgba(255,255,255,0.08)`
- Texto principal: `#ffffff` con `opacity: 0.95`
- Texto secundario: `rgba(255,255,255,0.5)` o `slate-400`
- Acentos: cyan `#22d3ee` (más brillante que en light), violet `#a78bfa`, los acentos brillan más en dark
- **Tipografía monospace** como acento (`font-mono tracking-[0.25em] uppercase text-[10px]`) para labels técnicas
- **Nunca**: dark gris medio `#333`, "dark mode de Bootstrap", fondos púrpuras saturados

### Regla de oro
**Si Claude no sabe si una página debe ser light o dark, mira la página vecina del mismo módulo y usa el mismo criterio. La consistencia interna pesa más que la decisión individual.**

---

## 4. Animaciones — la diferencia entre "se ve" y "se siente"

Las animaciones son donde NitroSales se separa de un dashboard mediocre. Pero animación mala es PEOR que sin animación. La regla es:

### Las 5 leyes de animación en NitroSales

**Ley 1 — Easing curves: SIEMPRE cubic-bezier, NUNCA `ease`/`linear`**

```css
/* CORRECTO — Linear/Stripe-grade */
transition: all 280ms cubic-bezier(0.16, 1, 0.3, 1);

/* PROHIBIDO */
transition: all 0.3s ease;
transition: all 200ms linear;
```

La curva `(0.16, 1, 0.3, 1)` es el "easeOutExpo" suave que usan Linear y Vercel. Es el default de NitroSales.

**Ley 2 — Duración: 180-320ms para micro, 400-600ms para macro, NUNCA más de 800ms**

| Tipo de animación | Duración |
|---|---|
| Hover state, focus, color shift | 180-220ms |
| Card lift, button press | 220-280ms |
| Modal open, drawer slide | 320-420ms |
| Page transition, expand large block | 480-600ms |
| Count-up de números (KPI) | 800-1200ms (excepción justificada) |

**Si una animación dura más de 800ms y no es un count-up, está mal.**

**Ley 3 — Las animaciones confirman, NO decoran**

Cada animación tiene que tener un propósito de feedback. Si una animación está ahí "porque queda lindo" pero no comunica nada, eliminarla.

- ✅ Botón se hunde 1px al click → confirma que el click se registró
- ✅ Card se eleva con shadow al hover → invita a la acción
- ✅ Número cuenta de 0 al valor → comunica magnitud y vida del dato
- ✅ Skeleton shimmer → comunica "estoy cargando, no me cierres"
- ❌ Logo que rota porque sí → ruido visual
- ❌ Fade in/out de elementos estáticos → distrae

**Ley 4 — Animaciones específicas que SÍ usamos en NitroSales**

Estas son patrones probados que ya están en producción y deben ser el default:

1. **Smooth expand/collapse** vía `grid-template-rows: 0fr → 1fr` (no max-height, no display:none).
2. **Count-up de KPIs** con `requestAnimationFrame` + easeOutQuart + `prevTargetRef` para from→to.
3. **Skeleton shimmer** vía `linear-gradient + background-position keyframe`.
4. **Sticky header collapse** que reduce padding/opacity al hacer scroll > 96px.
5. **Cmd+K command palette** con `backdrop-filter: blur` y entrance animation.
6. **Stagger entrance** de cards al cargar (cada card aparece con 50-80ms de delay sucesivo).
7. **Refetch overlay** vía clase `.pixel-refetching` que aplica shimmer sutil sin desmontar.
8. **Aurora radial gradients** para hero sections (radial-gradient blureado, posicionado con `position: absolute; inset: 0`).
9. **Prism delimiter** — línea horizontal multi-color como border-bottom de hero (`linear-gradient(90deg, cyan → violet → orange)`).

**Ley 5 — Respect `prefers-reduced-motion` SIEMPRE**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

No es opcional. Es accesibilidad.

---

## 5. Contraste y boundary — el error #1 de Claude

En la sesión 9, Tomy se quejó del header del Analytics: "no se nota bien dónde está, no contrasta, parece que de donde termina al fondo no hay contraste". Esa queja es el patrón que Claude debe evitar SIEMPRE.

### Reglas de contraste y boundary

**Regla 1 — Toda sección/sticky/card debe tener un boundary VISIBLE**

No alcanza con `border-bottom: 1px solid #eee`. Eso es contraste de Bootstrap 2014. El boundary moderno es **multi-capa**:

```css
/* Boundary world-class */
box-shadow:
  0 1px 0 rgba(15, 23, 42, 0.06),         /* hairline */
  0 8px 24px -12px rgba(15, 23, 42, 0.18), /* mid shadow */
  0 22px 40px -28px rgba(15, 23, 42, 0.16); /* far shadow */
```

O para casos especiales (hero, header), un **prism delimiter** multi-color:

```css
border-bottom: 2px solid transparent;
border-image: linear-gradient(90deg, #06b6d4 0%, #8b5cf6 50%, #f97316 100%) 1;
```

**Regla 2 — Backdrop con saturate + blur, no fondo plano**

Para sticky headers y modales, el fondo nunca es color plano. Es:

```css
background: linear-gradient(180deg, #ffffff 0%, #fbfbfd 55%, #f4f5f8 100%);
backdrop-filter: saturate(140%) blur(20px);
-webkit-backdrop-filter: saturate(140%) blur(20px);
```

Esto le da profundidad y "hace" que el contenido de atrás se sienta presente sin distraer.

**Regla 3 — Auroras en hero sections**

Para crear ambiente sin imágenes pesadas, usar 2-3 radial gradients absolutos sutiles:

```jsx
<div className="absolute inset-0 pointer-events-none">
  <div
    style={{
      position: "absolute",
      top: "-20%",
      left: "-10%",
      width: "60%",
      height: "100%",
      background: "radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 60%)",
      filter: "blur(40px)",
    }}
  />
  <div
    style={{
      position: "absolute",
      top: "-15%",
      right: "-5%",
      width: "50%",
      height: "100%",
      background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 60%)",
      filter: "blur(50px)",
    }}
  />
</div>
```

**Regla 4 — Decoraciones absolutas: cuidado con `overflow-hidden`**

Si una decoración absoluta tiene offset negativo (`-bottom-6`, `-top-4`), va a ser CLIPPED por un parent con `overflow-hidden`. Para sombras/glows fuera del bounding box, usar `box-shadow` o `filter: drop-shadow` en el parent mismo, NO un div absoluto hijo.

---

## 6. Tipografía — silenciosa pero crítica

NitroSales usa **Inter** como font principal (debería ya estar configurado en Tailwind config). Las reglas:

| Caso | Clase Tailwind |
|---|---|
| Título principal de página | `text-2xl font-semibold tracking-tight text-slate-900` |
| Sub-título de sección | `text-lg font-medium text-slate-700` |
| Card title | `text-sm font-semibold text-slate-600 uppercase tracking-wide` |
| KPI número grande | `text-4xl font-bold tabular-nums tracking-tight text-slate-900` |
| Body text | `text-sm text-slate-700 leading-relaxed` |
| Caption / metadata | `text-xs text-slate-500` |
| Label técnica (dark mode) | `text-[10px] font-mono tracking-[0.25em] uppercase text-cyan-400/70` |

**Reglas de oro tipográficas:**
- **`tabular-nums` SIEMPRE en números** que pueden cambiar (KPIs, contadores, precios). Sin esto, el número "salta" cuando los dígitos cambian.
- **`tracking-tight` en headings** para que se vean modernos y compactos.
- **NUNCA** usar `font-bold` en body text. Bold solo para títulos y números.
- **Jerarquía clara** — máximo 4 niveles de tamaño en una misma vista.

---

## 7. Componentes específicos — cómo se ven las cosas en NitroSales

### KpiCard (la unidad atómica del dashboard)

Estructura:
```
┌────────────────────────────┐
│ LABEL UPPERCASE (xs gray)  │
│                            │
│ 1,234.56 💎                │ ← número grande, count-up animado
│ ↑ +12.3% vs ayer (cyan)    │ ← delta con color condicional
│                            │
│ [sparkline mini opcional]  │
└────────────────────────────┘
```

- Background: `#ffffff`
- Border: `1px solid rgba(15,23,42,0.06)`
- Shadow: multi-layer (ver Regla 1 de contraste)
- Hover: lift 2px + shadow más intenso
- Padding: `p-5` o `p-6`
- Border radius: `rounded-2xl` (NO `rounded-md` ni `rounded-lg`)
- Si hay delta: cyan-500 si positivo, rose-500 si negativo, slate-400 si neutro

### Botones

| Tipo | Clase |
|---|---|
| Primary (acción principal) | `bg-slate-900 text-white hover:bg-slate-800 px-4 py-2 rounded-lg font-medium text-sm transition` |
| Secondary | `bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium text-sm` |
| Ghost | `text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-md text-sm` |
| Danger | `bg-rose-600 text-white hover:bg-rose-700 ...` |

**NUNCA**:
- Botones con gradientes fluo
- Botones con border-radius extremo (`rounded-full` solo para iconos circulares)
- Botones azules `#0066ff` planos de Bootstrap
- Botones con sombras drop-shadow exageradas

### Inputs y forms

- Border: `border border-slate-200`
- Focus: `focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10`
- Padding: `px-3 py-2`
- Border radius: `rounded-lg`
- NUNCA placeholder gris muy claro (mínimo `text-slate-400`)

### Sidebar (admin / nav)

- Width fija: `w-64`
- Background: dark mode si admin (`bg-[#05070d]`), light si user
- Active item: background sutil `bg-white/5` (dark) o `bg-slate-900/5` (light)
- Icons: `lucide-react`, tamaño `w-4 h-4`, alineados con label
- Section dividers con `border-t border-white/5`

---

## 8. Iconografía — solo lucide-react

**NitroSales usa exclusivamente `lucide-react`** para iconos. NO usar:
- Heroicons
- Font Awesome
- Material Icons
- Iconos custom SVG (excepto logos de marca)

Tamaños standard:
- Inline en texto: `w-4 h-4`
- Botones: `w-4 h-4` o `w-5 h-5`
- Hero sections: `w-8 h-8` o `w-10 h-10`
- Sidebar nav: `w-4 h-4`

Color: heredan `currentColor`, nunca hardcodear.

---

## 9. Lo que está PROHIBIDO — anti-patrones

Si Claude hace cualquiera de estas cosas, está rompiendo la visión:

1. ❌ **Bordes grises planos `#ddd`/`#eee`** sin shadow ni gradient
2. ❌ **Border-radius pequeño** (`rounded-md`, `rounded-sm`) en cards/modales — usar `rounded-xl` o `rounded-2xl`
3. ❌ **Fondos `#f0f0f0`** o grises chatos sin gradient
4. ❌ **Animaciones con `ease`/`linear`** — siempre cubic-bezier
5. ❌ **Animaciones de más de 800ms** salvo count-up
6. ❌ **Tipografía sin `tracking-tight`** en headings
7. ❌ **Números sin `tabular-nums`** en KPIs/counters
8. ❌ **Botones con gradientes fluo** o sombras dramáticas
9. ❌ **Fondos púrpura saturado** en dark mode (queda "gaming", no premium)
10. ❌ **Iconos de Material/Heroicons** — solo lucide-react
11. ❌ **Spacing inconsistente** — siempre múltiplos de 4 (Tailwind: `p-1, p-2, p-3, p-4, p-5, p-6, p-8`)
12. ❌ **Mobile "responsive de compromiso"** — mobile tiene que verse igual de premium
13. ❌ **Loading states con `<p>Cargando...</p>`** — siempre skeleton shimmer
14. ❌ **Confirmaciones con `alert()` o `confirm()`** — siempre modal custom
15. ❌ **Tooltips nativos del browser (`title=`)** salvo casos secundarios — usar tooltip custom

---

## 10. Cómo interpretar el feedback de Tomy

Tomy es no técnico pero tiene vocabulario propio. Acá está la traducción:

| Lo que dice Tomy | Lo que significa técnicamente |
|---|---|
| "Se ve barato" | Falta shadow multi-layer, gradients sutiles, o tracking-tight |
| "No contrasta" | El boundary entre secciones no se nota — agregar shadow o prism delimiter |
| "Parece de Bootstrap" | Bordes planos, border-radius chico, colores planos |
| "Falta vida" | Faltan micro-animaciones, hover states, count-ups |
| "Es muy estático" | No hay stagger entrance, no hay transitions on hover |
| "Queda cargado" | Demasiada información sin jerarquía visual o spacing |
| "No se entiende qué es importante" | Falta jerarquía tipográfica (tamaños iguales) |
| "Se siente lento" | Las transitions son > 400ms o no hay loading skeleton |
| "Parece amateur" | Spacing inconsistente, alineaciones rotas, tipografía sin tracking |
| "World-class / unicorn-grade" | Linear/Stripe/Vercel level — máxima ambición |
| "Más moderno" | Más blur, más gradient sutil, más auroras, más cubic-bezier |
| "Más innovador" | Animación o interacción que no existe en otras apps LATAM |

---

## 11. Workflow obligatorio antes de cualquier cambio de UI

Antes de tocar UI, Claude DEBE:

1. **Leer este documento entero** (no skim, leer)
2. **Identificar a qué sección pertenece** la página/componente que va a modificar
3. **Verificar light vs dark** según sección 3
4. **Mirar 2 referencias del top 1%** mentalmente (Linear/Stripe/Vercel) — "¿cómo lo harían ellos?"
5. **Listar las 5 cosas premium** que va a aplicar (tipografía, contraste, animación, spacing, iconos)
6. **Ejecutar el cambio**
7. **Auto-revisar** contra la lista de prohibidos (sección 9) antes de pushear
8. **Tomar screenshot mental**: ¿esto se vería bien en una pitch deck a inversores?

Si la respuesta a la pregunta 8 es "no" o "tal vez", **rehacer**. No pushear.

---

## 12. La pregunta final que Claude debe hacerse

Antes de cualquier `git push`, Claude debe preguntarse:

> **"Si Tomy abre esta página mañana en su laptop con un café al lado, ¿se va a sentir orgulloso de mostrársela a alguien, o va a sentir un pinchazo de 'ahh, esto se podría ver mejor'?"**

Si es lo segundo, no se pushea. Se rehace.

---

## 13. Estructura de zonas — NitroPixel Analytics (`/analytics`)

La página de analytics está organizada en 7 zonas secuenciales, cada una envuelta en try-catch IIFE para aislamiento de errores. Patrón UI consistente: `cardStyle` + `cardShadow` + animación `stagger-card` con delays incrementales.

| Zona | Nombre | Descripción |
|------|--------|-------------|
| 1 | KPI Strip | 4 métricas principales (Revenue, Órdenes, AOV, Coverage) con count-up animado |
| 2 | Channel Truth Table | Tabla pixel vs plataforma con Truth Score por canal |
| 3 | Channel Role Map | First-touch / Assist / Last-touch breakdown por canal |
| 4 | Funnel + Journeys | Funnel de conversión (anchos estáticos) + top 10 journeys multi-touch |
| 5 | Revenue Intelligence | Revenue por modelo de atribución + por fuente |
| 6 | Conversion Speed | Barras horizontales de conversion lag por bucket temporal |
| 7 | Devices & Top Pages | Ring chart dispositivos (izq) + Top 6 landing pages (der) |
| 8 | Pixel Coverage Timeline | AreaChart de cobertura diaria con ReferenceLine al 80% |

**Patrones consolidados en esta página:**
- Insight boxes: `bg-gradient-to-r from-gray-50 to-transparent p-3 rounded-xl text-xs text-gray-600`
- Datos normalizados con `Number()` y fallbacks en todo mapeo de API
- Recharts con gradientes cyan consistentes (`#06b6d4` → `#0891b2`)
- Cada zona maneja gracefully datos faltantes (retorna `null` si no hay data)

**Próximas zonas planificadas:** Conversion Rates, Journey Intelligence.

---

## 14. Evolución de este documento

Este documento NO es estático. Cada vez que Tomy da feedback nuevo sobre UI ("me gustó esto", "no me gustó eso"), Claude debe actualizar este documento al final de la sesión con la nueva regla aprendida. La biblia visual evoluciona con el gusto del fundador.

---

_Última actualización: 2026-04-12 (Sesión 18) — Actualizado ruta `/pixel` → `/analytics`, agregada sección 13 con estructura de zonas de la página de analytics._
