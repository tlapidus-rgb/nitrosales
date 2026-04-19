---
name: implementation-playbook
description: Ejecuta el onboarding de un cliente nuevo de NitroSales — desde firma hasta primer aha moment. Usala cuando Tomy diga "arrancamos con [cliente]", "armame el plan de onboarding", "checklist de setup", "qué hacemos los primeros 30 días con [X]", o cuando hay que orquestar el go-live de un cliente. Genera plan día por día, owners, milestones, comunicación al cliente, y criterios de "onboarding completo". El objetivo no es instalar — es que el cliente encuentre su primer insight concreto en la primera semana.
---

# implementation-playbook

Orquesta el onboarding. El objetivo no es técnico ("instalar pixel") — es que el cliente diga "ahora entiendo mi negocio diferente". Eso se logra en ventanas de tiempo muy concretas.

## Cuándo se dispara

- "Arrancamos onboarding con [cliente]."
- "Plan de los primeros 30 días."
- "Checklist de setup para [empresa]."
- "¿Qué hacemos la semana 1 / 2 / 3?"
- "Protocolo de go-live."

## Objetivo del onboarding

| Semana | Milestone | Qué tiene que haber pasado |
|---|---|---|
| Día 1-5 | Technical setup | Pixel instalado, conexiones activas, sync corriendo |
| Día 5-10 | Primera data | Primer dashboard usable, primer insight concreto |
| Día 10-20 | Aha moment | Cliente usa solo la herramienta, descubre algo que no sabía |
| Día 20-30 | Consolidación | Workflow diario establecido, QBR mini |
| Día 30-90 | Expansion potencial | Segundo activo, invitación a stakeholders |

## Estructura del playbook

### Bloque 0 — Kickoff call (día 1)

**Duración**: 60 min.

**Objetivos**:
- Conocer al equipo completo del cliente (no solo founder).
- Reconfirmar scope firmado.
- Acordar canales de comunicación (WhatsApp group, email).
- Fijar fechas: setup check, primera review.
- Entregar credenciales + links.

**Salida**:
- Doc compartido con plan + fechas + owners.
- Grupo de WhatsApp / Slack compartido abierto.

### Bloque 1 — Technical setup (día 1-5)

**Responsable principal**: Claude de Producto (Claude Code) → configura; Tomy supervisa.

**Tareas**:
- Instalar NitroPixel (ver `pixel-install-guide`).
- Conectar VTEX / Tiendanube (API + webhooks).
- Conectar ML (marketplace).
- Conectar Meta Ads.
- Conectar Google Ads.
- Conectar Klaviyo (si aplica).
- Validar sync de primer batch de datos.

**Entregables al cliente**:
- Screenshot de "dashboard arrancando".
- Aviso: "Primer data visible en X horas".

### Bloque 2 — Data validation (día 5-10)

**Responsable**: Tomy + cliente (juntos en call de 30 min).

**Tareas**:
- Revisar que los números que ve NitroSales cruzan con los nativos del cliente.
- Identificar discrepancias (usualmente aparecen) y decidir cuáles son "bien" vs "bug".
- Correr `data-quality-auditor` skill.

**Entregable**:
- Reporte "Validation & Trust": qué cruza OK, qué tiene explicación (y cuál), qué requiere fix.

### Bloque 3 — Aha moment (día 10-20)

**Responsable**: Claude VM (vía Aurum).

**Objetivo**: encontrar **1 insight específico** de la cuenta del cliente que no sabía antes.

**Ejemplos de aha moments reales**:
- "El 30% de tus ventas de Meta vienen asistidas por creators, no tracked".
- "Tu producto top en margen no es tu producto top en volumen — y estás gastando igual en ambos".
- "40% de tus clientes ML no volvieron a comprar en 6 meses, cuando el benchmark de tu vertical es 55%".

**Ejecución**:
- Correr `aha-moment-tracker` skill.
- Entregar insight por mail al founder, con screenshot.
- Invitar a 15 min para comentarlo.

### Bloque 4 — Consolidación workflow (día 20-30)

**Responsable**: Tomy + cliente.

**Tareas**:
- Establecer rutina diaria del cliente con la tool (qué mira el lunes, qué mira el viernes).
- Invitar a stakeholders secundarios (CFO, analista, operador de ads).
- Calendarizar QBR a los 90 días.

### Bloque 5 — QBR a 90 días

Ver `qbr-generator` skill.

## Canales de comunicación durante onboarding

- **WhatsApp group**: para temas ágiles, avisos, reacciones rápidas.
- **Email**: para entregables formales (reporte de validation, insights formales).
- **Calls**: solo cuando hace falta (kickoff + revisión de validation + QBR).

**Tiempo de respuesta comprometido**: < 4h hábiles en WhatsApp; < 24h en email.

## Output format (plan de onboarding por cliente)

```markdown
# Onboarding playbook — [Cliente]

## Metadata
- Fecha de firma: [...]
- Fecha de kickoff: [...]
- Activos contratados: [...]
- Plataformas a integrar: [...]
- Equipo del cliente: [nombres + roles]

---

## Plan día por día

### Día 1 — Kickoff
- [ ] Kickoff call 60 min (ver agenda abajo)
- [ ] Crear grupo WhatsApp con [nombres]
- [ ] Enviar credenciales NitroSales
- [ ] Compartir este playbook

### Día 2-3 — Technical setup
- [ ] NitroPixel instalado (owner: Claude de Producto)
- [ ] VTEX conectado
- [ ] ML conectado
- [ ] Meta conectado
- [ ] Google conectado

### Día 4-5 — First sync
- [ ] Primer batch de órdenes llegando
- [ ] Validar conteo vs nativo
- [ ] Screenshot "arrancamos" al cliente

### Día 5-10 — Data validation
- [ ] Call 30 min de validation con [cliente]
- [ ] Reporte "Validation & Trust" entregado

### Día 10-20 — Aha moment
- [ ] Aurum corre análisis de la cuenta
- [ ] Identificar 1 insight específico
- [ ] Entregar por mail con screenshot
- [ ] Call 15 min de comentario

### Día 20-30 — Consolidación
- [ ] Rutina diaria del cliente establecida
- [ ] Stakeholders secundarios agregados
- [ ] Calendarizar QBR a 90 días

### Día 30 — Onboarding completo
- [ ] Criterios de aha moment alcanzado: [sí/no]
- [ ] Cliente usando solo la herramienta: [sí/no]
- [ ] Próximos hitos definidos

---

## Agenda de kickoff call (60 min)

**Minuto 0-10 — Presentaciones**
- Quién está del lado del cliente, qué hace cada uno.
- Qué rol tiene cada uno en el uso de NitroSales.

**Minuto 10-25 — Plan de onboarding**
- Recorrer este playbook juntos.
- Fijar fechas clave.
- Definir canales de comunicación.

**Minuto 25-40 — Acceso y credenciales**
- Compartir logins.
- Primer tour de la interfaz.
- Identificar quién va a ser el primer "power user".

**Minuto 40-55 — Expectativas**
- Qué esperamos de ellos (acceso a plataformas, tiempo en kickoff técnico).
- Qué pueden esperar de nosotros (SLA, disponibilidad, QBR).

**Minuto 55-60 — Próximos pasos**
- Confirmar fecha de primer check de validation.
- Cualquier pregunta suelta.

---

## Criterios de éxito (al día 30)

- [ ] Cliente ingresó a la herramienta al menos 15 días de los últimos 30.
- [ ] Cliente identificó al menos 1 insight accionable.
- [ ] Cliente mencionó a NitroSales en al menos 1 conversación interna (positiva).
- [ ] Sync estable (no hay gaps > 24h).
- [ ] Comunicación en WhatsApp activa (al menos 1 mensaje/semana).

## Criterios de red flag (al día 30)

- ⚠️ Cliente no entró a la herramienta en los últimos 7 días.
- ⚠️ No respondió el último mensaje hace > 72h.
- ⚠️ Mencionó problemas con stakeholder interno (resistencia al cambio).
- ⚠️ Preguntó sobre "cómo cancelar" o "qué opciones tengo".

Si aparece alguno → disparar `churn-risk-detector` skill.

---

## Nota para Tomy
- [contexto del cliente específico: relación previa, sensibilidades, oportunidades]
- [stakeholders que hay que cuidar]
```

## Principios

1. **El aha moment no es accidental — se diseña**. En día 10-20, Tomy + Aurum buscan activamente el insight diferencial.
2. **Comunicación proactiva > reactiva**. No esperar que el cliente pregunte — anticipar avances.
3. **Honestidad en validation**. Si hay discrepancia, decir si es real o bug. No barrer bajo la alfombra.
4. **Onboarding no es un checklist — es una experiencia**. El cliente tiene que sentir que hay alguien atento, no un formulario.

## Anti-patrones

- Dejar el cliente solo "hasta que pregunte".
- Saturar con mails de updates automáticos sin contenido útil.
- Validation pasada por alto ("confiá en los números") → daña trust a largo plazo.
- No invitar a stakeholders secundarios → churn al cambiar de champion.

## Conexión con otras skills

- `pixel-install-guide`: setup técnico.
- `aha-moment-tracker`: buscar el insight clave.
- `data-quality-auditor`: validation del día 5-10.
- `health-score` + `churn-risk-detector`: monitoreo post-onboarding.
- `qbr-generator`: review de 90 días.
