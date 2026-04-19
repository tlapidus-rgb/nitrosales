---
name: handoff-claude-to-claude
description: Protocolo de handoff entre Claude VM (Ventas & Marketing) y Claude de Producto (el que trabaja en el repo nitrosales). Usala cuando Tomy pida "pasale esto al Claude de producto", "anotá esto para cuando toquemos producto", "armame el handoff para el repo", o cuando una tarea de ventas/marketing requiera intervención técnica en la app. También se dispara en reversa — cuando Claude de Producto necesita info de ventas/marketing. Produce brief de handoff estructurado + entradas en CLAUDE_STATE_VM.md o BACKLOG_PENDIENTES.md. Evita que los dos Claudes se pisen y evita pérdida de contexto entre dominios.
---

# handoff-claude-to-claude

Protocolo para que Claude VM y Claude de Producto colaboren sin pisarse. Tomy opera con dos agentes Claude: uno trabaja ventas/marketing (este), otro trabaja el producto/repo nitrosales. Cada uno tiene su propio `CLAUDE.md`, su propio HISTORIAL, su propio workspace. Pero a veces el trabajo de uno necesita al otro.

## Cuándo se dispara

- "Pasale esto al Claude de producto."
- "Anotá esto para cuando toquemos producto."
- "Armame el handoff para el repo."
- "¿Cómo le explico esto al otro Claude?"
- Tarea de ventas/marketing detecta bug / feature missing / data gap en el producto.
- Tarea de producto requiere input de ventas (copy, positioning, mensaje, prioridad comercial).
- Cambio en el producto que impacta cómo vendemos (nuevo feature, breaking change, rebrand parcial).

## Los dos Claudes

| Dimensión | Claude VM (este) | Claude de Producto |
|---|---|---|
| Workspace | `/mnt/nitrosales/SKILLS_VM/` + materiales de ventas | `/mnt/nitrosales/` (el repo completo) |
| CLAUDE.md | `CLAUDE_VM.md` (o equivalente del side VM) | `CLAUDE.md` (raíz del repo) |
| State file | `CLAUDE_STATE_VM.md` | `CLAUDE_STATE.md` |
| Historial | `HISTORIAL_SESIONES_VENTAS_MARKETING.md` | `HISTORIAL_SESIONES.md` |
| Backlog | parte de `BACKLOG_PENDIENTES.md` (prefijo `VM-`) | parte de `BACKLOG_PENDIENTES.md` (prefijo `PR-` o sin prefijo) |
| Domino | Ventas, marketing, clientes, pipeline, outbound, content, casos | Código, migraciones, infra, bugs, features, UI, APIs |

**Archivo compartido**: `BACKLOG_PENDIENTES.md` es la única fuente común. Los dos Claudes leen y escriben ahí, pero cada uno respeta prefijos de IDs y dominios.

## Principios del handoff

1. **Explicit > implícito**. Nunca asumir que el otro Claude "ya sabe". Todo handoff es escrito y archivado.
2. **Dominio no se cruza**. Claude VM no toca código del repo. Claude de Producto no escribe copy de ventas. Si hay ambigüedad, escalar a Tomy.
3. **Tomy es el router**. Si hay duda de a quién le toca algo, preguntar a Tomy.
4. **Idempotencia del handoff**. El brief debe ser autocontenido: si el otro Claude entra en una sesión nueva sin contexto, debe poder ejecutar con solo el brief.

## Tipos de handoff

### Tipo A — VM → Producto (lo más común)

VM detecta algo que el producto necesita resolver. Ej:
- Cliente pide feature X.
- Bug en dashboard reportado en QBR.
- Gap de data que rompe un insight de ventas.
- Copy en el producto (UI) que desalinea con messaging de afuera.

### Tipo B — Producto → VM

Producto termina algo que necesita comunicación externa. Ej:
- Nuevo feature listo → VM debe anunciar.
- Breaking change → VM debe avisar a clientes.
- Bug resuelto que afectó a un cliente → VM debe seguir up.
- Rebrand parcial → VM debe actualizar materiales.

### Tipo C — Tomy pide los dos

Tarea compleja donde Tomy quiere que los dos colaboren. Ej:
- "Lanzamos Aura: Producto arma la landing con feature, VM arma el launch + outbound".
- "Cliente X churneó: Producto reviewa su data, VM cierra comercialmente".

## Formato del brief de handoff

```markdown
# Handoff — [VM→PR | PR→VM | Coordinado]

## Metadata
- ID: [VM-YYYYMMDD-NN] o [PR-YYYYMMDD-NN]
- Fecha: [YYYY-MM-DD]
- Origen: [Claude VM / Claude PR]
- Destino: [Claude PR / Claude VM / Ambos]
- Prioridad: [urgente / alta / media / baja]
- Deadline sugerido: [fecha o "asíncrono"]

---

## Resumen ejecutivo (3-5 líneas)

[Qué hay que hacer y por qué importa. Legible por Tomy.]

---

## Contexto

### Situación actual
[Qué está pasando hoy. Qué se sabe. Qué se ignora.]

### Por qué surge el handoff
[El trigger: qué pasó que forzó pedir ayuda al otro dominio.]

### Cliente / prospect afectado (si aplica)
- Nombre: [...]
- Tiempo como cliente: [...]
- ARR: [...]
- Contacto responsable desde VM: [...]

---

## Pedido concreto

### Qué se pide
[Específico. Accionable. Sin ambigüedad.]

### Qué NO se pide (para acotar scope)
[Qué cosas quedan fuera del handoff para evitar scope creep.]

### Criterios de "listo"
- [ ] [criterio 1]
- [ ] [criterio 2]
- [ ] [criterio 3]

---

## Info útil / contexto técnico

[Data, links, capturas, transcripts, mensajes del cliente, archivos en el repo, etc.]

---

## Riesgos / sensibilidades

- [Qué puede salir mal.]
- [Qué NO decirle al cliente mientras se resuelve.]
- [Compromisos ya asumidos por VM con el cliente.]

---

## Estado post-handoff

- [ ] Brief archivado en `BACKLOG_PENDIENTES.md` con ID.
- [ ] Claude destino (productor o VM) notificado / brief disponible.
- [ ] Si requiere acción inmediata: Tomy avisado.

## Próximo paso

**Quién**: [Claude destino / Tomy / cliente]
**Qué**: [acción concreta]
**Cuándo**: [fecha]
```

## Ejemplos

### Ejemplo 1 — VM → Producto (bug reportado en QBR)

```markdown
# Handoff — VM→PR

## Metadata
- ID: VM-2026-04-19-01
- Fecha: 2026-04-19
- Origen: Claude VM
- Destino: Claude PR
- Prioridad: alta
- Deadline sugerido: 2026-04-26 (antes de próximo QBR)

## Resumen ejecutivo

En QBR con [Cliente X], el founder reportó que el módulo de atribución de Meta Ads muestra numbers distintos cuando se filtra por campaña específica vs cuando se ve el total. Diferencia ~12% en ROAS declarado. Cliente está en health verde pero esto erosiona confianza. Urge resolver o al menos explicar antes del próximo QBR.

## Contexto

### Situación actual
Cliente [X] usa NitroPixel + Aurum. En el dashboard de Aurum, al filtrar por "Campaña Y" el ROAS se ve 3.2x. Sin filtro (total cuenta) sale 2.8x. La suma de ROAS ponderados por spend debería dar ~2.8, pero visualmente no cuadra.

### Por qué surge
Cliente lo levantó en la call. Mandé screenshot y cálculo a Tomy. Hay que entender si es bug de cálculo, bug de UI, o falta de explicación en el dashboard.

### Cliente afectado
- Nombre: [Cliente X]
- ARR: USD 36k
- Tiempo como cliente: 8 meses
- Contacto: Juan, CMO

## Pedido concreto

### Qué se pide
1. Verificar si el cálculo de ROAS filtrado es correcto.
2. Si es correcto: agregar tooltip / nota en UI explicando la diferencia.
3. Si es bug: fix + comunicar a clientes que pudieron estar afectados.

### Qué NO se pide
- No hace falta rediseñar el módulo de atribución.
- No hace falta tocar Google Ads (solo Meta por ahora).

### Criterios de "listo"
- [ ] Diagnóstico del cálculo confirmado.
- [ ] Fix o tooltip en producción.
- [ ] Mail corto para Claude VM que pueda mandar al cliente.

## Info útil
- Screenshots: [link a archivo en workspace]
- Transcript QBR: [link]
- Endpoint relevante: `/api/metrics/orders` (según CLAUDE.md del repo)

## Riesgos
- Cliente es referido potencial de otros 3 founders. Un bug mal comunicado puede escalar.
- No decirle "es un bug" hasta confirmar.

## Próximo paso
Claude PR revisa código + data, me devuelve diagnóstico, yo armo el mensaje al cliente.
```

### Ejemplo 2 — Producto → VM (feature listo)

```markdown
# Handoff — PR→VM

## Metadata
- ID: PR-2026-04-19-01
- Origen: Claude PR
- Destino: Claude VM
- Prioridad: media
- Deadline sugerido: launch la próxima semana

## Resumen ejecutivo
Terminado el módulo de "Cohort Analysis" dentro de Bondly. Permite ver retention por cohorte mensual con filtros de canal de adquisición. Está en producción, flaggeado como beta. Hay que comunicarlo a clientes y armar material de ventas.

## Pedido concreto
1. Mail a clientes existentes con Bondly anunciando beta.
2. Actualizar landing de Bondly con nueva feature.
3. Un post en LinkedIn de Tomy (founder voice).
4. Actualizar el deck comercial + one-pager de Bondly.

## Info útil
- Feature docs: [link en repo]
- Screenshots: [link]
- Demo video corto: [pending — ¿VM lo graba o PR?]

## Riesgos
- Es beta: no sobrevender. Dejar claro que puede haber ajustes.
- Solo mostrar a clientes que ya tienen Bondly contratado.

## Próximo paso
Claude VM arma los materiales y los pone a review con Tomy.
```

## Protocolo operativo

### Cuando Claude VM crea un handoff

1. Identificar que el tema excede dominio VM.
2. Confirmar con Tomy que amerita handoff (no solo nota).
3. Escribir el brief en formato arriba.
4. Archivar en:
   - `BACKLOG_PENDIENTES.md` con ID `VM-YYYYMMDD-NN`.
   - Copiar brief a archivo standalone en `/mnt/nitrosales/handoffs/VM-YYYYMMDD-NN.md` (carpeta compartida).
5. Anotar en `CLAUDE_STATE_VM.md` la acción.
6. Avisar a Tomy: "Armé handoff VM-XXX para Producto, ¿lo priorizamos ahora o lo deja para la próxima sesión de producto?"

### Cuando Claude VM recibe un handoff

1. Leer `BACKLOG_PENDIENTES.md` al inicio de sesión (ritual de arranque).
2. Identificar items con prefijo `PR-` dirigidos a VM.
3. Si hay alguno urgente: abordarlo antes de lo que Tomy pida, salvo que Tomy diga lo contrario.
4. Si hay duda: preguntar a Tomy cómo quiere priorizar.

### Reglas de oro

1. **Claude VM nunca edita archivos del repo que sean código** (`.ts`, `.tsx`, `prisma.schema`, `next.config.js`, etc.). Solo docs, skills, materiales.
2. **Claude de Producto nunca edita copy de ventas** (landing copy, emails comerciales, deck, etc.) sin handoff explícito.
3. **CLAUDE.md del repo es lectura para VM**, pero no se modifica desde VM.
4. **Handoffs siempre tienen ID**. Trazabilidad > conveniencia.
5. **Si Tomy entra en conflicto entre los dos Claudes**, su word prevalece.

## Anti-patrones

- Claude VM "arregla rapidito" un bug en el repo → viola CLAUDE.md.
- Claude PR escribe copy de landing → no tiene contexto de brand voice ni positioning canon.
- Handoff verbal/oral sin escribir → se pierde.
- Dos Claudes trabajando en paralelo sobre el mismo deliverable sin coordinar → duplicación o conflicto.
- Pasar handoff sin criterios de "listo" → el otro Claude no sabe cuándo terminó.

## Comunicación con Tomy post-handoff

Cuando se crea un handoff, decirle a Tomy en lenguaje simple:

> "Esto excede lo que puedo hacer desde acá (ventas/marketing) — toca código del producto. Te armé un brief para el Claude de producto, ID: [VM-XXX]. ¿Lo priorizamos ahora o en la próxima sesión?"

Cuando se recibe un handoff:

> "Vi que el Claude de producto dejó algo pendiente para ventas (ID: PR-XXX). Es [resumen 1 línea]. ¿Lo abordamos ahora?"

## Conexión con otras skills

- **Input**: cualquier skill VM puede disparar un handoff (ej: `churn-risk-detector` detecta bug → handoff a PR).
- **Output**: el handoff alimenta `BACKLOG_PENDIENTES.md`, `CLAUDE_STATE_VM.md`, y la carpeta `/mnt/nitrosales/handoffs/`.

## Estado actual (abril 2026)

- Tomy opera con los dos Claudes de forma alternada (no simultánea).
- No hay carpeta `/handoffs/` todavía — se crea en el primer handoff real.
- `BACKLOG_PENDIENTES.md` existe y ya tiene items mezclados de ambos dominios.
- Prefijos de ID sugeridos: `VM-` (Ventas/Marketing), `PR-` (Producto), `BP-` (legacy, pre-separación).

## Regla final

Si Claude VM y Claude de Producto son dos manos de la misma persona (Tomy), el handoff es el puente entre las dos manos. Sin puente, se cae la moneda.
