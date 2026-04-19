---
name: competitive-intel
description: Analiza a un competidor de NitroSales, actualiza el mapa competitivo, o compara NitroSales contra otro producto que el prospect haya mencionado. Usala cuando Tomy diga "compará con [X]", "qué hace [Triple Whale / Klaviyo / Polar]", "armame la battlecard vs Y", "nos mencionaron [competidor], ¿qué decimos?", o cuando aparezca un competidor nuevo en conversación que no esté en el mapa. Genera battlecards accionables con diferenciadores claros sin hablar mal del competidor.
---

# competitive-intel

Produce análisis competitivo accionable: battlecards, comparativas y actualizaciones del mapa competitivo. Se apoya en el archivo canónico `CONOCIMIENTO_PRODUCTO/COMPETIDORES.md` pero genera output nuevo para momentos específicos (conversación comercial, landing, deck).

## Cuándo se dispara

- "Compará con [X]."
- "Armame battlecard vs [competidor]."
- "Qué hace [producto]."
- "El prospect mencionó [competidor], qué decimos."
- "Actualizá la info de [competidor] en el mapa."

## Proceso

1. Cargá `CONOCIMIENTO_PRODUCTO/COMPETIDORES.md` — fuente única de verdad sobre competencia.
2. Cargá `positioning-canon.md` y `brand-voice.md`.
3. Si el competidor NO está en el mapa, investigalo antes de responder (ver "Investigar competidor nuevo").
4. Aplicá los principios de `OBJECIONES_COMUNES.md` sección 3 (objeción #3: "¿por qué no uso [competidor]?").
5. Devolvelo en el formato pedido.

## Principios (siempre)

1. **Nunca hablar mal del competidor**. Ni con Tomy, ni en battlecard, ni en conversación.
2. **Hablar de lo que hacemos distinto**, no de lo que ellos hacen mal.
3. **Cuando conviene, reconocer** que el competidor es bueno en algo. Eso genera credibilidad.
4. **Honestidad**: si un competidor es mejor para un caso puntual, se dice.

## Formatos de output

### Formato A — Battlecard (para uso comercial rápido)

```markdown
# Battlecard: NitroSales vs [Competidor]

## Elevator pitch (1 línea)
[Competidor] es [lo que son bien]. NitroSales es [lo que hacemos distinto].

## Cuándo ellos ganan
- [situación 1]
- [situación 2]

## Cuándo nosotros ganamos
- [situación 1]
- [situación 2]
- [situación 3]

## Diferenciadores clave (top 3)
1. **[Diferenciador]** — [detalle en 1 línea].
2. **...**
3. **...**

## Frase para responder "¿por qué no uso [ellos]?"
> [2-4 líneas, directa, respeta el canon]

## Qué NO decir
- [trampas comunes]

## Qué preguntarle al prospect (discovery ante esta objeción)
- [pregunta 1 que ayuda a elegir mejor]
- [pregunta 2]
```

### Formato B — Comparativa extendida (para landing o deck)

```markdown
# NitroSales vs [Competidor]: comparativa

## Contexto
[Quiénes son, a quién apuntan, dónde se cruzan con nosotros.]

## Tabla de funcionalidades

| Capacidad | NitroSales | [Competidor] | Nota |
|---|---|---|---|
| Atribución first-party | ✅ | ✅ | Ambos. |
| VTEX nativo | ✅ | ❌ | Solo Shopify. |
| MercadoLibre | ✅ | ❌ | — |
| P&L + tri-currency | ✅ | ❌ | — |
| Creator economy | ✅ | ⚠️ | Ellos integran con impact.com. |
| AFIP / IVA | ✅ | ❌ | — |
| ... | ... | ... | ... |

## Para quién es cada uno
- Elegí [Competidor] si: [...]
- Elegí NitroSales si: [...]
```

### Formato C — Actualización del mapa

Si aparece info nueva sobre un competidor (pricing cambió, lanzaron feature, recibieron ronda):

```markdown
# Actualización COMPETIDORES.md — [Competidor]

## Cambio detectado
[Qué pasó y cuándo.]

## Implicancia para NitroSales
- [Cómo afecta el mensaje]
- [Qué diferenciadores se refuerzan/debilitan]

## Propuesta de actualización al mapa
[Texto exacto para cambiar en COMPETIDORES.md]

## Riesgo o oportunidad
- Riesgo: [...]
- Oportunidad: [...]
```

## Investigar un competidor nuevo

Si el competidor no está en `COMPETIDORES.md`:

1. Buscá su landing principal + pricing page + blog/docs.
2. Capturá: ¿qué hacen?, ¿quién es su ICP?, ¿cuánto cuestan?, ¿dónde están?, ¿integraciones?, ¿diferenciador que ellos dicen?
3. Evaluá el cruce con NitroSales: ¿overlap total? ¿adyacencia? ¿categoría distinta?
4. Preguntale a Tomy: "¿agregamos al mapa permanentemente o es one-off?".
5. Si es permanente, proponé un bloque para `COMPETIDORES.md`.

## Anti-patrones

- **Lista de "nosotros ganamos en todo"**. Nadie te cree. Incluí al menos una cosa donde ellos ganan.
- **Ataques personales a la marca del competidor**. Aunque sea cierto ("Triple Whale tuvo issues en 2023"), NO va. Se pierde credibilidad.
- **Jerga de "disruptor vs legacy"**. No somos disruptor de nadie. Somos el producto adecuado para un contexto específico.
- **Afirmaciones sin fuente**. "Son caros" → NO. "Según su pricing page pública, tier SMB arranca en USD X/mes" → SÍ.

## Competidores principales (resumen del mapa, para contexto rápido)

- **Triple Whale**: líder USA atribución Shopify. NO VTEX, NO ML, NO AFIP.
- **Northbeam**: Triple Whale enterprise. USD 1k+/mes. Requiere analista.
- **Klaviyo**: email + CDP. No atribución propia. Complementamos, no reemplazamos.
- **Polar**: UI linda + chatbot. Shopify USA. Sin LATAM.
- **Tiendanube nativo**: dashboard incluido. Básico. Válido para marcas emergentes.
- **Nubimetrics**: ML-only, pricing + inteligencia competitiva. Complementamos.
- **VTEX IO Dashboards**: dashboard operativo de VTEX. No reemplaza BI.
- **Grin / Aspire / Impact**: creator economy USA. Solo compiten con Aura.

Ver `COMPETIDORES.md` para análisis completo de cada uno.

## Regla práctica

Si un prospect menciona un competidor que no conocés bien, la respuesta honesta es:
> "No conozco [X] en detalle. ¿Me contás qué te da hoy y qué te sigue doliendo? Con eso te digo si somos mejor fit o no."

La honestidad gana más ventas que el teatro.
