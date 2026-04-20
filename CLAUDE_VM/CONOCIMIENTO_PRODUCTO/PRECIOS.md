# PRECIOS.md — Modelo de pricing (estado: DIRECCIÓN DEFINIDA — VALORES PENDIENTES)

> **Estado actual (2026-04-19)**: Tomy decidió la **dirección estratégica**: pricing **por volumen de data procesada** (Modelo D, descripto abajo). Los **valores numéricos finales** se calibran con data real de los 3 trials en curso. Los Modelos A, B, C quedan archivados como alternativas evaluadas pero descartadas.
>
> **Rationale de la decisión**: cobrar por facturación (Modelo B, % GMV) sonaba a "te cobro caro porque sabés que ganás más" — manda el mensaje incorrecto. Cobrar por data procesada manda el mensaje correcto: "procesamos infraestructura e IA; a mayor volumen de data, mayor costo real, por eso cobramos más". Honesto, defendible, alineado con categoría AI Commerce Platform.
>
> **Regla**: Claude VM nunca inventa precios numéricos. Si un prospect pregunta "cuánto sale", la respuesta es: "El modelo es por volumen de data procesada — te pedimos algunos inputs (órdenes/mes, SKUs, integraciones conectadas) y te damos un número cerrado. Queremos primero validar que el producto te resuelva el dolor, y después hablamos del número."

---

## Modelo D — Pricing 2D: Módulos contratados × Volumen de data procesada (DIRECCIÓN ELEGIDA, 2026-04-19)

### Cómo funciona (modelo en 2 dimensiones)

El precio se forma por **dos determinantes independientes** que se combinan:

**Dimensión 1 — SCOPE: qué módulos contrata el cliente**
Determina qué hace la plataforma por el cliente. Similar a Salesforce Clouds o HubSpot Hubs: el cliente no paga por lo que no usa.

**Dimensión 2 — SCALE: cuánta data procesa la plataforma por ese cliente**
Determina cuánto cuesta realmente operar. A mayor volumen de órdenes, SKUs, integraciones, eventos pixel y uso de IA, mayor costo real de infra/IA/storage, y por lo tanto mayor precio.

**Precio = f(Scope × Scale)**

### Dimensión 1 — Scope: Packs vs À la carte

**Opción 1 recomendada (para arrancar): Packs predefinidos**

Simplicidad de presentación alta, 3 packs cubren 90% de los casos:

| Pack | Qué incluye | Para quién |
|---|---|---|
| **Activación** | Control de Gestión personalizable + Finanzas básico + 1 módulo a elegir (NitroPixel o Bondly) | Retailer que arranca, sin stack armado, quiere el panel mínimo viable |
| **Crecimiento** | Control de Gestión + Finanzas + Marketing Digital + NitroPixel + Productos + Rentabilidad | Retailer en expansión con ad spend activo y multi-SKU |
| **Completo** | Todos los módulos + IA Aurum + Bondly + Aura + Marketplaces + integraciones ilimitadas | Retailer consolidado multicanal que quiere la plataforma entera |

**Opción 2 (flexibilidad avanzada, para casos grandes o partners): À la carte**

Cliente compone su plan módulo por módulo. Cada módulo tiene su precio base + su multiplicador de volumen. Se ofrece en situaciones donde:
- Enterprise quiere negociar específicamente (no quiere pagar lo que no usa).
- Partner (agencia) revende solo NitroPixel a sus clientes.
- Cliente avanzado ya tiene herramientas para algunos módulos y solo necesita partes.

**Módulos contratables individualmente**:

| Módulo | Qué entrega | Cost driver principal |
|---|---|---|
| **Control de Gestión** (incluido en todos los packs como base) | Panel personalizable, cross-data de todo el ecosistema | usuarios + integraciones |
| **NitroPixel** | Pixel first-party, atribución multicanal, Truth Score | eventos pixel/mes + integraciones ad platforms |
| **Marketing Digital** | Campañas unificadas Meta + Google, funnel, journeys | ad spend trackeado + eventos |
| **Productos** | Catálogo unificado VTEX+MELI+otros, inventario, rotación | SKUs activos |
| **Rentabilidad / Comercial** | P&L por SKU, márgenes, cross-sell, re-pricing | SKUs + órdenes/mes |
| **Marketplaces (MELI deep)** | Reputación, publicaciones, conciliación MELI | órdenes MELI/mes + publicaciones |
| **Finanzas (P&L tri-currency)** | P&L dual, Cash Runway, CAC payback, LTV:CAC | órdenes/mes + integraciones contables |
| **Bondly** (CRM + LTV) | Segmentación, LTV predictivo BG/NBD, churn risk | clientes únicos trackeados |
| **Aura** (creator economy) | Deals, attribution, Always On, dashboards públicos | creators activos + órdenes atribuidas |
| **Aurum** (IA con memoria) | Chat IA con 12 tools, 3 modos (Flash/Core/Deep) | queries IA + modo usado (Deep = 10-50× Flash) |

### Dimensión 2 — Scale: Volumen de data procesada

Inputs que el cliente declara en onboarding. El multiplicador de escala se aplica al precio base del pack/módulos elegidos:

| Input | Por qué pesa en el costo real |
|---|---|
| **Órdenes procesadas/mes** (suma todos los canales) | Cada orden dispara atribución, margen, update LTV, procesamiento pixel |
| **SKUs activos en catálogo** | Storage + procesamiento de inventario + unificación multicanal + cálculo rentabilidad |
| **Integraciones conectadas** | Cada integración = infra viva (webhooks, syncs, rate limits, reconciliación) |
| **Volumen de eventos pixel/mes** | Ingesta, storage, procesamiento de atribución (escala cuadrático con tráfico) |
| **Usuarios con acceso a dashboard** | Storage sesiones, permisos, cómputo de vistas personalizadas |
| **Uso de IA (Aurum)** — queries × modo | Costo real de inferencia. Deep = 10-50× Flash |

### Estructura de pricing (template para llenar con valores reales)

```
Precio mensual en modo Pack:
  Precio = PackBase(pack elegido) × MultiplicadorEscala(inputs declarados)

Precio mensual en modo À la carte:
  Precio = Σ (ModuleBase_i × ModuleScaleMultiplier_i) para cada módulo contratado

Donde:
- PackBase: precio fijo del pack (Activación / Crecimiento / Completo)
- MultiplicadorEscala: función de (órdenes/mes, SKUs, integraciones, eventos pixel, users, uso IA)
- ModuleBase_i: precio base de cada módulo individual
- ModuleScaleMultiplier_i: ajuste por volumen específico de ese módulo

Ejemplo Pack (valores placeholder, NO confirmados):
Cliente chico, Pack Activación:
  PackBase = USD X
  × Multiplicador (500 órdenes/mes, 200 SKUs, 2 integraciones, Aurum Flash bajo)
  = USD ~100-300/mes

Cliente grande, Pack Completo:
  PackBase = USD Y
  × Multiplicador (20.000 órdenes/mes, 5.000 SKUs, 8 integraciones, Aurum Deep alto)
  = USD ~2.000-5.000/mes

Ejemplo À la carte:
Agencia que solo quiere NitroPixel para sus clientes:
  NitroPixelBase + multiplicador por eventos pixel
  = USD ~X-Y/mes por cliente gestionado
```

### Cómo se presenta al prospect (script en 2 pasos)

**Paso 1 — definir scope (qué módulos)**:
> "Primero miramos qué necesitás. Tenés tres opciones: el Pack Activación si querés el panel mínimo y control financiero básico; el Pack Crecimiento si ya corrés ads activos y querés medirlos en serio; o el Pack Completo si querés la plataforma entera (incluye IA, CRM, creators, marketplaces). Si lo tuyo es específico, también lo armamos à la carte."

**Paso 2 — definir scale (cuánto volumen)**:
> "Después te pregunto 4 cosas para calibrar el número: ¿cuántas órdenes procesás por mes entre todos los canales? ¿Cuántos SKUs activos tenés? ¿Cuántas integraciones vas a conectar? ¿Cuánto vas a usar el asistente IA? Con eso te armo un número cerrado, sin sorpresas."

**Por qué esto funciona mejor que "por facturación"**:
- Honesto (el costo que te cobramos refleja el costo real que tenemos).
- Predecible (el cliente conoce sus inputs antes de firmar).
- Defendible (a mayor uso, mayor valor → mayor precio con justificación).
- No castiga el éxito (si vendés más por mejor marketing, no pagás más automáticamente — solo si eso genera más órdenes / tráfico / SKUs activos).

### Ventajas del Modelo D 2D

- **Narrativa limpia**: "cobramos por lo que usás y por lo que procesamos." Se alinea con la categoría AI Commerce Platform.
- **Auto-segmentación por ambos ejes**: un cliente chico con pocas funciones paga poco (scope chico × scale chico); un cliente grande con todas las funciones paga proporcionalmente (scope completo × scale alto). No necesitamos filtrar ICP por tamaño.
- **Upsell natural en 2 vectores**: podemos crecer el ticket del cliente (a) agregándole módulos (ej: suma Aura cuando lanza programa de creators), o (b) su propio crecimiento hace que el scale multiplier aumente. Doble motor de expansion revenue.
- **Predecibilidad para el cliente**: los inputs se declaran una vez, el precio se recalibra solo cuando esos inputs cambian significativamente.
- **Alineación con costo real**: la mayoría de los inputs efectivamente corresponden a costo compute/storage/IA real.
- **Flexibilidad para partners**: agencias pueden revender NitroPixel puro à la carte a sus clientes, sin forzar el pack completo.

### Desventajas / riesgos del Modelo D 2D

- **Fricción en la cotización**: requiere un paso de discovery para dar el número (vs. SaaS tier que se lee en la página). Mitigable con calculadora pública.
- **Complejidad de presentación**: dos dimensiones es más difícil de explicar que una sola. Hay que tener un script claro.
- **Requiere calculadora**: hay que construir una tool interna o una landing con calculadora para que el prospect pueda estimar él mismo.
- **Calibración inicial difícil**: sin data de referencia, los coeficientes iniciales son tentativos. Hay que estar dispuesto a ajustarlos después de los primeros 10-20 clientes.
- **Riesgo de "cherry picking"**: clientes avanzados podrían elegir solo el módulo más barato y pedir integraciones extras gratis. Hay que definir bien qué incluye cada módulo desde el día 1.

### Qué falta para activar el Modelo D 2D

- [ ] Medir consumo real de los 3 trials durante 60-90 días: órdenes procesadas, eventos pixel ingestados, queries a Aurum, costo compute real de Vercel + DB + OpenAI/Anthropic.
- [ ] Definir composición exacta de los 3 packs (Activación / Crecimiento / Completo) con qué módulos incluye cada uno, sin superposiciones ambiguas.
- [ ] Armar fórmula PackBase + MultiplicadorEscala con esos números + margen objetivo.
- [ ] Definir precios base individuales de cada módulo para modo À la carte.
- [ ] Construir calculadora interna (Excel primero, landing después) para cotizar en discovery.
- [ ] Probar la fórmula con 3-5 prospects para ver si el número cierra con su expectativa.
- [ ] Decidir valores finales y publicar en landing (o mantener behind-the-wall: "pedí tu cotización").

### Decisiones complementarias (independientes del modelo)

| Dimensión | Decisión |
|---|---|
| **Setup fee** | No. Onboarding incluido (ayuda adopción en beta). Reevaluar cuando haya más volumen. |
| **Contrato** | Mensual cancelable. Anual con descuento cuando producto esté más maduro (6+ meses). |
| **Trial** | No trial gratuito. Paid pilot 30 días con money-back si no se usa. Los 3 trials actuales son excepción previa a decisión de pricing. |
| **Overage** | No aplica en este modelo (el precio se recalibra automáticamente cuando los inputs cambian significativamente). Comunicación proactiva si el uso de IA se dispara. |
| **Descuentos** | Beta program (clientes actuales): 30-50% off durante 6-12 meses como reconocimiento de que nos ayudaron a pulir. Luego pricing normal. |

---

---

## Modelos candidatos evaluados (ARCHIVADOS — no se eligieron)

> Los siguientes modelos A, B y C se evaluaron antes de decidir el Modelo D. Se mantienen en el archivo como referencia del razonamiento, pero **NO son la dirección actual**. Si algún día el Modelo D no funciona y se pivotea, estos modelos son los candidatos de rescate.

### Modelo A — SaaS mensual por tier

**Cómo funciona**: Precio fijo mensual según tier. Tiers definidos por volumen (ej: GMV mensual, número de órdenes, o eventos de pixel).

**Ejemplo estructura** (valores placeholder, NO confirmados):
- **Starter**: hasta GMV USD 50k/mes → USD X/mes.
- **Growth**: hasta GMV USD 200k/mes → USD Y/mes.
- **Scale**: hasta GMV USD 1M/mes → USD Z/mes.
- **Enterprise**: > GMV USD 1M/mes → quote custom.

**Ventajas**:
- Predecible para el cliente.
- Fácil de comunicar ("entre USD X y Y al mes").
- Modelo más familiar para founders.

**Desventajas**:
- Cliente pequeño con alto uso paga menos que lo que cuesta servir.
- Cliente grande con bajo uso puede sentir que paga de más.
- Los tiers rígidos generan fricción al momento de subir.

**Cuándo elegir este modelo**: si querés optimizar para **simplicidad comercial** en early stage.

---

### Modelo B — % sobre GMV procesado

**Cómo funciona**: un porcentaje del GMV que pasa por los canales conectados (VTEX + ML + otros futuros).

**Ejemplo estructura** (valores placeholder, NO confirmados):
- **A%** del GMV tracked por NitroSales mensualmente.
- Piso mínimo: USD X/mes (para cuentas chicas).
- Techo / cap: USD Y/mes (para cuentas grandes, evita castigar el éxito).

**Ventajas**:
- **Escala con el valor**: si el cliente crece, vos también. Si baja, vos también (alineación de incentivos).
- Barrera de entrada muy baja para empezar — ideal early stage.
- Mensaje comercial fuerte: "te cobramos solo cuando vendés."

**Desventajas**:
- Variable: difícil para el cliente presupuestar.
- Difícil para vos proyectar ingresos predecibles.
- Requiere contrato que defina claramente qué es "GMV tracked" (órdenes, devoluciones, cancelaciones).

**Cuándo elegir este modelo**: si querés optimizar para **adopción rápida en early stage** y tenés estómago para ingresos variables.

---

### Modelo C — Híbrido (base + % GMV)

**Cómo funciona**: Tarifa base fija mensual (bajo valor) + % variable del GMV arriba de cierto umbral.

**Ejemplo estructura** (valores placeholder, NO confirmados):
- **Base mensual**: USD X/mes (cubre infraestructura mínima).
- **+ A%** del GMV por encima de USD Y/mes.
- **Cap total**: USD Z/mes (después de ese techo, no escala más).

**Ventajas**:
- Combina predictibilidad + alineación de incentivos.
- El base cubre tu costo fijo (infra, IA, soporte). El variable es upside.
- Mensaje comercial: "una parte chica fija + algo variable que se mueve con vos".

**Desventajas**:
- Más complejo de explicar (hay que aclarar dos variables).
- Riesgo de que el cliente mire solo el base y se olvide del variable.
- Documentación más detallada en el contrato.

**Cuándo elegir este modelo**: si querés lo mejor de los dos anteriores y tu producto ya tiene suficiente madurez para justificar el cobro fijo.

---

## Dimensiones a definir independiente del modelo

Cuando Tomy tome decisión, estas son las preguntas que hay que resolver:

### 1. ¿Qué incluye el precio?
- [ ] Todos los activos (NitroPixel, Aurum, Bondly, Aura) incluidos por default.
- [ ] O algunos activos como add-ons opcionales (ej: Aura con costo aparte por ser creator economy).
- [ ] Todas las integraciones incluidas.
- [ ] Costo de IA (Aurum, narrative engine) incluido.

**Recomendación default**: todo-incluido en el primer tier. Complejidad de unbundling no justifica en early stage.

### 2. ¿Hay setup fee?
- [ ] Cobrar USD X por onboarding (cubre el tiempo humano de arranque).
- [ ] O setup gratis para acelerar adopción.

**Recomendación default**: setup gratis en beta. Considerar fee cuando haya capacidad operativa para hacer onboarding escalable.

### 3. ¿Contrato mensual o anual?
- [ ] Mensual cancelable.
- [ ] Anual con descuento.
- [ ] Ambos como opciones.

**Recomendación default**: mensual cancelable en beta. Ofrecer anual con descuento cuando el producto esté más maduro.

### 4. ¿Trial gratuito?
- [ ] Sí, X días gratis.
- [ ] No, pero con garantía de satisfacción (money-back).
- [ ] Ni uno ni el otro — paid pilot directo.

**Recomendación default**: no trial gratuito en esta etapa — requiere muchos recursos y el producto es profundo. Offer: paid pilot de 30 días con posibilidad de salir limpio si no se usa.

### 5. ¿Overage charges?
Si el cliente supera el tier, ¿cobramos extra automático o le bumpeamos al siguiente tier?
- [ ] Auto-bump al siguiente tier con aviso.
- [ ] Notificación proactiva + conversación.
- [ ] Overage lineal (cobramos proporcionalmente lo que pase el techo).

**Recomendación default**: notificación proactiva + conversación. Genera relación, evita sorpresas en el invoice.

---

## Benchmarks de competencia (para referencia, NO copiar)

**Nota**: estos valores son a modo de referencia de rango de mercado. No son fuente para responder preguntas comerciales — son solo para calibrar internamente.

| Producto | Modelo | Tier SMB | Tier Growth | Tier Enterprise |
|---|---|---|---|---|
| Triple Whale | SaaS tier | ~USD 129/mes | ~USD 299/mes | Custom |
| Polar Analytics | SaaS tier | ~USD 175/mes | ~USD 550/mes | Custom |
| Northbeam | SaaS tier | ~USD 1000/mes | ~USD 2500/mes | Custom |
| Klaviyo | % lista + emails | Free hasta 250 contactos | Desde USD 45/mes | Custom |
| Impact.com (creators) | % comisión procesada | — | Custom | Custom |
| Nubimetrics | SaaS tier | ~USD 50/mes (ARS) | ~USD 150/mes (ARS) | Custom |

**Lectura**:
- SaaS tier USA para SMB ecommerce: USD 130-300/mes parece ser el rango cómodo.
- LATAM paga menos: Nubimetrics está en 50-150 USD.
- NitroSales apunta al rango de "Shopify app premium" / "herramienta seria": USD 150-500/mes parece sweet spot inicial para SMB LATAM.
- Top tier (enterprise): USD 1000+/mes razonable cuando haya clientes de GMV grande.

**Sin embargo**: el pricing no se define copiando. Se define en función de **cuánto valor entregás** y **cuánto puede pagar tu target**. Fuera del rango LATAM-realista vas a fallar en adopción.

---

## Cómo responder preguntas de precio mientras no haya pricing público

### "¿Cuánto sale?"
> "Estamos definiendo el modelo con los primeros clientes beta. Lo que te puedo contar es que será un pricing alineado al valor que el producto te genera — no cobramos setup, no hay contrato largo forzado, y tiene que cerrarte por ROI. ¿Podemos primero ver si el producto resuelve tu dolor, y de ahí hablamos número?"

### "¿Más barato que Triple Whale?"
> "La comparación directa no es justa porque cubrimos cosas distintas. En el rango general, apuntamos a ser **asequible para SMB argentino**, no precio USA. Cuando tenga el número cerrado te lo comparto."

### "¿Pueden hacer un descuento para beta?"
> "Sí — los clientes que entran en este momento tienen condiciones de programa de adopción temprana. Eso incluye precios más flexibles y acceso directo al equipo. La contrapartida es que nos ayudan a pulir el producto."

### "¿Contrato anual con descuento?"
> "Hoy no estoy haciendo anuales porque el producto evoluciona semana a semana y no quiero bloquearte en algo que va a crecer. Cuando haya 6 meses de producto estable, veré tener planes anuales con descuento."

---

## Notas para Claude VM

- **Modelo elegido**: Modelo D (por data procesada). Siempre explicar ese modelo al prospect.
- **NUNCA** decir un número de pricing (cifras USD/ARS) en ningún output (landing, email, deck, propuesta comercial) hasta que Tomy calibre los coeficientes con data de los 3 trials.
- Si Tomy pide "armame un pricing page para la landing" con valores: parar, recordar que los coeficientes no están calibrados, y pedir data real antes de escribir números.
- El script de presentación al prospect (sección "Cómo se presenta al prospect" arriba) sí se puede usar ya — no incluye cifras, solo explica el modelo.
- Cuando Tomy calibre los coeficientes, este archivo se actualiza primero con los valores reales + fecha. Después se puede usar en outputs comerciales.
- Pricing es **decisión estratégica**, no tarea de redacción. La única parte de redacción que yo hago es ayudarlo a **ordenar los trade-offs** y a **armar la narrativa** (este archivo), no inventar el número.

---

## Espacio para la decisión final (se completa cuando Tomy defina)

```markdown
### Decisión de pricing — YYYY-MM-DD

**Modelo elegido**: [A / B / C]

**Estructura final**:
- [valores reales]

**Condiciones**:
- Contrato: [mensual / anual]
- Setup fee: [sí USD X / no]
- Trial: [sí X días / no]
- Money-back: [sí / no]
- Descuentos aplicables: [ninguno / beta / anual / partner]

**Rationale de la decisión**: [por qué este modelo y no otros]

**Próxima revisión**: [fecha sugerida para revisar pricing con data real]
```
