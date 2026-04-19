# CASOS_DE_EXITO.md — Casos de cliente, plantilla y caso beta vigente

> **Propósito**: Registro estructurado de casos de cliente. Hoy hay **un cliente beta** en construcción (no cerrado como caso de éxito). Este archivo también contiene la **plantilla maestra** para documentar futuros casos cuando haya clientes pagando con resultados medibles.
>
> **Regla de oro de honestidad**: no inventamos números. No hay caso de éxito cerrado todavía. Cuando hablemos de "clientes", decimos la verdad: "estamos en beta con una marca argentina de juguetes y bebés". Punto.

---

## Estado actual (2026-04-18)

| Métrica | Valor |
|---|---|
| Casos de éxito cerrados | 0 |
| Clientes beta activos | 1 (El Mundo del Juguete / El Mundo del Bebé) |
| Clientes pagando | 0 (pricing no definido aún) |
| Testimoniales documentados | 0 |

Esto no es malo — es **donde estamos**. Para un producto en beta esto es normal. Lo que NO se hace es inventar "más de 50 marcas confían en nosotros". Se dice: "estamos en beta con una marca argentina de juguetes para probar en vivo antes de escalar a más clientes."

---

## Caso 1 — EN CONSTRUCCIÓN — El Mundo del Juguete / El Mundo del Bebé

### Datos básicos

| Campo | Valor |
|---|---|
| **Nombre fantasía** | El Mundo del Juguete + El Mundo del Bebé |
| **Razón social** | KAVOR S.A. |
| **Categoría** | Retail — juguetería + artículos para bebé |
| **Plataformas** | VTEX (`mundojuguete.com.ar`) + MercadoLibre (seller KAVOR S.A.) |
| **País** | Argentina |
| **Tipo de relación** | Cliente beta / programa de adopción temprana |
| **Organization ID (NitroSales)** | `cmmmga1uq0000sb43w0krvvys` |
| **Status** | Activo, onboarding completo, usando la plataforma |

### Cómo llegaron

[Pendiente de documentar con Tomy. Por ahora no se afirma nada públicamente.]

### Qué usan de NitroSales

Todas las secciones están activas, pero el caso típico de uso se centra en:
- **Control de Gestión**: chequeo diario de ventas unificadas VTEX + ML.
- **Marketplaces / MercadoLibre**: alto volumen de órdenes ML, publicaciones, reputación.
- **Comercial / Productos**: vista SKU-first unificada (un SKU vendido en VTEX + ML aparece una sola vez).
- **NitroPixel**: atribución de campañas Meta + Google.
- **Aurum**: asistente para consultas rápidas.

### Resultados medidos hasta ahora

[Pendiente de documentar. Se completa cuando haya datos concretos y aprobación del cliente para publicar.]

**Lo que NO se hace**:
- Publicar métricas sin consentimiento explícito.
- Inventar ratios de crecimiento, ROAS mejorados, etc.
- Usar el logo sin permiso escrito.

### Qué falta para convertirlo en "caso de éxito"

- [ ] Tener 3-6 meses de uso sostenido documentado.
- [ ] Medir métricas concretas antes/después en al menos 2 dimensiones (ej: ROAS, tiempo ahorrado, churn reducido).
- [ ] Entrevista estructurada con la persona que lo usa día a día.
- [ ] Video testimonial o quote aprobado por escrito.
- [ ] Acuerdo formal sobre qué se puede publicar (nombre, logo, métricas específicas, screenshots).

### Para comunicación comercial (mientras esté en beta)

**Cómo se puede mencionar**:
> "Estamos corriendo con una marca argentina de retail (juguetería + baby) que usa VTEX y MercadoLibre, para pulir el producto en vivo antes de escalar. Cuando cerremos los primeros meses de data te contamos resultados concretos."

**Cómo NO se puede mencionar**:
- ❌ "Logramos +Y% de ventas en El Mundo del Juguete" (no hay números medidos todavía).
- ❌ Logo del cliente en la landing sin autorización.
- ❌ "El CEO de KAVOR dice que..." con una quote inventada.

---

## Plantilla para futuros casos de éxito

Cuando aparezca un cliente con resultados medibles y autorización, usar esta plantilla:

```markdown
## Caso N — [Estado: CERRADO / EN CONSTRUCCIÓN] — [Nombre del cliente]

### Datos básicos

| Campo | Valor |
|---|---|
| Nombre fantasía | |
| Razón social | |
| Categoría | |
| Plataformas | |
| País / región | |
| Antigüedad como cliente | (meses) |
| Organization ID | |

### Contexto del cliente (antes de NitroSales)

- **Qué vendía**: [categoría, canales, volumen aproximado si se puede]
- **Stack anterior**: [qué dashboards, qué CRM, qué atribución usaban]
- **Dolor principal**: [la frase que dijeron en discovery]
- **Alternativas que evaluaron**: [qué otros productos consideraron]

### Qué usan de NitroSales

- **Secciones activas**: [Control de Gestión, Marketing Digital, etc.]
- **Features que más usan**: [P&L Pulso, Aurum, NitroPixel, etc.]
- **Integraciones conectadas**: [VTEX, ML, Meta, Google, etc.]

### Resultados medidos

Formato: métrica + baseline + resultado + período.

- **Métrica #1**: [ej: ROAS blended]
  - Antes: X
  - Después: Y
  - Período: Z meses
  - Nota: [contexto, si algún factor externo movió el número]
- **Métrica #2**: [ej: tiempo ahorrado en reporting semanal]
- **Métrica #3**: [ej: % de churn reducido]

### Quote aprobado por el cliente

> "[Frase del cliente, firmada por escrito, indicar si es nombrado o anónimo.]"

— [Nombre, cargo, empresa]

### Materiales de marca

- [ ] Logo aprobado para usar en landing
- [ ] Screenshots aprobados
- [ ] Video testimonial grabado
- [ ] Permiso escrito firmado

### Aprendizajes para el producto / pitch

- Qué feature brilló en este caso.
- Qué dolor específico quedó resuelto.
- Qué falta que el cliente pidió.
- Cómo se podría replicar este éxito con prospects similares.

---
```

---

## Reglas de honestidad (aplican siempre)

1. **No inventamos números**. Si no hay baseline medido, no hay delta. "Mejoró el ROAS" sin datos = no se publica.
2. **No usamos logos sin permiso**. Incluso si el cliente "ya lo sabe", necesitamos autorización escrita.
3. **No copiamos quotes de email o chat casual**. Si queremos una quote publicable, se pide formalmente y se aprueba.
4. **No prometemos resultados a futuros clientes** basados en casos anteriores. Cada negocio es distinto. Se puede decir "un cliente en categoría similar logró X" pero no "con nosotros vas a lograr X".
5. **En beta, decimos beta**. La honestidad vende más que el teatro.

---

## Roadmap de casos de éxito (pipeline)

Cuando haya clientes pagando con uso real, esta sección se actualiza con cada cliente en la etapa en que esté:

- **Pipeline de conversación**: [vacío]
- **Negociación**: [vacío]
- **Onboarding**: El Mundo del Juguete (completado — ahora en uso)
- **Primer mes de uso**: [vacío]
- **Primeros resultados**: [vacío]
- **Listo para caso publicable**: [vacío]

---

## Materiales genéricos para cuando no hay caso cerrado

Mientras no haya caso cerrado, el pitch se sostiene con:

1. **Demo en vivo** — mostrar la app funcionando con data real (del beta, con consentimiento).
2. **Arquitectura de diferenciación** (`COMPETIDORES.md`): por qué NitroSales es distinto.
3. **Profundidad de integraciones** (`INTEGRACIONES.md`): lo que está conectado en serio.
4. **Roadmap de producto**: lo que viene, con honestidad sobre lo que ya está y lo que no.
5. **Historia del fundador**: Tomy construye esto porque él vio el dolor en carne propia.

Estos 5 elementos son más que suficientes para cerrar los primeros 5-10 clientes beta/pagos. Los casos de éxito llegan después.

---

## Notas para Claude VM

- Cuando Tomy pida "escribime testimoniales para la landing", **parar** y recordar que no hay testimoniales reales todavía. Ofrecer alternativas: demo videos, screenshots con data anonimizada, bullet de "qué problema resolvemos" en vez de "qué logró X empresa".
- Cuando Tomy pida "casos de éxito para el deck", usar el **caso beta** (con el framing de "en construcción") + el **roadmap honesto**. Nunca inventar números.
- Cuando aparezca el primer caso real, **completar la plantilla** arriba de todo y **actualizar el conteo** del "Estado actual".
- Si un prospect pregunta "¿cuántos clientes tienen?", la respuesta honesta es: "Estamos en beta con una marca argentina. Arrancamos con los primeros clientes pagos en [timeline que Tomy defina]. Preferimos hacerlo bien con pocos antes de escalar."
