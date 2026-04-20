# LANDING /finanzas — Finanzas

> **Qué es este archivo**: el texto (copy) completo y canónico de la landing `/finanzas`. Tier 3 — Funcionalidad/panel de NitroSales. Tercera landing de Fase 3 (post /rentabilidad y /productos).
>
> **Alcance**: SOLO texto. No incluye diseño, colores, tipografías, imágenes ni layout. Eso corresponde a `BRAND_VISION.md` (Fase 2B).
>
> **Qué es Finanzas (definición del positioning)**: "P&L tri-currency en vivo + Cash Runway + CAC payback + LTV:CAC + capa de detalle contable configurable." Finanzas NO es un producto con identidad de marca propia — es la **sección del panel** donde el negocio ve el resultado económico en tiempo real, a dos niveles de profundidad: la vista ejecutiva que el dueño entiende en 2 minutos, y la capa de configuración y detalle que el contador (interno o estudio externo) usa para llevar la contabilidad real.
>
> **Tesis central — dos capas, dos audiencias, una sola verdad**: todo negocio vive con dos ángulos sobre sus finanzas. Uno es del **dueño / CEO**: preguntas de resultado ("¿cuánto gané este mes? ¿cuánta plata tengo? ¿estoy creciendo? ¿me alcanza la caja?"). El otro es del **contador / CFO / analista financiero**: preguntas de detalle ("¿los números cuadran con el ERP / los libros? ¿están las cuentas bien imputadas? ¿qué tipo de cambio se aplicó? ¿puedo reconciliar con el extracto del banco? ¿cómo exporto para el estudio?"). Hoy los dos ángulos viven en lugares distintos — el dueño mira un Excel simplificado o pide resúmenes al equipo, el contador trabaja en otro sistema que después se cruza a mano, y los números rara vez cierran al primer intento. Finanzas resuelve ambos en una sola pantalla: **vista simple arriba, capa de detalle configurable abajo**. La misma fuente, dos profundidades.
>
> **Audiencia primaria**:
>
> **Perfil A — Dueño / CEO / director general**. Mira finanzas todas las semanas para saber cómo va el negocio. No quiere saber de plan de cuentas, asientos ni reconciliación — quiere saber **cuánto ganó, cuánto tiene, cuánto le queda antes de que se vuelva un problema**. Lee P&L en modo resumen, mira caja, mira crecimiento vs. mes anterior, mira cuántos meses de runway le quedan. Su tiempo con la pantalla son 3-5 minutos por sesión.
>
> **Perfil B — Contador interno / CFO / analista financiero / estudio contable externo**. Entra todos los días (o cada vez que hay que cerrar un período). Configura el plan de cuentas, imputa categorías, revisa que las ventas estén bien contabilizadas por canal y por moneda, reconcilia con bancos y tarjetas, gestiona ajustes manuales, arma el export para el estudio o para el sistema contable oficial (SAP, Tango, Bejerman, Xero). Su tiempo con la pantalla son 2-3 horas por sesión en cierre, o revisiones puntuales durante el mes.
>
> **Audiencia secundaria**: el **director financiero / CFO fraccional** de empresas que todavía no tienen equipo financiero interno pero ya son lo suficientemente complejas como para necesitar visibilidad ejecutiva con soporte contable sólido.
>
> **Tono**: **ejecutivo-financiero**. Más contenido, menos metáforas. Menos "historias que pasan", más "resultados que se ven". El tono es profesional — como una conversación con un CFO, no con un vendedor. La landing tiene que lucir sólida, confiable, de estándar profesional. Pero simple de leer por el dueño no contador.
>
> **Ángulo narrativo**: hay dos ideas centrales.
> 1. **Simple arriba, exacta abajo**: el dueño entra y entiende sin esfuerzo; el contador entra y tiene la precisión contable que necesita. No son dos herramientas — es la misma con dos vistas.
> 2. **Una sola fuente de verdad**: hoy las finanzas del ecommerce están fragmentadas entre el ERP, Excel, el banco, MELI, VTEX, Shopify, la tarjeta corporativa, el sistema de comisiones. NitroSales las consolida, reconcilia y presenta con multi-moneda resuelta — de ahí salen tanto el P&L del dueño como los papeles del contador.
>
> **Ángulo secundario (configuración como activo)**: lo que otras herramientas ocultan (plan de cuentas, tipos de cambio, reglas de imputación, estructura del export hacia el sistema contable) acá está expuesto y editable por el contador. Es lo que permite que los números del dueño sean **verificables** — si no te cierra algo, abrís la capa de detalle y ves de dónde salió.
>
> **Honestidad obligatoria**:
> - No somos reemplazo del sistema contable oficial (AFIP, libros rubricados, declaración impositiva) ni pretendemos serlo. **No hacemos integración nativa con sistemas contables** (Tango, Bejerman, Xero, QuickBooks, SAP y otros quedan fuera del alcance de NitroSales — eso es foco de ERPs / sistemas contables, no del ecosistema ecommerce). Finanzas es la **capa operativa de lectura y decisión ecommerce**; la contabilidad legal sigue viviendo en el sistema contable del estudio, y NitroSales se limita a **exportar la data en formato que ese sistema contable puede procesar** (CSV / Excel estructurado). El contador carga el export en su sistema; no hay sync en vivo.
> - Los tipos de cambio usados son configurables por el contador (BNA, BCV, tipo de cambio banco, paralelo, contable interno). Se documenta qué se usa y cuándo.
> - Las métricas de CAC payback y LTV:CAC requieren al menos 3-6 meses de data consolidada para ser confiables — se explicita.
> - Los logos/casos reales se mantienen como placeholder hasta tener autorización + medición real.
>
> **Regla explícita**: NO segmentar por facturación. El fit se define por complejidad financiera (multi-canal + multi-moneda + necesidad de reconciliación), no por tamaño.
>
> **Palabras prohibidas** (además de las generales): "poderoso", "potente", "revolucionario", "gestión integral financiera", "solución financiera completa", "inteligencia financiera de última generación". El valor se defiende con ejemplos concretos de reportes generados, reconciliaciones resueltas y decisiones habilitadas.
>
> **Última actualización**: 2026-04-19 — v1.1 Sesión 3 VM — ajuste de scope para alinear con `/integraciones` v1.2: NitroSales NO hace integración en vivo con sistemas contables (Tango, Bejerman, Xero, QuickBooks, SAP quedan fuera del ecosistema ecommerce que cubrimos). Finanzas **exporta en el formato que esos sistemas pueden procesar** — el contador carga el archivo manualmente. Se reemplazó toda mención de "integración contable" / "conector contable" / "vía conector" por "export compatible" / "archivo de export". Versión previa (v1, misma fecha): tercera landing del Tier 3, primera con dualidad explícita dueño / contador.

---

## BLOQUE 1 — HERO

**Eyebrow (arriba del headline)**
FINANZAS · SIMPLE ARRIBA, EXACTA ABAJO

**Headline (H1)**
Los números que entiende el dueño. El detalle que necesita el contador.

**Subheadline (H2)**
P&L en vivo, caja, runway, CAC, LTV — con vista ejecutiva arriba y capa contable configurable abajo. La misma fuente de verdad, dos profundidades.

**Body (1 párrafo)**
Todo negocio mira sus finanzas desde dos ángulos al mismo tiempo. El dueño entra 3 minutos y necesita ver lo esencial: cuánto facturé, cuánto gané, cuánta plata tengo, cuántos meses me dura la caja, cómo vengo vs. el mes pasado. El contador (el interno o el que manda el estudio) entra 2 horas y necesita otra cosa: que las ventas estén imputadas a la cuenta correcta, que los gastos estén bien categorizados, que el tipo de cambio aplicado sea el que corresponde, que los números reconcilien con el extracto del banco, que todo se pueda exportar limpio al sistema contable oficial. Hoy esas dos necesidades viven en lugares distintos — el dueño tiene un Excel simplificado, el contador trabaja en otro sistema, y cuando los números no cierran hay que cruzar a mano. Finanzas resuelve ambas capas en una sola pantalla: **arriba, la vista ejecutiva que se entiende en 2 minutos; abajo, la capa de detalle editable donde el contador configura, imputa, reconcilia y exporta**. Una sola fuente, dos niveles de profundidad.

**CTA primario**
[CTA: Pedí tu demo → abre Calendly]

**CTA secundario**
[CTA: Ver Finanzas en vivo (3 minutos) → abre video demo]

**[VISUAL: pantalla central partida en dos niveles — arriba, dashboard ejecutivo con 4 KPIs grandes (Facturación / Ganancia / Caja / Runway), cada uno con número principal y tendencia. Abajo, drawer expandido "Detalle contable" con tabla de cuentas + columnas de configuración. Entre los dos niveles, un chip "Vista dueño / Vista contador" como toggle. Mensaje visual: "Lo mismo, a dos profundidades".]**

---

## BLOQUE 2 — TRUST STRIP

**Línea única**
Integrado con VTEX · MercadoLibre · Shopify · Tiendanube · Meta Ads · Google Ads · Bancos (API BBVA, Santander, Galicia, Itaú) · Tarjetas corporativas · Export compatible con cualquier sistema contable (Tango, Bejerman, Xero, QuickBooks, SAP y otros — el contador carga el archivo en su sistema, sin integración en vivo).

**Segunda línea**
Ventas, cobros, gastos, comisiones, impuestos, tipos de cambio y pagos — todo se consolida en una sola fuente. El export al estudio contable se arma en minutos, no en días.

**[VISUAL: logos de plataformas financieras en escala de grises + chip "Reconciliación en vivo" + chip separado "Export compatible con tu sistema contable".]**

---

## BLOQUE 3 — LAS CINCO COSAS QUE FINANZAS RESUELVE A DOS NIVELES

**Título de la sección**
Cinco cosas. Dos niveles de profundidad para cada una.

**Bajada**
Cada una de estas cinco cosas se muestra en dos capas. **Vista dueño**: lo que necesitás ver vos en 2 minutos para saber cómo va el negocio. **Vista contador**: la misma cosa con el detalle contable, las categorías, las reglas de imputación y los ajustes manuales — para que quien lleva tus números pueda configurarlo todo sin depender de nosotros.

---

### 1 — Cómo te fue este mes, de verdad (P&L en vivo)

**Vista dueño**
Una pantalla con la ecuación central del negocio:

- **Ingresos netos** del mes (ventas reales, descontando reembolsos, cancelaciones, comisiones de canal e impuestos sobre ventas).
- **Costo de mercadería vendida** (costo real de los productos despachados).
- **Margen bruto** y **margen bruto %**.
- **Gastos operativos** agrupados por bloque: marketing, personal, logística, impuestos, tecnología, otros.
- **EBITDA** y **resultado neto** del período.
- Comparación lado a lado con el mes anterior y con el mismo mes del año pasado. Variaciones destacadas en verde / rojo.

En 2 minutos sabés si fuiste mejor o peor que el mes pasado, y dónde cambió la aguja.

**Vista contador**
La misma información, con la capa contable activa:

- **Plan de cuentas configurable**: el contador define las cuentas y subcuentas según el esquema del negocio (o lo importa del sistema contable oficial).
- **Reglas de imputación**: cada venta, cada comisión, cada gasto se asigna a una cuenta por regla automática (ej: "todo cobro de MercadoLibre → cuenta 4.1.01 Ingresos por MELI"; "toda comisión de MELI → cuenta 5.2.03 Comisiones por ventas").
- **Ajustes manuales y reclasificaciones** con trazabilidad completa (quién lo tocó, cuándo, por qué).
- **Drill-down** desde cualquier línea del P&L ejecutivo hasta la transacción individual que la compone. Si el dueño ve "Ingresos netos $12.400.000" y no le cierra, el contador entra y ve los 1.800 eventos de venta que suman ese número.
- **Período flexible**: mes actual, trimestre, año, YTD, o rango custom (útil para cierres fiscales).

**Un caso real**
*El dueño mira el P&L del mes: ingresos $12.4M, margen bruto 41%, EBITDA $1.9M. Ve que el EBITDA bajó 8% vs. el mes anterior sin razón obvia y pregunta al contador. El contador entra a la misma pantalla, drillea por "Gastos operativos → Marketing" y ve que hubo un pago de agencia de $430k imputado al mes actual que en realidad correspondía al trimestre anterior. Reclasifica con un click (con nota de auditoría), el EBITDA se ajusta, y el dueño tiene la respuesta en 5 minutos.*

**→ La decisión que podés tomar**
El dueño: entiende qué movió el resultado del mes sin esperar el informe del estudio. El contador: mantiene la precisión contable sin exportar a Excel cada vez que hay que verificar algo.

**[VISUAL: pantalla partida — izquierda "Vista dueño" (P&L compacto con 6 líneas + comparativo), derecha "Vista contador" (mismo P&L expandido en plan de cuentas con drill-down visible). Toggle arriba para alternar.]**

---

### 2 — Cuánta plata tenés hoy y cuánto te dura (Caja + Runway)

**Vista dueño**
Una pantalla con el pulso de la caja:

- **Plata disponible hoy**: suma de bancos + billeteras (MercadoPago, PayPal) + efectivo declarado, por moneda y consolidado.
- **Ingresos proyectados próximos 30 días**: cobros de ventas ya cursadas, cobros pendientes de marketplaces.
- **Egresos comprometidos próximos 30 días**: pagos a proveedores pactados, sueldos, alquileres, impuestos con vencimiento.
- **Caja neta proyectada** a 30, 60, 90 días.
- **Runway**: cuántos meses te dura la caja si mantenés el ritmo actual de ingresos y egresos. Si el runway cae debajo de 6 meses, alerta. Si cae debajo de 3 meses, alerta fuerte.

Una sola pregunta respondida: "¿estoy tranquilo con la caja o empiezo a preocuparme?".

**Vista contador**
La caja desarmada a nivel detalle:

- **Extracto consolidado** por cuenta bancaria y billetera, con la última reconciliación registrada.
- **Reconciliación automática** con los extractos del banco importados (API o CSV): la plataforma empareja cada movimiento del banco con el evento contable correspondiente (venta, gasto, transferencia). Los que no emparejan quedan marcados como "pendientes" para revisión manual.
- **Cobros pendientes de marketplace** con fecha esperada de acreditación (MELI paga T+14 por default, VTEX según pasarela, etc.).
- **Órdenes de compra en curso** y **compromisos contables** (facturas emitidas pendientes de cobro, facturas recibidas pendientes de pago).
- **Conciliación bancaria exportable** al formato que pida el estudio contable.

**Un caso real**
*Cierre de abril. El dueño ve: caja disponible $18M, runway 7 meses — tranquilo. El contador entra al detalle y encuentra que hay $1.2M de movimientos bancarios sin reconciliar con eventos contables — la mayoría son comisiones de procesadoras que no tenían regla de imputación. Crea 3 reglas nuevas (una por procesadora), reconcilia masivamente, y el runway se ajusta a 7.2 meses con la caja ahora 100% conciliada. La cifra que el dueño vio de entrada estaba bien en general, pero ahora está respaldada contablemente.*

**→ La decisión que podés tomar**
El dueño: decide si puede invertir, contratar, hacer una campaña fuerte, o si tiene que ajustar gastos. El contador: cierra el mes con todo reconciliado, sin depender de cruzar extractos a mano.

**[VISUAL: dashboard con 3 cards arriba (Plata disponible hoy / Caja neta proyectada 90d / Runway en meses) + línea de tiempo abajo con ingresos y egresos proyectados. En la vista contador, un panel lateral con reconciliación: "1.812 movimientos · 1.789 conciliados · 23 pendientes".]**

---

### 3 — Tu negocio en tres monedas, la cuenta en una (Multi-currency resuelto)

**Vista dueño**
Tres chips arriba de toda la pantalla: **USD / ARS / BRL** (o las que apliquen al negocio). Cambiás el chip y todo el dashboard se re-expresa en esa moneda. Ves tu negocio entero desde cualquiera de las tres perspectivas, sin perder consistencia.

Si vendés en Argentina (ARS), comprás inventario importado (USD) y tenés una operación brasilera (BRL), el P&L en pesos no te cuenta la verdad — porque la inflación y la devaluación te tapan el resultado. Verlo en USD te da la foto real del negocio. Verlo en ARS te da la foto de caja local. Verlo en BRL te da la foto de la operación Brasil. Las tres al mismo tiempo, con un click.

**Vista contador**
La capa de detalle donde multi-moneda deja de ser magia y pasa a ser configuración explícita:

- **Tipos de cambio configurables por política contable**: BNA, BCV, tipo de cambio banco, paralelo (dólar blue), contable interno, o custom. El contador define qué tipo de cambio se aplica a qué tipo de transacción (ej: "importaciones → BNA del día de despacho; ventas retail en USD → BNA del día de venta; gastos en USD → promedio mensual").
- **Fecha de corte del tipo de cambio** para cada transacción: fecha de operación, fecha de cobro, fecha de cierre — según la política.
- **Ajustes por diferencia de cambio** (realizada y no realizada) calculados automáticamente y desglosados por cuenta.
- **Exposición cambiaria** del negocio: cuánto tenés en cada moneda, cuánto estás comprando / vendiendo en cada una, cuál es tu posición neta.
- **Re-expresión retroactiva**: si cambia una política cambiaria, se puede recalcular un período pasado con la nueva regla, manteniendo la versión anterior auditable.

**Un caso real**
*Un negocio argentino con operación en Brasil. Dueño mira el P&L en ARS: ganancia $1.8M en el mes, crecimiento vs. mes anterior +6%. Cambia el chip a USD: ganancia USD 9.200, crecimiento -12%. El peso se devaluó 20% en el mes. La cifra en ARS crecía por efecto cambiario, no por performance real del negocio. El contador valida: el cálculo usó BNA del último día del mes para el stock final, BNA promedio para las ventas, y el resultado USD es el que corresponde al plan contable. El dueño toma una decisión distinta a la que hubiera tomado mirando solo pesos.*

**→ La decisión que podés tomar**
El dueño: ve el negocio como realmente va, sin el ruido del tipo de cambio. El contador: tiene control explícito sobre qué tipo de cambio se aplica a qué transacción, con todo auditable.

**[VISUAL: toggle triple ARS / USD / BRL arriba del dashboard. Gráfico de P&L con las 3 líneas superpuestas (en cada moneda) mostrando divergencia. Abajo, panel "Política cambiaria activa" con las reglas configuradas — visible solo en vista contador.]**

---

### 4 — Cuánto te cuesta un cliente y cuándo lo recuperás (CAC + Payback + LTV)

**Vista dueño**
Tres números grandes que te dicen si el crecimiento es sostenible:

- **CAC** (cuánto te cuesta traer un cliente nuevo, en promedio). Se calcula cruzando la inversión total en adquisición (Meta + Google + MELI Ads + agencias + creators vía Aura + lo que corresponda) con la cantidad de clientes nuevos netos en el período.
- **Payback** (cuántos meses tarda en devolver esa plata). Es el tiempo que pasa desde que gastás los pesos de adquisición hasta que el cliente, con sus compras, deja en el negocio la misma cifra ya limpia de costos.
- **LTV:CAC** (cuánto vale un cliente en toda su vida con vos, dividido por cuánto te costó traerlo). Un ratio arriba de 3:1 es saludable, debajo de 2:1 es una alerta, debajo de 1.5:1 es que estás pagando por crecer.

Tres números que en 30 segundos te dicen si tu motor de crecimiento es rentable o te está comiendo la caja.

**Vista contador**
La misma lógica desarmada por componentes y editable:

- **Definición de "cliente nuevo"** configurable: primera compra en el período, primera compra de toda su historia con el negocio, primera compra en un canal específico — según cómo quiera medirlo el negocio.
- **Inputs del CAC** detallados: qué partidas de gasto entran (Meta Ads, Google Ads, MELI Ads, Aura, agencia, contenido, tooling, salarios del equipo de growth), y cuáles se excluyen. Cada partida con auditoría de origen.
- **Ventana de atribución** configurable (7 días, 30 días, 90 días) — con la definición clara de qué se atribuye a un cliente nuevo.
- **LTV predictivo con modelo estadístico** (BG/NBD + Gamma-Gamma, la referencia académica de Wharton) más un LTV observado por cohorte. El contador ve ambos y elige cuál publicar al dueño según cuán consolidado esté el histórico.
- **Cohortes de clientes** con comportamiento de recompra mes a mes desde la primera compra, para ver si el LTV está mejorando o cayendo con el tiempo.

**Un caso real**
*Dueño ve: CAC $8.400, Payback 4.2 meses, LTV:CAC 3.1:1. Ratio saludable, el negocio crece con rentabilidad. El contador entra al detalle y verifica: el CAC incluye Meta + Google + MELI Ads + Aura + agencia, excluye salarios del equipo (política del negocio: se imputan a OpEx, no a CAC). El LTV predictivo es 4.1x el CAC con 85% de confianza; el LTV observado a 12 meses es 3.1x con data real. Se publica el observado conservador al dueño. Si en una iteración el negocio quisiera cambiar la política (incluir salarios en CAC, por ejemplo), se recalcula transparentemente.*

**→ La decisión que podés tomar**
El dueño: decide cuánto más puede invertir en adquisición, o si tiene que bajar el ritmo. El contador: tiene la cuenta auditada, con cada input declarado y cada supuesto explícito.

**[VISUAL: 3 KPI cards grandes (CAC / Payback / LTV:CAC) con el ratio y la tendencia. Debajo (en vista contador), tabla con los componentes del CAC — partidas de gasto, monto, % del total — y cohort table de LTV observado por mes desde la primera compra.]**

---

### 5 — El estudio contable trabaja con tu data, no contra ella (Export)

**Vista dueño**
Una promesa simple: la conversación con tu contador (interno o externo) deja de empezar con "pasame los números" y empieza con "ya los viste — ¿hacemos el cierre?".

Todo lo que el estudio necesita — libro de ventas, libro de compras, extracto de caja, movimientos bancarios reconciliados, asientos contables sugeridos, conciliación de AFIP — se genera desde la plataforma con un click. El dueño deja de ser el puente que envía Excels los martes.

**Vista contador**
El flujo operativo real — **export**, no integración en vivo:

- **Export en formato compatible con los principales sistemas contables** (Tango, Bejerman, Xero, QuickBooks, SAP y otros). Cada cuenta del plan de Finanzas se puede mapear manualmente a la cuenta equivalente del sistema oficial; el archivo de export queda con la estructura que ese sistema espera, y el contador lo carga desde su lado. NitroSales no hace sync en vivo con sistemas contables — porque esos sistemas no son parte del ecosistema ecommerce que cubrimos.
- **Generación de asientos** a partir de los eventos de negocio (ventas, cobros, gastos, pagos) con la lógica de doble partida ya aplicada. El contador revisa, aprueba y exporta antes de cargar en el sistema contable.
- **Export de libros** (ventas, compras, IVA Ventas, IVA Compras, Retenciones, Percepciones) en los formatos requeridos por AFIP / equivalente regional.
- **Cierre de período** con traba: una vez cerrado un mes, las transacciones de ese período se bloquean contra edición (salvo reapertura explícita con auditoría).
- **Revisión colaborativa**: el contador marca asientos dudosos, deja notas, y el dueño / otro aprobador las revisa antes de cerrar. Todo trazable.
- **API de consulta** para estudios o herramientas que quieran leer los números de Finanzas desde su propio software (ej: llevarlos al sistema de liquidación de sueldos o al de gestión impositiva). Es lectura — no es write-back al sistema contable.

**Un caso real**
*Cierre mensual. El contador entra a Finanzas un lunes a las 10 am, revisa los 18 asientos marcados como "pendientes de reclasificar", aprueba 14 y ajusta 4 con nota. A las 11 am genera el export del libro de ventas, libro de compras y asientos, lo carga en Tango. A las 11:30 am cierra el período en Finanzas (queda bloqueado). A las 12 manda el reporte ejecutivo al dueño. Todo esto antes demandaba 2 días de cruce de planillas entre 3 personas.*

**→ La decisión que podés tomar**
El dueño: deja de ser el cuello de botella entre la operación y el estudio. El contador: cierra los períodos con precisión y en tiempo, sin re-trabajo, con audit trail completo.

**[VISUAL: flujo visual en 3 pasos — Eventos de negocio (ventas / gastos / cobros) → Finanzas (con plan de cuentas + reconciliación + revisión + export asistido) → Sistema contable oficial del estudio (Tango / Bejerman / Xero / etc). Entre Finanzas y el sistema contable, el ícono es "archivo de export" (no una flecha de sync). Chips de logos al final. En el medio, "Cierre asistido" con estado de asientos.]**

---

## BLOQUE 3B — POR QUÉ OTROS NO PUEDEN MOSTRARTE ESTO

**Título**
Simple arriba y exacto abajo solo pasa si la plataforma captura toda la operación, no solo la contabilidad.

**Bajada**
Los sistemas contables tradicionales (Tango, Bejerman, SAP, Xero, QuickBooks) son excelentes en lo suyo — registran asientos, cumplen normativa, generan libros. Pero no ven las ventas en vivo, no ven el CAC, no ven el inventario que se movió esta mañana, no consolidan marketplaces ni canales. Operan sobre asientos ya cargados. El dashboard financiero "ejecutivo" que ofrecen es, en el mejor caso, un recorte del balance.

Las herramientas de ecommerce analytics (Triple Whale, Motion, Polar, Daasity) resuelven bien el lado ejecutivo — dashboards lindos, CAC, LTV, ROAS. Pero no tienen capa contable configurable, no reconcilian con bancos, no generan asientos, no manejan multi-moneda con política cambiaria seria. El contador no las puede usar.

NitroSales no es ninguna de las dos: es la capa intermedia que **consume las dos fuentes a la vez** y las reconcilia. Captura los eventos de negocio en vivo (ventas, gastos, cobros, pagos, movimientos bancarios, comisiones, tipos de cambio) y los procesa con dos salidas: una vista ejecutiva para el dueño y una capa contable editable para el contador. El sistema contable oficial sigue siendo la fuente legal; NitroSales es la **fuente operativa** que alimenta tanto las decisiones como la contabilidad.

---

**Captura la operación completa de forma unificada.**
Todas las ventas de todos los canales, los cobros de todas las pasarelas, los gastos de todas las fuentes (bancos, tarjetas, proveedores), los impuestos, las comisiones, los tipos de cambio. Sin planillas intermedias.

**Aurum razona sobre la data cruzada y sugiere ajustes y explicaciones.**
Cuando el EBITDA baja 8% de un mes al otro, Aurum descompone la variación y te dice exactamente qué cuentas se movieron y por qué. El contador no arranca con "¿qué pasó?" — arranca con "este monto se movió por X y Y, ¿confirma?".

**Bondly (la memoria de tus clientes) alimenta el cálculo de LTV y CAC con data real.**
No es un LTV estadístico calculado sobre una muestra genérica; es el LTV observado de tus clientes reales, segmentado, con cohortes y recompra medida.

**Productos (el inventario consolidado) alimenta el cálculo de COGS sin ambigüedades.**
Cada venta sabe exactamente qué producto se movió, de qué lote, con qué costo unitario. El costo de mercadería vendida deja de ser una estimación que alguien ajusta a fin de mes.

---

**Sin esos cuatro insumos juntos, el dashboard financiero es una ilusión o la contabilidad es un retraso.** Por eso Finanzas es del Tier 3: no es un producto standalone, es el resultado visible de toda la infraestructura trabajando unificada.

**[VISUAL: diagrama con 4 flujos de entrada (operación unificada, Aurum, Bondly, Productos) convergiendo en una pantalla que se divide en dos niveles (dueño arriba, contador abajo). A la derecha, una salida al sistema contable oficial.]**

---

## BLOQUE 4 — CÓMO SE PONE EN MARCHA

**Título**
De fragmentación contable a pantalla única en dos semanas.

**Bajada**
Finanzas es la sección con más setup inicial de NitroSales, porque implica configurar plan de cuentas, reglas de imputación, política cambiaria y el formato de export hacia el sistema contable oficial. La buena noticia: una vez configurado, se mantiene solo. El contador del negocio trabaja con nosotros durante las primeras 2 semanas; después, opera independiente.

---

### Paso 1 — Conectamos bancos y canales (día 1-3)
Se conectan las cuentas bancarias (API o CSV automático), las pasarelas (MercadoPago, PayPal, Stripe), los canales de venta (VTEX, MELI, Shopify) y las plataformas de ads (Meta, Google). El sistema contable oficial (Tango, Bejerman, Xero, QuickBooks, SAP) **no se conecta en vivo** — Finanzas exporta en el formato que ese sistema puede procesar; el contador carga el archivo desde su lado. Cada conexión nativa la hace alguien de nuestro equipo junto al contador del negocio.

### Paso 2 — Configuración contable con el contador (día 3-10)
Sesión colaborativa entre nuestro equipo y el contador del negocio: definir plan de cuentas (importado o desde cero), reglas de imputación, política cambiaria, formato de asientos, estructura del export hacia el sistema oficial. Acá el contador **diseña la configuración** que va a operar por los próximos años.

### Paso 3 — Primer cierre asistido (día 10-14)
Primer cierre mensual con la plataforma en modo asistido — nuestro equipo acompaña al contador en la reconciliación inicial, revisión de asientos y export al sistema oficial. A partir del segundo cierre, el contador opera solo.

**[VISUAL: timeline 3 pasos con mini-screenshots — conectores → configuración del plan de cuentas → primer cierre asistido con checklist.]**

---

## BLOQUE 5 — PARA QUIÉN ES FINANZAS

**Título**
Para el que decide con plata y para el que lleva los números.

**Bajada**
Finanzas es la sección que más explícitamente habla a dos audiencias distintas al mismo tiempo. Si tu negocio tiene a los dos perfiles — dueño que decide con plata y contador (interno o externo) que lleva los números — Finanzas les da una herramienta compartida donde cada uno hace lo suyo sin pisarse.

---

### ✅ Es para vos si sos…
- **Dueño / CEO / director general** que quiere ver el pulso financiero del negocio todas las semanas sin pedírselo a nadie. P&L, caja, runway, CAC, LTV — en 3 minutos.
- **CFO interno** o **director financiero** que necesita la vista ejecutiva arriba y el detalle contable abajo, con una sola fuente de verdad.
- **Contador interno** que hoy gasta horas cruzando extractos bancarios, conciliando marketplaces y preparando Excels para el cierre. La configuración de reglas y reconciliación automática te devuelve tiempo.
- **Estudio contable externo** que atiende a este negocio — entra a la misma plataforma que el cliente, trabaja con el plan de cuentas que ya configuraste, genera export para tu sistema en minutos.
- **CFO fraccional / consultor financiero** que trabaja con múltiples negocios ecommerce — podés dar de alta a varios clientes con configuración propia para cada uno.

### ✅ Y además, tu negocio…
- Vende en **más de un canal** (tu tienda + MercadoLibre como mínimo). La consolidación es donde más se nota.
- Opera en **más de una moneda** (ventas en ARS + compras en USD, o cualquier combinación). La capa multi-currency configurable es diferencial.
- Necesita **reconciliar con bancos** (no solo contar pagos en efectivo). La reconciliación automática elimina un trabajo manual semanal.
- Tiene un **contador o estudio externo** con el que trabajás — Finanzas reduce fricción de comunicación entre el negocio y el estudio.

### ❌ Probablemente no todavía si…
- Operás con **contabilidad muy simplificada** (monotributo básico, sin necesidad de cierres detallados). Una planilla alcanza.
- Tu **sistema contable oficial** resuelve 100% de lo que necesitás y no tenés dashboards ejecutivos fuera de él. Finanzas no reemplaza tu contabilidad legal — la complementa.
- No tenés **multi-moneda ni multi-canal**. El caso de uso se achica y el ROI deja de justificarse.

---

## BLOQUE 6 — PRUEBA SOCIAL (CON HONESTIDAD)

**Título**
Sin promesas sobre números que todavía no medimos.

**Bajada**
Estamos midiendo el impacto de Finanzas en los primeros trials. Los números que vamos a publicar son: tiempo ahorrado al equipo financiero por cierre mensual, % de movimientos bancarios reconciliados automáticamente, cantidad mediana de ajustes contables detectados en el primer trimestre. Mientras tanto, la promesa es metodológica: una sola fuente de verdad con dos capas, configurable por el contador, auditable en cada ajuste.

---

### Mientras tanto, podés validarlo vos mismo
- Pedí la demo trayendo **tu última reunión financiera** (el Excel que mirás vos + el que arma el contador). En 30 minutos te mostramos cómo se verían las mismas cifras en Finanzas, con drill-down del dueño al contador.
- Armamos un **diagnóstico financiero inicial** sobre tu data actual: cuánto tiempo se está gastando en cruzar planillas, cuántos movimientos bancarios están sin reconciliar, cuántas reglas de imputación faltan.
- Te queda el análisis escrito para discutir con tu contador antes de firmar nada.

### Qué vamos a publicar acá cuando haya data
- Horas/mes ahorradas al equipo financiero en cierres y reconciliación.
- % de movimientos bancarios reconciliados automáticamente (baseline típica: 60-80% según estructura del negocio).
- Tiempo medio desde cierre del mes hasta reporte ejecutivo entregado al dueño.
- Cantidad mediana de ajustes / reclasificaciones detectados en el primer trimestre de uso.

**[VISUAL: placeholder "Datos medidos desde mayo 2026 · 3 trials en curso con configuración contable completa". Sin logos inventados, sin cifras fabricadas.]**

---

## BLOQUE 7 — OBJECIONES FRECUENTES

**Título**
Lo que te estás preguntando.

**Bajada**
Siete dudas concretas que aparecen en cada demo financiera. Respuesta directa a cada una.

---

### "¿Esto reemplaza mi sistema contable (Tango, Bejerman, SAP, Xero)?"
No. Tu sistema contable oficial sigue siendo la fuente **legal y normativa** (libros rubricados, cumplimiento impositivo, declaraciones). NitroSales es la fuente **operativa** — consume la data del negocio en vivo y la presenta a dos niveles (ejecutivo y contable). NitroSales **no se integra en vivo** con sistemas contables (quedan fuera del ecosistema ecommerce que cubrimos). Lo que hace sí es **exportar en el formato que tu sistema contable puede procesar**: el contador recibe un archivo listo para cargar en Tango / Bejerman / Xero / QuickBooks / SAP, sin tener que cruzar extractos a mano. Acorta el camino hasta el cierre — no lo automatiza en vivo.

### "Mi contador ya trabaja con el sistema que tiene, no va a usar otra herramienta."
Ese es el escenario más común — y la razón por la que Finanzas se diseñó con el contador en la cabeza. No le pedimos al contador que abandone Tango; le damos una herramienta que **le reduce el 70% del trabajo manual que hoy hace antes de abrir Tango** (cruzar extractos, conciliar marketplaces, categorizar gastos, preparar Excels para el dueño). En los primeros trials, los contadores que más resistían al principio fueron los primeros en pedir que el setup se haga rápido.

### "¿Cómo se maneja la tasa de cambio oficial vs. paralelo en Argentina?"
El contador define la política: puede usar BNA para todo, puede usar BNA para importaciones y tipo paralelo para ciertas transacciones, puede usar un tipo custom (contable interno). Cada regla se documenta y queda auditable. La plataforma no toma decisiones de política cambiaria — las ejecuta según lo que el contador configuró.

### "¿Puedo manejar más de una sociedad / razón social desde la misma cuenta?"
Sí. Cada sociedad tiene su propio plan de cuentas, política cambiaria, cuentas bancarias y estructura de export hacia su propio sistema contable oficial. Se pueden consolidar en un reporte ejecutivo para el dueño que maneja el grupo (con la moneda de consolidación que elija), manteniendo la contabilidad individual de cada entidad.

### "¿Qué pasa si hay un error en los números — se puede corregir?"
Sí. Todo ajuste es trazable (quién, cuándo, por qué). Si un período ya está cerrado, se reabre con auditoría explícita. No hay operaciones destructivas — el historial siempre queda.

### "¿Cómo funciona el cálculo de CAC? ¿Entra todo lo de marketing?"
Es configurable. El contador define qué partidas entran al CAC (ads pagos, agencias, creators, tooling, salarios de growth) y cuáles se excluyen. Cada configuración queda documentada. Si en una iteración el negocio decide cambiar la definición, se recalcula y se publica con nota de cambio metodológico.

### "¿El LTV es estadístico (predictivo) u observado?"
Ambos, y el contador elige cuál publicar. Mostramos el LTV observado por cohorte (basado en comportamiento real de recompra de tus clientes) y el LTV predictivo (modelo BG/NBD + Gamma-Gamma, estándar académico). El predictivo se usa cuando el histórico es corto; el observado cuando hay 12+ meses de data. La diferencia se documenta con intervalo de confianza.

---

## BLOQUE 8 — PRECIO

**Título**
Finanzas es una funcionalidad de NitroSales. Se incluye en los packs que activan la capa financiera.

**Bajada**
Finanzas no se vende standalone. Forma parte de los packs de NitroSales que incluyen el Tier 3 financiero. El costo escala con el **scope** (módulos contratados), el **scale** (cantidad de cuentas bancarias conectadas, canales de venta, sociedades), y la **complejidad contable** (plan de cuentas, multi-moneda activa, estructura de export hacia el sistema oficial).

### Qué incluye Finanzas cuando está activo en tu plan
- **P&L en vivo** con vista ejecutiva + capa contable configurable.
- **Caja consolidada** con reconciliación automática con bancos y pasarelas.
- **Runway proyectado** con alertas por umbral.
- **Multi-moneda** con política cambiaria editable y ajustes por diferencia de cambio.
- **CAC / Payback / LTV:CAC** con inputs configurables y cohortes observadas + LTV predictivo.
- **Plan de cuentas** editable con reglas de imputación automática.
- **Ajustes manuales y reclasificaciones** con auditoría completa.
- **Export compatible con cualquier sistema contable oficial** (Tango, Bejerman, Xero, QuickBooks, SAP y otros — el contador carga el archivo en su sistema, no hay sync en vivo).
- **Export de libros** (ventas, compras, IVA, retenciones) en formatos AFIP / regionales.
- **Cierre de período asistido** con bloqueo post-cierre.
- **Multi-sociedad** consolidable.

**CTA primario**
[CTA: Ver planes completos → abre /precios]

**CTA secundario**
[CTA: Pedí una demo financiera → abre Calendly]

**[VISUAL: tabla compacta de packs con fila destacada "Finanzas incluido en Pack Ejecutivo y Pack Completo".]**

---

## BLOQUE 9 — FAQ

**Título**
Preguntas que nos hacen seguido.

---

**¿Desde cuándo empieza a ver data Finanzas?**
Desde la fecha de conexión. Puede importarse histórico retroactivo si el contador quiere reconstruir meses pasados con la configuración nueva — se hace en el setup.

**¿Qué pasa si un movimiento bancario no se puede reconciliar automáticamente?**
Queda marcado como "pendiente de reconciliación" con sugerencias de emparejamiento (el sistema propone el evento contable más probable según monto, fecha, descripción). El contador confirma, rechaza, o crea una regla nueva para que casos similares se reconcilien automáticamente en el futuro.

**¿Puedo tener usuarios con diferentes niveles de acceso?**
Sí. Hay roles: **Solo lectura ejecutiva** (dueño / CEO — ve vista ejecutiva, no puede editar), **Editor contable** (contador / CFO — configura plan de cuentas, imputa, reconcilia, exporta), **Aprobador de cierres** (quien firma el cierre del período), **Admin** (gestiona usuarios y conexiones). Cada acción queda auditada con el usuario que la hizo.

**¿Finanzas maneja IVA, percepciones y retenciones?**
Sí. Se configura la estructura impositiva del negocio (condición fiscal, jurisdicciones, régimen de percepciones) y la plataforma aplica las reglas a cada transacción. El libro de IVA Ventas, IVA Compras, Retenciones y Percepciones se genera automáticamente con el formato AFIP.

**¿Cómo maneja ventas con facturación diferida (ej: programas de cuotas, post-pago)?**
El ingreso se reconoce según la política contable configurada (devengado vs. percibido). Para programas de cuotas, el contador configura cómo se reconoce cada cuota. Queda documentado y auditable.

**¿Qué pasa con los reembolsos y cancelaciones?**
Se registran como contracargos a la venta original, con trazabilidad completa. El P&L neto refleja el impacto real, no la venta bruta.

**¿Integra con liquidación de sueldos?**
No directamente. El gasto de sueldos se importa del sistema de liquidación (Bumeran, LibreLA, interno) vía export mensual o API. El detalle de cada empleado queda en el sistema de payroll; en Finanzas se ve la partida total imputada a la cuenta correspondiente.

**¿Puedo simular escenarios (ej: "¿qué pasa con mi runway si aumento marketing 30%?")?**
La simulación básica está disponible: ajustar partidas de gasto proyectadas y ver el impacto en caja y runway. Simulación avanzada (con supuestos de crecimiento, LTV, etc.) entra en roadmap — hoy se hace exportando a Excel desde la plataforma.

---

## BLOQUE 10 — CIERRE + CTA

**Título**
Los mismos números, a dos profundidades.

**Subheadline**
P&L, caja, runway, CAC, LTV — con la vista ejecutiva que entiende el dueño y la capa contable que configura el contador. Una sola fuente, dos profundidades.

**Body (1 párrafo)**
El problema no es que las empresas no tengan data financiera — es que cada uno la mira en un lugar distinto, y cuando los números no cierran hay que cruzar a mano. El dueño con su Excel simplificado; el contador con su sistema contable; el equipo de growth con su dashboard de CAC; el banco con su extracto; el marketplace con su liquidación. Cinco fuentes que deberían ser una. Finanzas es esa fuente única, presentada a dos niveles: arriba, lo que necesita ver el dueño — resultado, caja, runway, crecimiento — explicado en lenguaje de negocio; abajo, lo que necesita configurar y operar el contador — plan de cuentas, reglas de imputación, política cambiaria, reconciliación, cierres, exports al sistema oficial. El dueño entra 3 minutos y sabe cómo va. El contador entra 2 horas y cierra el mes. Los dos trabajan sobre la misma verdad.

**CTA primario**
[CTA: Pedí tu demo → abre Calendly]

**CTA secundario**
[CTA: Conocé Rentabilidad → link a /rentabilidad]

**Texto final chico**
¿Más dudas? Escribinos por WhatsApp al [+54 9 11 ....] — te respondemos nosotros, no un bot. Si querés, traé a tu contador a la demo.

**[VISUAL: cierre con gradient NitroSales + pantalla partida (vista dueño arriba / vista contador abajo) + CTAs grandes.]**

---

## FOOTER (compartido con la matriz y las otras sub-landings)

**Navegación**
- Producto: NitroPixel · Aurum · Bondly · Aura · Control de gestión · Marketing digital · Rentabilidad · Productos · Finanzas
- Recursos: Blog · Guías · Comparativas · Changelog
- Empresa: Sobre NitroSales · Founders · Contacto

**Legal**
- Términos · Privacidad · GDPR · LGPD · Status page

**Redes**
LinkedIn · Twitter/X · YouTube · WhatsApp

---

## NOTAS DE IMPLEMENTACIÓN (no van en la landing)

### Elementos que dependen de la próxima iteración
- Los **números concretos del ROI** (% reconciliación automática, horas/mes ahorradas, tiempo a reporte ejecutivo) se publican cuando haya 1 trial con 90+ días de Finanzas activo.
- Los **logos de estudios contables partners** no se publican hasta tener acuerdos firmados.
- La **tabla de planes** del Bloque 8 referencia `/precios` pendiente del Modelo D 2D final post 5 betas.
- Los ejemplos numéricos del Bloque 3 son ilustrativos — en producción se reemplazan por casos reales con autorización.
- Lista de sistemas contables **compatibles con el export** en Bloque 2 refleja el scope técnico planeado. NO es integración en vivo — es formato de archivo que el contador carga manualmente en su sistema. Confirmación caso por caso al onboardear.

### Cross-links obligatorios
- Al inicio (header): linkea a `/` (matriz) y a `/rentabilidad`.
- En Bloque 3B: linkea los activos relevantes (aurum, bondly, productos) explícitamente.
- En Bloque 8: linkea a `/precios` y a `/aurum`.
- En Bloque 10: linkea a `/rentabilidad` (partner natural del Tier 3 — Rentabilidad dice cuánto te deja cada producto, Finanzas dice cómo impacta en el resultado y la caja del negocio).

### Reglas de voz (checklist antes de publicar)
- [ ] Cero signos de exclamación.
- [ ] Cero emojis en body (solo en los ✅ / ❌ del Bloque 5, controlado).
- [ ] Voseo consistente ("pedí", "probá", "configurá").
- [ ] Cero números inventados en prueba social (Bloque 6 con placeholder explícito).
- [ ] Mención honesta de que NO reemplaza al sistema contable oficial (es capa operativa, no legal) — reforzada en Bloque 3B, Objeciones 1, FAQ, y Bloque 10.
- [ ] Mención honesta de que el LTV predictivo requiere historia suficiente y que hay un LTV observado paralelo.
- [ ] Mención honesta de que el contador define la política cambiaria (no la plataforma).
- [ ] CERO segmentación por facturación en Bloque 5 (regla ratificada 2026-04-19).
- [ ] Bloque 3B conecta Finanzas con los activos Tier 1/2 (Aurum, Bondly, Productos) — no queda como "feature aislado".
- [ ] Ejemplos numéricos usan ballpark realista.
- [ ] **Dualidad explícita "Vista dueño / Vista contador" en TODAS las 5 cosas del Bloque 3.** Es la característica distintiva de esta landing.
- [ ] **Voz ejecutivo-financiera** — más profesional y menos narrativa que /rentabilidad y /productos. Tono de CFO, no de vendedor.
- [ ] **Hero deja claro que hay dos audiencias y una sola fuente de verdad.**
- [ ] **Bloque 5 habla explícitamente a los dos perfiles** (dueño + CEO + CFO del lado ejecutivo, contador interno + estudio externo + CFO fraccional del lado operativo).
- [ ] Ningún uso de "poderoso", "potente", "revolucionario", "gestión financiera integral".
- [ ] **Cero promesa de "integración en vivo" con sistemas contables** (Tango, Bejerman, Xero, QuickBooks, SAP). Quedan fuera del ecosistema ecommerce que NitroSales cubre. El framing correcto es **"export en formato compatible"** — archivo que el contador carga manualmente en su sistema. Regla v1.1, alineada con `/integraciones` v1.2.

### Flujo narrativo
Hero (simple arriba, exacta abajo — dos perfiles, una fuente) → Trust Strip (plataformas financieras + contables + bancos + reconciliación en vivo) → Bloque 3 (5 cosas con dualidad dueño/contador en cada una: P&L / Caja + Runway / Multi-moneda / CAC + LTV / Integración estudio) → Bloque 3B (por qué sistemas contables tradicionales y analytics ecommerce por separado no alcanzan — integración con activos NitroSales) → Bloque 4 (setup 2 semanas, 3 pasos, colaborativo con contador) → Bloque 5 (para quién — roles ejecutivos y contables) → Bloque 6 (prueba social honesta con placeholder) → Bloque 7 (7 objeciones: reemplaza sistema contable, resistencia del contador, tipo de cambio AR, multi-sociedad, errores, CAC definición, LTV predictivo vs observado) → Bloque 8 (precio incluido en pack ejecutivo + completo) → Bloque 9 (FAQ — IVA, cuotas, reembolsos, payroll, simulación, reconciliación, permisos) → Bloque 10 (cierre "dos profundidades, una verdad").

### Patrón distintivo vs. /rentabilidad y /productos
Es la **primera landing del Tier 3 con dualidad explícita dueño/contador** en cada bloque de valor. En /rentabilidad el actor central era el dueño interpretando resultado; en /productos eran los dos perfiles operativos (compras + comercial) tomando decisiones semanales. En /finanzas, las dos audiencias conviven en el mismo bloque — lo que ve el dueño y lo que configura el contador, una al lado de la otra. Este patrón se va a replicar en todas las secciones Tier 3 donde aplique (especialmente /control-gestion que también tiene dualidad natural).

### Paralelismo con /rentabilidad y /productos
- **Mismo esqueleto** (Hero → Trust → Bloque 3 cinco cosas → Bloque 3B integración Tier 1/2 → Setup → Para quién → Prueba social → Objeciones → Precio → FAQ → Cierre).
- **Tono distinto**: más profesional-financiero y menos narrativo. El Bloque 3 no usa el flow "Lo que hoy pensás / Lo que en realidad está pasando / Caso real" al pie de la letra — usa un patrón adaptado "Vista dueño / Vista contador / Un caso real / La decisión que podés tomar".
- **Cross-link principal en cierre va a /rentabilidad** (son las dos landings "de resultado" del Tier 3, complementarias).

### Apertura de Fase 3 (actualizada)
Con Finanzas v1 completada, llevamos 3 de las 8 landings del Tier 3. Quedan:
- `/control-gestion` — panel personalizable (diferenciador secundario, también con dualidad dueño/operador).
- `/marketing-digital` — campañas + atribución cross-canal + journeys.
- `/integraciones` — hub de conexiones (diferencial vs Triple Whale Shopify-only).
- `/alertas` — Aurum proactivo (detección de anomalías).
- `/marketplaces` — MELI deep dive.

---

_Última actualización: 2026-04-19 — v1.1 Sesión 3 VM. Scope ajustado: export compatible en vez de integración en vivo con sistemas contables (alineado con `/integraciones` v1.2 — los sistemas contables quedan fuera del ecosistema ecommerce que NitroSales cubre). Próxima iteración post feedback de Tomy._
