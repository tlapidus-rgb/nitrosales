# NitroPixel — Logica de Atribucion (CORE PROTEGIDO)

> **PROHIBIDO MODIFICAR** esta logica sin autorizacion explicita del fundador.
> Esta documentacion describe el nucleo de NitroSales: como se detectan, vinculan y atribuyen las ventas.
> Cualquier cambio en estos archivos o en esta logica requiere aprobacion previa.

---

## Fecha de estabilizacion: 26 de Marzo de 2026

## Archivos protegidos

| Archivo | Funcion |
|---------|---------|
| `src/lib/pixel/attribution.ts` | Motor de atribucion: touchpoints, modelos, exclusion de pasarelas |
| `src/app/api/pixel/script/route.ts` | Script del pixel que corre en el browser del comprador |
| `src/app/api/webhooks/vtex/orders/route.ts` | Webhook que recibe ordenes de VTEX y ejecuta el match |
| `src/app/api/metrics/pixel/route.ts` | API del dashboard del pixel (queries de ordenes en vivo, revenue, etc.) |

---

## Como funciona la atribucion (en palabras simples)

### Dos fuentes de datos

1. **Browser (pixel script)**: Corre en la pagina de la tienda. Detecta de donde vino el usuario (Meta, Google, directo, etc.), que paginas vio, y si llego a la pagina de confirmacion de compra. Esto se guarda en `pixel_events`.

2. **Webhook de VTEX**: VTEX avisa cuando entra una orden nueva (numero de pedido, monto, estado, productos). Esto se guarda en `orders`.

### El match (vinculacion)

Cuando llega un webhook de VTEX con una orden nueva:
- El sistema busca si puede vincular esa orden con un visitor del pixel (por email, IP, etc.)
- Si encuentra el match, mira todos los touchpoints que ese visitor tenia en el browser y crea la atribucion
- Si NO encuentra el match, la orden queda en el sistema pero sin atribucion

### Ordenes en vivo del pixel

La seccion "Ordenes en Vivo" muestra TODAS las ordenes web (no marketplace), usando `orders LEFT JOIN pixel_attributions`:
- Ordenes con match: muestran el journey completo con touchpoints y atribucion al canal
- Ordenes sin match: aparecen con badge "Sin atribuir" — la venta se cuenta, pero no se sabe por que canal vino

### Revenue por canal y metricas de atribucion

Las metricas de revenue por canal, ROAS, revenue diario, etc. se calculan desde `pixel_attributions`. Esto significa que solo incluyen ordenes que se pudieron vincular con un visitor. La cobertura actual es ~95%.

---

## Logica critica que NO se debe modificar

### 1. Deduplicacion de webhooks (webhook handler)
VTEX envia webhooks en cada cambio de estado (PENDING → APPROVED → INVOICED → etc.). El sistema usa un check `isNewOrder` para procesar atribucion, PURCHASE events, CAPI e incremento de contadores solo la PRIMERA vez que ve una orden. Los webhooks subsiguientes solo actualizan el status.

### 2. Exclusion de pasarelas de pago (attribution.ts)
Los redirects de pasarelas de pago (MercadoPago, GoCuotas, Payway, TodoPago, Decidir, etc.) NO se cuentan como fuentes de trafico. Cuando el usuario vuelve a la tienda despues de pagar, el referrer de la pasarela se ignora y se preserva el touchpoint anterior legitimo.

Lista completa de pasarelas excluidas:
- mercadopago.com, mercadolivre.com, payway.com, todopago.com
- decidir.com, sps-decidir.com, prismamediosdepago.com
- naranjax.com, rapipago.com, pagofacil.com
- paypal.com, stripe.com, checkout.vtex.com, vtexpayments.com
- mobbex.com, getnet.com, payu.com, gocuotas.com

### 3. Touchpoints por sesion (attribution.ts)
Un touchpoint = un cambio de canal por sesion, no por evento. Si un usuario ve 10 paginas en la misma sesion desde Google Organic, eso es 1 solo touchpoint.

### 4. Ordenes marketplace excluidas del pixel
Las ordenes de marketplace (ej: Banco Provincia, MercadoLibre) se excluyen de toda la seccion del pixel con `trafficSource IS DISTINCT FROM 'Marketplace'`. No tiene sentido trackearlas porque la compra ocurre fuera del sitio.

### 5. Regex en template literals del pixel script
Las expresiones regulares dentro de `generatePixelScript()` usan `\\\\/` (doble escape) porque estan dentro de un template literal de JavaScript. `\\/` produce `//` que JavaScript interpreta como comentario y rompe el script entero. Este bug fue la causa raiz de que el pixel no funcionara.

---

## Deploys del 26 de Marzo de 2026

| Commit | Descripcion |
|--------|-------------|
| `36bca77` | Fix critico: regex en template literal del pixel script. El script no ejecutaba en el browser. |
| `91d79f5` | Deduplicacion de webhooks: `isNewOrder` check evita procesar atribucion multiple veces por orden. |
| `f860403` | Exclusion de pasarelas de pago: MercadoPago, Payway, TodoPago, etc. no cuentan como referral. |
| `ecf429d` | GoCuotas agregado a la lista de exclusion de pasarelas. |
| `aa6ef19` | Ordenes en vivo: LEFT JOIN para mostrar ordenes no atribuidas con badge "Sin atribuir". |

### Validaciones realizadas

Se hicieron 5 compras de prueba de $500 cada una para validar la atribucion:
1. Google Ads (gclid) → atribuida a `google/cpc` ✓
2. Meta Ads (fbclid) → atribuida a `facebook/paid` ✓
3. Google Organic → atribuida a `google/organic` ✓
4. Direct (pre-fix pasarelas) → mostraba `mercadopago.com.ar/referral` ✗ → corregido
5. Direct (post-fix pasarelas) → atribuida a `direct` ✓

---

## Regla de oro

> La fuente de verdad para la atribucion es el browser (el pixel). El webhook de VTEX trae la orden
> y busca si el pixel tiene el recorrido del comprador. Si lo encuentra, crea la atribucion con los
> touchpoints del browser. Si no lo encuentra, la orden aparece como "sin atribuir" pero no se pierde.
