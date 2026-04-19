---
name: naming-lab
description: Genera nombres para productos, features, secciones, campañas o materiales de NitroSales. Usala cuando Tomy pida "como se llama esto", "inventá un nombre para X", "dame 10 opciones de naming", "cómo bautizamos esta feature", o cuando estés creando algo nuevo que necesita marca. Aplica los principios de naming de NitroSales: corto, con alma, memorable, que encaje con el arquetipo de sistema nervioso/cerebro vivo, y que no choque con los activos existentes (NitroPixel, Aurum, Bondly, Aura).
---

# naming-lab

Genera candidatos de naming para productos, features, módulos o materiales de NitroSales respetando el arquetipo y la voz.

## Cuándo se dispara

- "Como se llama esta feature / sección / módulo."
- "Inventá un nombre para [X]."
- "Dame opciones de naming."
- Al crear un nuevo activo con marca (módulo importante que amerite nombre propio).
- Al nombrar campañas, landings A/B, playbooks.

## Proceso

1. **Entendé el contexto**:
   - ¿Qué hace la cosa? (función)
   - ¿Quién la va a ver? (internal vs externa)
   - ¿Es un activo top-level (como NitroPixel, Aurum, Bondly, Aura) o una feature dentro de uno?
   - ¿Hay palabras que debe o no debe incluir?
2. Cargá `positioning-canon.md` y `brand-voice.md` para confirmar arquetipo y voz.
3. Generá **10-15 candidatos** en distintos registros (ver patrones abajo).
4. Filtrá con los criterios (ver sección "Criterios de corte").
5. Entregá los **3-5 finalistas** con breve explicación de cada uno + recomendación top 1.

## Principios de naming NitroSales

1. **Corto** — 1 a 3 sílabas ideal. Máximo 2 palabras si son cortas.
2. **Con alma** — el nombre tiene que sugerir un comportamiento o actitud, no una categoría.
3. **Memorable a la primera** — si alguien lo escucha en una conversación debería poder recordarlo al día siguiente.
4. **Alineado al arquetipo** — sistema nervioso / cerebro vivo. Buscamos palabras de percepción, cognición, memoria.
5. **Evita jerga SaaS** — "Hub", "Pro", "Platform", "Cloud", "X", "AI" al final del nombre → prohibido.
6. **URL / handle disponible** — si es top-level, chequear que el .com o .ar esté libre (o al menos el handle social).

## Patrones que funcionan

### Palabras con significado (latín, astronomía, biología, mitología)

- **Aurum** (oro en latín → asistente valioso)
- **Aura** (campo energético → creator economy)
- **Bondly** (bond + friendly → relación con cliente)
- **Nitro** (combustible → velocidad del stack)

### Portmanteau (2 palabras fusionadas)

- NitroPixel = Nitro + Pixel
- Bondly = Bond + -ly

### Palabras funcionales

- Pulse, Pulso (P&L Pulso)
- Core, Flash, Deep (modos de Aurum)
- Insights, Signals, Lens

## Criterios de corte (filtro post-generación)

Para cada candidato, chequear:

- [ ] ¿Se puede pronunciar en español y en inglés sin ambigüedad?
- [ ] ¿Tiene 1-3 sílabas?
- [ ] ¿No colisiona con marcas existentes (Google, Shopify app store, skills.sh)?
- [ ] ¿Evoca percepción/cognición/memoria/verdad?
- [ ] ¿Sería anticuado en 3 años?
- [ ] ¿No suena a pack de vitaminas (demasiado "bio-hip")?
- [ ] ¿No tiene un doble sentido vergonzoso en español LATAM o portugués?

## Output format

```markdown
# Naming Lab — [contexto / función]

## Contexto captado
- Función: [...]
- Audiencia: [...]
- Restricciones: [...]

## 10 candidatos generados
1. Nombre — patrón — sílabas
2. ...
10. ...

## 3-5 finalistas

### 1. **[Finalista top]**
- Por qué funciona: [2-3 líneas]
- Por qué podría fallar: [1 línea]
- Chequeo URL/handle: [pendiente / libre / tomado]

### 2. ...

## Recomendación
**Uso: [Finalista top]**. Justificación en 2 líneas.

## Qué falta chequear antes de usarlo
- [ ] Dominio / handle
- [ ] Marca registrada (INPI si aplica)
- [ ] Google search: hay conflicto con otra cosa?
```

## Anti-patrones (NO propongas esto)

- **Algo + AI** → "SalesAI", "ProfitAI". Dice cero.
- **Algo + Hub / Pro / Cloud** → "GrowthHub", "SalesPro". Jerga commodity.
- **Acrónimos** → "NSLM" (NitroSales Lifecycle Manager). Nadie los recuerda.
- **Palabras en inglés random** → "Boost", "Launchpad", "Uplift". Vacías.
- **Palabras larguísimas** → "ExperienceOptimizationPlatform". Autoexplosivo.

## Ejemplo de ejecución

**Pedido de Tomy**: "cómo llamamos al módulo nuevo de seguimiento de inventario en tiempo real"

**Salida**:
- 10 candidatos (ej: Stock Pulse, Órbita, Watcher, Nexo, Lenta, Flujo, Stella, Orbit, Vigia, Thalassa).
- 3 finalistas con fundamento: Órbita (rota alrededor del SKU, se sabe dónde están todos), Vigia (vigila el stock), Flujo (movimiento constante).
- Recomendación top 1: **Órbita**. 3 sílabas. Astronomía encaja con Aurum (Saturn ring). Evoca movimiento ordenado alrededor de un centro (el SKU). URL disponible probablemente.
