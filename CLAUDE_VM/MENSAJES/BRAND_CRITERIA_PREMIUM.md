# BRAND_CRITERIA_PREMIUM.md
## La vara de la landing pública de NitroSales

> **Qué es esto:** el documento canónico que codifica el nivel de detalle, motion, tipografía y premium al que tiene que llegar la landing pública de NitroSales. Referencia obligatoria antes de cualquier iteración visual. Si algo que se diseña o implementa no pasa el checklist de este doc (sección 16), no es entregable final.

> **Nivel objetivo:** landing tier **$500K USD**. No es hipérbole, es benchmark real — es el tipo de landing que estudios como Active Theory, Locomotive, Resn, Green Chameleon, Humaan producen, o que teams internos de Apple, Stripe, Linear y Anthropic construyen para product launches. Nuestro objetivo es llegar a ese nivel visual con un setup mucho más chico (Tomy + Claude + tooling open source + algún freelance puntual), apalancándonos en disciplina y criterio donde no tenemos budget.

> **Por qué importa tanto:** NitroSales está definiendo una categoría que no existe en el mercado ("AI Commerce Platform para retailers LATAM"). La landing no es decoración — es el primer contacto donde el prospecto decide si somos serios. A este nivel de ambición de categoría, la landing tiene que estar a la altura del posicionamiento. Un hero que se siente SaaS genérico mata el mensaje de "estamos haciendo algo nuevo en el mercado".

> **Última actualización:** 2026-04-20 — Versión inicial post-pivot de C2+ a dirección cinematográfica dark. Se actualiza cada vez que emerge un criterio nuevo durante iteraciones.

---

## 1. Benchmarks obligatorios

Antes de iterar, estudiar estas referencias. No para copiar — para calibrar el ojo. Si tu propuesta no se siente al mismo nivel que estas, no está lista.

### Tier máximo — referencias obligatorias

| Referencia | Qué estudiar |
|---|---|
| `apple.com/vision-pro` | Scroll choreography, product reveal, atmospheric light shifts |
| `apple.com/airpods-max` | WebGL de producto + tipografía editorial + color por sección |
| `anthropic.com` | Discipline tipográfica, whitespace, restraint (menos es más) |
| `linear.app` | Motion micro-detail, tipografía, color, hairlines |
| `stripe.com/sessions` | Secciones como experiencias distintas pero coherentes |
| `rabbit.tech` | Dark premium, tipografía display dramática, motion |
| `humane.com` | Minimalismo con densidad de detalle (en zoom se nota) |
| `arc.net` (o archive si Dia la reemplazó) | Narrative scroll, art direction, card interactions |
| `framer.com` | Kinetic typography, micro-interactions en todos lados |
| `runwayml.com` | Dark editorial, producto visual, motion de video |

### Tier alto — referencias complementarias

`cursor.com`, `vercel.com`, `mercury.com`, `cluse.com`, `activetheory.net` (showreel), `locomotive.ca` (showreel), `resn.co.nz` (showreel), `green-chameleon.com`.

### Signature moments específicos para mirar

- Apple Vision Pro: la animación del dispositivo girando en 3D mientras scrolleás, con la luz cambiando según el ángulo.
- Linear 2024 "Purpose-built": el intro con partículas convergiendo en el texto.
- Arc: el "Welcome to your new browser" con card stack que responde al cursor.
- Stripe Sessions: cada sección es un micro-universo visual (una con grid técnico, otra con aurora fluida, otra con foto editorial), pero se sienten parte del mismo show.
- Anthropic launches: el ritmo tipográfico — cuánto aire hay entre cada párrafo, cómo los labels preceden a los statements.

---

## 2. Principios de motion

**Ley #1:** Nada se mueve sin razón. Cada animación comunica jerarquía, estado, o narrativa. Si sacás una animación y la página comunica igual, esa animación no va.

**Ley #2:** Curvas físicas, no ease-out genérico.
- UI moves (hover, reveal, state): `cubic-bezier(0.16, 1, 0.3, 1)` — el famoso "expo out"
- Momentos dramáticos (hero reveal, big transitions): `cubic-bezier(0.65, 0, 0.35, 1)`
- Interacciones tipo magnético (CTA hover, cursor attraction): spring physics con Framer Motion (`type: "spring", stiffness: 150, damping: 15`)
- **Prohibido:** `ease`, `ease-in-out`, `ease-out` defaults de CSS. Delatan falta de intención.

**Ley #3:** Timing por jerarquía.

| Tipo de movimiento | Duración objetivo |
|---|---|
| Micro-interacción (hover, focus) | 150-250ms |
| Transición de estado (button click, tab change) | 300-450ms |
| Elementos secundarios en reveal | 400-500ms |
| Elementos principales en reveal | 600-900ms |
| Big scene transitions (section to section) | 900-1400ms |

Nada por debajo de 120ms se percibe como movimiento, se percibe como "roto". Nada arriba de 1500ms frustra al usuario.

**Ley #4:** Stagger inteligente.
- Al revelar grupos de elementos, delay de 60-120ms entre items
- Nunca stagger uniforme sin sentido — respetar la jerarquía visual (el header antes del body, el body antes del CTA)
- Para grupos grandes (6+ items), usar stagger curvado, no lineal: `staggerChildren: 0.08, delayChildren: 0.2`

**Ley #5:** Parallax con intención.
- Solo elementos decorativos o de profundidad ganan parallax
- Nunca parallax en texto body (causa mareo)
- Intensidad: máximo ±40px de desplazamiento en un viewport completo
- Cursor parallax máximo 5-10px en secciones hero

**Ley #6:** Scroll choreography en momentos clave.
- GSAP ScrollTrigger con `scrub` para escenas donde el scroll es el control remoto del usuario
- Pinear secciones solo cuando hay narrativa real (un producto que se despliega, un data flow que se revela)
- No pinear por pinear — cansa el scroll

**Ley #7:** Cero easing de juguete.
- Prohibido: `easeOutBounce`, `easeOutElastic`, confetti, spring bouncing exagerado
- Esto delata templates de ThemeForest y mata el premium al instante

---

## 3. Tipografía

**Decisión de sistema:** dos familias. Display (para hero + headings grandes) y body (para todo lo demás).

**Display candidates (licenciar uno):**
- **Söhne Breit** (Klim Type Foundry) — Mercury, Doordash. Modern, dramatic.
- **GT Sectra Display** (Grilli Type) — Editorial serif contemporáneo con italic único.
- **Editorial New** (Pangram Pangram) — Elegant serif con bones modernos.
- **PP Neue Montreal** (Pangram Pangram) — Sans serif display con personalidad.
- **Neue Haas Grotesk Display** (Linotype) — Clásico grotesque, bullet-proof.
- **Söhne Schmal** (Klim) — Condensed grotesque, impacta en display grande.

**Body: Inter** (100-900, variable) o **Söhne Buch** si se licencia toda la familia Söhne. `font-feature-settings: "cv11", "ss01", "ss03"` habilitando características de Inter.

**Reglas de tracking (letter-spacing):**

| Contexto | Tracking |
|---|---|
| Display (hero H1, 72px+) | -0.045em a -0.06em |
| Headings grandes (40-60px) | -0.03em a -0.04em |
| Headings medios (24-36px) | -0.02em a -0.025em |
| Body text | -0.01em a 0em |
| Labels / eyebrows uppercase | +0.08em a +0.14em |
| Small print | 0em |

**Reglas de line-height:**

| Contexto | Line-height |
|---|---|
| Display hero | 0.9 - 0.95 |
| Headings | 1.05 - 1.15 |
| Body large (18-20px) | 1.55 - 1.65 |
| Body regular (14-16px) | 1.5 - 1.6 |
| Small print / captions | 1.4 |

**Escala tipográfica fluid:** usar `clamp()` en todo. Nada de media queries para font sizes.

```css
.display-xl  { font-size: clamp(64px, 10vw, 132px); }
.display-lg  { font-size: clamp(48px, 7.5vw, 96px); }
.display-md  { font-size: clamp(36px, 5.5vw, 64px); }
.h1          { font-size: clamp(32px, 4.5vw, 48px); }
.h2          { font-size: clamp(24px, 3.5vw, 36px); }
.body-lg     { font-size: clamp(16px, 1.25vw, 20px); }
```

**Split type en reveals.** El H1 principal nunca se revela como un bloque único con fade-up. Se revela palabra por palabra (o letra por letra en momentos signature), con mask reveal desde abajo. Usar Framer Motion con `splitText` manual, o licenciar GSAP SplitText ($150 en GSAP Club anual — vale la pena).

**Jerarquía por peso, no solo por tamaño.** Weight 300-400 para body, weight 600-700 para headings, weight 800-900 solo en display hero. Nunca mezclar muchos weights en una misma pantalla (máximo 3).

---

## 4. Color y luz

**Paleta disciplinada.** Máximo 3 acentos funcionales + escalas neutras. Nada de "colores de marca" al voleo.

**Paleta NitroSales landing pública (decisión actual):**

```css
--bg:            #06070b;   /* fondo principal, casi negro con tint blueish */
--bg-elevated:   #0a0c12;   /* cards, elevated surfaces */
--text-primary:  #ffffff;
--text-muted:    rgba(255, 255, 255, 0.65);
--text-subtle:   rgba(255, 255, 255, 0.45);
--text-faint:    rgba(255, 255, 255, 0.25);
--hairline:      rgba(255, 255, 255, 0.08);

--accent-cyan:   #22d3ee;   /* data, truth, observación */
--accent-violet: #a78bfa;   /* IA, memoria, inteligencia */
--accent-orange: #fb923c;   /* decisión, acción (relación con brand Nitro) */
```

**Regla:** nunca `#000` plano. Negro puro se ve vacío y plano en pantalla. Siempre un tint sutil (blueish, warmish) para dar presencia atmosférica.

**Gradients white text en display:**
```css
background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.7) 100%);
-webkit-background-clip: text;
```
El H1 del hero nunca es white plano — siempre tiene un gradiente sutil hacia abajo que da profundidad.

**Light temperature coherente.** Las auroras/glows en toda la landing usan el mismo espectro (cyan-violet-orange). No aparece un glow rosa en una sección y un glow verde en otra.

**Atmospheric shifts.** Secciones grandes pueden tener un shift de temperatura casi imperceptible (warmer cerca de CTAs emocionales, cooler en secciones técnicas). Es un detalle que se siente pero no se ve.

**Hairlines con gradiente, no sólidos.**
```css
/* ❌ No */
border-top: 1px solid rgba(255,255,255,0.1);

/* ✅ */
border-top: 1px solid transparent;
border-image: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent) 1;
```

**Glass morphism con mesura:**
```css
background: rgba(255, 255, 255, 0.03);
backdrop-filter: blur(24px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.08);
box-shadow:
  0 1px 0 rgba(255, 255, 255, 0.05) inset,
  0 40px 80px -20px rgba(0, 0, 0, 0.5),
  0 0 0 1px rgba(255, 255, 255, 0.02);
```

**Creator Gradient es exclusivo de Aura.** En la landing pública de NitroSales no aparece `#ff0080 → #a855f7 → #00d4ff` salvo en la sección específica de Aura (si se incluye).

---

## 5. 3D y WebGL

**Signature moment obligatorio en 3D.** Mínimo una escena (el orb hero o el sistema orbital de plataformas conectándose) tiene que estar en Three.js con shaders custom o uniforms reactivos al input (cursor, scroll, mouse velocity).

**Stack:**
- `three` + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`
- Para shaders custom: GLSL inline con `<shaderMaterial>` de R3F, o `lygia` para shader utils

**Presupuesto de performance:**
- Hero 3D no debe costar más de 4ms/frame en laptop mid-tier (test en 2020 MacBook Air M1)
- Si cuesta más: reducir polys, usar baked textures, o simplificar shader
- En low-end devices (detectar con `navigator.hardwareConcurrency < 4`): fallback a versión simplificada o SVG equivalente

**Post-processing con gusto.**
- Bloom (intensity 0.3-0.5, luminanceThreshold 0.9) — apenas perceptible
- Chromatic aberration máximo 0.5-1.0 — si se nota, bajar
- Vignette sutil (darkness 0.3, offset 0.5)
- **Prohibido:** SSAO exagerado, god rays genéricos, motion blur en hero (se siente Unity demo)

**Shaders custom (no limitarse a MeshStandardMaterial):**
- Fresnel para efectos de borde luminoso
- Noise-based deformation para orgánicos (no solo geometrías perfectas)
- Distance-field glow para auroras internas de meshes

**Fallback siempre:**
- Si WebGL no disponible (0.5% de usuarios), SVG/CSS animation digna, nunca mensaje de error
- Respetar `prefers-reduced-motion` incluso en 3D (reducir amplitud, no frame rate)

---

## 6. Interacción y cursor

**Cursor custom sutil.**
- Dot de 6-8px + ring de 24-30px
- Trail con lag suave (ring persigue al dot con delay de 80-120ms)
- Scale up a 1.5× al hover sobre elementos interactivos
- En links/texto selectable: cursor se transforma en hairline vertical (como caret)
- Cursor se oculta en touch devices (`pointer: coarse`)

**Magnetic hover en CTAs primarios.**
```js
btn.addEventListener('mousemove', (e) => {
  const rect = btn.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  btn.style.transform = `translate(${x * 0.12}px, ${y * 0.18}px)`;
});
btn.addEventListener('mouseleave', () => {
  btn.style.transform = '';
});
```
Máximo desplazamiento: 12px x, 18px y. Retorno con spring suave.

**Hover states en 2 capas mínimo.**
No alcanza con cambiar un color. Combinar:
- Background shift (color, opacity, o position de gradiente)
- Foreground shift (scale sutil, color, o translate)
- Border cambio (color, glow, o hairline opacity)
- Shadow cambio

**Reveal on scroll con IntersectionObserver.**
- Todo elemento importante entra al viewport con transform + opacity
- `threshold: 0.15` para triggerar cuando se ve 15% del elemento
- `rootMargin: '0px 0px -10% 0px'` para evitar triggerear justo en el borde

**Cursor-reactive en hero.**
El orb central (o una sección específica) responde al movimiento del cursor. Parallax máximo 5-10px. Subtle — el usuario siente algo vivo sin saber por qué.

---

## 7. Detalle y densidad

**Whitespace como diseño.**
- Padding vertical de secciones: `clamp(100px, 15vh, 200px)` entre secciones grandes
- Nunca paredes de texto sin aire
- El whitespace es lo que hace que lo que SÍ está se vea importante

**Cada palabra gana su lugar.**
- Si una palabra se puede cortar sin perder significado, se corta
- Hero H1: máximo 8-10 palabras
- Subtítulos: máximo 15-20 palabras
- Body de secciones: máximo 3 oraciones por párrafo

**Labels / eyebrows con propósito.**
- Uppercase, tracking +0.1em, weight 500-600
- 11-13px
- Precedidos por dot o line corta (hairline gradient)
- Color muted (`rgba(255,255,255,0.45)`)
- Ejemplo: `・ AI COMMERCE PLATFORM`

**Numerología visual.**
Cuando aparecen números (métricas, porcentajes, KPIs):
- Tipografía tabular-nums o monospace para alineación vertical
- Número prominente (48-96px), unidad más chica (16-24px) al costado o debajo
- Jerarquía clara: "94%" grande, "Pixel coverage" chico debajo

**Grids visibles donde corresponde.**
- En secciones de sistema (features, capas), grid de puntos al fondo con opacity 0.03-0.06
- Grid breathing sutil (animación de 40-80s)
- Se ve lo suficiente para comunicar "hay un sistema acá", no tanto para competir con el contenido

**Hairline dividers, no box borders gruesos.**
- Entre secciones: hairline horizontal de 1px con gradient transparent → white 8% → transparent
- En cards: border `1px solid rgba(255,255,255,0.06)` + subtle shadow
- Prohibido: `border: 1px solid gray`

---

## 8. Sound (opcional pero deseable)

Si se suma audio, hacerlo bien:
- Biblioteca: `Howler.js` o `Tone.js`
- Sonidos ≤200ms, muy sutiles, volumen bajo por default (30-50%)
- Mutado por default al cargar, toggle audio visible en nav
- Jamás autoplay con sonido

**Candidatos donde audio aporta:**
- Hover tick sutil en CTAs primarios (pad 10-15ms, tonal)
- Whoosh suave en section reveal big (solo en secciones signature)
- Confirmación tonal en action completed (ej: submit de form)

**Prohibido:**
- Autoplay de música de fondo
- Sonidos largos (>500ms)
- Sonidos estridentes o "meme sounds"
- Sonidos en todos los elementos (solo en momentos signature)

---

## 9. Loading sequence

La página no aparece — se revela. Coreografía de 800-1400ms:

1. Fondo transiciona de `#000` a `--bg` (300ms)
2. Logo fade-in con scale sutil (0.95 → 1.0) a los 200ms (duración 400ms)
3. Grid/auroras empiezan a respirar a los 500ms (fade-in opacity 0 → 1 en 600ms)
4. Nav fade-in a los 700ms (300ms duration)
5. Hero reveal con split type a los 900ms (800ms duration con stagger)
6. Scroll hint / indicator a los 1400ms

**Nada de spinners.** Si hay espera real de asset loading (fonts, 3D), progress bar hairline casi invisible en el top (1px de alto, color accent).

**First meaningful paint < 1.5s.** Assets pesados (3D, video) se lazy-loadean. El hero funciona sin ellos como fallback.

---

## 10. Accesibilidad (no negociable)

- **WCAG 2.2 AA mínimo**, AAA donde se pueda
- Navegación keyboard completa. Tab order lógico, focus states visibles (custom, no default del browser)
- `@media (prefers-reduced-motion: reduce)` desactiva parallax, scrubs, y animaciones decorativas. El contenido sigue siendo accesible.
- Contrast ratio: body text ≥ 7:1, display ≥ 4.5:1
- Screen reader: landmarks correctos (`main`, `nav`, `section`), aria-labels donde hace falta, alt text en todas las imágenes
- Touch targets: mínimo 44×44px en mobile
- Video/animaciones: todas las animaciones que bucleen se pueden pausar

---

## 11. Responsive

**Mobile no es escala — es rediseño.**
- El orbital que funciona en desktop probablemente no funciona en mobile. Hay que diseñar la versión mobile aparte.
- En mobile, el hero puede ser una versión 2D del orbital, o incluso una sequence animada distinta
- Breakpoints con intención: 640px (mobile), 1024px (tablet), 1440px (desktop), 1920px (ultra-wide)
- Cada breakpoint tiene un propósito, no se usan defaults de Tailwind sin pensar

**Motion reducido en mobile.**
- Performance limitada, batería, touch en lugar de cursor
- 3D hero se reemplaza por versión más liviana (canvas 2D o SVG animado)
- Parallax se reduce o desactiva
- Cursor custom obviamente no aplica
- Hover states se reemplazan por estados activos táctiles

---

## 12. Performance

**Lighthouse objetivo (producción):**

| Métrica | Target |
|---|---|
| Performance | ≥ 85 |
| Accessibility | ≥ 95 |
| Best Practices | = 100 |
| SEO | ≥ 90 |

**Budget de assets:**
- JS inicial ≤ 200KB gzip
- CSS ≤ 40KB gzip
- Fonts subsetted a los glifos usados (latin subset típicamente)
- Images: next/image con AVIF/WebP, lazy loading por default
- 3D/heavy JS: dynamic imports + Suspense. Three.js NO va en el bundle inicial si no se ve above-the-fold

**Core Web Vitals:**
- LCP < 2.5s
- FID / INP < 200ms
- CLS < 0.1

---

## 13. Anti-patterns (lo que NO hacemos)

- ❌ Easing de juguete (bounce, elastic, confetti)
- ❌ Parallax en body text
- ❌ Fade-up genérico desde opacity 0 en todo sin stagger ni curve intencional
- ❌ Gradientes arcoíris (el Creator Gradient es exclusivo de Aura)
- ❌ Emojis en la landing principal
- ❌ Toasts/popups al entrar a la página
- ❌ Sliders de logos "trusted by" rotando en loop (se usan logos estáticos en grid)
- ❌ Video autoplay con sonido
- ❌ Chat widget flotante en la landing de brand (sí en /precios o páginas de conversión)
- ❌ Fonts 100% free como display (Inter solo body, nunca hero display)
- ❌ Stock photography
- ❌ Iconos de Lucide sin personalizar strokes/weights
- ❌ Secciones sin whitespace que respire
- ❌ "Headers con 3 cards de features" en formato genérico SaaS
- ❌ Testimonials en carrusel rotando automático
- ❌ Gradients tipo Stripe 2020 (ya overused)
- ❌ Neomorphism
- ❌ Glassmorphism sin backdrop-filter real (solo opacity blanca)

---

## 14. Tooling stack oficial

**Framework y base:**
- Next.js 14+ con App Router
- TypeScript estricto
- Tailwind + CSS custom con variables

**Motion:**
- Framer Motion — animations a nivel componente
- GSAP + ScrollTrigger — choreography a nivel scroll
- Lenis — smooth scroll nativo
- GSAP SplitText (licenciado, GSAP Club $150/año) — split type de calidad

**3D / WebGL:**
- three
- @react-three/fiber
- @react-three/drei
- @react-three/postprocessing

**Tipografía:**
- Familia licenciada para display (Söhne / GT Sectra / Editorial New / PP Neue Montreal)
- Inter Variable para body
- next/font para optimización

**Iconos:**
- Lucide como base
- Custom SVG donde haga falta un icono con más carácter

**Analytics y performance:**
- Vercel Analytics (Core Web Vitals)
- PostHog para heatmaps y session recordings
- Lighthouse CI en el pipeline

**Sound (opcional):**
- Howler.js

---

## 15. Filosofía de iteración

1. **Cada sección se trabaja aparte.** No avanzamos de sección hasta que la anterior pase el checklist completo.
2. **Review de detalle obligatorio:** zoom 200% al mockup, ¿todo se ve cuidado? Hairlines, padding, alineación, kerning.
3. **Test en 3 devices mínimo:** desktop 1440×900, laptop 1280×800, mobile 390×844.
4. **Prueba de "5 segundos":** mostrarle la landing a alguien durante 5 segundos y tapar la pantalla. ¿Qué recuerda? Si no recuerda el positioning ni qué hace el producto, el hero no está funcionando.
5. **Iteración con razón.** Cada cambio propuesto tiene que justificar qué rule del doc cumple mejor que la versión anterior. "Me gusta más" no es razón válida — buscar cuál rule específica.
6. **Lo que no se puede pulir, no se envía.** Mejor una sección menos, impecable, que muchas secciones medio-terminadas.

---

## 16. Checklist pre-entrega (por iteración)

Antes de marcar una versión como "lista para review de Tomy":

- [ ] Se siente al mismo nivel que al menos 5 de los 10 benchmarks tier máximo
- [ ] Motion curves intencionales, nada genérico
- [ ] Tipografía con tracking y line-height por contexto (sección 3)
- [ ] Paleta respetada, nada de colores fuera del sistema
- [ ] Hairlines con gradiente, nunca sólidos
- [ ] Signature moment 3D/WebGL funcionando
- [ ] Cursor custom + magnetic hover en CTAs
- [ ] Loading sequence coreografiada
- [ ] Reveal on scroll con stagger y curves correctas
- [ ] Reduced motion respetado
- [ ] Lighthouse > 85 performance en producción
- [ ] Mobile pensado por separado, no escalado
- [ ] Cero anti-patterns (sección 13)
- [ ] Hairlines, paddings, alignment al zoom 200% se ven cuidados
- [ ] Test de 5 segundos pasa (se recuerda el positioning)
- [ ] Copy pulido — cada palabra gana su lugar
- [ ] Accesibilidad AA verificada (contrast, keyboard, screen reader)

---

## 17. Proceso propuesto para llegar al nivel $500K

Dado que somos equipo chico (Tomy + Claude), llegamos al tier máximo así:

**Fase 1 — Criterios y dirección (ahora).**
Este doc. Referencias estudiadas. Dirección personalidad lockeada (cinematic dark).

**Fase 2 — HTML mockup de alta fidelidad.**
Iterar sobre BRAND_DIRECTION_CINEMATIC.html hasta que se acerque lo máximo posible al nivel final dentro de limitaciones de single-file HTML. Split type, IntersectionObserver reveals, cursor custom, loading sequence, micro-parallax. Aunque sea HTML plano, subir la vara de presentación.

**Fase 3 — Decisión de tipografía + licensing.**
Elegir display font (probar Söhne Breit / GT Sectra / Editorial New / PP Neue Montreal en el mockup). Licenciar. Inter Variable para body.

**Fase 4 — Next.js build con stack completo.**
Empezar el proyecto real con todo el stack (Framer Motion + GSAP + Lenis + R3F). Sección por sección. No avanzar hasta que cada una pase el checklist.

**Fase 5 — Signature 3D moment.**
El orb hero o sistema orbital en R3F con shader custom. Esta es la escena que se comparte en Twitter/LinkedIn cuando la landing sale.

**Fase 6 — Polish y performance.**
Lighthouse > 85. Accessibility AA. Cross-browser (Chrome, Safari, Firefox, Edge). Mobile rediseño completo.

**Fase 7 — Launch.**
Deploy a producción con feature flag si hace falta. Analytics configurado. A/B test infrastructure lista para iterar.

**Timeline realista:** 6-10 semanas de iteración focused. Más rápido si se suma un motion designer freelance para la escena hero (opcional pero acelera).

---

_Este documento es vivo. Cada vez que una iteración expone una regla implícita que no estaba escrita, se agrega acá. Cada vez que una decisión de benchmark o tooling cambia, se actualiza._
