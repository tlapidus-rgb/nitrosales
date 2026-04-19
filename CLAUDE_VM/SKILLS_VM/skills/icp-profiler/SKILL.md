---
name: icp-profiler
description: Construye o refina el perfil del cliente ideal (ICP) de NitroSales, genera buyer personas detallados, y valida si un prospect concreto entra en el ICP. Usala cuando Tomy pida "perfilá este lead", "armame el ICP para X segmento", "¿vale la pena hablar con [empresa]?", "descríbeme al cliente ideal", o cuando necesites decidir si una marca debería estar en pipeline, qué vertical priorizar, o cómo segmentar un outbound. Saca una decisión binaria (entra/no entra al ICP) con justificación, no solo descripción.
---

# icp-profiler

Construye el perfil del cliente ideal (ICP) de NitroSales o valida si un prospect concreto cualifica. Esta skill es la **puerta de entrada del pipeline**: antes de gastar tiempo vendiéndole a alguien, pasa por acá.

## Cuándo se dispara

- "Perfilá a [empresa X]."
- "Esta marca, ¿entra en ICP?"
- "Armame el ICP para fundadores de juguetería."
- "Qué vertical tiene mejor fit con NitroSales."
- "Debería hablar con [empresa]?"
- Previo a cualquier outbound: para validar que la lista tiene sentido.

## Proceso

1. Cargá el PKB:
   - `/sessions/.../CONOCIMIENTO_PRODUCTO/QUE_ES_CADA_PRODUCTO.md`
   - `/sessions/.../CONOCIMIENTO_PRODUCTO/POSICIONAMIENTO_Y_VOZ.md`
2. Cargá `references/icp-dimensiones.md` (en esta skill) para entender las 8 dimensiones.
3. Si el pedido es sobre una empresa específica, buscá info pública (o pedile a Tomy lo que no sepas).
4. Aplicá el framework + devolvé verdict.

## ICP canónico de NitroSales (actualizable)

**Target**: fundadores de ecommerce en Argentina (expansión LATAM) con las siguientes características.

| Dimensión | Valor ideal |
|---|---|
| **Etapa** | Post-product/market fit (no validando si vende) |
| **GMV mensual** | USD 50k – USD 1M (sweet spot USD 150k–500k) |
| **Canales** | VTEX o Tiendanube + MercadoLibre (mínimo 2 canales) |
| **Ad spend** | Mínimo USD 5k/mes en Meta + Google combinados |
| **Equipo** | 3-20 personas (founder sigue involucrado en day-to-day) |
| **Pain explícito** | "No sé si gano plata / no sé de dónde vienen las ventas" |
| **Stack actual** | Planillas + dashboards nativos, sin atribución propia |
| **Disposición a pagar** | Asume SaaS USD 300-1000/mes es razonable |

Cuando una o más dimensiones no encajan, el fit se debilita — pero no necesariamente se descarta. Ver "Reglas de decisión".

## Reglas de decisión (entra / no entra)

### ENTRA (green-light)

- 6+ dimensiones en valor ideal.
- Dolor explícito en al menos una conversación (el fundador lo dijo con sus palabras).
- Mínimo 1 canal en VTEX o ML (sin esto, la integración deep no aplica).

### ENTRA CONDICIONAL (evaluar más)

- 4-5 dimensiones en valor ideal.
- El dolor no apareció todavía pero el contexto sugiere que existe.
- Plataforma alternativa (Shopify, Magento) — se puede hacer pero con advertencia ("hoy el sweet spot es VTEX+ML, Shopify lo tenemos en roadmap").

### NO ENTRA (red-light)

- <4 dimensiones en valor ideal.
- GMV < USD 20k/mes (ROI no demostrable, dashboards nativos le alcanzan).
- Vende solo en marketplaces sin tienda propia (Amazon-only, ML-only sin VTEX/Tienda propia) → puede entrar pero con caveat: el pilar Bondly no aplica.
- B2B puro (no ecommerce DTC) → producto no está pensado para esto.
- No tiene ad spend ni intención de gastar → ROAS no es dolor real.

## Output format (para validación de un prospect)

```markdown
# Perfil ICP: [Nombre empresa]

## Datos capturados
- Nombre: [...]
- Plataforma: [...]
- GMV estimado: [... / desconocido]
- Canales activos: [...]
- Ad spend estimado: [... / desconocido]
- Tamaño equipo: [...]
- Stack actual: [...]

## Dimensiones (8 total)
| Dim | Ideal | Actual | Match |
|---|---|---|---|
| Etapa | Post-PMF | [...] | ✅/⚠️/❌ |
| GMV | 50k-1M USD | [...] | ... |
| ... | ... | ... | ... |

## Verdict
**[ENTRA / CONDICIONAL / NO ENTRA]**

## Justificación
[3-5 líneas.]

## Próximo paso recomendado
- Si ENTRA: [qué outreach, qué ángulo, a quién contactar]
- Si CONDICIONAL: [qué data hace falta antes de avanzar]
- Si NO ENTRA: [si hay categoría adyacente o "volver en X meses"]

## Flags de riesgo
- [cualquier cosa a tener en cuenta en la conversación]
```

## Output format (para ICP de un segmento)

```markdown
# ICP: [Segmento]

## Perfil demográfico + firmográfico
[Vertical, geografía, tamaño, etapa, etc.]

## Dolores canónicos
- Dolor #1: [...]
- Dolor #2: [...]

## Triggers (señales que indican que necesitan ahora)
- Ej: "contrataron su primer analista", "abrieron canal ML", "subió su ad spend".

## Dónde encontrarlos
- Comunidades: [foros, slack groups, linkedin groups, eventos]
- Criterios de búsqueda: [...]

## Mensaje ancla
[Qué decirles primero — alineado a dolor + canon]
```

## Para construir o refinar el ICP completo

Si Tomy pide "armame el ICP" (no validación puntual), el flujo es:

1. Listar clientes actuales + pipeline activo (hoy = beta + quien esté en conversación).
2. Identificar patrones (qué tienen en común los que avanzan vs los que no).
3. Hipótesis de ICP: dimensiones concretas + rangos.
4. Propuesta de **3-5 sub-segmentos** priorizados con fit-score.
5. Devolvelo estructurado + pediçle a Tomy feedback.

## Conexión con otras skills

- `account-research` usa el ICP para investigar cuentas específicas.
- `prospect-list-builder` lo usa para construir listas.
- `objection-handler` usa el ICP para anticipar objeciones según segmento.
