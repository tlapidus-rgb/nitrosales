---
name: pixel-install-guide
description: Genera la guía de instalación de NitroPixel para un cliente específico, ajustada a su plataforma (VTEX, Tiendanube, Shopify, Magento, custom). Usala cuando Tomy o Claude de Producto necesite "guía para instalar el pixel en [plataforma]", "paso a paso para el cliente", "troubleshooting de pixel", o cuando haya que entregar un documento autoservicio para que el cliente o su dev siga. Produce docs claros, con capturas descritas, validaciones y qué hacer si algo falla.
---

# pixel-install-guide

Produce una guía de instalación de NitroPixel clara, paso a paso, ajustada a la plataforma del cliente. No ejecuta la instalación — entrega el documento que el cliente (o su dev) puede seguir.

## Cuándo se dispara

- "Guía de instalación para [cliente] en [plataforma]."
- "Paso a paso para que el dev del cliente instale el pixel."
- "Troubleshooting: dicen que no ven data."
- "Doc de setup VTEX / Tiendanube / Shopify."

## Plataformas soportadas

- VTEX (método nativo a través de VTEX IO o Checkout UI)
- Tiendanube (script en layout)
- Shopify (app o script en theme.liquid)
- Magento (extension / manual script)
- Custom / headless (React, Next.js, etc.)

## Proceso

1. Cargá docs internos de integración del producto (ver `CONOCIMIENTO_PRODUCTO/INTEGRACIONES.md` si existe).
2. Identificá plataforma del cliente.
3. Capturá credenciales de acceso requeridas (con permiso explícito).
4. Generá la guía con los pasos puntuales de esa plataforma.
5. Incluí validación post-instalación + troubleshooting.

## Estructura de una guía

```markdown
# Guía de instalación NitroPixel — [Cliente] — Plataforma: [X]

## Qué es NitroPixel (30 segundos)
NitroPixel es el pixel propio de NitroSales. Se instala una vez en tu tienda y captura eventos (page view, add to cart, purchase) de manera first-party, sin depender de Meta o Google.

## Qué vas a necesitar
- Acceso admin a tu tienda [plataforma].
- Credenciales de API (si aplica).
- 10-20 minutos.

## Paso a paso

### Paso 1 — Obtener tu Pixel ID
En tu panel de NitroSales, andá a Settings → Pixels → Crear pixel.
Copiá el ID que aparece (formato: `ntp_abc123xyz`).

### Paso 2 — [ajustado por plataforma]
...

### Paso N — Validación
1. Abrí tu tienda en una pestaña nueva.
2. Navegá a 3 páginas (home, producto, carrito).
3. Volvé a NitroSales → Settings → Pixels → Estado del pixel.
4. Deberías ver: "3 events received in the last 60 seconds".

Si ves eso: instalaste correctamente. Si no: ver sección troubleshooting.

## Troubleshooting

### "No veo events llegando"
1. Verificá que el script haya sido guardado en el theme.
2. Verificá que el Pixel ID sea el correcto (sin espacios).
3. Abrí DevTools → Network → filtrá por "nitrosales.com" — deberías ver requests.
4. Si nada de esto funciona, escribime a setup@nitrosales.com con screenshots.

### "Veo events pero los conteos no cruzan con mi tienda"
1. Puede ser diferencia de timezone — verificá que coincidan.
2. Puede haber ads blockers — testear en modo incógnito.
3. Puede haber páginas sin el pixel (checkout custom, landings externos).
4. Correr `data-quality-auditor` skill.

## Contacto

Para soporte de instalación:
- WhatsApp: [número]
- Mail: setup@nitrosales.com
- Tiempo de respuesta: < 4h hábiles.
```

## Detalle por plataforma

### VTEX

**Método recomendado**: VTEX IO app (NitroPixel está publicado como app nativa).

**Alternativa**: inyectar script en Checkout UI (`checkout-ui-custom`) y PDP.

**Pasos clave**:
1. Admin → Apps → Buscar "NitroPixel" → Instalar.
2. Configurar con Pixel ID.
3. Activar en storefront (checkout, catalog).
4. Validar con pixel-validator interno.

### Tiendanube

**Método**: script en layout global + script adicional en página de thanks (confirmación de compra).

**Pasos**:
1. Admin → Configuración → Código en la tienda → Script global.
2. Pegar bloque `<script>` que provee NitroSales.
3. En "Página de agradecimiento" (post-checkout), pegar el bloque de conversion event.
4. Guardar y testear con pedido de prueba.

### Shopify

**Método A — App oficial**: si NitroPixel está en Shopify App Store.
**Método B — Script manual**: editar theme.liquid.

**Pasos (Método B)**:
1. Admin → Themes → Edit code.
2. Abrir `theme.liquid`.
3. Pegar `<script>` de NitroPixel antes de `</head>`.
4. Abrir `checkout.liquid` (si tenés Shopify Plus) o usar Custom Pixel via admin.
5. Configurar conversion event en `thank_you.liquid`.
6. Testear.

### Magento

**Método**: extension oficial de NitroSales (si existe) o script manual en layout XML.

**Pasos (script manual)**:
1. Admin → Content → Design → Configuration → Edit layout.
2. Pegar script en `<head>` del tema.
3. En layout de `checkout_onepage_success`, pegar conversion event.
4. Limpiar cache de Magento.
5. Testear.

### Custom / headless (Next.js, React)

**Método**: SDK de NitroPixel para JS.

**Pasos**:
1. `npm install @nitrosales/pixel` (o equivalente si existe).
2. Inicializar en root del app con Pixel ID.
3. Llamar `nitroPixel.track('purchase', { value, currency, orderId })` en confirm.
4. Testear.

Si no hay SDK oficial, usar endpoint REST directamente:
- `POST https://api.nitrosales.com/pixel/event` con body `{ event, pixel_id, payload }`.

## Principios

1. **Instrucciones literales, no conceptuales**. Cliente que no sea técnico debe poder seguir.
2. **Capturas descritas** (no imágenes — la guía es texto). "Click en el botón 'Guardar' arriba a la derecha" > "clickeá guardar".
3. **Validación al final siempre**. Sin validación, no sabés si instaló.
4. **Troubleshooting explícito**. Los 3-5 problemas más comunes + cómo resolverlos.

## Anti-patrones

- Guía con jerga técnica que el cliente no técnico no entiende.
- "Consultá la documentación oficial de [plataforma]" → nos desprofesionaliza.
- Pasos sin screenshots descritos.
- Ninguna validación al final → cliente piensa que quedó ok cuando no.
- Troubleshooting vago ("si no funciona, escribime").

## Output format

Ver el template de arriba. Adaptar a la plataforma específica.

## Qué preguntar a Tomy / Claude de Producto

- ¿El cliente tiene dev o hay que enviarle guía "humano"?
- ¿La app oficial de la plataforma está publicada o usamos script manual?
- ¿Hay customizaciones específicas en su checkout (headless, one-page custom)?

## Conexión con otras skills

- **Downstream**: `data-quality-auditor` para validar después del install.
- **Downstream**: `implementation-playbook` usa esto en el bloque de Technical setup.
