# Propuesta — Reorganización del sidebar de NitroSales

> **Documento de propuesta, no de implementación.** Escrito para que Tomy
> apruebe antes de tocar código. Fecha: 2026-04-17 (sesión 41).
>
> **Regla dorada**: no se elimina absolutamente nada del sidebar actual.
> Se reordena, se reagrupa y se le da tratamiento visual diferenciado.
> Cada ítem que está hoy sigue estando después.

---

## 1. Principio rector

Lo que te diferencia de cualquier otro SaaS LATAM es **que tu plataforma
observa (NitroPixel), entiende (Aurum) y recuerda (Bondly + Aura)**. Eso
es el activo vivo. Todo lo demás es ejecución, importante, pero ya existe
en competidores. Entonces el orden visual del sidebar tiene que reflejar
ese activo primero, y después el trabajo del día.

Regla mental del orden: arriba va "la vida de la plataforma", al medio va
"el trabajo diario", abajo va "la administración". De arriba hacia abajo,
la densidad emocional baja y la funcionalidad sube.

---

## 2. Qué hace cada cosa hoy (inventario completo)

### Operativo / día a día
- **Centro de Control** — el hub. Resumen del negocio en una pantalla.
- **Pedidos** — órdenes unificadas de VTEX + MercadoLibre.
- **Alertas** — notificaciones del sistema (sync fail, stock bajo, etc).
- **Configuración** — ajustes de cuenta.

### Comercial / catálogo
- **Productos** — catálogo e inventario.
- **Rentabilidad** — márgenes y utilidad por SKU/canal.

### Adquisición / crecimiento
- **Campañas** — Meta Ads + Google Ads + Creativos + Overview.
- **SEO** — rankings, keywords, tráfico orgánico.
- **Competencia** — intelligence de competidores.

### Relaciones / activos humanos
- **Bondly** — customer 360, LTV, señales, clientes, audiencias.
- **Aura** — creator economy: influencers, deals, campañas, pagos.

### Canales de venta
- **MercadoLibre** — módulo dedicado (publicaciones, reputación, preguntas).

### Activos digitales vivos
- **NitroPixel** — el ojo que observa a cada visitante anónimo e identificado.
- **Aurum** — la inteligencia con memoria (Sinapsis, Bóveda, Chat).

### Finanzas
- **P&L** — estado de resultados + costos operativos.

---

## 3. Análisis de robustez (qué pesa más de verdad)

La "robustez" no es cuánto código tiene cada módulo, sino cuánto valor
único te entrega respecto a lo que ya existe en el mercado.

| Módulo | Qué te da único | Robustez percibida |
|---|---|---|
| **NitroPixel** | Tracking first-party propio, scoring behavioral, identidad anónima→cliente | **Altísima — es el activo core** |
| **Aurum** | IA con memoria, entiende tu negocio y aprende | **Altísima — es el cerebro** |
| **Bondly** | LTV predictivo, segmentación, señales en vivo, customer journey | **Alta — ya es el más completo de LATAM** |
| **Aura** | Creator economy con 7 tipos de deal y campañas Always On | **Alta — pocos competidores lo tienen integrado** |
| **Campañas** | Meta + Google + Creativos unificado | **Media-alta — diferencial vs. verlos por separado** |
| **Rentabilidad** | Margen unitario por SKU | **Media — pero crítica de decisión** |
| **MercadoLibre** | Módulo nativo dentro del stack | **Media — integración que ahorra trabajo** |
| **Pedidos, Productos** | Listados unificados | **Media — estándar bien hecho** |
| **SEO** | Tráfico orgánico | **Media — útil pero no moat** |
| **Competencia** | Monitor de competidores | **Media — táctico** |
| **P&L, Alertas, Config** | Utilitario esencial | **Baja robustez, alta criticidad operativa** |

Este ranking define cuánto "peso visual" merece cada uno en el sidebar.

---

## 4. Nueva jerarquía propuesta (de arriba hacia abajo)

> **Sistema de naming final aprobado**: vocabulario del ecommerce
> profesional, accesible a cualquier fundador LATAM, sin palabras
> elitistas ni gringas. Decidido por Tomy en sesión 41.

### 🌟 Tier 1 — ACTIVOS DIGITALES (el corazón / lo que posees)
Los dos activos vivos que observan y piensan. La palabra "ACTIVOS"
transmite propiedad: el fundador siente que es dueño de algo real dentro
de la plataforma.

1. **NitroPixel** (con animación orbital cyan, badge ASSET)
2. **Aurum** (con orb dorado flotante, badge INTELLIGENCE)

### 🧭 Tier 2 — CONTROL DE GESTIÓN (el día a día ejecutivo)
Lo que un fundador abre apenas entra. Lenguaje de director/CFO:
elegante, premium, profesional.

3. **Centro de Control**
4. **Pedidos**
5. **Alertas** ← sube desde el footer (hoy está perdida abajo)

### 💎 Tier 3 — FIDELIZACIÓN Y COMUNIDAD (clientes + creadores)
Los dos módulos con tratamiento de card premium. "Fidelización" habla
de clientes (Bondly), "comunidad" habla de creadores (Aura). El combo
cubre ambos activos humanos del negocio.

6. **Bondly** (verde loyalty)
7. **Aura** (gradiente creator pink→violet→cyan)

### 🚀 Tier 4 — MARKETING DIGITAL (cómo traigo ventas)
Todo lo que empuja demanda. Competencia sube acá porque es inteligencia
de mercado, no un "canal".

8. **Campañas** (Meta, Google, Creativos, Overview)
9. **SEO**
10. **Competencia** ← sube desde "Canales"

### 🧱 Tier 5 — COMERCIAL (lo que vendés y cuánto te deja)
Catálogo + rentabilidad juntos: el producto y su economía unitaria.

11. **Productos**
12. **Rentabilidad**

### 🏪 Tier 6 — MARKETPLACES (venta externa)
Plazas externas donde también vendés. "Marketplaces" deja claro que es
venta fuera de tu propio sitio.

13. **MercadoLibre**

### 💰 Tier 7 — FINANZAS
Salud financiera de la empresa, separada del día a día operativo.

14. **P&L** (Estado de Resultados, Costos Operativos)

### ⚙️ Tier 8 — (sin label, footer discreto)
Solo Configuración queda al fondo. Alertas se sube al Tier 2.

15. **Configuración**

### Cambios resumidos vs. hoy
- **Activos Digitales sube al Tier 1** (hoy está en el medio-abajo).
- **Alertas sube al Tier 2** (hoy está en el footer y es ventana a
  problemas urgentes, merece protagonismo).
- **Competencia se mueve a Crecimiento** (hoy está en Canales, pero es
  inteligencia de mercado, no un canal de venta).
- **Bondly y Aura quedan en el mismo grupo "Relaciones"** (hoy están
  separados: Bondly en "Clientes", Aura en "Creators").
- **Productos y Rentabilidad agrupados en Catálogo/Economía** (hoy están
  en "Comercial", lo cual es vago).

### Garantía de no pérdida
Los 15 ítems arriba son exactamente los 15 ítems actuales del sidebar.
Solo cambian de orden y de agrupación. Los sub-items de Campañas, Aura,
Bondly, MercadoLibre y P&L se mantienen idénticos.

---

## 5. Tratamiento visual por tier

Cada tier tiene un "peso visual" distinto. La idea es que tu ojo, al
entrar, vaya naturalmente de arriba hacia abajo, y que entienda sin leer
qué es prioridad vs. qué es utilitario.

### Tier 1 — Activos vivos (máximo peso)
- **Card holográfica** con conic gradient rotante de fondo muy sutil (ya
  existe para Aura, lo extendemos a NitroPixel y Aurum).
- **Ícono animado** grande (28px): NitroPixel con orbitas y pulsos de
  neuronas (ya existe como `PixelBrainSidebar`), Aurum con orb dorado
  que respira.
- **Label del grupo**: gradiente cyan→violeta con letterspacing amplio,
  uppercase, texto "EL CORAZÓN" (más evocativo que "ACTIVOS DIGITALES").
- **Altura de cada card**: un toque más alta que las demás (60px vs 44px).
- **Sub-label dentro de cada card**: "Tu activo digital vivo",
  "Inteligencia dorada del negocio".
- **Indicador de actividad en vivo**: un dot cyan que pulsa al lado de
  NitroPixel si hay visitantes activos en los últimos 5 minutos. Un dot
  dorado al lado de Aurum si tiene mensajes sin leer o análisis nuevos.
- **Hover**: la card se "ilumina" un 20% más en el glow.

### Tier 2 — Hoy y Ahora (protagonismo operativo)
- Labels clásicas, sin gradiente. Texto blanco, tracking normal.
- **Ícono de 22px**, color blanco sobre hover naranja.
- **Badge numérico vivo** al lado de Pedidos: "12 hoy" actualizándose en
  tiempo real. Al lado de Alertas: "3" si hay alertas no leídas (rojo
  pulsante si son críticas, amarillo si son warnings).
- Hover: border izquierdo naranja 2px, ligera elevación 1px.

### Tier 3 — Relaciones (segundo peso, cards premium)
- Cards premium existentes: Bondly verde (`#10b981`), Aura rosa-violeta
  (`#f472b6`). Ya están, solo mantenerlos.
- **Mejoras nuevas**:
  - Bondly: agregar dot verde pulsante si hay señales en vivo (igual que
    NitroPixel pero más tenue).
  - Aura: agregar badge dinámico de "3 aplicaciones pendientes" si hay
    cosas para revisar.
  - Dividir el grupo con el label "RELACIONES" en gradiente verde→rosa
    (une visualmente los dos colores de los módulos).

### Tier 4 — Crecimiento (peso medio)
- Labels estándar, tracking medio.
- Íconos 20px.
- Pequeño glow de color propio al hover:
  - Campañas: glow azul Meta-Google.
  - SEO: glow verde.
  - Competencia: glow naranja-amarillo (alerta táctica).
- Sin badges dinámicos, salvo un contador sutil de "campañas activas".

### Tier 5 — Catálogo y Economía (peso medio-bajo)
- Tratamiento sobrio. Íconos 20px.
- Rentabilidad con ícono que se tiñe verde si está positiva, rojo si
  está en pérdida (un toque tipo "traffic light" sin molestar).

### Tier 6 — Canales (peso medio-bajo)
- MercadoLibre con su logo/color amarillo ML (no solo SVG genérico).
  Esto ya lo transmite pero se puede reforzar.
- Indicador pequeño del estado de conexión (verde conectado, gris si hay
  problema de sync).

### Tier 7 — Finanzas (peso medio, contenido sensible)
- Tono más formal, ícono de billete/gráfico.
- Sin animaciones fuertes.

### Tier 8 — Utilitarios (peso mínimo)
- Texto en gris muted. Íconos 18px.
- Sin efectos especiales.

---

## 6. Animaciones y movimientos sutiles (el "se siente caro")

Todas las animaciones siguen la biblia visual: curva
`cubic-bezier(0.16, 1, 0.3, 1)`, duración 180-320ms.

### Animaciones globales del sidebar
1. **Entrada stagger al cargar**: cada tier aparece con 80ms de delay
   sucesivo. Primero el logo, después Tier 1 (corazón), después Tier 2,
   etc. Sensación de "la plataforma enciende".
2. **Scroll interno con gradient mask**: cuando el sidebar tiene
   overflow, los bordes superior e inferior se difuminan suavemente
   (fade out). Ya no se ven cortes duros.
3. **Separadores entre tiers**: línea horizontal muy tenue con un gradient
   horizontal que "respira" cada 6 segundos. Sutil, casi subliminal.

### Animaciones del Tier 1 (corazón)
4. **Aurora background** detrás de la sección Tier 1: un radial gradient
   cyan-violeta muy blureado que se mueve lentamente 40 segundos por
   ciclo. Da la sensación de "detrás de esto hay algo vivo".
5. **NitroPixel orb**: ya existe el PixelBrainSidebar con órbitas y
   pulsos. Mantenerlo, subirle el tamaño a 32px.
6. **Aurum orb**: el AurumOrb dorado flota 3px arriba y abajo en loop
   de 5s. Respira cada 2.8s. Ya existe.
7. **Pulse dot "live"**: dot de 6px que pulsa cada 1.6s junto al label
   "NitroPixel" cuando hay visitantes ahora mismo.

### Animaciones del Tier 2 (operativo)
8. **Alertas — campanita con micro-shake**: si hay alertas nuevas, el
   ícono de campana hace un pequeño shake de 0.5° cada 8 segundos (tipo
   "notificación sin ser invasivo"). Dot rojo pulsando al lado.
9. **Pedidos — contador counter-up**: cuando el número de pedidos
   cambia, el contador hace count-up animado de 400ms.

### Animaciones del Tier 3 (relaciones)
10. **Bondly breathing glow**: el border verde respira sutilmente cada
    4 segundos cuando estás en la página.
11. **Aura holo sweep**: el gradient rosa-violeta-cyan se desplaza
    lentamente de izquierda a derecha cada 7 segundos (ya existe).

### Hover states (todos los tiers)
12. **Elevación universal**: 1-2px de traslado hacia arriba y shadow
    sutil, duración 220ms.
13. **Border izquierdo que "entra" en active**: cuando una ruta está
    activa, el border izquierdo (2-3px) aparece con traslación desde la
    izquierda, no con fade.
14. **Color del texto shift**: al hover, el texto cambia de 0.7 opacity a
    1 opacity con transición 180ms.

### Indicadores dinámicos (el "dashboard está vivo")
15. **Dots de estado** al lado del label de cada módulo que se conecta
    con un servicio externo:
    - Verde = sincronizado y funcionando.
    - Amarillo = sync atrasado (>2h).
    - Rojo = error de conexión.
    Esto aplica a Campañas (Meta + Google), MercadoLibre, SEO (GSC), GA4.

---

## 7. Elementos nuevos que proponemos agregar (sin quitar nada)

1. **Label del grupo top**: cambiar "ACTIVOS DIGITALES" por **"EL CORAZÓN"**
   (más evocativo y te apropia del concepto).
2. **Nuevo separador inicial** arriba del Tier 1 con un prism delimiter
   (cyan→violet→orange) de 1px — mismo estilo que los hero sections.
3. **Indicador "live" en el logo**: un pequeño dot verde animado al lado
   del logo "NITROSALES" que indica "plataforma viva, todo conectado".
4. **Cmd+K shortcut hint**: al hover del logo, pequeña pista gris
   "⌘K" que te recuerda que existe el command palette (si no existe, lo
   podés agregar después).
5. **Collapse del sidebar opcional** (no obligatorio): posibilidad futura
   de minimizar a solo iconos (64px). Si lo queremos, va detrás.

---

## 8. Qué NO cambia

Para tu tranquilidad, esto queda igual:

- La lógica de auth y redirecciones.
- El comportamiento del `usePathname` + `isActive`.
- Todos los sub-items (`children`) de Campañas, Aura, Bondly, ML, P&L.
- La funcionalidad de los módulos. Esto es solo visual + orden.
- Los colores del brand (naranja, cyan, violet, etc).
- Las rutas (`/dashboard`, `/aura/inicio`, etc). Todos los links siguen.
- La responsividad mobile (hamburger, overlay, etc).

---

## 9. Riesgos y decisiones pendientes

### Riesgos bajos que no me preocupan
- La animación del aurora background puede pesar en equipos viejos. Se
  respeta `prefers-reduced-motion`, resuelto.
- Indicadores "live" necesitan queries ligeras de backend. Ya las tenés
  (visitantes de NitroPixel, alertas no leídas). Solo hay que exponerlas.

### ✅ Decisiones ya tomadas (sesión 41)
Todo aprobado. La propuesta está lista para ejecutar.

1. ✅ **Label Tier 1**: ACTIVOS DIGITALES (mantiene la palabra "ACTIVOS"
   que transmite propiedad para la empresa usuaria).
2. ✅ **Alertas suben al Tier 2** (Control de Gestión).
3. ✅ **Competencia se mueve a Tier 4** (Marketing Digital).
4. ✅ **Bondly + Aura se agrupan** bajo "FIDELIZACIÓN Y COMUNIDAD".
5. ✅ **Sistema de naming**: vocabulario del ecommerce profesional, no
   elitista ni silicon valley. Labels finales:
   - Tier 1 → ACTIVOS DIGITALES
   - Tier 2 → CONTROL DE GESTIÓN
   - Tier 3 → FIDELIZACIÓN Y COMUNIDAD
   - Tier 4 → MARKETING DIGITAL
   - Tier 5 → COMERCIAL
   - Tier 6 → MARKETPLACES
   - Tier 7 → FINANZAS
   - Tier 8 → (sin label)

---

## 10. Cómo implementarlo (por si querés saberlo aunque no lo ejecutes ya)

Cuando apruebes, la implementación es un commit único, aislado:
1. Reescribir el array `NAV_GROUPS` en `src/app/(app)/layout.tsx` con el
   nuevo orden y agrupaciones. Riesgo: cero, es un reorder.
2. Agregar keyframes y clases CSS nuevas para aurora, breathing,
   prism delimiter inicial. Todo dentro de `<style jsx global>` que ya
   existe.
3. Agregar endpoints ligeros (o reutilizar los existentes) para los
   indicadores "live": visitantes activos, alertas no leídas, sync
   status por plataforma. Mayoría ya existen.
4. Agregar componente `SidebarStatusDot` reutilizable de 6px con colores
   semantic (green/yellow/red).
5. Test en local (`npm run dev`), validar `npx tsc --noEmit`, y push
   directo a `main` (según CLAUDE.md regla #1).

Tiempo estimado de implementación: **2-3 horas** para dejarlo prolijo,
animaciones incluidas. Cero riesgo de romper rutas porque solo toca
presentación.

---

## 11. Cómo luce (descripción en palabras de la imagen final)

Cuando entres al dashboard después del cambio, vas a ver:

- Arriba, el logo NITROSALES con un puntito verde vivo al lado.
- Debajo, una zona diferente a todo lo demás: **"EL CORAZÓN"** en letras
  con gradient cyan-violeta, y debajo dos cards holográficas (NitroPixel
  con su orb azul rotando, Aurum con su orb dorado respirando). Ahí te
  das cuenta de que no es un dashboard más.
- Después, un grupo sobrio y compacto con **"HOY Y AHORA"**: Centro de
  Control, Pedidos con contador en vivo, Alertas con dot rojo cuando hay
  algo urgente.
- Más abajo, **"RELACIONES"** con Bondly (verde loyalty) y Aura (creator
  gradient) lado a lado, ambos con cards premium.
- Después, **"CRECIMIENTO"** con Campañas, SEO, Competencia.
- Después, **"CATÁLOGO Y ECONOMÍA"** con Productos y Rentabilidad.
- Después, **"CANALES"** con MercadoLibre.
- Después, **"FINANZAS"** con P&L.
- En el piso, casi invisible pero presente, Configuración.

La sensación de arriba abajo es: *"esto piensa y respira"* → *"esto
trabaja conmigo hoy"* → *"esto me conecta con mis clientes y creadores"*
→ *"esto me hace crecer"* → *"esto administra mi negocio"*.

Pasar el mouse por cada item se siente físico (elevación sutil, border
que entra), los indicadores en vivo te recuerdan que la plataforma está
conectada, y las dos cards del tope te recuerdan, cada vez que abrís la
app, que tu moat son NitroPixel y Aurum.

---

_Documento vivo. Tomy puede editar directamente, o marcar en el chat qué
aceptar/rechazar/modificar antes de que Claude implemente._
