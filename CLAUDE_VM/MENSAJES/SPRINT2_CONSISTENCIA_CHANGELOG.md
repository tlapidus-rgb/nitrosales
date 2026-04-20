# SPRINT 2 — Barrido cross-landings · Changelog

> **Fecha**: 2026-04-20
> **Origen**: CONSISTENCIA_TIER3_v1.md + decisiones Tomy 2026-04-20.
> **Alcance planificado**: barrer las 10 landings restantes (fuera de las 3 tocadas en Sprint 1) buscando: (a) "Fase X" en copy público, (b) cross-links externos a `/customers` o `/customers/vip`, (c) cross-links rotos, (d) palabras prohibidas nuevas.

---

## Resultado: cero cambios aplicados · un pase de validación

El scope REAL de Sprint 2 fue mucho menor al anticipado. Tras el barrido sistemático:

### Archivo por archivo

| Archivo | "Fase X" en copy público | Cross-links `/customers` | Cross-links `/mercadolibre` | Palabras prohibidas | Exclamaciones |
|---|---|---|---|---|---|
| LANDING_RENTABILIDAD.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_PRODUCTOS.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_FINANZAS.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_CONTROL_GESTION.md | 0 (solo metadatos internos) | 0 | 0 | 0 (*ver nota) | 0 |
| LANDING_MARKETING_DIGITAL.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_INTEGRACIONES.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_MATRIZ.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_AURUM.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_AURA.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |
| LANDING_NITROPIXEL.md | 0 (solo metadatos internos) | 0 | 0 | 0 | 0 |

**Total**: 0 cambios de código aplicados en Sprint 2.

---

### Nota sobre /control-gestion línea 137

Uso de la palabra "potentes" detectada: *"Las herramientas de BI tradicionales (Looker, Power BI, Tableau) son potentes pero requieren saber construir queries..."*

**Análisis**: la palabra está en la lista de prohibidas ("poderoso"/"potente"/"revolucionario") cuando se usa para **defender nuestro propio valor**. En este contexto, describe a **competidores** en un argumento estructural ("son potentes PERO requieren X, Y, Z"). Es un uso honesto del adjetivo para reconocer que el competidor tiene capacidad, y después contrastar con la fricción real. No rompe la regla.

**Decisión**: no se aplica fix. Se deja registrado como caso de excepción válida.

---

## Metadatos internos (frontmatter + footers)

En las 10 landings restantes, "Fase 3-1", "Fase 3-2", etc. aparecen en:
- Frontmatter (bloque `> Qué es este archivo: ... Primera landing de Fase 3 ...`).
- Footers de "Última actualización" (`v1 Sesión 3 VM (Fase 3-X)`).
- Secciones "Apertura de Fase 3 (actualizada)" al final del archivo.

**Estos son metadatos internos para que Claude en sesiones futuras (y Tomy) entiendan el orden de construcción.** NO son copy público visible al visitante de la landing.

La decisión de Tomy fue: "fases fuera del copy público". Los metadatos internos siguen siendo útiles para gestión del proyecto y continuidad cross-sesión (CLAUDE.md, ritual de arranque, BACKLOG_PENDIENTES referencian fases).

**Decisión**: los metadatos internos quedan como están. Esta decisión se documenta explícitamente acá para que no haya ambigüedad en pasadas futuras.

---

## Otros paths que aparecen como referencias narrativas (no como cross-links a landings marketing)

Detectados:
- `/campaigns` (en AURUM Bloque 3 y ALERTAS Bloque 3)
- `/memory`, `/admin/usage`, `/sinapsis` (en AURUM como features específicos)
- `/recursos` (en AURUM como nota meta de implementación condicional)

**Análisis**: estas son pantallas INTERNAS de la app, mencionadas narrativamente para dar ejemplo concreto del producto (tipo "Estás en /campaigns viendo Meta Ads, abrís el bubble de Aurum y..."). No son cross-links a landings públicas — son parte de la descripción del producto. Lectura natural del copy.

**Decisión**: se mantienen. Funcionan como anclas de realidad — el lector entiende dónde está dentro del producto.

**Observación para cuando se monte la versión web**: al implementar las landings en Next.js, estas referencias deberían renderizarse en color más suave (no link clickeable externo) para diferenciar "ruta interna de la app" vs "cross-link a otra landing".

---

## Checklist cerrado — Sprint 2

- [x] Barrido completo de las 10 landings restantes.
- [x] Cero "Fase X" en copy público detectadas.
- [x] Cero cross-links externos activos a `/customers` o `/customers/vip`.
- [x] Cero cross-links externos activos a `/mercadolibre`.
- [x] Cero palabras prohibidas introducidas post v1.1.
- [x] Cero signos de exclamación en los 3 archivos editados en Sprint 1.
- [x] Uso borderline de "potentes" en /control-gestion validado como excepción estructural.
- [x] Metadatos internos de fase preservados (decisión documentada).
- [x] Paths internos narrativos (`/campaigns`, `/memory`, etc.) preservados.

---

## Lo que queda para Sprint 3

- Escribir LANDING_PRECIOS.md (landing Tier 3 con tabla de precios representativa). Cross-link activo en múltiples landings hoy apunta a /precios y la landing no existe todavía.

---

_Fin del SPRINT2_CONSISTENCIA_CHANGELOG.md. Sprint 2 se cierra sin cambios aplicados — el corpus ya estaba alineado con las decisiones de Tomy. Próximo paso: Sprint 3 (escribir /precios)._
