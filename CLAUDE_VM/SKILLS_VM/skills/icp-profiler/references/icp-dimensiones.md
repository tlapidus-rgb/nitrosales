# ICP dimensiones — detalle de cada una

Las 8 dimensiones que usa `icp-profiler` para perfilar. Detalle y qué mirar.

## 1. Etapa

**Qué significa**: dónde está el negocio en el ciclo de vida.

- **Ideal**: Post-PMF, con revenue recurrente, equipo mínimo armado, infraestructura básica (tienda, ad accounts).
- **No ideal**: Pre-PMF (todavía validando si vende). Muy maduro (500+ empleados, tesis diferente).

**Cómo detectarlo**: Revenue declarado (si lo sabés), años en mercado (2+), cantidad de empleados (3+), stack activo.

## 2. GMV mensual (gross merchandise value)

**Qué significa**: cuánto dinero pasa por su operación ecommerce al mes.

- **Sweet spot**: USD 150k–500k/mes. Acá el dolor es más agudo: es plata suficiente para justificar herramientas, pero el equipo es chico para armarse un BI interno.
- **Rango aceptable**: USD 50k–1M.
- **Fuera de rango bajo**: <USD 20k → dashboard nativo alcanza.
- **Fuera de rango alto**: >USD 5M → ya puede tener equipo propio de data, negociación custom.

**Cómo estimar sin que te lo digan**: LinkedIn Navigator (tamaño empresa), Similarweb (tráfico web × conversion rate típico categoria), catálogo de productos (tamaño / ticket promedio × órdenes estimadas).

## 3. Canales activos

**Qué significa**: dónde vende.

- **Ideal**: VTEX + MercadoLibre simultáneos, con intención de escalar a más (Instagram Shop, TikTok Shop).
- **Alternativo aceptable**: Tiendanube + ML. Shopify + ML.
- **Flag de riesgo**: Solo 1 canal (solo ML o solo VTEX). El valor de unificar desaparece.
- **No aplica**: 0 canales digitales o solo físico.

## 4. Ad spend mensual

**Qué significa**: cuánto paga en Meta + Google + otros.

- **Ideal**: USD 5k+/mes, con Meta + Google simultáneos.
- **Mínimo viable**: USD 2k/mes. Abajo de eso, el valor de atribución no se ve.
- **Flag**: ad spend = 0 → el pilar de Percepción + Cognición no brilla. Puede entrar si tienen orgánico fuerte + creator-driven, pero el ROAS story no aplica.

## 5. Tamaño de equipo

**Qué significa**: cuántas personas trabajan en la marca.

- **Sweet spot**: 5-15 personas. Suficiente para tener complejidad pero chico para no tener analista dedicado.
- **Aceptable**: 3-25.
- **Flag**: 50+ → suelen tener stack enterprise (Looker, Tableau) y procesos de compra complejos. No los descartamos pero la conversación es diferente.
- **Flag bajo**: 1-2 → founder solo. Puede ser cliente pero el time-to-value de la plataforma es distinto.

## 6. Dolor explícito

**Qué significa**: hayan dicho con sus palabras un dolor que NitroSales resuelve.

- **Ideal**: "No sé si estoy ganando plata" / "perdí tiempo en planillas" / "no sé de dónde vienen las ventas" / "el ROAS de Meta no cierra con mis ventas reales".
- **Aceptable**: dolor adyacente ("crecer con menos equipo", "escalar sin perder control").
- **Flag**: "solo quiero un dashboard bonito" / "lo que tenemos alcanza" → no hay urgencia.

## 7. Stack actual

**Qué significa**: qué usan hoy para analytics / atribución / CRM.

- **Ideal**: planillas + GA4 + el panel nativo de la plataforma. No tienen atribución propia. No tienen customer intelligence.
- **Aceptable**: tienen Klaviyo + planilla propia. NitroSales complementa.
- **Flag**: ya tienen Triple Whale / Northbeam / Polar funcionando bien. Es venta de reemplazo, mucho más difícil.
- **Flag**: no tienen nada y no sienten dolor → convicción de que sirve es baja.

## 8. Disposición a pagar

**Qué significa**: si ya paga SaaS y cuánto.

- **Ideal**: paga >USD 500/mes en stack ecommerce (Klaviyo, Returnly, Gorgias, Shopify Plus/VTEX). Está acostumbrado al cheque mensual SaaS.
- **Aceptable**: USD 100-500/mes total de SaaS ecommerce.
- **Flag**: todo gratis o piratería → conversión baja.

---

## Cómo interpretar los checkmarks

- ✅ En rango ideal.
- ⚠️ En rango aceptable pero no ideal.
- ❌ Fuera de rango / flag de riesgo.

Verdict:
- **ENTRA**: 6+ ✅ y ningún ❌ en dimensiones 2, 3, 4 (GMV, Canales, Ad spend son dealbreakers si están ❌).
- **CONDICIONAL**: 4-5 ✅ o algún ⚠️ en dealbreakers.
- **NO ENTRA**: <4 ✅ o ❌ en dealbreakers.

---

## Notas de segmentación LATAM

Verticales que históricamente encajan bien con NitroSales:

1. **Juguetería + bebé** (caso beta vigente: El Mundo del Juguete).
2. **Indumentaria femenina** (alta frecuencia de compra, ciclo estacional, creator-driven).
3. **Home & deco** (AOV alto, atribución crítica).
4. **Belleza / cosmética** (canal creators fuerte, Aura brilla).
5. **Suplementos / fitness** (recompra predecible, LTV importante).
6. **Electro / tecno** (alto volumen ML, Bondly + Marketplaces).

Verticales con fit más débil:
- Alimentos / gastronomía (logística distinta, suele ir a Rappi/PedidosYa).
- B2B puro / industrial (modelo de ventas diferente).
- Servicios / infoproductos (no tiene SKU físico, Bondly no aplica igual).
