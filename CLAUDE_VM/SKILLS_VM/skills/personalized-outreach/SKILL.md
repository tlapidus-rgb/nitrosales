---
name: personalized-outreach
description: Genera outreach personalizado 1-a-1 para cada prospect — no templates masivos, sino mensajes específicos con referencia a su operación concreta. Usala cuando Tomy pida "armame el outreach para [empresa]", "personalizá este mensaje para [N] prospects", "primer contacto cold para [Nombre]", o cuando haya que convertir un prospect list en mensajes individuales. Toma el brief de `account-research` + el ICP + el canon, y produce mensaje único por prospect con hook referencial, pitch corto y CTA. Funciona en email + WhatsApp + LinkedIn DM + Instagram DM.
---

# personalized-outreach

Convierte un prospect en un mensaje único, personal, contextualizado — no template masivo. Es la skill que hace que el outbound de NitroSales no se sienta outbound.

## Cuándo se dispara

- "Armame outreach personalizado para [empresa]."
- "Primer contacto cold para [Nombre / empresa]."
- "Personalizá esto para estos [N] prospects."
- "Mensaje de intro por LinkedIn / IG / WhatsApp para [X]."

## Proceso

1. Cargá canon + voice.
2. Cargá `account-research` del prospect (si no existe, genéralo primero).
3. Cargá `icp-profiler` para confirmar fit y ángulo.
4. Identificá canal (email, WhatsApp, LinkedIn, IG DM).
5. Identificá el hook referencial (algo específico de ELLOS, no de nosotros).
6. Escribí el mensaje.
7. Revisá que NO suene template.

## Anatomía de un outreach personalizado (la fórmula)

```
1. [Gancho referencial específico]  ← 20-30% del mensaje
2. [Dolor probable inferido del research]  ← 20%
3. [Qué hacemos y por qué encaja]  ← 30%
4. [CTA concreto + honesto]  ← 20-30%
```

**La diferencia vs un template**: el gancho referencial. Sin él, es spam.

## Tipos de gancho referencial (lo que hace que NO sea template)

### 1. Detalle visible en su operación

- Lanzamiento reciente de colección.
- Ad específico corriendo en Meta Ad Library.
- Post reciente en LinkedIn / Instagram.
- Cambio detectado (nueva plataforma, nuevo canal, nuevo hire).

**Ejemplo**: "Vi que están en la colección de verano con 12 ads activos en Meta. Me llamó la atención que [detalle]."

### 2. Persona / conexión en común

- "Hablé con [Nombre] de [empresa similar] la semana pasada y me dijo [algo]."
- "Somos los 2 seguidores de [newsletter / cuenta]."

### 3. Insight de mercado aplicado a ellos

- "La política de Meta en iOS está pegando fuerte en marcas de [su vertical]. Vi que ustedes [...]."

### 4. Noticia o milestone reciente

- "Felicitaciones por [ronda / premio / expansión]."
- "Vi que abrieron canal en [ML, TikTok Shop, etc]."

### 5. Pregunta específica de operación

- "¿Cómo están midiendo [X específico de su negocio] hoy?" (sin respuesta obvia).

## Adaptación por canal

### Email
- Asunto: específico, no genérico.
- Cuerpo: 80-150 palabras.
- Firma: Tomy + 1 link.
- Ver `email-copy` skill para reglas detalladas.

### WhatsApp
- 2-3 mensajes encadenados.
- Sin asunto, directo al hook.
- Ver `whatsapp-copy` skill.

### LinkedIn DM / InMail
- Asunto corto si InMail.
- Cuerpo: 60-120 palabras (LI es más corto que email).
- No adjuntar PDF en el primer mensaje.
- Cerrar con CTA bajo ("¿Te suena tener 15 min?").

### Instagram DM
- Tono más casual.
- 50-80 palabras.
- Empezar con algo del contenido que postean ("Vi tu post de [X]").
- CTA muy bajo ("¿Te interesa charlar?").

## Output format (por prospect)

```markdown
# Outreach: [empresa]

## Metadata
- Canal: [email / WhatsApp / LinkedIn / IG]
- Destinatario: [Nombre, rol]
- Temperatura: [cold / warm]
- Hook detectado: [...]
- Ángulo (pilar/activo): [...]

---

### Mensaje

**[Asunto si aplica]**

[Cuerpo]

**CTA**: [acción concreta]

---

### Variante (ángulo distinto)

[...]

---

## Por qué funciona (para Tomy)

- Gancho referencial: [cita del detalle específico que usamos]
- Dolor implícito: [qué asumimos que le duele]
- CTA: [por qué elegimos este]

## Riesgos / notas

- [si hay algo que puede rebotar]
- [si hay algo que Tomy debería cotejar antes de mandarlo]
```

## Principios

1. **El hook referencial NO es negociable**. Si no encontrás algo específico de ELLOS, no mandes todavía — volvé al research.
2. **Prohibido "Espero que este mensaje te encuentre bien"**.
3. **Prohibido "Somos una plataforma que..."** en las primeras 2 líneas.
4. **Ofrecer 1 sola cosa** (demo, charla, recurso). No apilar.
5. **Ser honesto sobre la temperatura**. Si es cold, decirlo: "Te escribo en frío porque...".
6. **Cerrar siempre con opción de salida digna**. "Si no es el momento, sin drama".

## Anti-patrones

- Template idéntico con el nombre cambiado.
- Mencionar 3 features del producto en el primer mensaje.
- Links de Calendly sin contexto.
- Asuntos gancho-bait ("Tu competencia está haciendo esto").
- "Nos encantaría conocer más sobre [empresa]" → pasivo, vacío.
- Copiar/pegar la misma frase del research en 10 mensajes distintos.

## Volumen recomendado

- **Outbound diario máximo**: 10-15 mensajes personalizados por día (todos canales combinados).
- Más que eso = se cae la calidad.
- Pull + push: combinar outbound push (frío) con follow-up (warm) para no quemar la lista.

## Conexión con otras skills

- **Input**: `account-research` + `icp-profiler` + `prospect-list-builder`.
- **Output**: pasa a `multi-touch-sequence` cuando el prospect no responde al primer toque.

## Qué preguntar a Tomy antes de mandar

- ¿Me pasás contexto extra sobre [empresa]? (relación previa, opinión, lo que sabés)
- ¿Le podés mandar el mensaje vos (con tu nombre/voz) o alguien más?
- ¿Preferís rematar con CTA de demo o con CTA de charla abierta?
