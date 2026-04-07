# NitroPixel · NitroScore — Estrategia de Exposición al Cliente

**Estado:** Fase 1 — Interno (oculto detrás de feature flag)
**Última actualización:** 2026-04-07
**Owner:** Tomy

---

## Contexto

NitroScore es un score 0-100 + 5 palancas (click coverage, identity richness,
CAPI match, signal freshness, webhook reliability) que mide la salud del
NitroPixel para una organización dada.

Está construido sobre `/api/nitropixel/data-quality-score` y la página
`/nitropixel/quality`.

Usa `measurementStart` (piso 2026-04-07 para cuentas legacy, `firstSeenAt`
del primer evento para clientes nuevos) para no arrastrar data pre-fix, y
estados `"collecting"` para palancas que aún no tienen el mínimo de muestras
(20/10/5/10/5).

---

## El problema estratégico

Mostrarle a un cliente un número de "salud del pixel" es de doble filo:

1. **Sin contexto, un número bajo se interpreta como falla del proveedor.**
   El cliente ve 62/100 y piensa "Nitro no funciona", aunque el 38% que falta
   sea 100% culpa de su Shopify mal configurado, su CAPI sin permisos, o que
   simplemente no mandó tráfico suficiente.

2. **Los clientes comparan.** Cuando dos clientes de Nitro se cruzan en un
   grupo de WhatsApp y uno dice "yo tengo 87" y el otro "yo 54", el de 54
   escribe enojado aunque su pixel esté midiendo perfecto para su volumen.

3. **El responsable emocional del número soy yo.** Cobro el fee, doy la cara,
   y un score bajo lo asocian conmigo más que con su propia configuración.

4. **La semántica de "score" es de juicio.** Un número que parece una nota
   del colegio frustra; un checklist incompleto motiva.

## La estrategia: rollout en 4 fases

### Fase 1 — Interno (AHORA)

- El score existe pero está **oculto detrás de un feature flag**
  (`isInternalUser`) basado en allowlist por email.
- Solo yo (y mi equipo) lo veo. Lo uso como **radar interno** para:
  - Priorizar a qué cliente intervenir primero
  - Detectar cuándo un fix técnico mío impactó en la calidad
  - Generar un "health check mensual" curado que mando al cliente
- El cliente **no ve el número crudo** — ve mi diagnóstico humano.
- Duración: 30-60 días, hasta validar que el score refleja la realidad
  en distintos clientes.

### Fase 2 — Reframe a "Checklist de Setup"

- Mismo dato, otra cabeza.
- En vez de mostrar `62/100`, mostrar:
  - ✓ Click IDs conectados
  - ✓ CAPI activo
  - ✓ Webhook recibiendo órdenes
  - ⏳ Identidad enriquecida — en progreso
- Cambia la semántica de **juicio** ("tu pixel saca 62") a **progreso**
  ("te faltan 2 pasos"). El cliente nunca ve un número feo, ve una ruta clara.
- Esta página vive en `/nitropixel/setup` (mismo endpoint, distinto framing).

### Fase 3 — Score con piso

- Solo se muestra el número **arriba de cierto umbral** (ej. 75).
- Por debajo, el cliente ve "Configuración en curso" + acciones concretas.
- El cliente nunca ve un número feo. Cuando lo ve, ya ganó.

### Fase 4 — Score público con benchmark

- Solo cuando tengamos suficiente data por vertical para decir
  "tu 72 es top 10% de tu rubro".
- Hasta entonces, el número descontextualizado es más riesgo que valor.

---

## Decisiones técnicas

| Componente | Estado actual |
|---|---|
| Endpoint `/api/nitropixel/data-quality-score` | ✅ Build con `measurementStart` floor + collecting state |
| Página `/nitropixel/quality` (score completo) | ✅ Build, oculta detrás de `isInternalUser` |
| Página `/nitropixel/setup` (checklist) | ✅ Build, oculta detrás de `isInternalUser` |
| `src/lib/feature-flags.ts` | ✅ Allowlist por email |
| Exposición pública | ❌ Bloqueada — fase 1 |

## Cómo activar para más usuarios

Editar `src/lib/feature-flags.ts` y agregar el email del usuario al
array `INTERNAL_EMAILS`. Es deliberadamente manual para forzar una
decisión consciente.

## Cómo desactivar el feature flag (Fase 2 → cliente)

Cambiar el guard en los `layout.tsx` de `/nitropixel/quality` y
`/nitropixel/setup` por la lógica deseada (ej. checkear plan, role,
o quitarlo del todo).

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cliente pide ver el score y no se lo damos | Respuesta: "Estamos validando el modelo. Te mando el diagnóstico curado mensual" |
| Internamente alguien comparte el link | Feature flag a nivel layout — devuelve 404 si no estás en allowlist |
| El measurementStart se rompe para un cliente nuevo | Default seguro: si no hay primer evento, `measurementStart = now()` (collecting state, no número falso) |
