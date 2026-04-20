# LANDING_BUILD_HANDOFF.md
## Handoff completo de Cowork → Claude Code para la build de la landing pública de NitroSales

> **Para quién es este documento:** la próxima sesión de Claude (sea en Cowork, Claude Code, o donde sea) que continúe el trabajo de construir la landing pública de NitroSales. Si sos esa sesión: leé este archivo COMPLETO antes de hacer nada. Es el briefing canónico.

> **Fecha de handoff:** 2026-04-20 (cierre de Sesión 3 VM — fase de brand direction)

> **Próxima fase:** Implementación real (Next.js build) con vara de calidad $500K. Se recomienda ejecutar desde **Claude Code**, no desde Cowork, porque Claude Code tiene mejor tooling para Next.js, dev server, git, y manejo de muchos archivos en paralelo.

---

## 1. Dónde estamos en el arco completo de trabajo

### Arco macro del proyecto "Landing Pública de NitroSales"

```
Fase 1 — Posicionamiento y voz       ✅ (Sesión 1-2 VM, 9 docs en CONOCIMIENTO_PRODUCTO/)
Fase 2A — Matriz y Tier 1/2/3        ✅ (Sprints 1-3, 9 landings Tier 3 escritos)
Fase 2B — Brand direction            ✅ (dirección cinematográfica lockeada)
Fase 2C — Criterios de calidad       ✅ (BRAND_CRITERIA_PREMIUM.md escrito)
Fase 3 — Mockup HTML de alta fidelidad   ⏸  (pendiente: pulir BRAND_DIRECTION_CINEMATIC.html)
Fase 4 — Decisión de tipografía + licensing  ⏸
Fase 5 — Next.js build real                   ⏸  (este es el big one)
Fase 6 — Signature 3D moment                  ⏸
Fase 7 — Polish, accessibility, performance   ⏸
Fase 8 — Launch                               ⏸
```

### Qué pasó en esta sesión (Sesión 3 VM, 2026-04-19/20)

1. **Sprints 1-3 de consistencia cross-landings** completados. Los 9 Tier 3 landings + matriz + precios están alineados a posicionamiento v5.
2. **Fase 2B brand direction** — 4 iteraciones hasta llegar a la dirección correcta:
   - V1 — 4 personalidades: A (Stripe/Ramp), B (Vercel/Linear), C (Notion/Superhuman), D (Arc/Raycast). Tomy dudó entre A y C.
   - V2 — variantes dentro de A y C (A2 Ramp, A3 Linear Light, C2 Superhuman, C3 Editorial). Mi recomendación: fusión C2+.
   - C2+ — warm premium fusion con screenshots de producto + Instrument Serif italic. **Rechazada por Tomy:** el italic serif se sentía "raro" y el premium no estaba al nivel.
   - **CINEMATIC** — pivot completo: dark, zero serif, zero screenshots, metáfora abstracta (sistemas conectándose), mucha animación, mucho detalle de lujo, minimalista. **Lockeada como dirección.**
3. **Fase 2C criteria** — Tomy subió la vara de "$30K landing" a "$500K landing". Se escribió `BRAND_CRITERIA_PREMIUM.md` con 17 secciones de reglas testables.

### Qué quedó OPEN (pendientes concretos)

1. **Pulir el HTML mockup** (`BRAND_DIRECTION_CINEMATIC.html`) aplicando reglas del criteria doc — split type, cursor custom con trail, loading sequence coreografiada, IntersectionObserver reveals, micro-parallax, más detalle en hairlines/auroras. Esto es "calibración visual" antes de ir a Next.js.
2. **Decidir tagline final.** Hay 7 candidatos sobre 3 ángulos:
   - Ángulo 1 (v5 actual): "Tu primer activo digital." / "Vendé más. Gastá mejor. Decidí con la verdad."
   - Ángulo 2 (AI Commerce como categoría): variantes con "La primera AI Commerce Platform para retailers LATAM"
   - Ángulo 3 (fusión): combinaciones de los dos.
3. **Decidir familia tipográfica display** — candidatos: Söhne Breit, GT Sectra Display, Editorial New, PP Neue Montreal, Neue Haas Grotesk Display, Söhne Schmal. Licenciar una ($500-2000).
4. **Decisión de arquitectura de repo** — ver sección 4 de este doc.
5. **Scaffolding inicial de Next.js** con el stack completo del criteria doc.

---

## 2. Decisiones lockeadas (NO re-abrir)

Estas cosas ya se decidieron y no se discuten de nuevo sin razón muy fuerte. Claude Code: si empezás a reabrir estas, estás perdiendo tiempo.

| Decisión | Valor | Dónde |
|---|---|---|
| Paraguas de marca | **NitroSales es paraguas, "Nitro" es familia** (NitroPixel, NitroLens, Aura, Bondly, Aurum) | CONOCIMIENTO_PRODUCTO/POSICIONAMIENTO_Y_VOZ.md |
| Categoría | **AI Commerce Platform para retailers LATAM** | LANDING_MATRIZ.md línea 25 |
| Positioning v5 canónico | **"Tu primer activo digital. Vendé más. Gastá mejor. Decidí con la verdad."** | REGLAS_CLAUDE_VENTAS_MARKETING.md línea 185 |
| Personalidad visual | **Cinematográfica dark** (no warm light, no editorial serif, no SaaS genérico) | Esta sesión |
| Metáfora visual principal | **Orbital / sistemas conectándose** (no screenshots de producto en hero) | Esta sesión |
| Serifs en landing | **Prohibidos salvo caso excepcional justificado** (el italic no transmitió premium) | Esta sesión |
| Modo color | **Dark protagonista** (`--bg: #06070b`) | BRAND_CRITERIA_PREMIUM.md sección 4 |
| Vara de calidad | **Tier $500K landing** | BRAND_CRITERIA_PREMIUM.md intro |
| Creator Gradient | **Exclusivo de Aura** — no aparece en landing pública | UI_VISION_NITROSALES.md |
| Precios en landings Tier 3 | **Sin USD/ARS concretos** — solo "desde X" cualitativo | LANDING_PRECIOS.md decisión Sprint 3 |

---

## 3. Biblia de referencia (archivos canónicos a leer)

Si sos una sesión nueva continuando este trabajo, estos son los archivos que tenés que haber leído ANTES de proponer cualquier cosa. En orden recomendado:

### Orden de lectura obligatorio

1. **`CLAUDE_VM/REGLAS_CLAUDE_VENTAS_MARKETING.md`** — reglas generales del Claude VM. Qué tocás y qué no.
2. **Este archivo** (`LANDING_BUILD_HANDOFF.md`) — contexto completo.
3. **`CLAUDE_VM/MENSAJES/BRAND_CRITERIA_PREMIUM.md`** — la vara. 17 secciones. Cada iteración se mide contra este doc.
4. **`CLAUDE_VM/MENSAJES/BRAND_DIRECTION_CINEMATIC.html`** — el mockup que refleja la dirección lockeada. Abrirlo en browser para ver.
5. **`CLAUDE_VM/CONOCIMIENTO_PRODUCTO/POSICIONAMIENTO_Y_VOZ.md`** — posicionamiento v5, voz, palabras a usar/evitar.
6. **`CLAUDE_VM/CONOCIMIENTO_PRODUCTO/QUE_ES_CADA_PRODUCTO.md`** — los 4 activos con marca + las 5 secciones funcionales.
7. **`CLAUDE_VM/MENSAJES/LANDING_MATRIZ.md`** — el wireframe/copy canónico del home (Tier 1).

### Orden de lectura recomendado (siguiente capa)

8. `CLAUDE_VM/CONOCIMIENTO_PRODUCTO/SECCIONES_DEL_PRODUCTO.md`
9. `CLAUDE_VM/CONOCIMIENTO_PRODUCTO/INTEGRACIONES.md`
10. `CLAUDE_VM/CONOCIMIENTO_PRODUCTO/COMPETIDORES.md`
11. `CLAUDE_VM/CONOCIMIENTO_PRODUCTO/OBJECIONES_COMUNES.md`
12. `UI_VISION_NITROSALES.md` (del root, lectura — es del Claude Producto pero útil)
13. `CLAUDE_VM/MENSAJES/LANDING_*.md` (los 9 Tier 3 landings) — leer a medida que los necesites.

### Iteraciones históricas de brand direction (archivo, no acción)

Estos están como referencia histórica de qué se intentó y por qué se descartó. NO son la dirección actual.

- `BRAND_DIRECTIONS_PREVIEW.html` — V1 con 4 personalidades A/B/C/D.
- `BRAND_DIRECTIONS_PREVIEW_V2.html` — V2 con variantes dentro de A y C.
- `BRAND_DIRECTION_C2_PLUS.html` — intento warm premium fusion. Rechazado.
- `BRAND_DIRECTION_CINEMATIC.html` — **la dirección actual**. Esta es la que vale.

---

## 4. Decisión de arquitectura de repo (pendiente de confirmar con Tomy)

### El problema

El repo `nitrosales` actual (en Vercel como `nitrosales.vercel.app`) es el **app interno** para retailers (dashboard, integraciones, P&L, etc.). La landing pública es un **asset de marketing**, otra cosa. Mezclarlos en el mismo repo genera riesgo y complejidad.

### Opciones

**Opción A — Repo separado `nitrosales-landing`** (recomendado).
- Pro: limpio, deploys independientes, zero riesgo al app, iteración rápida sin miedo.
- Pro: es lo que hacen Apple, Stripe, Linear, Vercel, Anthropic — landing separada del producto.
- Pro: dominio final `nitrosales.com` (landing) vs `app.nitrosales.com` o similar (app).
- Contra: compartir componentes/types con el app requiere publicarlos como package o duplicar (aceptable — la landing comparte poco con el app de hecho).

**Opción B — Subcarpeta `/landing` en el repo actual.**
- Pro: todo en un lugar.
- Contra: requiere reorganizar el repo (mover `src/` a `app/` o `/apps/dashboard/`), riesgo no trivial.
- Contra: deploy compartido — un cambio en la landing puede romper el deploy del app.

**Opción C — Monorepo turborepo con `/apps/dashboard` + `/apps/landing`.**
- Pro: limpio conceptualmente.
- Contra: overkill para esta etapa. Turborepo suma complejidad de build, caché, workspace config. No vale la pena ahora.

### Recomendación

**Opción A — repo separado `nitrosales-landing`.**

Pasos concretos si se aprueba:
1. `gh repo create tlapidus/nitrosales-landing --private`
2. Clonar localmente.
3. `npx create-next-app@latest . --ts --tailwind --app --no-src-dir --import-alias "@/*"`
4. Setup inicial con stack del criteria doc (ver sección 5).
5. Linkear a Vercel y configurar dominio `nitrosales.com` (cuando esté listo).
6. Primera commit con scaffolding.

---

## 5. Stack técnico a montar (del criteria doc)

**Framework base:**
- Next.js 14+ con App Router
- TypeScript estricto (`strict: true`)
- Tailwind 3.4+ con config custom

**Motion:**
- `framer-motion` — animations a nivel componente
- `gsap` + `@gsap/react` — para ScrollTrigger (GSAP Club si licenciamos, ~$150/año para SplitText)
- `lenis` — smooth scroll nativo

**3D / WebGL:**
- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`

**Tipografía:**
- `next/font` para optimización
- Familia display licenciada (decidir cuál)
- Inter Variable para body

**Iconos:**
- `lucide-react` como base
- Custom SVG donde haga falta

**Analytics/monitoring (post-launch):**
- `@vercel/analytics`
- PostHog (opcional)

**Testing visual (opcional etapa tardía):**
- Percy o Chromatic

### Estructura de carpetas sugerida (Next.js App Router)

```
nitrosales-landing/
├── CLAUDE.md                       ← instrucciones para Claude Code en este repo
├── app/
│   ├── layout.tsx                  ← root layout con fonts, analytics
│   ├── page.tsx                    ← home (Tier 1)
│   ├── producto/                   ← Tier 2
│   │   ├── nitropixel/
│   │   ├── aurum/
│   │   ├── bondly/
│   │   └── aura/
│   ├── soluciones/                 ← Tier 3
│   │   ├── rentabilidad/
│   │   ├── marketing-digital/
│   │   └── (etc)
│   ├── precios/
│   ├── api/
│   │   └── contact/                ← form submission
│   └── globals.css
├── components/
│   ├── brand/                      ← Logo, Wordmark
│   ├── motion/                     ← Reveal, SplitText, MagneticButton, SmoothScroll
│   ├── scenes/                     ← OrbitHero, FragmentationScene, LayerCards
│   ├── ui/                         ← Button, Card, Eyebrow, Divider
│   └── layout/                     ← Nav, Footer, Section
├── lib/
│   ├── fonts.ts
│   ├── motion-presets.ts           ← curves, timings, stagger configs
│   └── content/                    ← copy extraído de los LANDING_*.md
├── public/
│   ├── fonts/                      ← licensed display font files
│   └── og/                         ← OG images por landing
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## 6. Próximos pasos en orden

### Paso 0 — Confirmar decisión de repo (con Tomy)

Antes de scaffoldear: Tomy aprueba "Opción A — repo separado `nitrosales-landing`" o propone otra cosa.

### Paso 1 — Pulir HTML mockup existente

Aplicar a `BRAND_DIRECTION_CINEMATIC.html` las reglas del criteria doc que son viables en single-file HTML:

- Split type en el H1 del hero (reveal letra por letra con mask)
- Cursor custom con dot + ring + trail (lag 80-120ms)
- Loading sequence coreografiada (bg → logo → grid → nav → hero, 1400ms total)
- IntersectionObserver reveals con threshold 0.15 y stagger 80-120ms
- Micro-parallax en cursor sobre el orb (5-10px máximo)
- Hairlines con gradiente en todos los dividers
- Review detalle al zoom 200%

Esto es ~1 sesión de trabajo. Sirve como calibración visual antes de Next.js.

### Paso 2 — Decidir tagline final

Sesión corta de 3-5 variantes revisadas con Tomy. Lockear.

### Paso 3 — Licenciar fuente display

Probar en el mockup con 2-3 candidatas. Decidir. Licenciar.

### Paso 4 — Scaffolding Next.js

Crear el repo según sección 5. Primera commit con:
- Next.js setup
- Tailwind config con variables CSS del criteria doc
- Fonts cargadas via `next/font`
- Dependencias del stack instaladas
- Lint + prettier setup
- Vercel linkeado

### Paso 5 — Building sección por sección

Orden sugerido (del más importante al menos):

1. **Nav** — logo + menu + CTA. Con animación de entrada al load.
2. **Hero** — orb 3D (R3F) + H1 display + subtítulo + CTAs. Signature moment. **Más tiempo acá que en cualquier otra sección.**
3. **Fragmentación** — chips de plataformas desconectados. Motivación del problema.
4. **4 Capas** — Observa / Entiende / Recuerda / Decide con visualizaciones abstractas animadas.
5. **Productos** — los 4 activos Nitro con hover states.
6. **Social proof** — logos + 1-2 casos.
7. **CTA final** — glass card con auroras.
8. **Footer** — minimalista.

Cada sección pasa el checklist de 17 puntos (criteria doc sección 16) antes de mergear a main.

### Paso 6 — Páginas interiores (Tier 2 + Tier 3)

Una vez que el home está en nivel $500K, se aplica el sistema a las páginas interiores. El copy ya está escrito en `LANDING_*.md`.

### Paso 7 — Polish, accessibility, performance

- Lighthouse > 85 performance
- WCAG AA verificado
- Reduced motion probado
- Cross-browser (Chrome, Safari, Firefox, Edge)
- Mobile rediseñado (no escalado)

### Paso 8 — Launch

Dominio, DNS, robots.txt, sitemap, OG images, analytics, A/B framework, heatmaps.

---

## 7. Rules of engagement para Claude Code

Cuando Tomy abra Claude Code en este repo (o en `nitrosales-landing` cuando exista), Claude Code tiene que:

### Ritual de arranque VM (respetar)

Este ritual viene de `REGLAS_CLAUDE_VENTAS_MARKETING.md` y aplica igual en Claude Code:

1. `cd` al repo.
2. `git fetch origin --prune && git checkout main && git pull origin main`.
3. Leer este archivo (`LANDING_BUILD_HANDOFF.md`).
4. Leer `BRAND_CRITERIA_PREMIUM.md`.
5. Abrir `BRAND_DIRECTION_CINEMATIC.html` en browser para calibrar el ojo.
6. Leer los 9 docs de `CONOCIMIENTO_PRODUCTO/` (orden en sección 3 de este handoff).
7. Verificar con Tomy cuál es el próximo paso según sección 6.

### Modo de trabajo

- **Iteración sección por sección.** No avanzar hasta que la anterior pase el checklist del criteria doc.
- **Cada cambio justifica qué rule del criteria doc cumple.** "Me gusta más" no es razón válida — referenciar la sección específica.
- **Test visual cada commit importante.** Dev server corriendo, probar en browser, zoom 200%, test de 5 segundos.
- **Nada de anti-patterns.** Sección 13 del criteria doc.
- **Copy del LANDING_*.md es canónico.** No reescribir copy en componentes — extraer a `lib/content/` y referenciar.
- **Nunca tocar archivos de Claude Producto.** Si es repo separado esto es moot. Si es subcarpeta, seguir regla #1 de `REGLAS_CLAUDE_VENTAS_MARKETING.md`.
- **Git workflow:** depende de la decisión de repo. Si separado, probablemente branches por sección con PRs. Si mismo repo, depende de la regla actual (main-only).

### Qué NO hacer

- ❌ Empezar a implementar sin haber leído el criteria doc completo.
- ❌ Proponer cambios de dirección visual (dark, zero serif, orbital, etc.) — están lockeadas.
- ❌ Reescribir copy que ya está en los `LANDING_*.md`.
- ❌ Subir la complejidad (ej: proponer monorepo) sin justificación fuerte.
- ❌ Saltarse el ritual de arranque.
- ❌ Avanzar a la siguiente sección sin pasar el checklist.

### Qué SÍ hacer liberalmente

- ✅ Proponer mejoras al criteria doc si descubrís un anti-pattern nuevo.
- ✅ Instalar dependencias del stack recomendado sin pedir permiso.
- ✅ Armar component primitives reutilizables (Reveal, MagneticButton, Eyebrow, etc.).
- ✅ Pedir feedback de Tomy visual temprano y seguido (screenshots, deploys preview).
- ✅ Hacer commits pequeños y frecuentes con mensajes descriptivos.

---

## 8. Mapa de archivos clave de esta sesión

Para la próxima sesión, los archivos que importan de esta iteración:

```
/CLAUDE_VM/MENSAJES/
├── BRAND_CRITERIA_PREMIUM.md              ← la vara ($500K tier)
├── BRAND_DIRECTION_CINEMATIC.html         ← mockup de la dirección lockeada
├── LANDING_BUILD_HANDOFF.md               ← este archivo
├── LANDING_MATRIZ.md                      ← copy canónico del home
├── LANDING_PRECIOS.md                     ← copy canónico de /precios
├── LANDING_{AURA,AURUM,BONDLY,NITROPIXEL}.md  ← Tier 2 producto
├── LANDING_{RENTABILIDAD,MARKETING_DIGITAL,CONTROL_GESTION,FINANZAS,INTEGRACIONES,MARKETPLACES,ALERTAS}.md  ← Tier 3 soluciones
├── CONSISTENCIA_TIER3_v1.md               ← reporte del pase de consistencia
├── SPRINT{1,2,3}_CONSISTENCIA_CHANGELOG.md ← changelog de los sprints
│
├── BRAND_DIRECTIONS_PREVIEW.html          ← HISTORIA (V1 4 personalidades)
├── BRAND_DIRECTIONS_PREVIEW_V2.html       ← HISTORIA (V2 variantes A y C)
└── BRAND_DIRECTION_C2_PLUS.html           ← HISTORIA (C2+ rechazada)
```

---

## 9. Apéndice: lecciones aprendidas en esta sesión

Para que la próxima sesión no las repita.

1. **Tomy es visual — mostrar antes que describir.** Las decisiones de personalidad visual se toman con mockup HTML, no con descripciones en texto. Tiempo invertido en un mockup bueno paga.

2. **No confiar en AI fonts defaults.** Proponer Inter como display del hero delata template. Licenciar familia display con carácter.

3. **Subir la vara temprano.** Tomy pasó de $30K a $500K sin dudar. Arrancar con la vara alta ahorra iteraciones.

4. **Dirección dark + abstract + orbital funciona para NitroSales.** Producto nuevo, categoría nueva, metáfora visual abstracta > screenshots de producto.

5. **Zero serifs funciona.** El italic Instrument Serif en C2+ se sintió "raro". Inter display weight 800 con tracking ultra-tight comunica premium sin recurrir a serif.

6. **Criteria doc como biblia.** Escribirlo DESPUÉS de varias iteraciones visuales captura lecciones reales, no teoría.

7. **Claude Code > Cowork para implementación real.** Cowork es bueno para mockups y decisiones. Claude Code es mejor para Next.js build.

---

_Última actualización: 2026-04-20 — Cierre de Sesión 3 VM, transición a fase de implementación. Si algo cambia en la fase de build que invalide este handoff, actualizar acá._
