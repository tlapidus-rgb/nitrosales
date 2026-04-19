# PROPUESTA — Rediseño de la sección de Finanzas (P&L)

**Ambición declarada por Tomy:** Fathom / Jirav killer para LATAM ecommerce.
**Moneda:** ARS nominal + ARS ajustado por inflación + USD (tri-moneda).
**Data entry:** automático donde se pueda, manual donde sea imposible.
**Base:** preservar el scan de constancia AFIP y toda funcionalidad viva actual.

---

## Decisiones cerradas (sesión 41 con Tomy)

| # | Decisión | Resultado |
|---|---|---|
| D1 | Orden de pestañas | **Pulso · Estado · Costos · Escenarios · Fiscal** (Pulso es la portada narrativa, leído en 10s) |
| D2 | Fuente de USD | **Dropdown global** con default **MEP**. El usuario puede cambiar a Oficial / CCL / Blue desde cualquier pantalla |
| D3 | Narrativa IA del Pulso | **Aurum generativo** (la misma AI del resto del producto) + guardrails antipáginas-en-blanco y caps duros de sanidad sobre los números |
| D4 | Nombre de la pestaña de proyecciones | **Escenarios** (en vez de "Proyección") — transmite que hay múltiples futuros simulables |
| D5 | Orden de implementación | **Secuencial, Fase 0 → 5.** Arranca cuando Tomy apruebe esta versión del plan |

> Todo lo que sigue está alineado a estas 5 decisiones.

---

## TL;DR en 3 párrafos

Hoy el P&L de NitroSales es **sólido técnicamente** (cálculo de IVA débito fiscal para RI, scan de constancia AFIP, shipping rates por CP, comisiones MELI/VTEX, medios de pago configurables, costos manuales con distinción fijo/variable, waterfall, breakdown por canal/categoría/marca). **Está al 60% del camino.** Pero no compite todavía con Fathom o Jirav porque le falta: tri-moneda, forecasting, escenarios what-if, driver-based planning, cash runway prominente, narrativa auto-generada, bridge con métricas de marketing (CAC/LTV), y una UX que premie la velocidad de lectura.

La propuesta reorganiza **`/finanzas` en 5 pestañas que se leen de izquierda a derecha como una historia**: Pulso (¿cómo estoy hoy?) → Estado (P&L línea por línea) → Costos (configuración) → Escenarios (forecast + what-if) → Fiscal (AFIP/IVA/obligaciones). Cada pestaña resuelve una pregunta de negocio distinta con una visualización "hero" única — no 20 gráficos mediocres por página.

El diferenciador que nadie tiene hoy en el mundo: **bridge en vivo entre el P&L y los módulos de ventas/marketing/fidelización de NitroSales**. Si cambio mi CAC en Bondly, veo cómo se mueve el payback en el P&L. Si subo el spend en Meta Ads, veo el impacto en el beneficio neto proyectado. **Un único número de verdad para founder, operador y contador.**

---

## 1. DIAGNÓSTICO: qué tenemos hoy (y qué hay que preservar sí o sí)

### 1.1. Lo que ya está vivo y funciona (no se toca)

| Feature | Estado | Ubicación actual |
|---|---|---|
| Cálculo de IVA débito fiscal para RI (extrae 21%) | Vivo | `/finanzas` detallado |
| Scan de constancia AFIP (OCR + parse + auto-fill) | Vivo | `/finanzas/costos` onboarding fiscal |
| Shipping rates importables vía CSV con rangos de CP | Vivo | `/finanzas/costos` → logística |
| Payment fees configurables (credit, debit, transfer, cash) | Vivo | `/finanzas/costos` → plataformas |
| Costos manuales con 3 rate types (fijo, por envío, %) | Vivo | `/finanzas/costos` |
| Comisiones MELI (auto desde sync) + VTEX (configurable) | Vivo | P&L por canal |
| COGS automático desde `order_items.costPrice` + fallback | Vivo | P&L línea por línea |
| Waterfall + vista ejecutiva vs detallada | Vivo | `/finanzas` tabs |
| Breakdown por canal/categoría/marca | Vivo | `/finanzas` detallado |
| Comparación vs período anterior | Vivo | cards KPI |
| Distinción fijo vs variable en `ManualCost.type` | Vivo (parcial, sin UX fuerte) | DB |
| Copy-from-previous-month (solo fijos) | Vivo | `/finanzas/costos` |
| Cargas sociales en categoría Equipo | Vivo | `/finanzas/costos` |
| Warning de cobertura COGS <50% | Vivo | `/finanzas` |
| Health status (Excelente/Saludable/Ajustado/Negativo) | Vivo | vista ejecutiva |

**Regla de oro:** la propuesta **preserva el 100% de esta data y lógica**. Solo la expone mejor, la enriquece con nuevas capas, y la unifica visualmente.

### 1.2. Los gaps que cerramos con esta propuesta

| Gap | Por qué importa | Cómo lo cubrimos |
|---|---|---|
| Solo ARS, sin ajuste inflación | Argentina 2026 → lectura nominal engaña | Toggle tri-moneda con fuente IPC oficial |
| Sin forecasting | Founder no sabe cómo termina el mes | Rolling 12M con drivers |
| Sin escenarios what-if | "Si contrato 2 personas más…" sin respuesta | Split-screen base/optimista/pesimista |
| Sin driver-based planning | Cambiás un número y el P&L no se recalcula solo | Driver tree + auto-link |
| Cash runway no se ve | Métrica de vida o muerte, enterrada | Hero widget en Pulso |
| Sin CAC/LTV/Payback visible | Está la data en Bondly, no cruza al P&L | Bridge Bondly ↔ P&L |
| Sin alertas predictivas | "Margen bajó 8pp este mes" tarde | Alertas automáticas |
| Sin narrativa auto-generada | Founder mira 20 números y no sabe qué mirar | Aurum genera resumen en lenguaje humano |
| Sin anomaly detection | Shipping sube 40% un mes y nadie se entera | Rule engine simple |
| Sin export a Excel/PDF | Contadores piden Excel | Export nativo |
| Sin versionado de COGS | Cambia el costo y pisa la historia | `CostPriceHistory` por SKU |
| Sin calendario fiscal | Vencimientos AFIP sin aviso | Calendario con obligaciones |

---

## 2. PRINCIPIO RECTOR

> **"El founder abre Finanzas y entiende su negocio en 10 segundos.
> Decide en 1 minuto.
> Planifica en 5 minutos."**

Todo diseño se evalúa contra este ideal. Si una visualización requiere más de 10 segundos para interpretarse, **no va**. Si un ajuste requiere más de 3 clicks, **no va**.

Hay 3 capas mentales que el producto tiene que cubrir, en este orden:

1. **¿Cómo estoy?** (estado instantáneo) → Pulso
2. **¿Por qué estoy así?** (causalidad y detalle) → Estado + Costos
3. **¿Qué pasa si…?** (simulación, planificación) → Escenarios

Todo lo demás (Fiscal, reportes, exports) son **herramientas de soporte**, no el show principal.

---

## 3. ARQUITECTURA — 5 pestañas que cuentan una historia

```
┌─────────────────────────────────────────────────────────────────┐
│  FINANZAS                                                       │
├─────────────────────────────────────────────────────────────────┤
│  [Pulso] [Estado] [Costos] [Escenarios] [Fiscal]                │
│   ↑ el 80% del tiempo estás acá                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Pestaña | Pregunta que responde | Tiempo objetivo de lectura |
|---|---|---|
| **Pulso** | ¿Cómo estoy hoy? | 10 segundos |
| **Estado** | ¿Por qué el resultado fue ese? | 2 minutos |
| **Costos** | ¿Qué tengo cargado y cómo? | 1 minuto por categoría |
| **Escenarios** | ¿Cómo termino el mes? ¿Qué pasa si…? | 3 minutos |
| **Fiscal** | ¿Qué debo pagar y cuándo? | 30 segundos |

### 3.1. Por qué NO hay pestaña "Cash Flow" separada

Cash flow vive **transversal** a las 5 pestañas. En Pulso aparece como "cash runway". En Estado como línea de ingreso vs egreso real. En Escenarios como forecast de caja. Separarlo fragmenta la narrativa.

### 3.2. Por qué NO "Dashboard" + "Reporte" + "Costos" como hoy

La dicotomía "Ejecutivo vs Detallado" del diseño actual es un falso binario. Todo founder quiere ambas cosas **al mismo tiempo**: el KPI arriba, el detalle abajo. Las pestañas nuevas resuelven esto por **contexto** (¿qué pregunta estoy haciendo?), no por nivel de detalle.

---

## 4. LAS 10 CAPACIDADES CORE

### Capacidad 1 — Data fabric: automático donde se pueda, manual donde no

**Principio:** cada número en el P&L tiene un "origen" visible. El usuario ve un ícono (🔄 auto, ✏️ manual, 🧮 calculado, 📄 AFIP) que le dice de dónde salió.

| Componente del P&L | Origen (ideal) | Estado hoy |
|---|---|---|
| Revenue bruto | Auto desde VTEX + MELI | ✅ |
| Revenue neto IVA | Calculado (revenue / 1.21 si RI) | ✅ |
| COGS | Auto desde `order_items.costPrice` | ✅ |
| Meta Ads | Auto desde Meta API | ✅ |
| Google Ads | Auto desde Google Ads API | ✅ |
| Envíos reales | Auto desde shipping rates + CP | ✅ (parcial) |
| Envíos estimados | Calculado desde orden | ✅ |
| Comisiones MELI | Auto desde webhooks | ✅ |
| Comisiones VTEX | Calculado desde config | ✅ |
| Payment fees | Calculado desde config por método | ✅ |
| Sueldos y RRHH | Manual (con copy-from-prev) | ✅ |
| Alquileres, servicios | Manual | ✅ |
| IIBB, Ganancias | Calculado desde fiscal profile | ⚠️ parcial |
| Retenciones MELI (IVA/IIBB/Ganancias) | Auto desde webhooks | ✅ |
| Devoluciones/refunds | Auto desde orders | ⚠️ parcial |
| Merma/roturas | Manual | ✅ |

**Añadimos:** badge visual "fuente del dato" al lado de cada línea del P&L. Click → modal con detalle técnico ("este número viene de 437 órdenes VTEX entre 01/04 y 17/04, comisión 2.5% según tu config").

### Capacidad 2 — Taxonomía de costos profesional

Todo costo tiene **4 ejes de clasificación**, no uno:

**Eje 1 — Categoría funcional** (ya existe: Logística, Equipo, Plataformas, Fiscal, Infraestructura, Marketing, Merma, Otros).

**Eje 2 — Comportamiento** (nuevo con UX fuerte):

| Tipo | Definición | Ejemplo |
|---|---|---|
| **Fijo** | No cambia con volumen | Alquiler, sueldos base, Shopify fijo |
| **Variable** | Escala con volumen | COGS, packaging, Meta Ads (hasta cierto punto) |
| **Semifijo** | Salta por escalones | Un warehouse más a partir de X pedidos |

**Eje 3 — Mecanismo de cálculo** (ya existe parcial: `rateType`):

| Mecanismo | Input del usuario | Resultado |
|---|---|---|
| Monto fijo mensual | $400.000 | $400.000 en el mes |
| Porcentaje de base | 3.5% de ventas | Se recalcula con revenue |
| Por unidad operativa | $250 por envío | Se recalcula con # envíos |
| Por rango/tabla | Tabla de CP | Se recalcula con rates |
| Fórmula custom | `headcount × 1.35 × salario_promedio` | Driver-based |

**Eje 4 — Categoría fiscal** (nuevo — cruza con AFIP):

| Tipo fiscal | Deducible Ganancias | Computa IVA crédito fiscal | Ejemplo |
|---|---|---|---|
| Gasto deducible con IVA | ✅ | ✅ | Proveedor RI con factura A |
| Gasto deducible sin IVA | ✅ | ❌ | Sueldos, servicios de monotributistas |
| No deducible | ❌ | ❌ | Multas, gastos personales |

Esto es un **diferenciador brutal**: ningún competidor gringo entiende esto porque es específico de Argentina. Y es lo que el contador del founder le pide cada mes.

### Capacidad 3 — Tri-moneda (ARS nominal / ARS ajustado / USD)

**3 vistas, un toggle**. Por defecto, ARS nominal (lo que ves en la cuenta). Se puede cambiar a:

- **ARS ajustado por inflación**: toda la data histórica se expresa en pesos de "hoy" usando el IPC del INDEC. Fundamental para comparar marzo vs octubre de 2026 sin que la inflación distorsione.
- **USD**: todo dolarizado. El usuario elige qué referencia usar desde un **dropdown global visible en cualquier pantalla** (Oficial / MEP / CCL / Blue). **Default: MEP** — es el tipo de cambio financiero accesible legalmente que usan los ecommerce reales para costear imports y pricing, y refleja el "dólar de verdad" del negocio.

**Cómo se maneja:**

1. **Tabla nueva `ExchangeRateDaily`**: fecha, oficial, mep, ccl, blue (referencia). Cron diario que consulta fuentes oficiales.
2. **Tabla nueva `InflationIndexMonthly`**: mes, ipc, ipc_acumulado. Cron mensual contra INDEC.
3. **Capa de conversión transparente**: el P&L guarda **siempre** en ARS nominal. El toggle renderiza al vuelo.
4. **Badge sobre el número**: cuando estás en modo ajustado, pequeño ícono 📊 al lado del número, hover muestra "convertido desde $X al IPC de abril 2026".
5. **Dropdown global de USD en el header de Finanzas** (siempre visible): Oficial · MEP (default) · CCL · Blue. El cambio se persiste en `organizations.settings.usdRateSource` para la próxima sesión.

**Decisión técnica:** guardar costos e ingresos en **ARS con timestamp**. Nunca convertir y guardar — el costo de almacenamiento es nada vs el costo de perder precisión.

### Capacidad 4 — AFIP live (constancia scan → sincronización continua)

**Hoy tenemos:** scan de PDF de constancia + parse + auto-fill. Brillante. **Lo mantenemos y lo elevamos.**

**Qué agregamos:**

1. **Botón "Resincronizar constancia"** — un click, volvés a subir el PDF y actualiza solo los campos que cambiaron (nueva categoría Monotributo, nueva actividad, cambio de provincia).
2. **Calendario de obligaciones fiscales** — según tu régimen, el sistema te arma el calendario anual (vencimiento Monotributo día 20, IIBB CABA día 18, Ganancias anual junio, etc.) con alertas 3 días antes.
3. **Tablero de retenciones** — cuánto te retuvieron por IVA, IIBB, Ganancias en cada marketplace, con proyección de crédito fiscal a recuperar.
4. **Alertas de límite Monotributo** — si tu facturación anual proyectada supera la categoría actual, alerta con 2 meses de anticipación para recategorizar o pasar a RI.
5. **Sugerencia de régimen** — basado en tus números reales, Aurum sugiere "te conviene pasar a RI en el trimestre que viene porque X".

### Capacidad 5 — Waterfall narrativo (hero viz de la pestaña Estado)

Hoy ya existe el waterfall. Lo convertimos en **hero**.

```
Revenue ─────────────────────────────────────── $12.500.000
           ▼ IVA Débito                           -$2.168.595
           ▼ COGS                                 -$4.450.000
           ═══════════════════════════════════════ $5.881.405 (Margen bruto 56.6%)
           ▼ Meta Ads                             -$820.000
           ▼ Google Ads                           -$450.000
           ▼ Envíos netos                         -$380.000
           ▼ Comisiones marketplace               -$310.000
           ▼ Payment fees                         -$220.000
           ▼ Sueldos + cargas                     -$1.800.000
           ▼ Infraestructura                      -$350.000
           ▼ Otros                                -$180.000
           ═══════════════════════════════════════ $1.371.405 (Neto 11.0%)
```

**Features del waterfall nuevo:**

- **Click en cualquier barra → drill-down** al detalle de esa línea (ej: "Meta Ads" abre panel lateral con campañas de mayor gasto).
- **Toggle "mostrar como %"** — todos los números se vuelven porcentaje del revenue. Útil para benchmarking interno o vs industria.
- **Hover sobre una barra** → minibarra comparativa mes anterior + alerta si variación > 15%.
- **Animación al cargar** — cada barra baja de a una, como si se construyera el P&L. Refuerza la lógica de "esto baja por acá, esto baja por allá".

### Capacidad 6 — Drivers y árbol de palancas

**Inspiración:** Jirav + Mosaic. Lo adaptamos a ecommerce LATAM.

**Qué es un driver:** una variable de negocio que si cambia, mueve el P&L.

**Drivers pre-configurados para ecommerce LATAM:**

| Driver | Valor actual (ejemplo) | Qué mueve |
|---|---|---|
| Tráfico orgánico diario | 1.200 sesiones | Revenue (orgánico) |
| Tráfico paid diario | 800 sesiones | Revenue (paid) |
| Conversion rate | 2.1% | Revenue |
| AOV | $18.500 | Revenue |
| COGS % | 38% | Margen bruto |
| Ad spend diario | $45.000 | Ad cost + Revenue paid |
| ROAS paid | 2.8x | Revenue paid / Ad spend |
| CAC | $2.800 | Payback period |
| LTV (90d) | $28.000 | Payback period |
| Repeat rate 90d | 22% | LTV |
| Headcount | 7 | Sueldos + cargas |
| Salario promedio | $1.200.000 | Sueldos |
| Tipo cambio USD | $1.050 | Todo lo dolarizado |
| IPC mensual | 3.8% | Todo lo ajustado |

**Cómo se ven:** panel lateral con sliders. Cambiás un slider → todo el P&L se recalcula visualmente al lado. Si cambiás COGS de 38% a 42%, ves en tiempo real cómo baja el margen bruto.

**Árbol de drivers (driver tree):** vista alternativa que muestra cómo los drivers se encadenan:

```
Beneficio Neto
├── Margen Bruto
│   ├── Revenue
│   │   ├── Tráfico × Conv × AOV (orgánico)
│   │   └── Ad spend × ROAS (paid)
│   └── COGS %
└── OPEX
    ├── Variables (% revenue)
    └── Fijos ($)
```

### Capacidad 7 — Escenarios con ranges (Causal pattern)

**3 escenarios por default**, editables:

- **Base** (lo más probable) — usa tendencia + seasonality
- **Optimista** (si todo sale bien) — drivers +10/+15% según convenga
- **Conservador** (si las cosas se ponen feas) — drivers -10/-15%

**Innovación clave (Causal):** cada driver puede ser un **rango**, no un número fijo.

En vez de `COGS % = 40%`, escribís `COGS % = 38–42%`. El escenario genera no una línea, sino una **banda sombreada** en el gráfico. Ves el rango de outcomes posibles.

**Split screen visual:**

```
┌────────────────────┬────────────────────┬────────────────────┐
│    CONSERVADOR     │        BASE        │     OPTIMISTA      │
├────────────────────┼────────────────────┼────────────────────┤
│ Revenue $9.8M      │ Revenue $12.5M     │ Revenue $15.1M     │
│ Margen neto 6.2%   │ Margen neto 11.0%  │ Margen neto 15.8%  │
│ Cash runway 4.8m   │ Cash runway 7.2m   │ Cash runway 11.4m  │
└────────────────────┴────────────────────┴────────────────────┘
```

**Acciones posibles sobre un escenario:**

- **"Hacerlo realidad"** → los drivers del escenario pasan a ser el budget del mes.
- **"Exportar"** → PDF con el escenario completo (útil para inversores, bancos).
- **"Clonar"** → duplicar para modificar sin perder el original.

### Capacidad 8 — Forecast rolling 12 meses con estacionalidad

**Método:** hybrid.

1. **Base estadística:** tendencia de los últimos 90 días + estacionalidad histórica de la categoría (Día del Niño, Hot Sale, Navidad, Black Friday, vuelta al cole).
2. **Overlay de drivers:** tus drivers actuales se proyectan al futuro con reglas (ej: tráfico orgánico crece 8% MoM si SEO sigue activo).
3. **Overlay de eventos:** campañas, lanzamientos, contrataciones cargadas a futuro.

**UI:** línea del tiempo de 12 meses con 3 capas superpuestas:
- Línea azul firme → actual (meses cerrados)
- Línea gris punteada → forecast base (meses por venir)
- Banda verde/roja → rango con escenarios

**Click en un mes futuro** → abre el waterfall proyectado de ese mes.

### Capacidad 9 — Cash runway prominente (hero de la pestaña Pulso)

**Por qué:** porque no hay métrica más crítica para un founder. Pry lo hacía bien, Brex lo perdió. **Lo hacemos mejor que nadie.**

**Componente visual:**

```
┌────────────────────────────────────────┐
│  CASH RUNWAY                           │
│                                        │
│         ┌──────────┐                   │
│         │   7.2    │ meses             │
│         └──────────┘                   │
│  ────────────────────────────────      │
│  🟢 Saludable  (mayor a 6 meses)       │
│  Proyectado para: 25 nov 2026          │
│                                        │
│  [▼] Ver cómo se descompone            │
└────────────────────────────────────────┘
```

**Color semáforo:** rojo <3m, naranja 3-6m, verde >6m.

**Click en "Ver cómo se descompone"** → panel con:
- Cash hoy: $X
- Burn mensual proyectado: $Y
- Incomings esperados: $Z
- Eventos que alteran el runway (contratación prevista, inversión, pago grande)

**Comparación mes a mes:** cómo se mueve el runway semana por semana. Alerta si cae más de 1 mes por semana.

### Capacidad 10 — Bridge con Bondly y Campañas (el killer único)

**Diferenciador mundial.** Ningún Fathom, Jirav, Runway tiene esto. Porque **NitroSales tiene la data de Bondly (CLV, cohortes, churn) y Campañas (ad spend, ROAS)**.

**Bridge visual en Pulso:**

```
┌─────────────────────────────────────────────────┐
│  MARKETING FINANCIERO (nuevo)                   │
├─────────────────────────────────────────────────┤
│  CAC           $2.800   (Bondly → Clientes)     │
│  LTV (90d)    $28.000   (Bondly → LTV)          │
│  LTV:CAC      10.0x     🟢 excepcional          │
│  Payback      1.2 meses 🟢 recuperás rápido     │
│  Ad spend        27%    del revenue             │
│  Beneficio/$    $0.41    por cada $1 en ads     │
└─────────────────────────────────────────────────┘
```

**Click en CAC** → te lleva directo al Centro de Control de Campañas con el breakdown por plataforma.

**Click en LTV** → te lleva a Bondly → LTV con el detalle por cohort.

**Forecast link:** en Escenarios, tenés slider de "CAC target" y "LTV target". Si tus objetivos de marketing cambian, el P&L los absorbe automáticamente.

---

## 5. UI — cómo se ve cada pestaña

### 5.1. Pestaña "Pulso" (80% del tiempo el founder vive acá)

```
┌───────────────────────────────────────────────────────────────────┐
│  📍 PULSO              [ARS nominal ▼]     Periodo: Últimos 30d ▼│
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📖 NARRATIVA AUTOMÁTICA (generada por Aurum, 2 líneas)           │
│  ────────────────────────────────────────────────────────         │
│  Este mes facturaste $12.5M (+18% vs marzo), con un margen        │
│  neto de 11.0%. Tu mayor palanca negativa fue Meta Ads            │
│  (+23% en spend sin ROAS proporcional). Runway cayó de 8.2        │
│  a 7.2 meses.                                                     │
│                                                                   │
├────────────────────────┬──────────────────────────────────────────┤
│  CASH RUNWAY           │  RESULTADO DEL MES                       │
│   7.2 meses            │  $1.37M neto (11.0% margen)              │
│   🟢 Saludable         │  ▲ +$210k vs marzo                       │
│   hasta 25 nov 2026    │                                          │
├────────────────────────┼──────────────────────────────────────────┤
│  REVENUE $12.5M (+18%) │  COSTOS $11.1M (89% del revenue)         │
│  ORDERS   742 (+12%)   │  MAYOR PESO: COGS 36%, Sueldos 14%       │
├────────────────────────┴──────────────────────────────────────────┤
│                                                                   │
│  MARKETING FINANCIERO                                             │
│  CAC $2.8k | LTV $28k | Ratio 10x 🟢 | Payback 1.2m 🟢            │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│  TENDENCIA 12 MESES (sparkline revenue + beneficio neto)          │
│                                                                   │
│  [Ver P&L completo →]  [Ver Escenarios →]                         │
└───────────────────────────────────────────────────────────────────┘
```

**Detalles de interacción:**
- Narrativa actualiza cada vez que cambiás el período.
- Click en cualquier card → zoom a la pestaña que da más detalle.
- Alertas inteligentes aparecen arriba de la narrativa si algo crítico cambió (margen cayó >3pp, cash runway <3m, anomalía en shipping).

### 5.2. Pestaña "Estado" (el P&L línea por línea, con waterfall hero)

```
┌───────────────────────────────────────────────────────────────────┐
│  📊 ESTADO                                                        │
│  [Moneda: ARS ▼]  [Período: Mes actual ▼]  [Ver como: $ / % ▼]    │
│  [Comparar con: Mes anterior ▼]                                   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓     │
│  WATERFALL INTERACTIVO (hero)                                     │
│  Revenue $12.5M ─ IVA -$2.1M ─ COGS -$4.4M ═ Bruto $5.8M ─...     │
│  ... ─ Neto $1.37M                                                │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│  ESTADO DE RESULTADOS (tabla con drill-down)                      │
│                                                                   │
│  FACTURACIÓN                          $12.500.000   🔄           │
│    IVA Débito Fiscal (21%)            -$2.168.595   🧮           │
│    Revenue Neto IVA                   $10.331.405   🧮           │
│                                                                   │
│  COGS                                 -$4.450.000   🔄           │
│    VTEX (412 órdenes)                 -$2.100.000   🔄 →         │
│    MELI (330 órdenes)                 -$2.350.000   🔄 →         │
│                                                                   │
│  MARGEN BRUTO                         $5.881.405    56.6% 🧮     │
│                                                                   │
│  OPEX                                 -$4.510.000                │
│    Variables                          -$2.290.000                │
│      Meta Ads                         -$820.000     🔄           │
│      Google Ads                       -$450.000     🔄           │
│      Envíos netos                     -$380.000     🔄           │
│      Comisiones marketplace           -$310.000     🧮           │
│      Payment fees                     -$220.000     🧮           │
│      Packaging                        -$110.000     ✏️           │
│    Fijos                              -$2.220.000                │
│      Sueldos + cargas                 -$1.800.000   ✏️           │
│      Infraestructura                  -$350.000     ✏️           │
│      Plataformas SaaS                 -$70.000      ✏️           │
│                                                                   │
│  BENEFICIO NETO OPERATIVO             $1.371.405    11.0% 🧮     │
│                                                                   │
│  Leyenda: 🔄 auto · 🧮 calculado · ✏️ manual · → drill-down      │
└───────────────────────────────────────────────────────────────────┘
```

**Detalles:**
- Cada línea tiene badge de origen.
- Variables vs Fijos **agrupados explícitamente** (era el gap del diseño viejo).
- Click en cualquier línea → drill-down lateral (panel que se desliza desde derecha).
- Botón "Exportar" (PDF profesional + Excel con formato contable).

### 5.3. Pestaña "Costos"

```
┌───────────────────────────────────────────────────────────────────┐
│  💸 COSTOS                                                        │
│  Mes: Abril 2026 ▼                       [+ Nuevo costo]          │
├───────────────────────────────────────────────────────────────────┤
│  RESUMEN DEL MES                                                  │
│  Total $2.330k · Fijos $2.220k (95%) · Variables $110k (5%)       │
├───────────────────────────────────────────────────────────────────┤
│  CATEGORÍAS                                                       │
│                                                                   │
│  ▼ 👥 EQUIPO                                    $1.800k  [Editar] │
│     ▣ Fijo | Mensual recurrente                                   │
│     • Sueldo CEO            $500k   [FIJO]    ✏️                  │
│     • Sueldo marketing      $400k   [FIJO]    ✏️                  │
│     • Sueldo ops            $350k   [FIJO]    ✏️                  │
│     • Freelancer SEO        $150k   [VARIABLE · Mensual]  ✏️      │
│     • Cargas sociales (30%) $400k   [CALCULADO]                   │
│                                                                   │
│  ▼ 📦 LOGÍSTICA                                 $380k    [Editar] │
│     ▣ Variable | Por envío + tabla CP                             │
│     • Andreani estándar AMBA (tabla 2.300 CP)   $240k   🔄        │
│     • OCA interior (tabla 1.100 CP)             $120k   🔄        │
│     • Packaging ($150/envío × 742)              $111k   🧮        │
│     • Mermas                                    $9k     ✏️        │
│                                                                   │
│  ▼ 🏢 INFRAESTRUCTURA                           $350k    [Editar] │
│     ▣ Fijo | Mensual                                              │
│     • Alquiler depósito     $280k   [FIJO]    ✏️                  │
│     • Servicios             $50k    [FIJO]    ✏️                  │
│     • Seguros               $20k    [FIJO]    ✏️                  │
│                                                                   │
│  ▼ 💻 PLATAFORMAS                               $70k     [Editar] │
│  ▶ 📣 MARKETING (no-ads)                        ...              │
│  ▶ 🧾 FISCAL (no impuestos directos)            ...              │
│  ▶ 🗑  MERMA Y PÉRDIDAS                          ...              │
│  ▶ 📎 OTROS                                     ...              │
└───────────────────────────────────────────────────────────────────┘
```

**Mejoras críticas vs hoy:**
- Chip visible FIJO/VARIABLE al lado de cada costo.
- Resumen arriba mostrando **ratio fijo:variable del mes** (key metric para saber qué tan resiliente es tu estructura).
- Inline edit por campo (click sobre el número, editás, enter para guardar).
- Bulk edit (seleccionar varios → "aumentar 8% todos"), útil cuando hay aumento general.
- Copy-from-prev ya existe → lo mejoramos agregando **"copy con ajuste por inflación"**: copia del mes anterior pero le suma el IPC del mes.

**Nuevo rate type: "driver-based"**

```
Costo de sueldos de atención al cliente
Fórmula: headcount_atencion × salario_promedio × 1.30 (cargas)
Inputs: headcount_atencion = 2, salario_promedio = $800k
Resultado: $2.080.000

[Sliders editables ante cambios]
```

### 5.4. Pestaña "Escenarios"

```
┌───────────────────────────────────────────────────────────────────┐
│  🔮 ESCENARIOS                                                    │
│  Horizonte: 12 meses ▼      [+ Nuevo escenario]                   │
├───────────────────────────────────────────────────────────────────┤
│  ESCENARIOS ACTIVOS                                               │
│  ┌───────────────┬───────────────┬───────────────┐                │
│  │ 🔴 CONSERVADOR│ 🟡 BASE       │ 🟢 OPTIMISTA  │                │
│  │ Revenue 12M   │ Revenue 12M   │ Revenue 12M   │                │
│  │  $118M        │  $150M        │  $185M        │                │
│  │ Margen 6.2%   │ Margen 11.0%  │ Margen 15.8%  │                │
│  │ Runway 4.8m   │ Runway 7.2m   │ Runway 11.4m  │                │
│  │ [Activar]     │ [Activo ✓]    │ [Activar]     │                │
│  └───────────────┴───────────────┴───────────────┘                │
├───────────────────────────────────────────────────────────────────┤
│  DRIVERS (mueve los sliders y ves el impacto en vivo)             │
│                                                                   │
│  Tráfico orgánico/día    ────●──────────  1.200                   │
│  Conversion rate         ───●───────────  2.1%                    │
│  AOV                     ─────●─────────  $18.500                 │
│  Ad spend/día            ────●──────────  $45.000                 │
│  ROAS                    ──────●────────  2.8x                    │
│  COGS %                  ────●──────────  38% (rango 36-42%)      │
│  Headcount               ●──────────────  7 (subirá a 9 en jul)   │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│  FORECAST LÍNEA (12 meses)                                        │
│                                                                   │
│  [Gráfico con actuals sólido + forecast punteado + banda]         │
│                                                                   │
│  [Click en un mes → waterfall de ese mes]                         │
└───────────────────────────────────────────────────────────────────┘
```

### 5.5. Pestaña "Fiscal"

```
┌───────────────────────────────────────────────────────────────────┐
│  🧾 FISCAL                                                        │
├───────────────────────────────────────────────────────────────────┤
│  TU PERFIL                                                        │
│  Razón social: Nitro Toys SA                                      │
│  CUIT: 30-71234567-9                                              │
│  Régimen: Responsable Inscripto                                   │
│  Provincia: CABA  (+Convenio Multilateral: Sí)                    │
│  [📄 Resincronizar constancia]                                    │
├───────────────────────────────────────────────────────────────────┤
│  CALENDARIO DE OBLIGACIONES (próximos 30 días)                    │
│                                                                   │
│  📅 20/04  IVA abril (estimado $2.1M)              [8 días]       │
│  📅 18/04  IIBB CABA (estimado $380k)              [6 días] ⚠️    │
│  📅 30/04  Ganancias anticipo (estimado $150k)     [18 días]      │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│  RETENCIONES RECIBIDAS (mes actual)                               │
│                                                                   │
│  IVA retenido (MELI)     $180k  → crédito fiscal                 │
│  IIBB retenido (MELI)    $80k   → crédito fiscal                 │
│  Ganancias retenido       $55k   → crédito fiscal                 │
│  TOTAL A FAVOR          $315k                                     │
│                                                                   │
├───────────────────────────────────────────────────────────────────┤
│  SUGERENCIA DE AURUM                                              │
│                                                                   │
│  💡 A este ritmo, en agosto 2026 vas a superar el tope            │
│     Monotributo. Te conviene evaluar pasar a RI en julio          │
│     para no caer en rezonificación. [Ver análisis →]              │
└───────────────────────────────────────────────────────────────────┘
```

---

## 6. FEATURES ÚNICOS (nadie en el mundo tiene esto)

### 6.1. Narrativa auto-generada con Aurum (decisión D3)

Cada apertura de Pulso, **Aurum generativo** (la misma IA que usás en el resto del producto) genera **2-3 frases** que resumen el estado:

> "Este mes facturaste $12.5M (+18% vs marzo), con un margen neto de 11.0%. Tu mayor palanca negativa fue Meta Ads (+23% en spend sin ROAS proporcional). Runway cayó de 8.2 a 7.2 meses."

**Arquitectura anti-alucinación (3 capas de defensa, aprendida del error S40-MODELO-SIN-BARANDAS):**

1. **Capa de datos duros (fuente de verdad, determinista):** antes del prompt, una función extrae los números clave del período (revenue, margen, top 3 variaciones, runway actual vs anterior, alertas activas). Estos números **nunca** los inventa Aurum — van como contexto fijo.
2. **Capa generativa (Aurum redacta):** Aurum recibe los números duros + las comparaciones pre-computadas y los redacta en lenguaje humano, con voz de analista. Puede elegir qué enfatizar, no qué decir.
3. **Capa de validación post-output:** regex + diff contra los números fuente. Si Aurum mencionó un número que no coincide con la fuente dura (±1% de tolerancia por redondeo), la narrativa se descarta y se usa un fallback de plantilla simple. Todo log queda en `finance_narrative_audit` para review.

**Caps duros de sanidad:** si algún driver está fuera de rango físico (ej: margen neto <-100% o >+80%), la narrativa automáticamente se silencia y se muestra "Datos atípicos detectados — revisando antes de resumir" en vez de exponer outputs indefendibles.

**Por qué generativo y no determinista:** la voz de plantilla se nota y mata el premium feel. Aurum le da la personalidad que diferencia a NitroSales de un reporte de Excel. Los guardrails cubren el riesgo sin matar la magia.

### 6.2. Tri-moneda con toggle flip

Al hacer toggle, el P&L entero se "da vuelta" con animación de flip 3D. Premium feeling. Mantiene los mismos números conceptuales, cambia la representación.

### 6.3. Bridge Bondly ↔ Campañas ↔ P&L (el killer absoluto)

Único en el mundo porque requiere tener las 3 módulos en un mismo producto. Nosotros los tenemos.

### 6.4. Ajuste IPC automático

Conexión al API del INDEC para IPC mensual oficial. Cualquier comparación histórica se puede ver en pesos de hoy.

### 6.5. AFIP scan evolutivo

Ya existe el scan. Lo elevamos a **"constancia viva"**: el sistema mantiene un registro de cambios en tu constancia y te avisa si hay actualizaciones (muchos founders no se enteran de que el Estado les cambió una categoría hasta que les llega una intimación).

### 6.6. Alertas predictivas

> "A este ritmo, tu cash runway será de 4.8 meses a fin de mes. Hace 30 días era 7.2. Revisá el spend de Meta (+$300k) y el COGS de la marca X (+8pp)."

### 6.7. "Rate-type Driver" en costos

Ningún competidor permite que un costo manual sea una **fórmula** (`headcount × salario × 1.30`) que se recalcula sola. Nosotros sí.

---

## 7. DATA MODEL — qué tablas se tocan

### Nuevas tablas

| Tabla | Propósito |
|---|---|
| `ExchangeRateDaily` | Tipo de cambio diario (oficial, MEP, CCL, blue) |
| `InflationIndexMonthly` | IPC mensual del INDEC |
| `CostPriceHistory` | Historial de costos por SKU (evitar que cambio de hoy pise el pasado) |
| `FinancialScenario` | Escenarios guardados (nombre, drivers, ranges) |
| `BudgetLine` | Presupuesto por línea/mes para comparación AvB |
| `DriverValue` | Valores actuales y target de cada driver |
| `FiscalObligation` | Obligaciones fiscales calculadas + vencimientos |
| `FinanceAlert` | Alertas predictivas + severidad + dismissed |

### Campos a agregar a `ManualCost`

- `fiscalType` (enum: `DEDUCTIBLE_WITH_IVA`, `DEDUCTIBLE_NO_IVA`, `NON_DEDUCTIBLE`)
- `behavior` (enum: `FIXED`, `VARIABLE`, `SEMI_FIXED`)
- `driverFormula` (string nullable, JSON DSL para rate type driver)
- `autoInflationAdjust` (boolean, si sí → se ajusta por IPC al copiar al mes siguiente)

### Campos a agregar a `organizations.settings`

- `currencyPreference`: `"ARS_NOMINAL"` | `"ARS_ADJUSTED"` | `"USD"`
- `usdRateSource`: `"OFFICIAL"` | `"MEP"` | `"CCL"` | `"BLUE"`
- `defaultScenarioId`: id del escenario activo

### Tablas existentes que **no se tocan** (importante)

`shipping_rates`, el core de `orders` y `order_items`, `ml_commissions`, `ad_metrics_daily`, `platformConfig`, la lógica de `fiscalProfile` (solo se agrega encima).

---

## 8. ROADMAP DE IMPLEMENTACIÓN

Dividido en 6 fases. Cada fase pusheable a `main` de forma independiente sin romper nada.

### Fase 0 — Infraestructura tri-moneda y unificación visual (semanas 1-2)

- Crear `ExchangeRateDaily` + cron diario.
- Crear `InflationIndexMonthly` + cron mensual (INDEC).
- Hook `useCurrencyView()` con 3 modos.
- Reestructurar routing: `/finanzas/pulso`, `/finanzas/estado`, `/finanzas/costos`, `/finanzas/escenarios`, `/finanzas/fiscal`.
- Redirigir `/finanzas` → `/finanzas/pulso` por default.
- UI: tabs superiores premium según UI_VISION (gradient activo, dot indicator).

**Entregable:** 5 pestañas existentes con data de hoy + toggle de moneda funcionando en Estado.

### Fase 1 — Pulso (hero + narrativa) (semanas 3-4)

- Componente "Cash Runway Hero".
- Componente "Marketing Financiero" (bridge inicial con ad_metrics_daily + placeholder de Bondly).
- Narrativa auto-generada con función determinista.
- Sparkline 12 meses.
- Alertas card (integración inicial con `FinanceAlert`).

**Entregable:** Pulso es la pestaña por defecto, limpio, narrativo, con cash runway prominente.

### Fase 2 — Estado (waterfall hero + taxonomía pro) (semanas 5-6)

- Waterfall interactivo con drill-down lateral.
- Agrupamiento explícito Variables vs Fijos.
- Badge de origen por línea.
- Toggle "$ vs %".
- Export a PDF y Excel (usar skill pptx/xlsx).
- Nuevo `CostPriceHistory` para versionado de COGS.

**Entregable:** el P&L más legible y auditable de Argentina.

### Fase 3 — Costos pro (fijos/variables/%/driver) (semanas 7-8)

- UI de categorías con chips FIJO/VARIABLE visibles.
- Resumen ratio fijo:variable.
- Nuevo rate type `DRIVER_BASED` con editor de fórmula.
- Bulk edit por categoría.
- Copy-from-prev con ajuste IPC opcional.
- Agregar campos `fiscalType`, `behavior`, `driverFormula`, `autoInflationAdjust` a `ManualCost`.

**Entregable:** versatilidad máxima, cubre cualquier estructura de costo de cualquier founder.

### Fase 4 — Escenarios (forecast + simulación) (semanas 9-11)

- Tabla `FinancialScenario` + UI de 3 escenarios.
- Drivers con sliders y rangos.
- Forecast line chart con estacionalidad LATAM (Día del Niño, Hot Sale, etc.).
- Split screen comparativo.
- Export de escenario a PDF.

**Entregable:** el founder puede planificar el próximo año sin abrir Excel.

### Fase 5 — Fiscal enhanced + Bridge profundo Bondly/Campañas (semana 12)

- Calendario de obligaciones desde fiscal profile.
- Cálculo de retenciones recibidas.
- Sugerencia de régimen con Aurum.
- Bridge profundo Bondly → CAC/LTV con datos reales.
- Bridge Campañas → ROAS/CAC con datos reales.
- Alertas predictivas con reglas de negocio.

**Entregable:** Finanzas queda terminado a nivel "Fathom/Jirav killer LATAM".

### Fase 6 (opcional, futuro) — Integraciones contables

- Webhook hacia Xubio / Colppy / Tango.
- Export para AFIP (archivos TXT que requieren algunos regímenes).
- Integración con Mercado Pago para conciliar liquidaciones.

---

## 9. CRITERIOS DE ÉXITO

| Criterio | Métrica | Target |
|---|---|---|
| Velocidad de lectura | Tiempo medio en Pulso para entender estado | <10s |
| Adopción de features | % usuarios que usan costos con driver formula | >20% en 60d |
| Confianza en los números | % de usuarios que marcan "coincide con mi contador" | >85% |
| Uso de escenarios | # escenarios creados por usuario activo/mes | >2 |
| Reducción de abandono | Caída de usuarios que desisten de usar P&L | -50% |
| NPS específico de Finanzas | Pregunta "¿recomendarías el P&L de NitroSales?" | >60 |
| Sustitución | % usuarios que dejan de usar Fathom/Jirav | >30% en 120d |

---

## 10. RIESGOS Y MITIGACIONES

| Riesgo | Severidad | Mitigación |
|---|---|---|
| INDEC cambia estructura de datos | Baja | Cron con fallback a scraping; cache local |
| Conversión USD genera confusión legal (IVA en dólar no existe) | Media | Tag "vista informativa" en modo USD; impuestos siempre en ARS |
| Narrativa de Aurum inventa datos | Alta | 100% determinista, no LLM free; plantilla + datos reales |
| Waterfall con muchos items se vuelve ilegible | Media | Auto-agrupación si >10 líneas; "ver más" expandible |
| Escenarios + drivers son complejos y founders no los adoptan | Media | Defaults inteligentes; tour guiado primera vez; plantillas por tipo de negocio |
| Migraciones de DB rompen producción | Alta | Seguir regla de 5 pasos (endpoint → deploy → ejecutar → schema → deploy) |
| Tri-moneda triplica la carga de cálculo | Baja | Storage siempre en ARS nominal; conversión al vuelo (client-side) |

---

## 11. DECISIONES TOMADAS (sesión 41)

Las 5 decisiones que tenía pendientes quedaron cerradas con Tomy y están integradas en todo el plan.

| # | Decisión | Resultado | Impacto en el plan |
|---|---|---|---|
| **D1** | Orden de pestañas | **Pulso · Estado · Costos · Escenarios · Fiscal** | Pulso es la portada (80% del tiempo el founder vive ahí). Fase 1 arranca por Pulso. |
| **D2** | Fuente de USD | **Dropdown global**, default **MEP** | Se agrega dropdown en el header de Finanzas. `organizations.settings.usdRateSource` persiste la elección del usuario. |
| **D3** | Narrativa IA | **Aurum generativo con guardrails** (3 capas anti-alucinación) | Feature 6.1 rediseñado: datos duros + Aurum redacta + validación post-output. Log en `finance_narrative_audit`. |
| **D4** | Nombre de la 4ta pestaña | **Escenarios** (en vez de "Proyección") | Se renombró toda referencia en el doc. Route: `/finanzas/escenarios`. |
| **D5** | Orden de implementación | **Secuencial Fase 0 → 5** | Empieza por Fase 0 (tri-moneda + routing) cuando Tomy dé OK. Cada fase se pushea a `main` de forma independiente. |

---

## 12. CÓMO LUCE DE NOCHE (estética)

Siguiendo UI_VISION_NITROSALES:

- **Paleta principal Finanzas:** azul profundo `#1e40af` para revenue, verde `#10b981` para ganancias, rojo `#ef4444` para pérdidas, dorado `#fbbf24` para cash runway (vínculo con Aurum).
- **Gradient de la pestaña activa:** `linear-gradient(90deg, #1e40af, #10b981)` (azul financiero → verde ganancia).
- **Typography:** números siempre en `font-tabular` (Geist Mono) para alineación perfecta en tablas.
- **Cash runway widget:** `box-shadow: 0 0 24px rgba(251,191,36,0.25)` con aura dorada, si está en zona verde. Si entra en naranja o rojo, glow cambia de color.
- **Transiciones:** 240ms cubic-bezier(0.16, 1, 0.3, 1) para cambios entre pestañas y entre monedas.
- **Waterfall animation:** las barras caen de a una al cargar (stagger 80ms). Refuerza causalidad.
- **Narrativa:** tipo serif editorial (no sans), para que se sienta como lectura de un analista, no una tabla.

---

## Fin de la propuesta

Cualquier cosa que quieras ajustar antes de que empiece a implementar, me lo decís.

**Gate explícito:** este plan NO arranca hasta que Tomy dé el OK. No se crea ningún endpoint, no se toca ninguna tabla, no se pushea nada a `main` sin confirmación.

**El comando para que empiece Fase 0:** *"OK, arrancá con Fase 0"* (o equivalente).

**Si querés ajustes primero:** decime qué cambiar y lo integro al doc antes de empezar.
