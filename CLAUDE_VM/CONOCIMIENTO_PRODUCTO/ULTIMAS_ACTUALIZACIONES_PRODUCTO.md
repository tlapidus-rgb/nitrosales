# ULTIMAS_ACTUALIZACIONES_PRODUCTO.md — Changelog comercial de NitroSales

> **Propósito**: Registro de cambios del producto filtrado por **relevancia comercial**. No es el changelog técnico (eso vive en `CLAUDE_STATE.md` del lado Producto). Acá solo entra lo que mueve la aguja para ventas, marketing o comunicación.
>
> **Cómo se actualiza**: Al inicio de cada sesión VM, se corre un sync pass contra el repo de Producto. Si hay commits nuevos desde el último SHA registrado en `HISTORIAL_SESIONES_VENTAS_MARKETING.md`, Claude VM los destila y agrega una entrada nueva arriba.
>
> **Último SHA sincronizado**: `6441ec25d8c1ba2632fc5836d723ae74e299b2d9` (cierre de Sesión 42 de Producto — 2026-04-18).

---

## Cómo leer este changelog

Cada entrada tiene:
- **Fecha + sesión Producto + SHA** al que pertenece.
- **Lo que cambió** en lenguaje comercial (no técnico).
- **Implicancia** para ventas/marketing (qué nuevo argumento, qué objeción se resuelve, qué hay que comunicar).
- **Status de comunicación**: si ya se comunicó externamente (landing, newsletter) o está pendiente.

---

## 2026-04-18 — Sesión 42 Producto — P&L Pulso Fase 1 — SHA `6441ec25`

### Lo que cambió

Se lanzó la primera fase de **P&L Pulso**, la sección de Finanzas reimaginada como dashboard conversacional, no como planilla tradicional.

Lo concreto:
- **Hero de Cash Runway** arriba de todo — cuántos meses de caja quedan al ritmo actual.
- **Marketing Financiero integrado** — spend total, blended ROAS, CAC y margen post-marketing en el mismo lugar.
- **Sparkline de 12 meses** — evolución del P&L mes a mes de un vistazo.
- **Costos YTD** con breakdown por categoría.
- **Narrative engine** — genera un resumen en lenguaje natural del estado del mes ("estás vendiendo bien pero la devaluación se comió el margen"). Usa Anthropic.
- **Alerts engine** — alertas financieras específicas (runway <3m, categoría con margen negativo, etc.).
- **Manual cash override** — input para corregir el saldo de caja cuando no está integrado el banco.
- **Aurum context** — el narrative se alimenta de Aurum para ser consistente con lo que el asistente conoce del negocio.
- **Tri-currency toggle** activo en toda la sección: USD MEP (default), ARS nominal, ARS ajustado inflación.

### Implicancia comercial

Esto es el **nuevo sticky maker** del producto. Argumento clave que se puede agregar al pitch:

> "Tenemos P&L conversacional con tri-currency (USD MEP, ARS nominal, ARS ajustado inflación) y narrative engine que te explica el mes en 3 bullets. Ningún dashboard USA tiene esto. Ningún dashboard LATAM tampoco."

Argumentos adicionales habilitados:
- "Abrí la app un viernes a la tarde, mirás Cash Runway, y ya sabés si podés dormir tranquilo."
- "El CFO no entra — entra el CEO. El narrative le habla como le hablaría su COO."
- "Cambiás el toggle a ARS ajustado y ves cuánto de tu crecimiento es real y cuánto es nominal por inflación."

Nuevo dolor que se resuelve: "no sé si estoy ganando plata" — ahora hay una pantalla que lo responde.

### Status de comunicación

- [ ] Landing: pendiente (hay que agregar bloque de Finanzas con screenshots del Pulso).
- [ ] Newsletter / changelog público: pendiente (no hay aún).
- [ ] Demo video: pendiente (es prioridad — esto se demos-tra mejor que se lee).

### Notas para Claude VM

Cuando se pida landing o deck, asegurarse de que Finanzas/P&L Pulso tenga **su propia slide** y no esté metida en "otros features". Es el feature con mayor potencial de diferenciación de Q2 2026.

---

## Estado inicial al bootstrap — 2026-04-18

> Este bloque es la foto del producto al momento de crear el PKB. No es un "cambio" — es el punto de partida sobre el cual los próximos commits se van a diferenciar.

### Activos con marca (4)

1. **NitroPixel** — pixel propio de atribución con 4 modelos (LAST_CLICK, FIRST_CLICK, LINEAR, NITRO), cross-domain cookies, bot filtering, exclusión de 18+ gateways de pago, 7 zonas de analytics.
2. **Aurum** — asistente IA conversacional con 12 tools de datos, 3 modos (Flash/Core/Deep), memoria persistente, onboarding auto-detect, orb flotante Saturn-ring, telemetría.
3. **Bondly** — customer intelligence VTEX-only. Triple-layer LTV (historical / BG-NBD+Gamma-Gamma predicted / behavioral), 7 KPI tiles, Insights Engine con 5 detectores, Churn Risk Scoreboard.
4. **Aura** — creator economy. Aura Inicio con 7 zonas, 7 tipos de deal (COMMISSION, FLAT_FEE, PERFORMANCE_BONUS, TIERED_COMMISSION, CPM, GIFTING, HYBRID), Always On campaigns, ventana de atribución configurable 1-180 días, Creator Gradient #ff0080→#a855f7→#00d4ff.

### Secciones funcionales (5)

1. **Control de Gestión** — Centro de Control, Pedidos, Alertas, Sync Status.
2. **Marketing Digital** — NitroPixel, SEO (GSC), Campañas (Meta + Google + Creativos), Audiencias, Aura.
3. **Comercial** — Productos (SKU-first), Rentabilidad, Bondly.
4. **Marketplaces** — MercadoLibre.
5. **Finanzas / P&L** — P&L Pulso, Estado, Costos, Escenarios, Fiscal (AFIP).

### Integraciones activas

VTEX (webhooks + cron), MercadoLibre (webhooks + cron), Meta Ads (on-demand), Google Ads (on-demand), GA4 (cron), GSC (cron), Resend (email), Anthropic (Aurum + narrative engine), AFIP (facturación fiscal), dolarapi (tipo de cambio MEP), INDEC (IPC para ajuste por inflación).

### Clientes

**1 cliente beta**: El Mundo del Juguete / El Mundo del Bebé (VTEX `mundojuguete` + ML KAVOR S.A.). Organization ID `cmmmga1uq0000sb43w0krvvys`. Tratar como caso **en construcción**, no como caso de éxito cerrado. Ver `CASOS_DE_EXITO.md`.

### Stack técnico relevante a la conversación comercial

- Next.js 14 + TypeScript + Prisma + PostgreSQL.
- Deploy: Vercel → `nitrosales.vercel.app` (URL pública).
- Modelo de branches simplificado: todo directo en `main`. Sin staging.
- Arquitectura SKU-first en productos (un SKU aparece una sola vez con breakdown por canal).

### Posicionamiento vigente

Posicionamiento v5 — ver `POSICIONAMIENTO_Y_VOZ.md`:
- **One-liner**: "Tu primer activo digital. Vendé más. Gastá mejor. Decidí con la verdad."
- **Arquetipo**: sistema nervioso / cerebro vivo.
- **4 pilares**: Percepción, Cognición, Memoria viviente, Verdad.

---

## Plantilla para la próxima entrada

Cuando aparezca una sesión de Producto nueva, copiar este bloque arriba de todo:

```markdown
## YYYY-MM-DD — Sesión NN Producto — [TITULO] — SHA `XXXXXXX`

### Lo que cambió

[bullets en lenguaje comercial]

### Implicancia comercial

[qué nuevo argumento, qué objeción resuelve]

### Status de comunicación

- [ ] Landing: [estado]
- [ ] Newsletter: [estado]
- [ ] Demo video: [estado]

### Notas para Claude VM

[qué hay que tener en cuenta al escribir outputs]

---
```
