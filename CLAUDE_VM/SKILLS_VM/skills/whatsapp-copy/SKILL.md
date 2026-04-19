---
name: whatsapp-copy
description: Escribe mensajes de WhatsApp para NitroSales — outbound frío, seguimientos post-demo, notificaciones de cuenta, recordatorios de reunión, handshake con prospects calientes. Usala cuando Tomy pida "armame el WhatsApp para [X]", "mensaje de intro por WhatsApp", "follow-up del call de ayer", o cuando haya que producir copy para el canal más inmediato. Entrega mensajes cortos, humanos, con el tono exacto de Tomy hablando — no se siente vendedor. No manda el mensaje, solo produce el texto listo para pegar.
---

# whatsapp-copy

Produce copy de WhatsApp que suena a Tomy hablando, no a un bot de venta. WhatsApp es canal íntimo en LATAM — el tono equivocado rompe la relación en 1 mensaje.

## Cuándo se dispara

- "Mensaje de WhatsApp para [X]."
- "¿Cómo le escribo al founder de [empresa]?"
- "Follow-up del call de ayer por WA."
- "Recordatorio de la reunión de mañana."
- "Handshake después de un refer."

## Proceso

1. Cargá `_CANON/brand-voice.md` (ojo: WhatsApp es el canal más informal, pero sin caer en parodia argentina).
2. Identificá tipo + contexto + cuánto sabemos del destinatario.
3. Escribí 1 mensaje base + 1-2 variantes.
4. Decidí si va con audio o solo texto (ver "Audio vs texto").

## Principios WhatsApp de NitroSales

1. **Máximo 3-4 líneas por mensaje**. Si no entra, partir en dos mensajes encadenados.
2. **Nada de formalismo innecesario**. "Buenos días, espero se encuentre bien" → destruye. "Hola [nombre], qué tal?" → bien.
3. **Nunca pedir demo en el primer mensaje**. Primera interacción es handshake, no pitch.
4. **Usar nombre propio**. "Soy Tomy, de NitroSales" — no "el equipo de NitroSales".
5. **Cero emojis en mensajes comerciales**. 1 emoji máximo, solo si hay confianza previa.
6. **Mayúscula al inicio, punto final**. No somos adolescentes. Pero tampoco formales.
7. **No usar signo de pregunta invertido en cada frase** — se pierde flow. "Como estas?" / "Te copa 15 min el jueves?" funcionan.

## Tipos de mensaje

### 1. Cold outbound (por referido)

**Estructura** (3 mensajes encadenados):

**Mensaje 1**:
> Hola [nombre], qué tal? Soy Tomy de NitroSales. [Referente] me pasó tu contacto.

**Mensaje 2** (separado por 1-2 min de diferencia):
> Armé una plataforma para que fundadores como vos dejen de vivir adentro de planillas. Básicamente une VTEX, ML, Meta, Google y creators en un solo cerebro.

**Mensaje 3**:
> Si te hace ruido, te muestro 15 min por Meet esta semana. Si no, sin drama, borramos.

### 2. Cold outbound (sin referido)

Mismo patrón, pero el gancho inicial debe ser MÁS específico y personal:

**Mensaje 1**:
> Hola [nombre], qué tal? Te escribo porque vi [algo puntual de su operación — colección nueva, apertura en ML, contratación reciente].

**Mensaje 2**:
> Soy Tomy, fundador de NitroSales. Hacemos atribución + P&L real-time para VTEX/ML. Nos cruzamos con marcas en tu etapa.

**Mensaje 3**:
> 15 min para ver si hace fit? Si no es el momento, quedamos conectados.

### 3. Recordatorio de reunión (warm)

**Mensaje**:
> Hola [nombre], dejo por acá el link del Meet para mañana [hora]: [link]. Cualquier cosa antes, avisame por acá.

### 4. Post-demo (follow-up inmediato)

**Mensaje** (mandarlo en los 10 min posteriores):
> [Nombre], gracias por el tiempo ahora. Te armo un resumen por mail de lo que hablamos. Si algo urgente queda, escribime directo por acá.

### 5. Nudge suave (3-5 días sin respuesta post-demo)

**Mensaje 1**:
> Hola [nombre], todo bien?

**Mensaje 2** (al día siguiente si no hay respuesta):
> Sin presión — solo quería saber si el material que te mandé el [día] te sirvió, o si tenés alguna duda puntual.

### 6. Cierre (decisión pendiente)

**Mensaje**:
> [Nombre], tengo la firma lista, así que cuando decidas me avisás. Te dejo espacio sin bombardear. Si necesitás hablar con [equipo/socio] antes, avisame y te preparo un resumen corto para ellos.

### 7. Rechazo de prospect (nos dice "no es ahora")

**Mensaje**:
> [Nombre], gracias por la honestidad. Lo bueno de no es ahora es que puede ser dentro de 3 meses. Te marco para retomar en [mes concreto] y mientras tanto te mando la newsletter si te copa.

## Audio vs texto

**Mandar audio** (voz de Tomy):
- Cuando hay relación previa.
- Cuando el tema es complejo y el texto lo haría largo.
- Para celebraciones ("primer hit del pixel", "primer mes cerrado").

**Nunca mandar audio**:
- Primer contacto frío.
- Mensajes transaccionales (recordatorios, links).
- Cuando sabés que el destinatario está en reunión.

**Regla**: audio máximo 45 segundos. Si no entra, es un tema para llamar.

## Output format

```markdown
# WhatsApp: [tipo] — [contexto]

## Metadata
- Destinatario: [nombre, empresa]
- Relación: [cold / warm / hot]
- Objetivo: [...]

---

### Mensaje 1
> [texto]

### Mensaje 2 (enviar 1-2 min después)
> [texto]

### Mensaje 3 (opcional)
> [texto]

---

## Alternativa (si quieren otro ángulo)
> [...]

## Nota
- [si va con audio / no]
- [mejor momento del día para mandarlo]
- [qué esperar como respuesta]
```

## Anti-patrones

- "Estimado [Nombre], espero que se encuentre bien." → muy formal, no va.
- "Hola bro" / "jefe" / "crack" → muy informal, no va.
- "Te invito a agendar un espacio en mi calendario: [link calendly]." → deshumaniza.
- Más de 4 mensajes seguidos sin respuesta del otro.
- Links largos sin contexto.
- "Te escribo para OFRECERTE..." → palabra "ofrecer" mata.
- Emojis de 🚀 💰 📈 → cliché.

## Regla de oro

Antes de mandar, releer en voz alta. Si te daría cringe recibirlo de un desconocido, no lo mandes.
