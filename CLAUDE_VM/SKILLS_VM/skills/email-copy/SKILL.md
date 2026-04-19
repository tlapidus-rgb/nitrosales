---
name: email-copy
description: Escribe emails de NitroSales — cold outbound, nurture, transaccional, onboarding, re-engagement, newsletter y correos de clientes. Usala cuando Tomy pida "armame un email para X", "escribime el cold a [empresa]", "hacé el follow-up de la demo", "email de bienvenida", o cuando haya que producir cualquier correo que salga bajo el nombre de Tomy o NitroSales. Produce subject + preview + cuerpo + CTA con la voz NitroSales, honesta, corta, sin jerga SaaS. No manda el email — solo produce el copy listo para copiar y pegar.
---

# email-copy

Produce emails listos para enviar o disparar en un ESP. No clickea "enviar". No pide permiso para enviar. Solo produce copy.

## Cuándo se dispara

- "Armame un email cold para [empresa]."
- "Escribime el follow-up después de la demo."
- "Newsletter de esta semana."
- "Email de bienvenida."
- "Re-engagement de leads fríos."
- "Respuesta a [objeción concreta] por mail."

## Proceso

1. Cargá `_CANON/positioning-canon.md` + `_CANON/brand-voice.md`.
2. Identificá el tipo de email (ver "Tipos").
3. Definí con Tomy (si no está claro):
   - ¿Qué sabemos del destinatario? (nombre, empresa, dolor probable)
   - ¿Qué le estamos pidiendo que haga? (1 sola acción, siempre)
   - ¿Cuál es el contexto previo? (hubo conversación, es en frío, es un re-engage)
4. Elegí la estructura del tipo.
5. Escribí. Corto. Sin emojis salvo en newsletter casual.
6. Revisá contra `brand-voice` (palabras prohibidas, ritmo, lectura en voz alta).

## Tipos de email

### 1. Cold outbound (primer contacto)

**Estructura**:
- Subject: 3-6 palabras, específico, NO genérico ("Propuesta para [empresa]" → MAL; "Cómo [empresa] mide ML hoy" → BIEN).
- Preview: 5-10 palabras, complementa el subject, no repite.
- Cuerpo (80-120 palabras máximo):
  - Gancho referencial (algo puntual sobre ellos: campaña que vieron, feature que lanzaron, trigger de señal).
  - 1 línea de dolor probable.
  - 1 línea de qué hacemos.
  - CTA concreto: "¿Tomamos 15 min esta semana?".
- Firma: "Tomy — NitroSales" + link 1 solo.

**No hacer**:
- "Espero que este email te encuentre bien."
- "Soy fundador de NitroSales, una plataforma que..."
- "Agendá acá un espacio en mi calendario: [link]."
- Más de 1 CTA.

### 2. Follow-up (después de demo)

**Estructura**:
- Subject: "Lo que hablamos hoy — [1 idea concreta de la demo]".
- Cuerpo (100-150 palabras):
  - Gracias corto (1 línea).
  - Recap: "Lo que quedó claro fue [X]. Lo que quedó por resolver fue [Y]".
  - Siguiente paso concreto: "Te mandé acceso a [recurso]" o "Te propongo [fecha] para ver [tema]".
- Firma.

### 3. Nurture (no tienen demo todavía, hay que mantener warm)

**Estructura**:
- Subject: una pregunta o una idea ("Algo que vimos en [vertical]"; "¿Cómo estás midiendo ML?").
- Cuerpo (100-200 palabras):
  - Historia real (de beta, de cliente, de cosa vista en el mercado).
  - Insight derivado.
  - CTA suave: "Si te interesa, te cuento cómo lo aplicamos" / "Respondeme y te mando un breakdown".

### 4. Re-engagement (leads fríos, 30+ días sin contacto)

**Estructura**:
- Subject: honesto. "¿Sigo acá?" / "Última vez que te escribo" (y esta vez de verdad).
- Cuerpo (50-80 palabras):
  - Reconocer el silencio sin culpa ("Hace tiempo no hablamos").
  - Hook nuevo (feature nueva, caso, cambio de pricing).
  - CTA binario: "Si te interesa, respondé. Si no, quedamos bien y te borro de esta lista".

### 5. Transaccional (bienvenida, confirmaciones)

**Estructura**:
- Subject: literal y directo. "Te damos la bienvenida a NitroSales" → MAL. "Tu cuenta NitroSales ya está lista" → BIEN.
- Cuerpo:
  - 1 línea confirmando qué pasó.
  - Qué hacer ahora (3 pasos máximo, numerados).
  - Contacto humano ("Si algo no funciona, escribime directo — Tomy").

### 6. Onboarding (serie de emails durante setup)

Secuencia típica (5 emails):
1. Día 0: "Arrancamos" (qué pasa ahora, qué necesitamos).
2. Día 2: "Pixel instalado — primer dato" (celebrar el primer hit).
3. Día 5: "Tu primer insight" (algo específico de su cuenta).
4. Día 10: "Check-in" (pregunta abierta: "¿Qué te sigue doliendo?").
5. Día 20: "Consolidación" (QBR mini).

### 7. Newsletter (Nitroletter — canal permanente)

**Estructura**:
- Subject: un insight o una frase con alma ("Medir menos para entender más").
- Cuerpo (300-600 palabras):
  - Abre con un insight real de la semana (algo que vimos, algo que aprendimos).
  - Cita de un cliente si aplica.
  - Link a 2-3 cosas de valor (artículo, caso, tool).
  - Cierra con 1 pregunta al lector.

## Output format

```markdown
# Email: [tipo] — [contexto]

## Metadata
- Tipo: [cold / follow-up / nurture / re-engage / transaccional / onboarding / newsletter]
- Destinatario: [persona / segmento]
- Objetivo: [qué queremos que pase]
- ESP / canal: [...]

---

**Subject**: [texto]
**Preview**: [texto]

---

[Cuerpo del email]

---

**Firma sugerida**:
Tomy
NitroSales
[link 1]

---

## Variantes a A/B (opcional)
- Subject A / B
- Hook A / B

## Nota para Tomy
[algo que valga la pena avisar — ej: "revisá si [empresa] es cliente actual antes de mandarlo"]
```

## Anti-patrones

- Subject genérico ("Propuesta", "Sobre tu empresa", "Reunión").
- Cuerpos de 500+ palabras. Nadie los lee.
- 2+ CTAs. Confunde. 1 sola acción por email.
- "Dale click acá para agendar" sin contexto.
- Placeholder tipo "{{First Name}}" sin aclarar que hay que reemplazar.
- Firmas con logo + frase motivacional + 4 links de redes. Mata el mensaje.

## Regla de oro

Un email de NitroSales debería poder mandarse desde el teléfono, a las 10pm, sin preparación, y sonar exactamente igual que si lo escribieras en la laptop con tiempo. Si no suena así, está sobre-producido.
