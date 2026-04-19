---
name: discovery-prep
description: Prepara a Tomy para una discovery call con un prospect — arma el brief, define el objetivo del call, diseña las 8-12 preguntas que tiene que hacer (no solo responder), anticipa las objeciones probables y define qué tiene que salir del call para que valga la pena. Usala antes de cada discovery call ("en 1 hora tengo call con [X], preparame", "brief para la call de mañana con Y"), o cuando Tomy quiera estructurar mejor sus discoveries en general. Entrega un doc de 1 página con orden del call + preguntas clave + señales a detectar.
---

# discovery-prep

Prepara una discovery call. No es un script de venta — es un framework para que Tomy escuche más que hable, detecte si hay fit real y salga con información accionable.

## Cuándo se dispara

- "Preparame la discovery con [X]."
- "Brief para la call de mañana."
- "Tengo call en 1 hora, ayudame."
- "¿Qué preguntas le hago?"
- "Revisemos mi estructura de discovery."

## Proceso

1. Cargá `account-research` del prospect (si no existe, corré esa skill primero).
2. Cargá `icp-profiler` y verificá fit preliminar.
3. Cargá `OBJECIONES_COMUNES.md` del PKB.
4. Cargá canon + voice.
5. Armá el brief con la estructura abajo.

## Estructura canónica de la discovery call

### Objetivo del call (siempre)
Al cerrar los 30-45 min, Tomy debería poder responder:

1. ¿Entra en ICP? (ENTRA / CONDICIONAL / NO ENTRA).
2. ¿Cuál es su dolor real (no el declarado)?
3. ¿Qué activo de NitroSales le resuelve más?
4. ¿Quién es el decisor y cómo compran?
5. ¿Hay timing? (urgencia real vs "mirando opciones").
6. ¿Cuál es el siguiente paso concreto?

### Duración: 30-45 min máximo

Más de 45 minutos = mal diseño. La energía se cae.

### Estructura temporal (30 min)

| Minuto | Bloque | Objetivo |
|---|---|---|
| 0-3 | Intro corta | Que se relaje, marco del call |
| 3-15 | Discovery (ellos hablan) | Entender su contexto |
| 15-25 | Espejo + demo contextual | Mostrarles algo concreto si aplica |
| 25-28 | Siguiente paso | Cerrar con acción |
| 28-30 | Q&A libre | Lo que no salió |

## Las 8-12 preguntas canónicas (Tomy las hace, no responde)

Ordenadas por momento del call:

### Bloque apertura (3-5 min)

1. **"Antes de empezar — ¿qué te trajo a querer esta call?"** (entender el gatillo real).
2. **"¿Qué hiciste ya, y qué querés hoy resolver?"** (evita pitches ciegos).

### Bloque contexto (5-10 min)

3. **"Contame en 2 minutos cómo venden hoy: plataforma, canales, volumen aprox."**
4. **"¿Cuánto invierten en ads este mes? ¿dónde?"**
5. **"¿Quién mira los números del negocio hoy? ¿vos, un equipo, nadie formalmente?"**

### Bloque dolor real (10-15 min)

6. **"Cuando pensás en tu operación de data, ¿cuál es el tema que más te quema?"**
7. **"Si hoy te dijera 'tenés 2 horas libres por semana', ¿en qué las invertirías?"** (identifica el cuello).
8. **"¿Qué probaron antes? ¿qué no funcionó?"** (historia de compra).

### Bloque decisión (15-25 min)

9. **"Si esto te tuviera sentido, ¿cómo lo evalúan internamente? ¿solo vos, con alguien?"**
10. **"¿Qué tendría que pasar en los próximos 30 días para que esto sea una prioridad para ustedes?"**
11. **"¿Cuál sería el 'dealbreaker' — algo que si no lo resolvemos, no avanzan?"**

### Bloque cierre (25-28 min)

12. **"¿Cuál sería el siguiente paso más útil para vos?"** (dejar que ellos propongan).

## Cómo detectar señales durante el call

### Señales positivas (avanzar)

- Usan "nosotros" no "yo" → hay equipo, hay infra.
- Mencionan números específicos sin dudar → tienen la cabeza en el negocio.
- Describen el dolor con ejemplos concretos ("el lunes pasado abrí 6 planillas...").
- Preguntan pricing o plazos antes que nosotros → intent real.
- Hablan del equipo: "tendría que mostrarle a mi socio / CFO".

### Señales rojas (pausar)

- "Me parece interesante" sin dar detalles → tibio.
- No pueden articular números básicos del negocio → pre-PMF.
- Mencionan 4 herramientas adyacentes que están probando → shopping sin compromiso.
- "Mandame info y lo vemos con el equipo" sin siguiente paso → polite dismiss.
- Vuelven todo el tiempo al precio como foco único → pagador difícil.

## Output format

```markdown
# Discovery prep: [empresa / nombre]

## Metadata
- Fecha + hora del call: [...]
- Duración prevista: [...]
- Plataforma: [Meet / Zoom / presencial]
- Quién participa de su lado: [nombre, rol]

## Snapshot del prospect (del research)
- ICP fit preliminar: [ENTRA / CONDICIONAL / NO ENTRA]
- Plataforma: [...]
- GMV estimado: [...]
- Dolor hipótesis: [...]

## Objetivo de este call específico
[2-3 líneas: qué querés lograr, qué información querés salir con]

## Ángulo sugerido de apertura
[2-3 líneas que pueden usarse casi literal al abrir el call]

## Las 10-12 preguntas priorizadas (orden sugerido)
1. [pregunta 1]
2. [pregunta 2]
...

## Señales a detectar (watchlist)
### Positivas
- [...]
### Rojas
- [...]

## Objeciones probables + respuesta de 1 línea
1. [objeción] → [respuesta corta]
2. ...

## Demo contextual (si aplica)
- Si detectás dolor de [X], mostrar [activo/screen].
- Si mencionan [Y], no mostrar nada — cerrar con promesa de mandar async.

## Plan de siguiente paso (3 variantes según outcome)
- **Hot**: [próximo paso si el call sale fuerte]
- **Warm**: [próximo paso si sale tibio]
- **Cold**: [próximo paso si no hay fit]

## Qué NO hacer en este call
- [lista de trampas específicas a este prospect]

## Nota para Tomy (pre-call)
- [recordatorio, dato de último momento, contexto emocional si aplica]
```

## Principios

1. **Escuchar más que hablar**. Objetivo: que el prospect hable el 60-70% del tiempo.
2. **No pitchar en los primeros 15 min**. Si lo hacés, cerraste el canal de información.
3. **Hacer preguntas abiertas**. "¿Tienen atribución?" → cerrada. "Contame cómo miden hoy" → abierta.
4. **Resumir antes de avanzar**. "Entonces, lo que escucho es [X]. ¿Te represento bien?".
5. **Honestidad sobre fit**. Si en el call 20 detectás que no entra, decirlo: "Creo que no somos el fit ahora, pero tal vez [X]".

## Anti-patrones

- Llegar al call sin leer el research.
- Script lineal. Rigidiza la conversación.
- Demo antes de entender el dolor.
- Hablar del producto más que del prospect.
- Cerrar con "te mando más info por mail" sin siguiente paso claro.

## Qué preguntar a Tomy antes del call

- ¿Cómo llegaste a este lead? (inbound / referido / evento)
- ¿Hay historia previa con esta persona o empresa?
- ¿Hay algo que NO quieras que pregunte (razón delicada)?
- ¿Querés que te dé el brief 30 min antes o al inicio del día?
