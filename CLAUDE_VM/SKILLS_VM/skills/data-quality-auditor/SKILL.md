---
name: data-quality-auditor
description: Audita la calidad de los datos de un cliente dentro de NitroSales — valida que los números cruzan con fuentes nativas, detecta gaps, duplicados, inconsistencias, timezones mal seteados, y genera el reporte "Validation & Trust" que se entrega al cliente en día 5-10 del onboarding. Usala cuando Tomy diga "validá la data de [cliente]", "los números no cruzan", "auditoría de integridad", "hay algo raro en el dashboard", o como parte estándar del onboarding. Reporta con honestidad lo que cruza, lo que no, y por qué.
---

# data-quality-auditor

Audita integridad y calidad de la data del cliente dentro de NitroSales. Produce un reporte honesto que se entrega al cliente — base de la "Trust" inicial.

## Cuándo se dispara

- "Validá la data de [cliente]."
- "Los números de NitroSales no cruzan con los de VTEX / ML."
- "Auditoría de integridad."
- "Hay algo raro en el dashboard de [X]."
- Como parte estándar del onboarding (día 5-10).
- Cuando aparece una discrepancia reportada por el cliente.

## Proceso

1. Identificá qué data validar (usualmente los últimos 30 días).
2. Obtené benchmarks nativos (lo que ve el cliente en VTEX admin / ML admin / Meta / Google).
3. Cruzá NitroSales vs nativo por métrica.
4. Categorizá las discrepancias encontradas.
5. Producí el reporte.

## Métricas canónicas a validar

### Ventas
- Total de órdenes (cantidad).
- Total de revenue (valor).
- Ticket promedio.
- Breakdown por canal (VTEX / ML / etc).

### Ads
- Spend total Meta.
- Spend total Google.
- Impresiones + clicks.
- Conversiones reportadas por plataforma.

### Atribución
- Ventas con `utm_source` taggeado vs sin tag.
- % direct vs % tracked.

### Clientes
- Clientes únicos del período.
- % nuevos vs repeat.

### Inventario (si aplica)
- SKUs activos.
- Stock total.

## Categorías de discrepancia

### Tipo 1 — Esperada / Explicable

Diferencias que sabemos por qué existen y son razonables:
- **Timezone**: nativo en timezone local, NitroSales en UTC (ajustable).
- **Cancelaciones**: NitroSales cuenta órdenes confirmadas al momento del sync; si hay cancelaciones tardías, el conteo difiere temporalmente.
- **Moneda**: conversión de USD/ARS/BRL puede tener pequeños rounding errors.
- **Attribution window**: Meta cuenta en ventana 7d-click; NitroSales puede usar ventanas distintas.

### Tipo 2 — Bug nuestro

Diferencias que indican error en nuestra integración:
- Números muy distintos (>10%) sin explicación clara.
- Órdenes duplicadas.
- Órdenes faltantes del período.
- Webhooks caídos.

### Tipo 3 — Bug del cliente

Diferencias que indican data rota en el cliente:
- Pixel instalado parcialmente (falta en alguna página).
- Ads corriendo sin UTMs.
- SKUs sin categorías mapeadas.
- Plataforma con configuración inconsistente.

### Tipo 4 — Ambigüedad conceptual

Ninguna de las dos partes está "mal", pero miden cosas distintas:
- "Revenue" en VTEX incluye envío; en NitroSales puede no incluirlo (o al revés).
- "Orders" en ML puede contar ventas confirmadas vs creadas.
- "Customers" puede agrupar por email o por device ID.

## Output format (reporte Validation & Trust)

```markdown
# Reporte de Validación — [Cliente]
## Período: [YYYY-MM-DD a YYYY-MM-DD]

## Resumen ejecutivo

De [N] métricas validadas:
- ✅ [X] cruzan perfecto (diferencia < 2%).
- ⚠️ [Y] tienen diferencia explicable (Tipo 1 o Tipo 4).
- ❌ [Z] requieren fix (Tipo 2 o Tipo 3).

**Conclusión**: [La data está en condiciones / Requiere ajustes / No podés usar data aún].

---

## Tabla de cruces

| Métrica | Nativo | NitroSales | Diferencia | Categoría | Estado |
|---|---|---|---|---|---|
| Órdenes totales | 4,320 | 4,298 | -0.5% | Tipo 1 (timezone) | ✅ |
| Revenue total | ARS 82M | ARS 81.3M | -0.8% | Tipo 1 (cancelaciones) | ✅ |
| Meta spend | USD 12,400 | USD 12,398 | -0.02% | OK | ✅ |
| ML ventas | 1,200 | 980 | -18% | Tipo 2 — webhook caído del 10 al 12 | ❌ |
| Ticket promedio | ARS 18,900 | ARS 18,950 | +0.3% | OK | ✅ |
| ... | ... | ... | ... | ... | ... |

---

## Diferencias detectadas y explicación

### ✅ Diferencias menores (aceptables)

**1. Órdenes totales: -0.5%**
- Causa: diferencia de timezone (tu admin usa ART, NitroSales procesa en UTC hasta las 21h ART).
- Acción: sin acción. Se normaliza al día siguiente del sync.

### ⚠️ Diferencias medias (explicables, vale la pena saber)

**2. Revenue total: -0.8%**
- Causa: incluye 23 cancelaciones tardías (post-confirmación). VTEX las descuenta; NitroSales las cuenta como cancel_after_confirm.
- Acción: podés ver la lista de cancelaciones tardías en [Reports → Order Exceptions].

### ❌ Diferencias grandes (requieren fix)

**3. ML ventas: -18%**
- Causa: webhook de ML se cayó del 10 al 12 de [mes] (problema transitorio del lado de ML).
- Acción: estamos haciendo backfill manual. Próxima revisión: [fecha].
- Propuesta: activamos un cron de safety-net cada 2h para el canal ML.

---

## Red flags detectadas (acción inmediata)

- [ ] [red flag si aparece]
- [ ] [...]

## Green flags detectadas (bueno saberlo)

- ✅ Tu data de creators (attribution UTM) está perfectamente taggeada — raro, felicitaciones.
- ✅ VTEX webhook tiene 99.8% de uptime en el período.

---

## Propuesta de próximos pasos

1. **Aceptamos este reporte** y seguimos a la siguiente fase del onboarding (aha moment).
2. **Arreglamos los 2 items marcados en ❌** antes de seguir. Tiempo estimado: [N días].
3. **Establecemos reporte mensual** automático de validation (opcional).

---

## Nota para Tomy
- [alerta de qué comunicar al cliente]
- [qué pasa del lado del producto para arreglar]
```

## Principios

1. **Honestidad sobre discrepancias**. Nunca barrer bajo la alfombra. El cliente valora la transparencia.
2. **Explicar causa, no solo existencia**. Diferencias sin explicación generan desconfianza.
3. **Distinguir categorías**. No es lo mismo un timezone que un webhook caído.
4. **Invitar al cliente a cuestionar**. "Si ves algo raro que no anoté, decime".

## Anti-patrones

- Reporte que dice "todo OK" cuando hay gaps → trust roto cuando el cliente encuentre algo.
- Esconder errores del producto detrás de jerga técnica.
- Comparar con métricas no comparables (ej: revenue con envío vs sin envío).
- No cerrar el reporte con acción clara.

## Red flags inmediatas (si alguna aparece, alertar a Tomy)

- **Gap > 20% en una métrica crítica** (órdenes, revenue) sin explicación → bug serio.
- **Datos duplicados detectados** en la base NitroSales → problema de sync.
- **Webhook caído por > 24h** → requiere contacto con la plataforma.
- **Cliente no ve ninguna data** post-setup → pixel mal instalado, ver `pixel-install-guide`.

## Cuándo correr este skill

- Una vez como parte del onboarding (día 5-10).
- Mensualmente en los primeros 3 meses del cliente.
- On-demand cuando aparece discrepancia reportada.
- Trimestralmente en QBR.

## Conexión con otras skills

- **Upstream**: `implementation-playbook` dispara esto en Bloque 2.
- **Downstream**: si data pasa validation → `aha-moment-tracker`.
- Si hay gaps críticos → reportar a Claude de Producto para fix del bug.
