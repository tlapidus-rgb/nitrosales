# BACKLOG_PENDIENTES.md — Temas pendientes de NitroSales

> **Propósito**: tracker vivo de temas que Tomy decidió no abordar ahora, pero que quedan registrados para no perderlos. Claude lee este archivo al inicio de cada sesión junto con `CLAUDE.md`, `CLAUDE_STATE.md` y `ERRORES_CLAUDE_NO_REPETIR.md`.
>
> **Cómo funciona**:
> - Tomy puede pedirle a Claude que cargue un tema nuevo acá en cualquier momento.
> - Cada ítem tiene contexto, prioridad, estado, y cuándo entró al backlog.
> - Cuando un ítem se resuelve, se marca como `✅ resuelto` con la sesión y commit(s), y se archiva en la sección "Resueltos".
> - Cuando un ítem se descarta, se marca como `🗑 descartado` con la razón.
>
> **Última actualización**: 2026-04-17 — Sesión 40 (creación del archivo + primer ítem crítico).

---

## 🔴 Prioridad CRÍTICA

### BP-001 — pLTV predictivo: rails de sanidad + capa contextual con IA

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Trigger**: bug encontrado en el rediseño Bondly LTV. Cliente Ariel Lizárraga (2 compras en 4 días, gasto total $157k) aparece en el top con pLTV 365d = $4.874.306 y 54% de confianza. Imposible defenderlo frente a un usuario no-técnico.

**Diagnóstico**:
- BG/NBD + Gamma-Gamma extrapola la frecuencia observada (0,5 compras/día con 4 días de historia) a 365 días sin piso de antigüedad mínima.
- El modelo es matemáticamente correcto para el input recibido, pero el input es inadecuado para clientes con T < 30 días.
- Probablemente el 15-30% de los clientes del top-N ranking actual están inflados por este efecto.
- Ver `ERRORES_CLAUDE_NO_REPETIR.md` → Error #S40-MODELO-SIN-BARANDAS para regla completa.

**Plan por fases** (acordado con Tomy en Sesión 40):

#### Fase 1 — Rails de sanidad (esta es la que arregla el bug visible)

Cambios en `/api/ltv/predict`:
1. **Piso de antigüedad**: si `T < 30 días` → NO usar BG/NBD. Fallback a promedio del segmento × factor de retención del canal.
2. **Cap duro**: `pLTV_365 ≤ avgTicket × freqP95_segmento × 365`. Si BG/NBD supera el cap, truncar.
3. **Confianza recalibrada**: `confianza_final = min(confianza_modelo, f(T))` con `f(T<30)=20%, f(T<90)=50%, f(T<180)=75%, f(T≥180)=modelo_raw`.
4. **Badge "Cliente nuevo"** en la UI cuando se usó el fallback, con texto explicativo "Historia insuficiente · usando promedio del segmento".
5. **Filtro default del Top-N ranking**: excluir T < 30 días, con toggle "Incluir clientes nuevos".

Esfuerzo: 1-2 commits. Impacto: arregla el bug visible de credibilidad. **No toca la matemática de BG/NBD**, solo agrega barandas alrededor.

#### Fase 2 — Capa contextual con IA (Claude Haiku)

Arquitectura de 5 capas:
1. **Capa de piso** (de Fase 1): hard rules + caps. Defensa contra ridículos.
2. **Capa estadística**: BG/NBD intacto, solo activa con T ≥ 30 días.
3. **Capa contextual (nueva)**: Claude Haiku recibe por cliente:
   - Perfil (productos, categorías, ticket, T, frecuencia, canal, ciudad, segmento).
   - Benchmark del segmento (promedio y p75 de clientes similares con 180+ días).
   - Macro del momento: inflación esperada (BCRA REM), ICC (Di Tella), calendario de tentpoles (Día del Niño, Black Friday, Navidad, inicio escolar).
   - Señales de NitroPixel: frecuencia de visita post-compra, engagement con email.
   Devuelve: `{p90d, p365d, confidence, reasoning_bullets[], intent_archetype}`.
4. **Capa de ensamble**: blending por T:
   - T < 30 → 85% contextual + 15% segmento (BG/NBD OFF).
   - 30 ≤ T < 180 → 40% BG/NBD + 50% contextual + 10% lookalike.
   - T ≥ 180 → 60% BG/NBD + 30% contextual + 10% lookalike.
5. **Capa UI**: mostrar ensemble value + reasoning text + breakdown colapsable de aporte de cada capa + confidence ring recalibrado.

Costo estimado: ~$7-15/mes en API calls (top-50 diario o top-1000 semanal). Precomputar en cron de las 3am → tabla `ltv_predictions` → dashboard solo hace SELECT.

Esfuerzo: 3-4 semanas.

#### Fase 3 — Drift monitor + feedback loop (mes 2-3)

- Comparar predicciones de hace 3/6/12 meses con lo que realmente pasó.
- Calcular MAE (mean absolute error) mensual y alertar si sube > X%.
- Dashboard interno de salud del modelo.
- Retrain cron trimestral.

Esfuerzo: 1-2 semanas.

#### Fase 4 — XGBoost especializado (mes 12-18+)

Solo cuando haya 3.000-5.000 clientes con ≥ 12 meses de historia digital madura. Entonces se entrena un modelo gradient-boosted sobre cohortes recientes y reemplaza parcialmente la Capa 3 contextual para clientes con historia suficiente. Los nuevos siguen usando Claude Haiku.

Requisitos previos:
- Tener Fases 1-3 funcionando.
- Volcar 5 años de data del retail Mundo del Juguete como **base de conocimiento y benchmarks** (NO como training data cruda — domain shift es real).
- Feature engineering: 30-50 features por cliente.
- Infra: entrenamiento en notebook/Colab + predicciones precomputadas en cron.

Esfuerzo: 4-6 semanas cuando llegue el momento.

**Data del retail Mundo del Juguete (aporte de Tomy en Sesión 40)**:
- 45 años de historia de clientes físicos.
- Útil como **contexto**, no como training data directo (cambió el negocio, los canales, el mix de productos).
- Transferible: arquetipos familiares (abuela regaladora, mamá con hijos, comprador impulso), estacionalidad cultural argentina, afinidades de categoría por edad del niño, geografía socioeconómica.
- No transferible: frecuencias absolutas, canales de adquisición, sensibilidad a cuotas, mix de productos actual.

**Decisión de Tomy (Sesión 40)**: avanzar Fase 1 cuando se retome el tema, no ahora. La Fase 2 se revisa con documento aparte antes de implementar.

---

## 🟡 Prioridad ALTA

_(vacío por ahora)_

---

## 🟢 Prioridad MEDIA

### BP-002 — `/bondly/audiencias` sin contenido

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: la ruta existe en el sidebar de Bondly desde Fase 1, pero la página todavía no tiene contenido. Es la próxima sección natural del rediseño Bondly después de LTV. Debería incluir: builder de audiencias con reglas (gasto, recencia, productos, segmento, LTV tier), preview con contador, export a Meta/Google CRM lists, segmentos predefinidos (VIP, en riesgo, cart abandoners, etc.), sincronización automática.

### BP-003 — Row expansions en tabla de cohortes de LTV

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: la tabla de retención por cohorte en `/bondly/ltv` muestra porcentajes por mes. Click en celda debería expandir fila mostrando el drill de clientes de ese cohorte con comportamiento de retención individual. Útil para investigar por qué un cohorte específico (ej: diciembre 2024) tiene retención anómala.

### BP-004 — Cursor pagination en Behavioral Explorer feed

**Entró al backlog**: 2026-04-17 (Sesión 40)
**Estado**: 📝 pendiente
**Contexto**: el Behavioral LTV Explorer en `/bondly/ltv` muestra visitantes pixel scoreados. Hoy está limitado a un paginado básico. Cuando la base de visitantes crezca (>50k), el endpoint puede volverse lento. Migrar a cursor pagination (`id > lastSeenId LIMIT N`) cuando sea necesario.

---

## 🔵 Prioridad BAJA (nice-to-have)

_(vacío por ahora)_

---

## ✅ Resueltos

_(vacío por ahora — cuando un ítem se resuelva, mover acá con fecha, sesión y commit)_

---

## 🗑 Descartados

_(vacío por ahora — cuando un ítem se descarte, mover acá con razón)_

---

## Notas de uso para Claude

- **Al inicio de cada sesión**: leer este archivo junto con los otros tres obligatorios (`CLAUDE.md`, `CLAUDE_STATE.md`, `ERRORES_CLAUDE_NO_REPETIR.md`).
- **Cuando Tomy pida "agregar un pendiente"**: agregar un nuevo ítem con ID correlativo (`BP-XXX`), prioridad, estado, fecha de entrada y contexto. No inventar prioridad — preguntar si no queda clara del mensaje.
- **Cuando Tomy pida "resolver un pendiente" o lo hagamos juntos**: actualizar el estado, mover al bloque "Resueltos" con fecha/sesión/commit(s).
- **Cuando Tomy pida "descartar un pendiente"**: mover al bloque "Descartados" con la razón.
- **Al cierre de sesión**: si surgieron cosas "para después" durante el trabajo, proponerlas a Tomy para agregarlas acá (no auto-agregarlas sin consulta).
- **No duplicar**: si un tema ya está en `CLAUDE_STATE.md` → sección "Pendientes / backlog" de alguna sesión, hacer match acá con el ID correspondiente para evitar que vivan en dos lados.
