---
name: account-research
description: Investigación profunda de una cuenta / empresa específica antes de una reunión, outreach o propuesta. Usala cuando Tomy pida "investigá a [empresa]", "preparame la reunión con X", "qué sabemos de Y", "qué angle usamos con Z", o antes de cualquier discovery call. Produce un brief ejecutivo (1 página) con plataforma, GMV estimado, stack actual, signals de dolor, quiénes son los decisores, por dónde arrancar la conversación, y objeciones probables específicas de esa cuenta.
---

# account-research

Prepara un brief ejecutivo de una empresa específica para avanzar una conversación comercial con información, no a ciegas.

## Cuándo se dispara

- "Investigá a [empresa]."
- "Preparame la reunión con [X]."
- "Qué sabemos de [marca]."
- Antes de cualquier discovery call o envío de outbound personalizado.
- Cuando aparece un nuevo lead y Tomy quiere decidir si vale la pena avanzar.

## Proceso

1. Cargá el ICP canónico (skill `icp-profiler`).
2. Buscá info pública de la empresa. Si hay gaps, pedíle a Tomy que te pase lo que sepa (no inventes).
3. Aplicá el framework (ver "Dimensiones a cubrir").
4. Devolvelo en el formato de output abajo.

## Dimensiones a cubrir (brief)

### 1. Identidad
- Nombre comercial + razón social (si la tenés).
- País + ciudad.
- Años en el mercado.
- Categoría / vertical.
- Tamaño aproximado (empleados según LinkedIn).

### 2. Stack ecommerce
- Plataforma principal: VTEX, Tiendanube, Shopify, Magento, custom.
- Marketplaces activos: ML, Amazon, otros.
- Sitio propio: URL + tráfico estimado (Similarweb si está disponible).
- Apps/tools públicos instalados: detectables via BuiltWith, Wappalyzer.

### 3. Actividad comercial
- Top categorías de producto (ver catálogo web).
- Ticket promedio estimado.
- Estacionalidad (si aplica — juguetes = fin de año, indumentaria = cambio temporada).
- GMV estimado (método: tráfico × conv.rate × AOV, o empleados × factor categoría).

### 4. Actividad marketing
- Instagram: followers, frecuencia de posts, quality.
- TikTok: sí/no.
- Email marketing visible en el sitio (newsletter popup): indicador de que ya usan algún ESP.
- Creators / UGC: ven fotos reposteadas, menciones, partnerships.
- Anuncios Meta visibles en Meta Ad Library.

### 5. Señales de dolor (triggers)

Buscá específicamente señales que alinean con los pilares NitroSales:

- Cambios recientes que sugieren que necesitan ahora:
  - ¿Lanzaron tienda nueva o migraron plataforma? → atribución rota.
  - ¿Abrieron canal ML nuevo? → necesitan unificar.
  - ¿Contrataron su primer analista? → van a querer BI real.
  - ¿Levantaron ronda? → presupuesto disponible.
  - ¿Subió mucho su ad spend (Meta Ad Library)? → necesitan atribución.

### 6. Decisores probables

Mirá LinkedIn:
- Founder / CEO (decisor final en SMB).
- CMO / Head of Marketing (usuario frecuente si existe).
- CFO / Head of Finance (relevante para módulo P&L).
- Analista / Data lead (si existe — a veces es el que evalúa herramientas).

### 7. Por dónde arrancar

Según dolor detectado, cuál activo NitroSales tira primero:

- Dolor de atribución → hook con NitroPixel.
- Dolor de P&L / margen → hook con Finanzas.
- Dolor de customer churn → hook con Bondly.
- Gastan en creators → hook con Aura.
- Fundador quemado de ver planillas → hook con Aurum.

### 8. Objeciones probables según perfil

- Si ya tienen Klaviyo fuerte → "¿y mi email marketing?" (respuesta: convivimos).
- Si vienen de Shopify → "¿lo tienen integrado?" (respuesta: roadmap).
- Si son equipo grande con analista → "tenemos Looker" (respuesta: Looker es taller, NitroSales es fábrica).
- Ver `objection-handler` para respuestas detalladas.

## Output format

```markdown
# Brief: [Nombre empresa]

## Snapshot (1 línea)
[Categoría], [plataforma], [GMV est], [tamaño equipo]. [Fit ICP: ENTRA/CONDICIONAL/NO ENTRA].

## Identidad
- Razón social: [...]
- País / ciudad: [...]
- Años mercado: [...]
- Empleados LinkedIn: [...]

## Stack ecommerce detectado
- Plataforma: [...]
- Marketplaces: [...]
- Apps/tools visibles: [...]
- Tráfico mensual estimado: [...]

## Actividad comercial
- Verticales: [...]
- AOV estimado: [...]
- Estacionalidad: [...]
- GMV estimado: USD [...]

## Actividad marketing
- Instagram: [followers, ritmo, feeling]
- Ads Meta Library: [cantidad ads activas, feeling]
- Email marketing: [sí/no, ESP probable]
- Creators/UGC: [...]

## Señales de dolor (por qué AHORA)
- [signal 1]
- [signal 2]
- [signal 3]

## Decisores probables (LinkedIn)
- [Nombre] — [rol] — [nota opcional]
- ...

## Hook recomendado para primer contacto
Ángulo: [pilar o activo]. Mensaje base:

> [1-2 líneas de copy específicas a esta cuenta]

## Objeciones probables (top 3) + respuesta preparada
1. [objeción] → [respuesta]
2. [...]
3. [...]

## Verdict y next step
[ENTRA / CONDICIONAL / NO ENTRA]. Próximo paso concreto: [qué hacer esta semana].
```

## Qué NO hacer

- No inventes GMV, empleados ni datos si no los tenés. Poné "desconocido" o "estimado X-Y".
- No vayas a scrapear páginas privadas / LinkedIn con cuenta falsa. Lo que es público está bien.
- No copies texto literal de la web del cliente en el brief — resumen, no transcripción.
- No generes el brief a medias esperando que Tomy aporte datos — preguntá lo que no sepas al final del brief.

## Qué preguntarle a Tomy (al final del brief)

Si faltan datos críticos:
- "No pude confirmar GMV — tenés estimación propia?"
- "¿Tenés contacto warm con alguien del equipo, o es cold?"
- "¿Este lead vino de qué canal (referido, inbound, outbound, evento)?"
