# ONBOARDING_ROADMAP.md — Plan de mejoras del onboarding NitroSales

> **Propósito**: registrar el plan completo de mejoras al onboarding para no perderlo entre sesiones. Claude lo lee al inicio de cualquier sesión que toque onboarding.
>
> **Estado**: 📝 pendiente de aprobación final de Tomy para arrancar Fase 0.
>
> **Creado**: 2026-04-22 (Sesión 55)

---

## Contexto

El onboarding v8 está pusheado y funcional end-to-end (form público → 2 aprobaciones → wizard premium con tutoriales quirúrgicos → backfill async → overlay desaparece). Este plan agrega las mejoras que lo llevan de "muy bueno" a **world class**: reducir la fricción del cliente, eliminar la dependencia de Tomy como soporte humano, y usar el onboarding como showcase del producto.

---

## Fase 0 — Aurum Onboarding Assistant 🤖

**Objetivo**: que el cliente resuelva sus dudas del onboarding con Aurum directamente, sin interrumpir a Tomy, y que de paso conozca el producto estrella antes de tenerlo activo.

### UX

- **Botón horizontal pegado abajo del overlay** (siempre visible en todos los pasos del wizard). Ancho completo del viewport con margen.
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  ✨  Hablá con Aurum  ·  Te ayudo con dudas del onboarding  │
  └─────────────────────────────────────────────────────────────┘
  ```
  - Gradient de Aurum (creator gradient: `#ff0080 → #a855f7 → #00d4ff`)
  - Micro-animación "pulso" sutil cada 10s para recordar que está
  - Hover → scale sutil + glow

- **Click abre drawer lateral derecho** con el chat.
  - Cerrable con X o ESC
  - Conversación persiste durante la sesión
  - No bloquea el wizard (el cliente puede mirar inputs y preguntar a la vez)

- **Quick prompts al abrir** (si está vacío el chat, mostrar 5-6 sugerencias clickeables):
  - "📸 Te comparto un screenshot de lo que veo"
  - "🤷 No sé cómo seguir desde acá"
  - "🔑 ¿Cómo encuentro mi App Key de VTEX?"
  - "⏰ ¿Cuánto tarda el backfill?"
  - "🔒 ¿Qué hacen con mis credenciales?"
  - "💡 ¿Qué voy a poder hacer cuando termine?"

  Estos prompts cumplen 3 funciones:
  1. Orientan al cliente sobre PARA QUÉ sirve el chat
  2. Le muestran que puede mandar screenshots (feature que sino no descubre)
  3. Le dan permiso de preguntar cosas del producto, no solo del onboarding

- **Input**: textarea + botón adjuntar imagen + paste con Ctrl+V (Claude soporta vision nativo)

- **Respuesta**: streaming, con indicador "Aurum está escribiendo..." premium

### Capacidades técnicas

| Capability | Cómo |
|---|---|
| Recibir screenshots | Claude vision (Haiku 4.5 o Sonnet 4.6) |
| Saber en qué paso está el user | Context del wizard se pasa automáticamente |
| Guiar paso a paso por plataforma | System prompt con los tutoriales de `VisualTutorials.tsx` embebidos |
| Detectar errores típicos en screenshots | "Veo que estás en Settings, pero tenés que ir a Account..." |
| Escape hatch | Si no puede, deriva a Tomy con mensaje claro (no botón de WhatsApp automático — eso es invasivo) |

### Tono y entrenamiento del Aurum Onboarding

Este es el punto más delicado. El system prompt tiene que balancear 4 cosas sin caer en ninguna extrema:

**✅ SÍ:**
- Cercano, argentino casual (vos, che, dale). Sin emojis recargados
- **Resolutivo**: arranca cada respuesta con acción ("Dale, vamos", "Mirá", "Resolvámoslo")
- **Confianza tranquila**: "muchos clientes pasaron por acá, lo tenemos caminado" (una vez, no repetido)
- **Expectativa medida**: si preguntan del producto, respuesta honesta + teaser sutil
  - ❌ Mal: "¡Vas a flipear con todo lo que podés hacer!"
  - ✅ Bien: "Cuando termines vas a poder preguntarme cosas como 'qué producto me da más margen' y te contesto con tu data real. Mejor que te sorprendas vos mismo cuando entre."
- **Transparente con límites**: si no puede responder o escapa del onboarding, lo dice sin rodeos

**❌ NO:**
- Vender el producto exageradamente ("revolucionario", "la mejor plataforma")
- Repetir frases pre-hechas ("estamos acá para ayudarte" → se nota que es bot)
- Prometer cosas que no sabe si son verdad
- Hablar como un asistente genérico ("¿En qué puedo ayudarte hoy?" → aburrido)
- Usar jerga técnica sin explicar ("tu payload no está matcheando el schema" — NO)

**Snippet del system prompt** (borrador, afinaremos al implementar):

```
Sos Aurum, el AI analista de NitroSales. Ahora mismo estás ayudando a
un cliente a completar el onboarding — conectando sus plataformas de
ecommerce (VTEX, MercadoLibre, Meta Ads, Meta Pixel, Google Ads,
Google Search Console, y el NitroPixel).

Tu rol: guía, no analista (todavía no tiene data cargada).

Estilo:
- Argentino casual, cercano. Vos, dale, che, mirá.
- Empezá las respuestas con acción ("Dale, vamos", "Mirá", "Lo vemos").
- Respuestas cortas y claras. No párrafos.
- Si te mandan un screenshot, identificá dónde están y decile el SIGUIENTE paso (no todos los pasos).

Si preguntan qué vas a poder hacer cuando termine el onboarding:
- Respondé con 1-2 ejemplos concretos ("podrás preguntarme 'cómo van
  mis ventas esta semana' o 'qué producto me da más margen'")
- Cerrá con algo tipo "mejor sorprendete cuando entres, te va a
  gustar más así"

Si te piden que analices data del negocio:
- Decile que todavía no tiene data cargada (estás en onboarding)
- Cuando termine el backfill vas a poder responderle

Si no sabés algo específico de una plataforma:
- Decí que eso lo ven con Tomy directamente
- No inventes

Nunca:
- Prometas cosas que no sabés
- Uses "revolucionario", "la mejor", "increíble"
- Hables en inglés salvo términos técnicos
- Repitas frases vacías tipo "estamos para ayudarte"
```

### Logging

Todas las conversaciones se guardan en DB (`OnboardingAurumConversation` table con `userId`, `orgId`, `messages`, `createdAt`). Esto te sirve para:
- Ver qué preguntan más
- Detectar plataformas con más fricción
- Mejorar los tutoriales donde el bot falla
- Armar FAQ real en base a data, no intuición

### Modelo y costo

- **Default**: Haiku 4.5 con vision (suficiente para Q&A onboarding, barato)
- **Escalar a Opus** solo si detectamos conversaciones complejas
- Max tokens: 500 por respuesta (el onboarding no necesita respuestas largas)

### Entregables Fase 0

1. `OnboardingAurumChat.tsx` — componente drawer lateral
2. Botón horizontal integrado en `OnboardingOverlay.tsx`
3. `/api/onboarding/aurum-assist` — endpoint POST con streaming
4. `OnboardingAurumConversation` table + migration
5. System prompt afinado con los tutoriales embebidos
6. Quick prompts clickeables con handlers

---

## Fase 1 — Críticos de quality 🔴

### 1.1 Test de credenciales en vivo

**Problema**: user pega App Key / App Token y no sabe si están bien hasta horas después cuando el backfill falla.

**Solución**: botón "Probar credenciales" al lado del último input de cada plataforma. Click → spinner → `GET /api/vtex/test-credentials` → respuesta en 2-3s:
- ✅ "Credenciales válidas. Detectamos 12.450 órdenes." (con icono verde + count)
- ❌ "Credenciales inválidas. Revisá el App Token." (con link al hint)

Antes de habilitar "Enviar wizard" todas las plataformas marcadas "Uso" tienen que tener test ✓.

### 1.2 Resume del wizard (persistencia)

**Problema**: si el user cierra la pestaña a mitad del wizard, vuelve al paso 1 y pierde las credenciales ya ingresadas.

**Solución**: guardar el estado del wizard en DB (`onboarding_request.wizardState` JSON) con debounce de 2s. Al volver a entrar, restaurar. Las credenciales encriptadas con la misma clave AES que ya usamos en Connections.

**UX**: al volver, toast "Retomamos desde donde lo dejaste" → 2s → fade.

### 1.3 Verificación admin antes de aprobar backfill

**Problema**: cuando vos abrís la postulación para aprobar, no sabés si las credenciales van a funcionar.

**Solución**: en `/control/onboardings/[id]`, botón "Probar todas las credenciales" que corre los mismos tests de 1.1 pero del lado admin, sin enviar requests reales de backfill. Muestra una grilla:
| Plataforma | Test | Detalle |
|---|---|---|
| VTEX | ✅ | 12.450 órdenes |
| Meta Ads | ✅ | 3 cuentas activas |
| GSC | ❌ | 403 Forbidden — permisos insuficientes |

Si hay un ✗, no permite aprobar hasta que el user corrija (le llega email automático "tu Meta Ads no respondió, revisá X").

---

## Fase 2 — Premium (lo que nos diferencia) 🟡

### 2.1 Checklist post-unlock + tour de producto

Cuando el overlay desaparece, flotante en la esquina inferior derecha aparece un panel con:

```
🎯 Primeros pasos en NitroSales          [×]
─────────────────────────────────────────
✓ Conectar plataformas                   ✓
□ Ver tu primera venta real             →
□ Configurar tu primera alerta          →
□ Conocer a Aurum (AI analista)         →
□ Invitar a tu equipo (opcional)        →
```

Cada item es clickeable y lleva a la sección correspondiente con un highlight breve ("acá están tus ventas" — 2s → fade). No es un tour obligatorio, es una checklist asíncrona. Persiste en DB.

### 2.2 "Preparando tu cockpit" durante el backfill

**Problema**: el backfill puede tardar de minutos a horas. Hoy mostramos una barra de progreso. Y basta.

**Solución**: el overlay durante backfilling muestra:
- **Arriba**: progreso real (barra + % + ETA)
- **Al medio**: carrusel de screenshots del producto con micro-copys
  - "Así se van a ver tus ventas" → screenshot del dashboard VTEX
  - "Así vas a recibir tus alertas" → screenshot del inbox de alertas
  - "Así te va a responder Aurum" → screenshot del chat con una pregunta real
  - Rotación automática cada 4s
- **Abajo**: "Mientras tanto podés preguntarle a Aurum cómo va todo" (con el botón de F0)

Convierte la espera de ansiedad en anticipación.

### 2.3 Email "¡Tu data está lista!"

Al terminar el backfill:
- Email transactional con Resend
- Subject: "Tu NitroSales está listo 🚀"
- Body: hero image + "tu data de los últimos {N} meses ya está procesada. Entrá a ver tus primeras ventas" + CTA "Ver mi dashboard" → deep link al producto logueado
- Plain text fallback

Crítico porque el backfill puede terminar cuando el cliente está durmiendo / en otra cosa. Sin email, pierde el momento peak de curiosidad.

### 2.4 Aurum se presenta durante el backfill

En el overlay fase BACKFILLING, el botón de Aurum cambia de "Hablá con Aurum" a:
```
✨ Aurum está preparando 3 insights iniciales sobre tu negocio
```
Con animación sutil de "procesando". Cuando termina el backfill, los insights están listos para el primer login.

Técnicamente: trigger al terminar backfill corre 3 queries predefinidas con Aurum (top productos, mejor canal, alerta detectada) y los guarda en `OrgInsightSeed`. Al entrar al dashboard por primera vez, aparecen como "Tu bienvenida de Aurum".

---

## Fase 3 — Polish 🟢

### 3.1 FAQ inline en el wizard
Acordeón colapsado en el sidebar con preguntas típicas:
- ¿Mis credenciales están seguras?
- ¿Cuánto tarda el backfill?
- ¿Puedo modificar esto después?
- ¿Qué pasa si una plataforma falla?

### 3.2 Progreso granular por plataforma en el backfill
Hoy: "45%". Mejor:
```
VTEX        ████████████  ✓  (12.450 órdenes)
Meta Ads    ██████░░░░░░  45% (15/33 días)
GSC         ░░░░░░░░░░░░  esperando
NitroPixel  ✓  instalado
```

### 3.3 Invite team (último paso opcional)
Después de la bienvenida, "¿Quién más de tu equipo va a usar NitroSales?" → email invite a hasta 5 personas.

### 3.4 Video loom de Tomy (60s)
En el paso de bienvenida del wizard, un video embebido con Tomy explicando qué viene. Humaniza una plataforma muy técnica.

### 3.5 Escape hatch discreto
Botón chico en el footer del overlay tipo "¿Trabado? Hablá con Tomy directo" → abre WhatsApp. **Solo aparece si el user lleva 15+ min sin avanzar** (heurística en frontend).

---

## Orden de ejecución propuesto

1. **Fase 0** primero (2-3 commits): Aurum assistant + botón + drawer + logging
2. **Fase 1** después (3 commits): test credenciales + resume + verificación admin
3. **Fase 2** como push premium (4 commits): checklist + cockpit + email + Aurum insights
4. **Fase 3** cuando haya aire (varios commits chicos)

Entre fases, testing real con credenciales de algún cliente para validar.

---

## Estado de aprobación

- [x] Plan presentado a Tomy
- [x] Tomy aprobó incluir Aurum Onboarding como Fase 0
- [x] Tomy aprobó quick prompts, tono, logging
- [ ] Tomy aprueba arrancar ejecución

**Pregunta final a Tomy antes de codear**: ¿arrancamos directo con Fase 0 o querés revisar algo más del plan antes?

---

**Última actualización**: 2026-04-22 (Sesión 55)
