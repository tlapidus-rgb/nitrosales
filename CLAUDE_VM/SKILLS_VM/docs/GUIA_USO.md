# GUÍA DE USO — Skills VM

> Cómo usar las 36 skills de Claude VM día a día. Escrita para Tomy, en lenguaje simple.

## Qué son las skills

Son "capítulos de un manual" que Claude VM lee cuando corresponde. Cada skill se enfoca en UNA cosa (armar un email, un QBR, un post de LinkedIn, etc.) y aplica el canon de NitroSales (positioning, voz, casos).

**No son macros**. No ejecutan solas. Se disparan cuando pedís algo que matchea su trigger (ver la descripción de cada skill).

---

## Cómo se disparan

### Opción A — Trigger natural (más común)

Tomy escribe en el chat en lenguaje natural:

- "Armame un cold email para el fundador de [X marca]" → se dispara `email-copy`.
- "Calculame el health score de [Cliente Y]" → se dispara `health-score`.
- "¿Cómo vengo de pipeline?" → se dispara `pipeline-reviewer`.
- "Revisá si [prospect] tiene sentido" → se dispara `icp-profiler` o `account-research`.

Claude VM identifica el trigger, carga la skill, y ejecuta.

### Opción B — Invocación explícita

Si Tomy quiere forzar una skill específica:

- "Usá la skill `email-copy` para esto."
- "Corré `pipeline-reviewer`."

### Opción C — Combinación

Algunas tareas disparan múltiples skills en cadena:

- Cerrar un caso de éxito → `aha-moment-tracker` (extraer) + `case-study-builder` (armar).
- Preparar un QBR → `health-score` + `qbr-generator` + `expansion-opportunity`.
- Lanzar un prospect nuevo → `icp-profiler` → `account-research` → `personalized-outreach` → `multi-touch-sequence`.

---

## Flujo típico por día / semana

### Lunes — Revisión semanal

- `sales-dashboard` (semanal) → numbers + alertas.
- `pipeline-reviewer` → deal-by-deal + acción esta semana.
- `health-score` portfolio → quién está en amarillo/rojo.

### Martes-Jueves — Trabajo tácticо

Según lo que toque:
- Cold outreach: `prospect-list-builder` + `personalized-outreach` + `multi-touch-sequence`.
- Call de discovery: `discovery-prep` antes, notas después.
- Demo: `demo-script` (si necesitás afinar), `objection-handler` (si hubo ruido).
- Propuesta: `proposal-generator` (con `pricing-modeler` si aplica).
- Content: `blog-writer` / `social-content` / `newsletter-writer` según canal.
- Cliente activo: `qbr-generator`, `churn-risk-detector`, `expansion-opportunity` según caso.

### Viernes — Cierre de semana

- Update de `CLAUDE_STATE_VM.md` + `HISTORIAL_SESIONES_VENTAS_MARKETING.md`.
- Si se pasó algún handoff: `handoff-claude-to-claude`.
- Si cerró un caso: `case-study-builder`.

### 1er día hábil del mes — Dashboard mensual

- `sales-dashboard` (mensual) con comparativa MoM.
- Revisión de NRR, CAC, LTV.
- Actualización de `BACKLOG_PENDIENTES.md`.

---

## Cómo pedirle cosas a Claude VM (mejor / peor)

### ✅ Pedidos efectivos

- "Armame un cold email para el founder de Duos, asunto corto, apunta a pain de atribución."
- "Calculame el health score de [Cliente X] con los datos de última call y del dashboard."
- "Armame el guión de demo para un prospect que ya tiene Meta Ads y WooCommerce."
- "Revisá el pipeline, contame qué hago esta semana."
- "Armame un post LinkedIn sobre el tema Dark Funnel para publicar mañana."

### ❌ Pedidos vagos (van a rebotar o generar menos valor)

- "Ayudame con ventas." → ¿qué parte?
- "Mandale algo al cliente." → ¿qué cliente? ¿qué tema?
- "Hacé marketing." → ¿qué canal? ¿qué mensaje?

**Tip**: cuanto más específico el contexto (cliente, canal, objetivo, restricción), mejor output.

---

## Cómo Claude VM pasa contexto entre skills

Las skills comparten 3 fuentes:

1. **`_CANON/`** — documentos canónicos de posicionamiento, voz, naming, productos. Siempre se consultan primero.
2. **`CLAUDE_STATE_VM.md`** — estado actual (semana activa, prioridades, clientes hot).
3. **`HISTORIAL_SESIONES_VENTAS_MARKETING.md`** — qué pasó en sesiones previas.

Eso garantiza que si ejecutamos `email-copy` hoy y después `case-study-builder`, los dos outputs "suenan a NitroSales" sin tener que repetir el contexto.

---

## Reglas importantes que Claude VM respeta

1. **Nunca inventa data**. Si falta info, pregunta.
2. **Nunca toca código del repo nitrosales**. Si algo requiere producto, arma handoff.
3. **Nunca publica sin permiso**. Copy va a review de Tomy antes de publicarse.
4. **Nunca promete numbers que no estén validados**. Incluye casos de éxito inventados, ROI sin base, etc.
5. **Respeta voice guide**. Rioplatense sutil, técnico pero cálido, sin hype.
6. **Escala a Tomy si hay duda**. Mejor preguntar que asumir.

---

## Cómo actualizar / mejorar una skill

Si después de usar una skill ves que falta algo o sobra algo:

1. Decile a Claude: "la skill `email-copy` le falta [X]" o "modificá [X]".
2. Claude edita el SKILL.md directamente.
3. Corré `scripts/sync-skills.sh` para que se actualice en `.claude/skills/user/`.
4. Anotá la modificación en `MAPA_EJECUCION.md` (changelog).

---

## Cómo agregar una skill nueva

Si aparece una necesidad no cubierta:

1. Decile a Claude: "armame una skill de [X] que haga [Y]".
2. Claude usa su propia skill `skill-creator` (instalada) o la construye manualmente siguiendo el formato canónico.
3. Agrega entrada en `MAPA_EJECUCION.md`.
4. Sync.

---

## Script de sync

Cada vez que se crean / modifican skills, correr:

```bash
bash CLAUDE_VM/SKILLS_VM/scripts/sync-skills.sh
```

(Ejecutar desde el root del repo: `/Users/ttt/Documents/GitHub/nitrosales`.)

Esto copia `CLAUDE_VM/SKILLS_VM/skills/*` a `~/.claude/skills/user/` para que Cowork las reconozca.

---

## Troubleshooting

### "No se disparó la skill que esperaba"

- Verificar que el trigger en la description matchee lo que pediste.
- Invocar explícitamente ("usá la skill X").
- Si el trigger es débil, editar la description para que sea más pushy.

### "La skill generó output medio genérico"

- Falta contexto en el pedido. Dar más: cliente, objetivo, tono específico, ejemplo de referencia.
- Chequear que el CANON (positioning, voice, casos) esté bien poblado.

### "Dos skills se pisan"

- Invocar explícitamente la que querés.
- O decir a Claude: "para esto usá [X] no [Y], ajustalo".

### "La skill menciona algo que no hice"

- Alucinación. Pedirle a Claude que se base solo en la data provista.
- Agregar en la skill: "si falta data concreta, pedirla, no inventar".

---

## Glosario rápido

- **Skill**: un capítulo del manual de Claude VM (ej: `email-copy`).
- **Canon**: documentos base inmutables (positioning, voice, naming).
- **PKB**: personal knowledge base — carpeta con conocimiento estructurado.
- **Trigger**: frase o intent que dispara una skill.
- **Progressive disclosure**: skill corta que carga subfiles más densos según necesidad.
- **Handoff**: pase de contexto entre Claude VM y Claude de Producto.

---

## Donde está todo

```
SKILLS_VM/
├── README.md           # overview
├── _CANON/             # positioning, voice, naming, productos
├── docs/
│   ├── MAPA_EJECUCION.md       # qué se hizo
│   ├── SKILLS_A_INSTALAR.md    # externas recomendadas
│   └── GUIA_USO.md             # este doc
├── scripts/
│   └── sync-skills.sh          # copia skills a .claude/skills/user/
└── skills/             # 36 skills, una por carpeta
    ├── positioning-canon/
    ├── brand-voice/
    ├── ...
    └── handoff-claude-to-claude/
```

---

## Apertura mental

Estas skills no son la verdad absoluta. Son el punto de partida.

A medida que NitroSales crezca (primeros clientes, primeros casos, primer pricing firme), las skills se van afinando. La intención es que Tomy las edite sin miedo, las borre si no sirven, agregue las que falten. Claude VM se adapta al canon, no lo impone.

**Si una skill te rompe, avisá. Si hay algo que funciona mejor hecho a mano, hacelo a mano.**

Las skills son asistencia, no reemplazo de criterio.
