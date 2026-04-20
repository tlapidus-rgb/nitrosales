# SPRINT 1 — Pase de consistencia Tier 3 · Changelog

> **Fecha**: 2026-04-20
> **Origen**: CONSISTENCIA_TIER3_v1.md (reporte cruzado sobre 13 landings).
> **Decisiones base** (Tomy, 2026-04-20):
> 1. /customers y /customers/vip → pantallas internas de la app. Sin cross-links externos.
> 2. /precios → landing completa con precios representativos (pendiente Sprint 3).
> 3. "Cabina de control" → excepción puntual documentada en /marketplaces.
> 4. Fases visibles → fuera del copy público. Reemplazo por "próximamente" / "en roadmap".
> 5. Creator Gradient → exclusivo de Aura. No se extiende.

---

## Archivos tocados en Sprint 1

### 1. LANDING_ALERTAS.md (v1 → v1.1)

**Cambios aplicados:**
- **3 referencias `/mercadolibre` → `/marketplaces`**:
  - Bloque 3 área 2, ejemplo concreto ("Estás en /marketplaces viendo tus publicaciones…").
  - Sección "Cross-links obligatorios" (lista Bloque 3).
  - Sección "Paralelismo con el resto del Tier 3" (cross-links secundarios).
- **Cross-links externos a /customers/vip removidos**: reemplazo por fraseo de funcionalidad interna ("Estás mirando tus clientes VIP dentro de la plataforma").
- **Cross-links obligatorios actualizados**: se aclara que VIP es mención de funcionalidad, no ruta pública.
- **Footer frontmatter + footer final bumpeado a v1.1** con descripción de los cambios.

**Razón narrativa:**
La landing pública no debía linkear a una pantalla interna como si fuera una página de marketing. El dolor que /alertas describía con clientes VIP se cuenta igual, sin apuntar a una URL que no es de marketing.

---

### 2. LANDING_BONDLY.md (v1 → v1.1)

**Cambios aplicados:**
- **Bloque 3 → se saca "(próximamente)" de la referencia a `/alertas`**: `/alertas` ya es landing live del corpus Tier 3; el disclaimer era una deuda vieja del momento en que se escribió /bondly (anterior a /alertas).
- **Bloque 8 → se reemplaza "en Fase 2" por "próximamente"**: línea sobre `/bondly/audiencias` pasando de placeholder a API. Copy público libre de números de fase.
- **Footer frontmatter + footer final bumpeado a v1.1** con descripción de los cambios.

**Razón narrativa:**
"(próximamente)" sobre un producto que ya existe es fricción innecesaria. Y el número de fase (Fase 2) no le dice nada al lector externo — suena a jerga interna.

---

### 3. LANDING_MARKETPLACES.md (v1 → v1.1)

**Cambios aplicados:**
- **Resolución de contradicción MELI Ads** (verificada con Tomy, 2026-04-20):
  - Estado real: hoy ya se trae la data de Mercado Ads vía API oficial y se muestra consolidada con órdenes MELI reales (reporting informativo).
  - Lo que NO existe todavía: capa de insights accionables específicos (tipo "pausá esta campaña" / "reasigná presupuesto"). Esa capa queda como "en roadmap".
  - Se actualizaron 5 lugares donde la v1 negaba la existencia de Mercado Ads o lo ponía "en Fase 4":
    - Bloque 2 (honestidad obligatoria).
    - Bloque 5 (para quién NO hoy).
    - Bloque 7 (objeción "¿Tienen Mercado Ads?").
    - Bloque 7 (objeción "¿Puedo pausar una publicación?").
    - Bloque 8 (lo que no está incluido).
- **Menciones de fase numerada removidas del copy público** (Fase 4, Fase 5 → "próximamente" / "en roadmap"):
  - Bloque 5 "multi-account en roadmap Fase 5" → "multi-cuenta en roadmap".
  - Bloque 7 edición de publicaciones "Fase 4 con Mercado Ads" → "en roadmap".
  - Bloque 8 "multi-cuenta en plan agencia desde Fase 5" → "próximamente".
  - Bloque 9 (FAQ) "roadmap Fase 5" → "roadmap".
  - Bloque 9 (FAQ) "plan agencia (Fase 5)" → "plan agencia (próximamente)".
  - Bloque 9 (FAQ) "roadmap Fase 4+" → "en roadmap".
- **Nota de implementación** sobre el roadmap Fase se actualiza con la decisión tomada: las fases NO se exponen en copy público.
- **"Cabina de control" queda intacto** en Bloque 7 (respuesta sobre conector de tienda) — decisión Tomy: excepción puntual documentada.
- **Footer frontmatter + footers finales bumpeados a v1.1** con descripción de los cambios.

**Razón narrativa:**
Las dos versiones previas se contradecían: /marketing-digital v1.1 decía que MELI Ads se reportaba hoy, /marketplaces v1 decía que estaba en Fase 4. La realidad del producto (confirmada por Tomy) es un intermedio: reporting ya existe, insights accionables no. El copy ahora refleja esa verdad sin prometer de más ni negar lo que ya existe.

---

## Lo que NO se tocó en Sprint 1 (queda para Sprint 2)

- Barrido cross-landings para limpiar "Fase X" en las otras 5 Tier 3 (/rentabilidad, /productos, /finanzas, /control-gestion, /integraciones) y /matriz.
- Barrido cross-landings para eliminar cross-links externos a /customers y /customers/vip en otras landings.
- Verificar si /marketing-digital requiere ajuste marginal ahora que /marketplaces quedó alineado (respuesta breve: no requiere, ya estaba bien — describe reporting sin prometer optimización).

## Lo que queda para Sprint 3

- Escribir LANDING_PRECIOS.md como landing Tier 3 con tabla de precios representativa.

---

## Checklist de verificación post-Sprint 1

- [x] `/alertas` → 0 referencias a `/mercadolibre` en copy público.
- [x] `/alertas` → 0 cross-links externos a `/customers` o `/customers/vip`.
- [x] `/bondly` → 0 menciones de `/alertas (próximamente)` en copy público.
- [x] `/bondly` → 0 menciones de "Fase 2" en copy público.
- [x] `/marketplaces` → narrativa MELI Ads alineada con `/marketing-digital` (reporting existe, accionables en roadmap).
- [x] `/marketplaces` → 0 menciones de "Fase 4" / "Fase 5" en copy público del lector externo.
- [x] `/marketplaces` → "cabina de control" preservado como excepción puntual.
- [x] 3 archivos bumpeados de v1 a v1.1 con footer descriptivo.
- [x] Cero palabras prohibidas nuevas introducidas (verificado en ediciones).
- [x] Voseo preservado. Cero exclamaciones agregadas.

---

_Fin del SPRINT1_CONSISTENCIA_CHANGELOG.md. Próximo paso: aprobación Tomy de Sprint 1, después Sprint 2 (barrido cross-landings de "Fase X" + cross-links /customers)._
