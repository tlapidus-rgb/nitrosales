---
name: lead-qualifier
description: Califica leads inbound de NitroSales (los que llegan por landing, newsletter, refer, evento) con un proceso rápido y honesto — entran al pipeline o quedan en nurture. Usala cuando aparezca un lead nuevo ("acaba de pedir demo desde la web [X]", "este lead vino del evento", "califica este lead", "vale la pena hablar con [empresa]"), o cuando haya que decidir si un inbound merece tiempo de Tomy. Cruza el lead contra el ICP, asigna prioridad (HOT / WARM / COLD / DESCARTAR) y propone próximo paso.
---

# lead-qualifier

Decide rápido y honestamente: este inbound merece tiempo de Tomy o no. No deja leads colgando — siempre hay próximo paso, aunque sea "te paso a la newsletter".

## Cuándo se dispara

- "Llegó un lead, califícalo."
- "Vale la pena hablar con [X]?"
- "Se anotó [Nombre] en el form, ¿le respondo?"
- "Tengo 30 leads del evento, priorizá."
- "Este viene de [canal], ¿qué prioridad?"

## Proceso

1. Cargá `icp-profiler` (criterios canónicos).
2. Cargá `account-research` mini (rápido, no full brief — eso viene después).
3. Capturá la información que ya tenés del lead (form, mail, contacto en evento).
4. Aplicá el scoring + asigná prioridad.
5. Definí próximo paso por prioridad.

## Información mínima para calificar

- Nombre + empresa + rol.
- Cómo llegó (canal de adquisición).
- ¿Qué pidió? (demo, info, propuesta, casual).
- Plataforma / vertical (si está en el form o se infiere).
- Contexto adicional aportado (mensaje libre, comentario).

Si falta información crítica, **NO inventar**. Marcar gap y pasar a la decisión con lo que hay.

## Scoring rápido (1-2 minutos por lead)

### Criterios duros (van/no van)

| Criterio | Va | No va |
|---|---|---|
| Plataforma | VTEX / ML / Tiendanube / Shopify | Custom / B2B / sin ecommerce |
| Geografía | Argentina / LATAM | USA / Europa / Asia (al menos hoy) |
| Vertical | DTC, retail, marketplaces | Servicios, B2B puro, inmobiliaria |
| Tamaño detectable | 3-50 personas | Solo founder pre-tracción / corporación 500+ |

### Señales de calidad (asignan prioridad)

| Señal | Peso |
|---|---|
| Pidió demo explícita (no "info") | +3 |
| Mencionó dolor en mensaje libre | +3 |
| Empresa identificable + tracción visible | +2 |
| Vino por refer warm | +2 |
| Rol decisor (founder, head, director) | +2 |
| Vino por contenido orgánico (newsletter, blog) | +1 |
| Solo dejó email genérico (gmail con nombre incompleto) | -1 |
| Empresa no identificable | -1 |

## Tabla de prioridad

| Score | Prioridad | Significado | Acción |
|---|---|---|---|
| 8+ | HOT | Encajan + intent claro | Contactar HOY (mismo día) |
| 5-7 | WARM | Encajan pero falta señal | Contactar en 24-48h |
| 2-4 | COLD | Calza tibio | Mandar resource + seguimiento en 7d |
| <2 | DESCARTAR | No fit | Respuesta cordial + no priorizar |

## Output format

```markdown
# Lead qualifier: [Nombre / Empresa]

## Datos capturados
- Nombre: [...]
- Empresa: [...]
- Rol: [...]
- Email: [...]
- Canal de origen: [landing / newsletter / referido / evento / otro]
- Pedido literal: "[texto]"
- Plataforma detectada: [...]
- Vertical: [...]

## Cruce con ICP
- Plataforma: [✅/⚠️/❌]
- Geografía: [✅/⚠️/❌]
- Vertical: [✅/⚠️/❌]
- Tamaño detectable: [✅/⚠️/❌]

## Señales de calidad detectadas
- [+/- 3] [señal]
- [+/- 2] [señal]
- ...

## Score total
[N puntos]

## Prioridad
**[HOT / WARM / COLD / DESCARTAR]**

## Justificación (3-5 líneas)
[...]

## Próximo paso recomendado

### Si HOT
- Acción inmediata: [WhatsApp / mail directo de Tomy]
- Mensaje base: "[1-2 líneas]"
- Disparar `discovery-prep` para [fecha].

### Si WARM
- Acción en 24-48h: [mail con material relevante + propuesta de call]
- Personalización mínima: [...]

### Si COLD
- Acción: mail con [resource específico] + invitación a newsletter.
- Recordatorio de re-engagement en 30 días.

### Si DESCARTAR
- Respuesta cordial: "[plantilla]"
- No priorizar, pero responder con respeto.

## Gaps de información
- [qué no pude confirmar y vale la pena pedir]

## Nota para Tomy
[lo que valga la pena alertar]
```

## Plantillas de respuesta por prioridad

### HOT — Respuesta inmediata (WhatsApp)

> Hola [Nombre], soy Tomy de NitroSales. Vi tu pedido de demo, ¡gracias! Tengo espacio mañana [hora] o el [día] [hora]. ¿Cuál te funciona?

### WARM — Respuesta en 24-48h (Email)

> Hola [Nombre], gracias por escribir. Vi que están en [vertical / plataforma] — vi un par de cosas de [empresa] que me parecen interesantes para arrancar la conversación. ¿Te animás a 20 min esta semana? Mando un par de horarios.

### COLD — Respuesta + nurture

> Hola [Nombre], gracias por interesarte en NitroSales. Te mando este recurso que probablemente te ayude ahora mismo: [link]. Te sumo a la Nitroletter, donde mando cosas que pueden serte útiles. Si en algún momento querés hablar, escribime.

### DESCARTAR — Respuesta cordial

> Hola [Nombre], gracias por contactarnos. Por lo que veo, NitroSales hoy no es el fit ideal para [empresa] (somos especialmente fuertes para marcas con [criterio que no encaja]). Te dejo este recurso por si suma: [link genérico de blog]. Cuando crezcas a [umbral] o cambien las condiciones, escribime y vemos.

## Casos especiales

### Lead que viene por referencia warm (de cliente actual o partner)

Subir prioridad automática al menos a WARM, idealmente HOT. La señal "alguien que confía en nosotros te derivó" pesa más que el form completo.

### Lead que vuelve después de tiempo

Si Tomy lo conoce de antes (ya hubo conversación previa), no aplicar este scoring. Recuperar contexto y retomar donde quedó.

### Lead de competencia disfrazado

Si detectás que es alguien de Triple Whale, Polar, etc. — responder cordial, no compartir info confidencial, no priorizar.

### Lead bot / spam

No responder. Marcar como descartar sin acción.

## Principios

1. **Nunca dejar un lead sin respuesta**. La última impresión importa.
2. **Honestidad sobre fit**. Si no encajan, decirlo amable. No vender por vender.
3. **Tiempo de Tomy es el recurso escaso**. Solo HOT merece contacto inmediato.
4. **Dudoso → COLD, no WARM**. Mejor underestimate que overestimate.

## Anti-patrones

- Tratar todos los inbounds como hot leads → satura calendario, baja calidad.
- Respuestas template impersonales para HOT → quema oportunidad.
- Ignorar leads cold → mala señal de marca.
- "Te calificamos y no eres apto" → tono soberbio.

## Conexión con otras skills

- **Output HOT**: pasa a `discovery-prep` y luego `demo-script`.
- **Output WARM**: pasa a `personalized-outreach` para primer mensaje.
- **Output COLD**: pasa a la lista de nurture (newsletter + recordatorio 30d).
