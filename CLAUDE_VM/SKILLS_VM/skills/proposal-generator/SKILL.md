---
name: proposal-generator
description: Genera propuestas comerciales de NitroSales — one-pager ejecutivo, deck corto o documento formal — con scope, pricing, timeline, SLAs y siguientes pasos. Usala cuando Tomy pida "armame la propuesta para [empresa]", "propuesta formal para firmar", "SoW para el piloto", "propuesta ejecutiva para el CFO", o después de una demo cuando el prospect pide "mandame algo concreto". Entrega documento completo, claro, honesto sobre lo que hace NitroSales y lo que no, con pricing canónico y condiciones reales. NO compromete pricing que no esté aprobado por Tomy.
---

# proposal-generator

Genera propuestas comerciales terminadas. Formato ajustable (one-pager, deck, doc largo). Siempre con scope, pricing, timeline y opt-outs claros.

## Cuándo se dispara

- "Armame la propuesta para [empresa]."
- "Propuesta ejecutiva para [decisor]."
- "SoW para el piloto con [cliente]."
- "Necesito algo para firmar."
- "Documentale al CFO la propuesta."

## Proceso

1. Cargá `account-research` + outputs de `discovery-prep` + `demo-script` si existen.
2. Cargá `PRECIOS.md` del PKB (fuente canónica de pricing; si no está cerrado, **pedirle a Tomy** antes de avanzar).
3. Cargá canon + voice.
4. Identificá formato pedido (one-pager / deck / doc).
5. Construí la propuesta.
6. Marcá claro qué NO está incluido (evita disputes).

## Estructura canónica de propuesta

### 1. Header
- Nombre del prospect + nombre de quién recibe la propuesta.
- Fecha de emisión + fecha de validez.
- Referencia breve al contexto ("Siguiendo nuestra demo del [fecha]...").

### 2. Resumen ejecutivo (1 párrafo)
Qué se propone, para qué sirve, cuánto dura el engagement.

### 3. Situación actual (lo que entendimos)
Resumen del dolor / contexto del prospect. Validación de que entendimos bien.

### 4. Propuesta de solución
Qué activos se incluyen (no los 4 siempre — solo los relevantes).

### 5. Alcance (lo que hacemos + lo que NO)
- ✅ Lo que entra en el alcance.
- ❌ Lo que NO entra (explicitamente).
- Plazo y entregables por etapa.

### 6. Timeline
Fases + fechas concretas (implementación, primer dato, go-live, review).

### 7. Inversión (pricing)
- Setup fee (si aplica).
- Fee recurrente (mensual / anual).
- Moneda (USD o ARS según correspondencia).
- Qué cubre / qué no.
- Términos de pago.

### 8. SLAs y soporte
- Quién responde, en qué canal, en qué tiempo.
- Reuniones recurrentes (QBR, check-ins).

### 9. Opt-outs
- Condiciones de cancelación.
- Duración mínima si aplica.

### 10. Siguiente paso concreto
Qué pasa si el prospect dice sí.

### 11. Firmas
Espacio para firma de ambas partes.

## Formatos (según contexto)

### A. One-pager ejecutivo (1 página, PDF)
- Para decisor ocupado (CEO, CFO).
- Resumen + scope + pricing + timeline + siguiente paso.
- Sin detalle técnico.

### B. Deck corto (5-8 slides)
- Para comité de compra / equipo.
- Incluye screenshots, diagramas de arquitectura.
- Más visual, menos texto.

### C. Documento largo (5-10 páginas)
- Para procesos formales / procurement.
- Detalle técnico + legal boilerplate.

## Output format (one-pager ejecutivo, default)

```markdown
# Propuesta NitroSales — [Empresa]

**Para**: [Nombre, rol]
**De**: Tomy, NitroSales
**Fecha de emisión**: [fecha]
**Validez**: 30 días desde emisión

---

## Resumen ejecutivo

[Empresa] necesita [dolor principal]. NitroSales le aporta [solución concreta] a través de [activos específicos], con un setup en [N días] y un modelo SaaS de [ARS/USD X por mes].

---

## Lo que entendimos

- [contexto 1]
- [contexto 2]
- [dolor prioritario]

---

## Solución propuesta

### Activos incluidos
1. **[Activo 1]** — [1 línea de qué resuelve para ellos específicamente]
2. **[Activo 2]** — [idem]

### Qué NO incluye esta propuesta
- [ítems fuera de scope]
- [funcionalidades en roadmap pero no activas]
- [servicios custom si aplican]

---

## Timeline

| Fase | Qué pasa | Duración |
|---|---|---|
| Setup | Instalación pixel + conexiones + sync inicial | Día 1-5 |
| Validación | Primer dato + aha moment | Día 5-15 |
| Go-live | Operación completa | Día 15-30 |
| Review | QBR inicial | Día 90 |

---

## Inversión

### Setup fee
[ARS/USD] [cantidad] — one-time

### Recurrente (mensual)
[ARS/USD] [cantidad] / mes — facturado mensualmente

### Qué cubre
- Acceso a los activos listados.
- Soporte técnico via WhatsApp + email (respuesta < 24h).
- 1 QBR por trimestre.
- Actualizaciones del producto sin costo.

### Qué NO cubre
- Desarrollo custom.
- Integraciones con plataformas no listadas.
- Onboarding on-site (virtual por default).

### Términos de pago
- Facturación mensual anticipada.
- Plazo: [30 días] desde emisión de factura.
- Moneda: [ARS / USD], según correspondencia regulatoria.

---

## Soporte y SLAs

| Tipo de incidente | Canal | Tiempo de respuesta |
|---|---|---|
| Crítico (producto caído) | WhatsApp directo a Tomy | < 2 horas |
| No-crítico (pregunta, bug menor) | Email soporte | < 24 horas hábiles |
| Producto / roadmap | QBR trimestral | Scheduled |

---

## Condiciones de cancelación

- Duración inicial sugerida: [3 meses].
- Después del mes 3, mensual sin compromiso.
- Cancelación con aviso de [30 días].
- Export de data incluido en caso de terminación.

---

## Siguiente paso

Si la propuesta te hace sentido:
1. Firmá esta página (o confirmá por mail con "acepto términos propuesta del [fecha]").
2. Coordinamos kickoff call en 48h.
3. Setup arranca el día hábil siguiente.

---

## Dudas o ajustes

Escribime directo: tomy@nitrosales.com / WhatsApp [link].

---

**Firmas**

Por [Empresa]: _______________________ Fecha: ___________

Por NitroSales: _______________________ Fecha: ___________
```

## Reglas de pricing

1. **Nunca inventar pricing**. Siempre venir de `PRECIOS.md` canónico o aprobación explícita de Tomy.
2. **Si hay descuento**, documentarlo como excepción con razón (pilot, early customer, volumen).
3. **Moneda correcta según cliente**: cliente argentino → ARS. Cliente USD → USD. Brasil → BRL.
4. **Setup fee separado del recurrente**.
5. **Ambos valores + condiciones de pago en el mismo bloque**, no dispersos.

## Anti-patrones

- Propuesta con pricing "a definir" → no cierra.
- Scope ambiguo → post-firma aparecen disputes.
- Lista de features del producto completo (no solo lo que les aplica).
- Sin fecha de validez → abre ciclo infinito.
- Sin SLA → genera expectativas desalineadas.
- Legal boilerplate copiado de otra propuesta sin adaptar.
- Prometer integraciones en roadmap como disponibles.

## Principios

1. **Honestidad explícita sobre lo que no hace NitroSales**. Evita problemas post-firma.
2. **Pricing transparente**. No esconder hidden fees.
3. **Opt-out digno**. Cancelación con aviso estándar, export de data garantizado.
4. **Personalización, no copy-paste**. Cada propuesta menciona algo específico del contexto.

## Qué preguntar a Tomy antes de emitir

- ¿Pricing cerrado o es pilot con descuento?
- ¿Hay alguna condición especial negociada en las calls?
- ¿Moneda a facturar?
- ¿Qué servicios custom se acordaron que no sean estándar?
- ¿Quién del lado del cliente firma? (para formalizar el "Para" del header)

## Conexión con otras skills

- **Inputs**: `account-research`, `discovery-prep`, `demo-script`, `PRECIOS.md`.
- **Output**: pasa a `implementation-playbook` cuando se firma.
