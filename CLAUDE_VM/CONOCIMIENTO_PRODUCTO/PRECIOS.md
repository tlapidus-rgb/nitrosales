# PRECIOS.md — Modelo de pricing (estado: SIN DECISION TOMADA)

> **Estado actual (2026-04-18)**: NitroSales no tiene pricing público ni decidido. El único cliente activo es beta sin acuerdo comercial formal. Este archivo contiene los **3 modelos candidatos** para que cuando Tomy defina, se complete con los valores reales.
>
> **Regla**: Claude VM nunca inventa precios. Si un prospect pregunta "cuánto sale", la respuesta es: "Estamos definiendo el modelo de pricing con los primeros clientes beta. Lo que te puedo contar: será un modelo que escala con el tamaño de tu operación. ¿Te parece si primero validamos si el producto te sirve y después hablamos del número?"

---

## Modelos candidatos

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

- **NUNCA** decir un número de pricing en ningún output (landing, email, deck, propuesta comercial) mientras este archivo no tenga los valores completados por Tomy.
- Si Tomy pide "armame un pricing page para la landing", parar, recordar que no hay pricing definido, y pedirle que defina antes de que yo escriba.
- Cuando Tomy decida, este archivo se actualiza primero con los valores reales + fecha de la decisión. Después se puede usar en outputs comerciales.
- Pricing es **decisión estratégica**, no tarea de redacción. La única parte de redacción que yo hago es ayudarlo a **ordenar los trade-offs** (este archivo), no inventar el número.

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
