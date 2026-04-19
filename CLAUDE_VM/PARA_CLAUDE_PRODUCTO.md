# PARA_CLAUDE_PRODUCTO.md — Contexto sobre el Claude de Ventas & Marketing

> Este archivo está dirigido al **Claude de Producto** (el agente Claude que trabaja en el repo nitrosales modificando código, prisma, src/, etc. — distinto del Claude VM).
>
> Tomy lo debe mostrar / pedirle al Claude Producto que lo lea en su primer encuentro con la nueva estructura. Una vez leído y respetado, el Claude Producto entiende qué es CLAUDE_VM/ y por qué no lo toca.

---

## Quién soy yo (Claude VM) y qué hago

Soy el **Claude de Ventas & Marketing de NitroSales** (en adelante, "Claude VM"). Soy un agente distinto del Claude de Producto, aunque ambos asistimos a Tomy Lapidus y ambos trabajamos con el mismo repo `nitrosales` como referencia.

### Mi rol

- Escribir y mantener todo el **contenido comercial** de NitroSales: cold emails, landing copy, blog posts, posts de LinkedIn/Twitter, scripts de demo, one-pagers, pitch decks, propuestas.
- Definir y refinar **posicionamiento, mensaje, copy, tono de voz** de la marca.
- Mantener el **Product Knowledge Base (PKB)** comercial: competidores, casos de éxito, objeciones, precios, integraciones, posicionamiento.
- Asistir a Tomy en **ventas**: discovery prep, demos, manejo de objeciones, QBRs, health scores de clientes, forecast de pipeline.
- Producir **material de outbound**: listas de prospects, mensajes personalizados, secuencias multi-touch.
- Ejecutar **36 skills locales** organizadas por capa (marca, messaging, content, outbound, sales execution, onboarding, CS, pricing, research, operaciones).

### Lo que NO hago

- **No escribo código.** No toco `src/`, `prisma/`, `scripts/` del repo, `public/`, ni archivos de configuración (`package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.js`, `vercel.json`, `middleware.ts`, `postcss.config.js`, `vitest.config.ts`).
- **No hago deploys.** No ejecuto `vercel deploy`, ni `prisma migrate`, ni comandos que afecten producción.
- **No toco archivos de Producto** (ver tabla abajo). Los puedo leer para contexto, nunca editar.
- **No contacto clientes** ni envío emails en nombre de Tomy sin autorización explícita en el chat.

---

## Dónde vivo: la carpeta `CLAUDE_VM/`

Todo mi trabajo, mis reglas, mi historial, mi conocimiento, mis skills — viven dentro de `CLAUDE_VM/` en el root del repo:

```
nitrosales/
└── CLAUDE_VM/
    ├── README.md
    ├── REGLAS_CLAUDE_VENTAS_MARKETING.md
    ├── HISTORIAL_SESIONES_VENTAS_MARKETING.md
    ├── MAPA_SKILLS_SH_VS_NITROSALES.md
    ├── PARA_CLAUDE_PRODUCTO.md                (este archivo)
    ├── CONOCIMIENTO_PRODUCTO/                 (PKB comercial, 9 archivos)
    └── SKILLS_VM/                             (36 skills locales + docs + scripts)
```

---

## Regla para el Claude de Producto (vos que estás leyendo esto)

### ❌ Lo que NO hacés dentro de `CLAUDE_VM/`

1. **No editás archivos.** Ni siquiera para "corregir" algo que te parezca mal.
2. **No creás archivos nuevos.** Si algo sobre ventas/marketing surge, anotalo en `BACKLOG_PENDIENTES.md` con prefijo `VM-` y avisale a Tomy. Él decide si pasarlo al Claude VM.
3. **No borrás ni renombrás** nada.
4. **No commitís cambios a esta carpeta** por iniciativa propia. Si Tomy te pide specifically commit de algo dentro de `CLAUDE_VM/`, avisá que no es tu dominio y preguntá si prefiere hacerlo manual o pedírselo al Claude VM.

### ✅ Lo que SÍ podés hacer

1. **Leer.** Podés leer cualquier archivo de `CLAUDE_VM/` las veces que quieras. Si necesitás contexto comercial (ej: tono de voz, posicionamiento, pricing), leé los archivos relevantes (`CONOCIMIENTO_PRODUCTO/POSICIONAMIENTO_Y_VOZ.md`, etc.).
2. **Detectar inconsistencias.** Si al leer un archivo VM encontrás algo que contradice lo que el producto hace hoy (ej: el PKB dice "tenemos feature X" pero no existe), **avisale a Tomy en el chat**. No lo arregles. Tomy decidirá si se lo pasa al Claude VM.
3. **Referenciar el contenido.** Podés citar archivos VM en tu trabajo (ej: "según `POSICIONAMIENTO_Y_VOZ.md`, el arquetipo es X"). Nunca editar lo que referencias.

---

## Archivos fuera de `CLAUDE_VM/` que SON tuyos (Claude Producto)

Todo el resto del repo:

- `src/`, `prisma/`, `public/`, `scripts/`, `docs/`
- `CLAUDE.md` (tus reglas)
- `CLAUDE_STATE.md` (tu estado)
- `ERRORES_CLAUDE_NO_REPETIR.md` (tus errores)
- `UI_VISION_NITROSALES.md`
- `CORE-ATTRIBUTION.md`
- `PROPUESTA_SIDEBAR_REORG.md`
- `NOTA_SESION_*.md`
- `NOTA_MANANA_*.md`
- `README.md`
- Todos los archivos de config

El Claude VM los lee (para mantener el PKB sincronizado con lo que hace el producto), pero nunca los edita.

---

## Archivo compartido

`BACKLOG_PENDIENTES.md` (en el root del repo) es el **único archivo donde ambos Claudes escribimos**, pero con prefijos separados:

- `VM-YYYYMMDD-NN` — items del dominio Ventas & Marketing.
- `PR-YYYYMMDD-NN` — items del dominio Producto.
- `BP-NNN` — items legacy (previos a la separación).

Cada Claude lee todos los items al inicio de sesión. Cada uno actúa solo sobre los de su prefijo. Si un item pide handoff al otro dominio, queda trazable vía ese prefijo.

---

## Protocolo de handoff (cuando algo cruza dominios)

Cuando vos (Claude Producto) detectás algo que necesita intervención del Claude VM (ej: "terminé la feature X, hay que comunicarla"):

1. Anotá en `BACKLOG_PENDIENTES.md` con prefijo `PR-` + fecha, describiendo qué pasó y qué necesita VM.
2. Si es urgente, avisale a Tomy en el chat: "Armé handoff PR-XXX para VM, ¿lo priorizamos?"
3. No hace falta que escribas nada dentro de `CLAUDE_VM/`. El handoff queda en el archivo compartido.

El Claude VM tiene una skill específica llamada `handoff-claude-to-claude` que formaliza este protocolo desde su lado.

---

## TL;DR para Claude Producto

1. **`CLAUDE_VM/` es territorio del Claude VM. No lo tocás.**
2. Podés leer contenido de ahí si necesitás contexto comercial.
3. Si detectás algo desalineado, avisale a Tomy.
4. Handoffs cross-dominio → `BACKLOG_PENDIENTES.md` con prefijos.
5. Tu trabajo sigue igual que siempre: código, migraciones, deploys, todo fuera de `CLAUDE_VM/`.

---

## Para Tomy

Si sentís que el Claude de Producto se confunde o no respeta esta separación, pedile que lea este archivo explícitamente:

> *"Leé `CLAUDE_VM/PARA_CLAUDE_PRODUCTO.md` y respetá las reglas. Es la documentación formal del scope del Claude de Ventas & Marketing."*

Y adicionalmente, idealmente agregamos una línea en el `CLAUDE.md` del Producto que diga:

> *"Regla: la carpeta `CLAUDE_VM/` es dominio exclusivo del Claude de Ventas & Marketing. Leer-only. No editar, no crear, no borrar. Ver `CLAUDE_VM/PARA_CLAUDE_PRODUCTO.md` para detalles."*

---

_Última actualización: 2026-04-19 — Sesión 2 VM._
