# Skills externas a instalar desde Cowork (skills.sh)

Este documento lista las skills externas que Tomy debería instalar desde la UI de Cowork (marketplaces de skills.sh). Son packs producidos por otras personas que complementan lo que construimos localmente en `SKILLS_VM/skills/`.

**Cómo se instalan**: desde Cowork → Settings → Plugins/Skills → Search o Install from URL. Los packs de skills.sh (Corey Haines, Lenny, Manoj, etc.) deberían estar disponibles vía el registry.

**Regla**: las skills externas se usan como insumo / inspiración. **No reemplazan las skills locales de NitroSales** — nuestras skills locales ya adaptan positioning, voice, y contexto LATAM. Las externas sirven cuando:
- Necesitamos una perspectiva genérica (ej: copywriting fundamentals).
- Una tarea no crítica no amerita skill propia.
- Queremos complementar con frameworks de referentes.

---

## Prioridad 1 — Packs de ventas / copywriting / marketing

### 1. `sales-skills` (autor: skills.sh community o similar)

**Qué aporta**: fundamentos de SaaS sales — discovery, demo, negociación, manejo de objeciones desde manuales clásicos (SPIN, MEDDIC, Challenger).

**Cómo usarlo**: de referencia para `discovery-prep`, `demo-script`, `objection-handler` cuando necesitemos contrastar con canon externo.

**Triggers esperados**: "SPIN selling", "MEDDIC qualification", "BANT".

---

### 2. Corey Haines — growth / content pack

**Qué aporta**: Corey es founder de Swipewell y ex-head of growth de varios SaaS. Su pack suele cubrir newsletter growth, content distribution, positioning (estudió Wiemer para muchos casos).

**Cómo usarlo**: complemento de `newsletter-writer`, `social-content`, `blog-writer`. Especialmente útil para benchmark de métricas de distribución.

**Triggers esperados**: "newsletter growth", "swipe file", "content distribution framework".

---

### 3. Lenny Rachitsky — product + growth pack

**Qué aporta**: Lenny es autor de la newsletter más leída de product management y growth. Sus frameworks suelen venir del mundo producto pero tienen alta aplicación en growth stage startups.

**Cómo usarlo**: complemento en QBRs, product-sales handoff, ICP refinement, growth experiments.

**Triggers esperados**: "product-led growth", "north star metric", "user interview".

---

### 4. Manoj Ranaweera — outbound + cold outreach

**Qué aporta**: Manoj produce frameworks prácticos de cold outbound y prospecting, especialmente B2B.

**Cómo usarlo**: complemento de `personalized-outreach`, `multi-touch-sequence`, `prospect-list-builder`.

**Triggers esperados**: "cold email", "prospecting", "outbound cadence".

---

### 5. `onewave` (si está en registry)

**Qué aporta**: pack de ventas y CS orientado a PLG / high-velocity SaaS.

**Cómo usarlo**: complemento de `lead-qualifier`, `health-score`, `churn-risk-detector`.

---

## Prioridad 2 — Packs de operación

### 6. CRM / pipeline management frameworks

**Qué buscar**: skills sobre Hubspot / Pipedrive / Salesforce operation, aunque hoy operamos con spreadsheets.

**Cómo usarlo**: si en el futuro Tomy adopta CRM formal, tener el framework listo.

---

### 7. Customer Success playbooks genéricos

**Qué buscar**: skills que cubran onboarding, NPS, churn playbooks tipo Gainsight / ChurnZero.

**Cómo usarlo**: complemento de `implementation-playbook`, `qbr-generator`.

---

### 8. Analytics / dashboard design

**Qué buscar**: skills sobre cómo leer / construir dashboards ejecutivos (tipo Benn Stancil, Jamie Quint).

**Cómo usarlo**: complemento de `sales-dashboard`, análisis de data de clientes.

---

## Prioridad 3 — Complementarias (nice-to-have)

### 9. LinkedIn founder-brand packs

**Qué buscar**: skills específicas de construcción de perfil LinkedIn para founders B2B.

### 10. PR / media / launch packs

**Qué buscar**: skills sobre cómo lanzar productos con prensa, media kits, etc. Aplicable cuando lancemos casos grandes o hitos.

### 11. ABM (Account Based Marketing) frameworks

**Qué buscar**: skills tipo Demandbase / Terminus metodología.

### 12. Email deliverability / domain reputation

**Qué buscar**: skills técnicas sobre SPF, DKIM, DMARC, warm-up, evitar spam.

---

## Packs que NO deberíamos instalar (al menos por ahora)

❌ **Packs de copywriting en inglés muy USA-centric**: fuerzan expresiones, tono, frames que no vibran en LATAM. Usar con mucho filtro o directamente no usar.

❌ **Packs de venta enterprise ($100k+ ACV)**: ciclos largos, multi-stakeholder, procurement, legal — no es el ICP hoy. Claude VM los ignoraría igual.

❌ **Packs de e-commerce D2C puro**: NitroSales NO es D2C — es B2B SaaS para D2C. Confunde si se instala sin filtro.

❌ **Duplicados de lo que ya tenemos local**: si encuentro un pack que cubre exactamente `demo-script` genérico, mejor no instalarlo — nuestra skill ya está adaptada a canon NitroSales.

---

## Proceso de instalación sugerido

1. **Tomy abre Cowork → Settings → Plugins / Skills**.
2. Busca por nombre (ej: "corey haines").
3. Install.
4. Primera vez que se trigger, revisar:
   - ¿La skill respeta canon NitroSales?
   - ¿Entra en conflicto con una skill local?
5. Si entra en conflicto: ver cuál prefiere Tomy, desinstalar la otra o usar prefijo.

## Cómo convive una skill externa con una skill local

Si dos skills matchean el mismo trigger (ej: externa `cold-email-writer` y local `email-copy`):

- **Claude carga primero la local** (porque está en `user/skills`).
- Si el trigger es ambiguo, Claude propone opciones.
- Tomy puede pedir "usá la externa de Corey" o "usá la local".

## Update cadence

Revisar skills.sh / Cowork marketplace cada 1-2 meses por nuevos packs relevantes. Cuando hay un pack nuevo útil, anotarlo acá y decidir si se instala.

## Estado (abril 2026)

- Skills locales de VM: 36 construidas (ver `MAPA_EJECUCION.md`).
- Skills externas instaladas: 0 (pending Tomy instala).
- Próxima review: mayo 2026.
