# ERRORES_CLAUDE_NO_REPETIR.md — Errores que Claude NO debe volver a cometer

> **Instrucción**: Claude DEBE leer este archivo al inicio de cada sesión.
> Cada error está documentado con causa raíz y la regla que lo previene.
> Si Claude comete un error que ya está acá, es una falla grave de proceso.

> **Última actualización: 2026-04-20 — Sesión 53 (2 errores/patrones nuevos: VTEX tiene 2 mecanismos de webhooks (uno con UI y otro API-only), cambios en config de terceros en prod requieren checklist de 7+ puntos + dry-run).**

---

## Error #S53-VTEX-HOOKS-TWO-MECHANISMS — Asumir que los webhooks de VTEX estan todos en la UI de Admin

**Cuándo pasó**: Sesión 53, cerrando BP-MT-OPS-001. Asumí inicialmente que todos los webhooks de VTEX estaban en un solo lugar de la UI. Tomy tambien recordaba "haberlos configurado en el admin". Pero al buscar encontramos solo 1 de los 2 (el de inventory, en Afiliados). Después de revisar código, docs y confirmar via API, descubrí que VTEX tiene DOS mecanismos separados:

1. **Afiliados** (Admin → Configuracion de la tienda → Pedidos → Configuracion → tab Afiliados) — TIENE UI. Cada afiliado tiene un "Endpoint de busca". Maneja eventos de SKU/inventory principalmente.
2. **Orders Broadcaster** (`POST /api/orders/hook/config`) — **NO TIENE UI**. Solo API. Maneja cambios de estado de ordenes (order-created, payment-approved, invoiced, etc.).

### Causa raíz
- Asumí paridad entre UI y totalidad de features. Error tipico: "si tiene UI para A, tiene UI para todo".
- La doc de VTEX está fragmentada y no deja claro que son 2 mecanismos separados.

### Regla
**Para onboarding / auditoria de webhooks en plataformas externas (VTEX, MELI, Shopify, etc.), SIEMPRE chequear via API además de la UI.** No basta con la UI del admin.

Para VTEX específicamente, siempre correr estos 2 curls al inicio:
```bash
# Lista Afiliados (orders API si existe en UI)
curl -H "X-VTEX-API-AppKey: $KEY" -H "X-VTEX-API-AppToken: $TOKEN" \
  "https://{account}.vtexcommercestable.com.br/api/checkout/pvt/configuration/orderForm/affiliates"

# Lista Orders Broadcaster (API-only, NO aparece en UI)
curl -H "X-VTEX-API-AppKey: $KEY" -H "X-VTEX-API-AppToken: $TOKEN" \
  "https://{account}.vtexcommercestable.com.br/api/orders/hook/config"
```

El segundo es el que uno olvida. Si devuelve un objeto con `hook.url`, hay un webhook de orders configurado via API que **no aparece** en la UI.

### Prevención
- Al onboardear cualquier cliente VTEX, incluir en checklist: "lista hooks via ambos endpoints"
- Documentar en el runbook de onboarding que el Orders Broadcaster es API-only
- Agregado a MEMORY.md como patron crítico multi-tenant

---

## Error #S53-PROD-CHANGES-SIN-DRY-RUN — Ejecutar cambios en producción externa sin checklist ni dry-run

**Cuándo pasó**: Sesión 53. Inicialmente propuse a Tomy "ejecutar el PUT para actualizar el webhook VTEX" con un plan de 4 pasos simples. Tomy (con razón) me frenó 3 veces pidiendo análisis más profundo. Me llamó la atención explícita: *"necesito que seas más quirúrgico y minucioso"*.

Tras la tercera iteración terminé con un plan robusto que incluyó:
- Checklist de 7 puntos pre-ejecución
- Dry-run idempotente (POST con config actual sin cambios) para validar creds + payload
- Rollback payload listo
- Verificación end-to-end triggerendo con data real (orden real de hace 2 min)

Esto debería haber sido el plan DESDE el inicio, no después de que Tomy me lo exigiera 3 veces.

### Causa raíz
- Confundí "acción reversible en minutos" con "acción de bajo riesgo justificando plan simple"
- No internalicé que producción externa (VTEX, MELI, etc.) merece el mismo nivel de cuidado que producción propia (DB)
- Tomy es founder no técnico — mi trabajo es proteger su plataforma con el máximo rigor, no optimizar para velocidad

### Regla
**Para cualquier cambio en config de sistema externo en prod (VTEX, MELI, Meta, Google, GA4, Resend, etc.), ejecutar este checklist MÍNIMO de 7 puntos ANTES de cualquier POST/PUT/DELETE:**

1. **Código receptor deployado**: ¿el codigo que va a recibir el nuevo shape YA está en `origin/main`? (verificar con `git merge-base --is-ancestor <commit> origin/main`)
2. **Fallback en código propio**: ¿si llega payload viejo durante la ventana, el código no crashea?
3. **Atomicidad en el sistema externo**: ¿el POST/PUT reemplaza config de manera atómica (sin half-applied state)?
4. **Backup capturado**: ¿tengo la config actual guardada byte a byte para rollback?
5. **Rollback en un comando**: ¿tengo el curl exacto para volver al estado previo?
6. **Red de seguridad secundaria**: ¿hay cron nocturno / reintentos / data persistida en el sistema externo que garantice recuperación aunque el cambio falle?
7. **Dry-run idempotente**: ¿puedo probar las credenciales de escritura enviando la config ACTUAL (idéntica) antes del cambio real?

Solo tras PASAR los 7 puntos, ejecutar el cambio real + GET verificación + test end-to-end con data real.

**Patron DRY-RUN**: el dry-run es un POST con la config actual (sin cambios). Si devuelve 2xx, probamos que:
- Credenciales tienen permiso de escritura ✅
- Payload es aceptado por el endpoint ✅
- No cambió nada (idempotente) ✅

Solo después del dry-run exitoso, ejecutar el cambio real.

**Patrón TEST END-TO-END**: no conformarse con "HTTP 200 en el save". Triggerear el flujo completo con data real:
- Para webhooks: simular el webhook con un orderId REAL reciente
- Para API keys: hacer una llamada real al endpoint protegido
- Para DB migrations: correr una query de ejemplo que use el schema nuevo

Solo si el pipeline COMPLETO procesa correctamente, confirmar éxito.

### Prevención
- Agregado a MEMORY.md como patron crítico para cambios en prod externa
- En sesiones futuras, si Tomy menciona "quirúrgico", "cero margen de error", "minucioso" — arrancar DIRECTO con el checklist de 7 puntos sin esperar que me lo pida

---

## Error #S52-FINDFIRST-SIN-ORGID — findFirst sin scoping de organizationId (multi-tenant unsafe)

**Cuándo pasó**: Sesión 52, auditoría multi-tenant profunda. Encontré 21 endpoints/funciones que usaban `prisma.X.findFirst({ where: { platform: "..." } })` SIN incluir `organizationId` en el where. Todos funcionaban perfecto en single-tenant (1 sola org en DB) pero habrían causado data leak silencioso el día que se cree la 2da org (Arredo). Específicamente:
- `getSellerToken()` devolvía el token de cualquier conn ML
- Webhooks VTEX podían procesar órdenes en la org equivocada
- Endpoints de páginas ML (dashboard, reputacion, preguntas, publicaciones) usaban findFirst para resolver orgId en vez de tomarlo de session
- Admin endpoints (fix-brands, etc) tenían orgId hardcoded o default a org específica

### Causa raíz
- En single-tenant no hay penalty — siempre hay solo 1 conn VTEX/ML/etc, así que findFirst siempre devuelve la correcta.
- Dev diario no expone el bug → se propaga por meses.
- El bug se manifiesta EL DÍA que se crea la 2da org y ya es tarde (data mezclada silenciosamente).

### Regla
**En cualquier query que busque entidades scopeadas a org (Connection, Product, Order, Customer, Alert, etc.), SIEMPRE incluir `organizationId` en el WHERE.** Si no hay orgId en scope, resolverlo explícitamente antes:
- Endpoints autenticados: `const orgId = await getOrganizationId()` desde session
- Endpoints públicos (webhooks): resolver por identifier único del payload (mlUserId, accountName, etc.) o query param `?org=`
- Endpoints admin sin session: query param `?org=` explícito

```ts
// ✅ BIEN
const orgId = await getOrganizationId();
const connection = await prisma.connection.findFirst({
  where: { platform: "MERCADOLIBRE" as any, organizationId: orgId },
});

// ❌ MAL (multi-tenant unsafe)
const connection = await prisma.connection.findFirst({
  where: { platform: "MERCADOLIBRE" as any },
});
```

**Antipatrón adicional**: `const orgId = connection.organizationId` **después** del findFirst. Esto es circular — ya usaste la conn de org equivocada.

**Ver también**: patrón de fallback condicional en auth-guard para casos transicionales single→multi.

---

## Error #S52-AUDITORIA-UN-SOLO-PASE — Auditorías de seguridad de un solo pase son insuficientes

**Cuándo pasó**: Sesión 52. Primer pase de auditoría multi-tenant encontró 13 hallazgos. Tomy pidió auditoría profunda PRE-MERGE para "cero margen de error". Segundo pase encontró **8 bugs adicionales** que se habían escapado del pase inicial. Si hubiera mergeado con solo el pase 1, esos 8 bugs habrían llegado a producción.

### Causa raíz
- Primer pase usa queries amplias (Agent Explore) que cubren los casos obvios pero miss patterns específicos.
- Los bugs multi-tenant son sutiles: no rompen tsc, no rompen en single-tenant, no se ven en testing visual.
- Exceso de confianza post-primer pase = tentación de mergear sin segundo review.

### Regla
**Para cambios sistémicos críticos (multi-tenant, auth, permisos, pagos), SIEMPRE hacer 2 pases de auditoría antes de mergear:**

**Pase 1 (amplio)**: Agent Explore o similar — lista amplia de hallazgos.
**Pase 2 (profundo, pre-merge)**: greps específicos con patterns exactos:
- `platform:\s*"X"` sin `organizationId`
- `updateMany\(` / `deleteMany\(` sin filter de org
- `organization\.findFirst\(\)` sin filter
- `const ORG_ID = env \|\| "hardcoded"`
- Hardcoded IDs literales del cliente actual

El pase 2 típicamente descubre **~50% más bugs** que el pase 1. Si no se hace, esos bugs llegan a producción.

**Regla adicional — branch preview pre-merge**: para cambios críticos, usar branch + preview URL de Vercel + validación user antes de merge a main. NO es violación de la "solo main" rule si el user lo autoriza explícitamente.

**Señal de alarma**: si pensaste "ya está todo cubierto, mergeo" tras el primer pase → hacé el pase 2 igual. Toma 30 minutos extra, previene data leak silencioso en producción.

---

## Error #S51-SCHEDULE-EVERY-OPEN — Schedules disparaban cada apertura de /alertas

**Cuándo pasó**: Sesión 51, mientras leía `engine.ts` para implementar el cron `/api/cron/alerts-scheduler`. Descubrí que la función `evaluateRule` para reglas type=schedule llamaba `primitive.evaluate()` y actualizaba `lastFiredAt` cada vez que se ejecutaba — sin chequear si `nextFireAt` ya había llegado. Resultado: **cada vez que el user abría `/alertas`, todas las schedules disparaban de nuevo**, generando "alertas múltiples" silenciosamente. El bug existía desde la implementación original del rules engine en S50 (commit `59e7879`) y nunca se detectó por QA visual porque el síntoma era "alerta aparece" (correcto en superficie, multiplicado en realidad).

### Causa raíz
- La logica original chequeaba cooldown solo para `type='condition'`, pero para `type='schedule'` ejecutaba sin guardas.
- Solo se actualizaba `lastFiredAt`, nunca se actualizaba `nextFireAt` después de disparar — entonces el campo quedaba "huérfano" y el motor no tenía forma de saber cuándo volver a disparar.
- QA visual no detectaba el bug porque la UI agrupaba o deduplicaba alertas similares al renderizar.
- El bug solo se hacía visible si: (a) abrías `/alertas` 10 veces seguidas y mirabas DB; o (b) tenías email activo y te llegaban N emails por apertura.

### Regla
**Para cualquier feature que tenga "ejecutar en horarios programados" (schedules, cron jobs, scheduled emails, etc.), el motor DEBE chequear:**
1. **dueNow**: ¿`nextFireAt` ya llegó o nunca disparó?
2. **recentlyFired**: ¿está dentro de la ventana de visibilidad (ej: 24h) para mostrar el último resultado sin re-ejecutar?
3. **silencio**: si no es ni A ni B, NO ejecutar.

Y al disparar, **actualizar TANTO `lastFiredAt` COMO `nextFireAt = compute(schedule)`** — nunca uno sin el otro.

```ts
// ✅ BIEN
if (rule.type === "schedule") {
  const dueNow = !nextFireAt || nextFireAt <= now;
  const recentlyFired = lastFiredAt && now - lastFiredAt < 24 * 3600 * 1000;
  if (dueNow) { /* fire + update both timestamps */ }
  else if (recentlyFired) { /* show without re-firing */ }
  else return null; // silencio
}
```

**Antipatrón**:
```ts
// ❌ MAL — dispara cada vez sin chequear nextFireAt
const result = await primitive.evaluate(...);
await prisma.$executeRaw`UPDATE alert_rules SET lastFiredAt = NOW() WHERE id = ${rule.id}`;
// nextFireAt nunca se actualiza
```

**Conexión con #S24-L2-METASYNC**: cuando tocás un sistema existente para agregar features nuevas, REVISAR la lógica existente. El QA visual no detecta bugs sutiles de comportamiento — solo bugs visibles. Si vas a tocar el motor para agregar el cron, primero verificá que el motor actual hace lo que DEBE hacer.

**Detección preventiva**: cuando agregues un campo "schedule" o "nextFireAt" al schema, agregar un test mental: "si llamo evaluateRule 2 veces seguidas, ¿lastFiredAt cambia solo la primera vez?".

---

## Error #S51-MAX-TOKENS-TRUNCATION — Tool exitosa pero reply truncado sin fallback informativo

**Cuándo pasó**: Sesión 51. Tomy probó crear una regla desde el FloatingAurum (bubble lateral, modelo Haiku con `max_tokens=600`). La tool `create_alert_rule` ejecutó correctamente y guardó la regla en DB, pero Haiku se quedó sin tokens al generar el mensaje de cierre. El loop salió sin `finalReply` y el código mostraba el fallback genérico "No pude generar una respuesta. Probá de nuevo." — engañando al user a creer que la regla NO se había creado, cuando en realidad SÍ. Tomy intentó de nuevo y el dedupe saltó: "ya tenés una regla así". Solo ahí supo que la primera había funcionado.

### Causa raíz
- `max_tokens=600` en `/api/aurum/section-insight` era suficiente para insight inicial / pregunta puntual, pero NO para tool-use loop con tool inputs largos + texto de cierre.
- El loop salía con `finalReply = ""` y caía al fallback `"No pude generar una respuesta"` que no diferenciaba entre "el modelo no genero nada" y "el modelo ejecuto una tool con éxito pero no pudo generar el mensaje de cierre".
- El usuario creía que el sistema fallaba cuando en realidad la operación se había completado exitosamente.

### Regla
**Para cualquier tool-use loop con riesgo de truncation por max_tokens, implementar dos defensas combinadas:**

1. **Subir max_tokens** a un margen suficiente (1500+ para Haiku con tools complejas, 4000+ para Sonnet).
2. **Tracking de "última tool exitosa"** durante el loop — si el modelo se queda sin tokens al final, generar el reply manualmente basado en qué tool ejecutó:

```ts
let lastSuccessfulTool: { name: string; resultText: string } | null = null;

for (let round = 0; round < MAX_ROUNDS; round++) {
  // ... ejecutar tools ...
  for (const tool of toolUseBlocks) {
    const result = await executeTool(tool.name, tool.input, ctx);
    if (result.startsWith("OK ")) {
      lastSuccessfulTool = { name: tool.name, resultText: result };
    }
  }
}

// Fallback inteligente:
if (!finalReply && lastSuccessfulTool) {
  if (lastSuccessfulTool.name === "create_xxx") {
    finalReply = "✓ Listo, X creada con éxito.";
  }
  // ... otros casos por tool
}
```

**Antipatrón**:
```ts
// ❌ MAL — fallback genérico que engaña al user
if (!finalReply) finalReply = "No pude generar una respuesta. Probá de nuevo.";
```

**Señal de alarma**: si el user reporta que "intenté X 2 veces y la segunda dijo que ya existía", probablemente la primera ejecución exitosa quedó "tapada" por un fallback genérico.

**Conexión con #S49-SILENT-FETCH-FAIL**: ambos errores son la misma familia — el sistema hace algo correctamente pero la capa de presentación no comunica el resultado real al user. Lesson general: **el feedback al user debe reflejar el estado real del sistema, no el estado de "completé bien la generación de texto"**.

---

## Error #S51-DESCARTAR-COMO-REDUNDANTE — Descartar feature sin evaluar costos operativos reales

**Cuándo pasó**: Sesión 51. Yo había marcado la **Fase 8g-3c (Wizard de creación de reglas desde formulario)** como "redundante con Aurum chat — bajo valor" en mi planificación. Razonamiento: "si Aurum chat ya hace lo mismo y mejor, ¿para qué duplicar?". Tomy lo pidió expresamente más tarde con dos razones que yo no había considerado:
1. **Costo operativo de tokens**: cada creación via Aurum gasta ~3K tokens (descubrimiento + propuesta + creación). Wizard form gasta 0 tokens.
2. **Preferencia UX**: muchos users prefieren forms guiados sobre chat, especialmente para configuración previsible.

### Causa raíz
Yo evalué solo 1 dimensión: **costo de implementación duplicado** ("ya tenemos esto en Aurum, no hace falta hacerlo dos veces"). Ignoré:
- **Costo operativo**: cada feature delegada solo a Aurum tiene un costo recurrente en tokens que escala con uso.
- **Preferencia UX por segmento**: no todos los users prefieren chat. Hay perfiles operativos no técnicos que prefieren forms.
- **Costo de mantenimiento futuro**: el wizard reusa subcomponentes del EditDrawer (Field/Section/ParamField/etc) — implementarlo realmente costó pocas líneas extra.

### Regla
**Cuando descarte una feature como "redundante", evaluar 4 dimensiones antes de marcarla como bajo valor:**

1. **Costo de implementación**: ¿cuántas líneas, cuánto reuso?
2. **Costo operativo recurrente**: ¿la otra forma tiene costo por uso (tokens, llamadas API, etc.)?
3. **Preferencia UX por segmento**: ¿hay users que prefieren la otra modalidad?
4. **Costo de mantenimiento**: ¿la duplicación realmente lo es, o son features complementarias que comparten core?

Si dudás en alguna, **preguntar al user antes de descartar**. La pregunta más útil es: "veo que esto es similar a X que ya tenemos. ¿Te parece valioso tener ambos o lo dejamos solo X?".

**Antipatrón**:
```
"8g-3c Wizard crear desde UI: redundante con Aurum chat. BAJO valor."
```

**Patrón correcto**:
```
"8g-3c Wizard crear desde UI: complementa a Aurum chat con form previsible
+ ahorra ~3K tokens por creación. Trade-off: preguntarle a Tomy si valora
estos beneficios sobre el costo de implementación (~1-2 hs)."
```

**Señal de alarma**: si Tomy te pide algo que ya habías marcado como "redundante / bajo valor", reflexioná sobre qué dimensión te perdiste. Casi siempre es una de las 4 de arriba.

---

## Error #S49-JWT-STALE-TOKEN — Confiar en session.user.id sin fallback por email

**Cuándo pasó**: Sesión 49, Fase 8e Alertas. Creé `/api/alerts/read` POST/DELETE + `/api/alerts/favorite` POST/DELETE usando `(session?.user as any)?.id ?? null` para obtener el userId. El user marcaba alertas como leídas pero al refrescar volvían como no leídas + el badge externo no bajaba. Diagnostico: visitando GET `/api/alerts/read` devolvia `{"error":"No autenticado","userId":null}`. Causa: el JWT de Tomy fue emitido antes de que se agregara `token.id = user.id` en el callback de NextAuth en sesiones anteriores. Los tokens JWT viejos no se actualizan hasta logout+login explicito, asi que `session.user.id` venia undefined para ese user aun estando logueado.

### Causa raíz
- Cuando se agrega un campo nuevo al token JWT callback, los usuarios con sesiones activas mantienen sus tokens viejos sin ese campo hasta logout.
- Confie en `session.user.id` como si fuera siempre truthy, sin considerar el escenario JWT stale.
- El fallo era silencioso: el POST devolvia 401 pero el client ignoraba `res.ok`, haciendo optimistic UI local que parecia funcionar pero nada persistia en DB.
- `getUserReads()` en alert-hub recibia `userId=null` y devolvia Set vacio, asi que el GET `/api/alerts` tampoco marcaba ninguna alerta como leida → estado inconsistente multi-capa.

### Regla
**Nunca confiar en `session.user.id` directo. Usar siempre el patron "email-first con lookup en DB" que usa `permission-guard.ts` (ya probado productivo)**:

```ts
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  // 1. Preferir session.user.id si existe (mas rapido)
  const idFromSession = (session?.user as any)?.id;
  if (idFromSession) return idFromSession;
  // 2. Fallback por email (SIEMPRE expuesto por NextAuth)
  const email = session?.user?.email;
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email }, select: { id: true },
  });
  return user?.id ?? null;
}
```

Este helper vive en `src/lib/alerts/get-user-id.ts` y debe usarse en cualquier endpoint nuevo que resuelva userId desde sesion.

**Antipatrón**:
```ts
// ❌ MAL — falla para tokens viejos
async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id ?? null;
}
```

**Señal de alarma**: si un feature "funciona en la sesion pero no persiste al refrescar" o "funciona en test nuevo pero no en user viejo", chequear primero si el endpoint depende de `session.user.id`. Probablemente JWT stale.

---

## Error #S49-SILENT-FETCH-FAIL — Client-side fetch sin check de res.ok silencia bugs criticos

**Cuándo pasó**: Sesión 49. En `setAlertRead` del page.tsx use `try { await fetch(...) } catch { rollback }`. El try/catch solo captura errores de red (fetch rejected). Si el servidor devolvia 401 o 500, `fetch` resolvia OK y el codigo continuaba como si el write hubiera exitoso. Resultado: optimistic UI local funcionaba pero nada persistia en DB, y el user no tenia forma de saberlo (solo al refrescar veia que volvia todo atras). Tomy reporto el problema 2 veces antes de que identificaramos el root cause.

### Causa raíz
- `fetch` solo rechaza en errores de red/CORS. Status codes 4xx/5xx NO hacen reject.
- El try/catch daba sensacion de estar manejando errores cuando en realidad solo capturaba una fraccion.
- Sin surfacing visible al user (console.error a secas no le sirve a un user no-tecnico) los 401/500 pasaban desapercibidos.

### Regla
**En cualquier fetch client-side con efectos de DB persistentes (POST/PUT/DELETE), chequear SIEMPRE `res.ok` y mostrar banner/toast visible al user cuando falla**:

```ts
// ✅ BIEN
const res = await fetch("/api/x", { method: "POST", ... });
if (!res.ok) {
  const errText = await res.text().catch(() => "");
  console.error(`[feature] fallo (${res.status})`, errText);
  setWarning(`No se pudo guardar (HTTP ${res.status}). ${errText.slice(0, 200)}`);
  // rollback del optimistic UI
  return;
}
// ok: pingBadgeRefresh o lo que corresponda
```

**Antipatrón**:
```ts
// ❌ MAL — el servidor puede devolver 401/500 y el catch no se entera
try {
  await fetch("/api/x", { method: "POST" });
  // continua como si exitoso
} catch {
  // rollback solo si red fallo
}
```

**Regla adicional — banner transitorio**: cuando falla un write, mostrar un banner rojo con el HTTP status exacto + primeros 200 chars del body del error. Auto-dismiss 8s. Esto:
- Surfacea inmediatamente el bug al user no-tecnico (no hace falta devtools).
- Permite diagnosticar HTTP status: 401 = autenticacion, 403 = permisos, 500 = server error.
- Si el user reporta "tal cosa no persiste", pedirle que nos mande el banner.

**GET de diagnostico**: para features multi-capa (client → API → DB), crear un endpoint GET de diagnostico que devuelve el estado actual en DB del user logueado (ej: `GET /api/alerts/read` devuelve `{userId, totalReads, recentReads}`). El user puede visitarlo desde el browser y mandarme el JSON, sin necesidad de saber devtools.

---

## Error #S30-AURUM-HALO — Asumir que entendi el feedback visual sin verificar con el usuario

**Cuándo pasó**: Sesión 30. Tomy comparte screenshot del orb Aurum con anillo Saturno y dice _"la aurora alrededor de la bola está mal diseñada porque se ve la parte que no se debería ver"_. Yo interpreto que habla del halo EXTERIOR de la burbuja y arreglo eso (reemplazo blur div por box-shadow + overflow:hidden). Tomy vuelve con el MISMO screenshot: _"no es que el halo está por fuera de la parte oscura, sino que el halo no da el efecto de que está alrededor del círculo, porque la parte de atrás del halo está por delante del círculo dorado. Fijate bien profundamente"_. Recién ahí entendí que hablaba del anillo Saturno y su oclusión 3D (la mitad de atrás del anillo tenía que pasar detrás de la esfera, no en frente).

### Causa raíz
- Palabra ambigua ("aurora" / "halo") tiene varios candidatos visuales en la UI (halo exterior de la burbuja, anillo del orb, glow interno). Elegí el primero que se me ocurrió sin preguntar.
- No le pedí a Tomy que señalara o describiera más específico antes de hacer el cambio.

### Regla
**Cuando el feedback visual es ambiguo y hay múltiples candidatos en la imagen, NO asumir: pedir clarificación.** Preguntas válidas: "¿te referís al halo exterior de la burbuja, al anillo alrededor del orb, o al glow interno?". O mandar una anotación pidiendo que marque en el screenshot.

**Señal de alarma**: si Tomy comparte el MISMO screenshot dos veces, casi siempre es porque no entendí el feedback la primera vez.

---

## Error #S27-REBUILD — Rediseñar seccion entera sin pedido explicito

**Cuándo pasó**: Sesión 27. En el marco de rebuilding `/campaigns/google` (que SÍ estaba pedido), tambien reescribi el **Overview** de `/campaigns` desde cero con una estructura nueva (cards + jerarquia distinta). Tomy reaccionó: _"restauralo tal cual estaba"_ → commit `4e43d4f` de revert.

### Causa raíz
- Scope creep: estaba "en zona" tocando `/campaigns` y decidí que el Overview "tambien podía mejorar". Tomy no lo pidió.
- Confundí "rebuild de /campaigns/google" (pedido explícito) con "rebuild de /campaigns entero" (no pedido).

### Regla
**Cambios estructurales / rewrites de secciones existentes requieren pedido EXPLICITO.** Si estoy tocando una seccion y veo algo "que se podría mejorar" afuera del scope pedido, **primero preguntar** antes de tocarlo. Un commit revertido es peor que un commit no escrito.

**Antipatrón**: "ya que estoy acá, aprovecho y mejoro también X". Casi siempre termina en revert.

---

## Error #S25-CRONS-PREMATUROS — Agregar crons multi-tenant cuando no hace falta

**Cuándo pasó**: Sesión 25. Agregué crons horarios/diarios multi-tenant para syncar Meta y Google Ads de todas las orgs activas. A la hora volví a revertir a on-demand porque:
- Hay 1 org activa (no es multi-tenant real todavía).
- Los crons consumían API quota de Meta y Google sin beneficio (el usuario abre `/campaigns/*` y el sync on-demand dispara con `waitUntil` via `useSyncStatus`).
- CLAUDE.md ya indicaba sync on-demand para ads (modelo decidido en S17+).

### Causa raíz
- No consulté CLAUDE.md antes de meter mano en la arquitectura de sync (la tabla del modelo de sync ya decía "on-demand" para Meta/Google).
- Asumí que "mejor fresco" era universalmente bueno, sin evaluar costo (API quota) ni beneficio real (¿quién necesita datos frescos a las 3am si nadie está mirando?).

### Regla
**Antes de cambiar la arquitectura de sync, leer la tabla en CLAUDE.md ("Modelo de sync de datos").** Si ya hay una decisión documentada y quiero cambiarla, preguntarle a Tomy PRIMERO con la justificación.

**Criterio para crons vs on-demand**:
- Usuario abre la pagina y necesita datos → on-demand.
- Hay multi-tenant real y los datos tienen que estar frescos aunque nadie mire → crons.
- Hoy (1 org): on-demand gana siempre.

---

## Error #S23-META-VIDEO-FIELDS — Pedir fields en el endpoint equivocado de Meta

**Cuándo pasó**: Sesión 23. Para resolver el video de un creative Meta, pedí `effective_object_story_id` como campo del `/ads` endpoint de Meta Marketing API. Meta devolvía error: ese campo solo vive en `/adcreatives`, no en `/ads`. Además intentaba leer `video_source.source_url` con el user access token, que Meta rechaza — solo `META_PAGE_ACCESS_TOKEN` (el token de la page owner del video) tiene permiso para ese campo.

### Causa raíz
- Mezclé fields de entidades distintas en Meta (Ad vs AdCreative vs Video). Cada entidad tiene su propio set de fields válidos.
- Usé el token por default (user token) sin chequear qué token requiere cada campo específico.

### Regla
**Cuando un call a Meta Marketing API falla por campo inválido**:
1. Primero confirmar en qué entidad vive ese campo (`/ads`, `/adcreatives`, `/videos`, `/adsets`, `/adaccounts`).
2. Chequear qué token-scope requiere el campo (user token vs page token vs system user).
3. `video_source.source_url` en particular: SIEMPRE requiere `META_PAGE_ACCESS_TOKEN` de la page que posee el video.

**Patron de fallback util**: permalink embed de Facebook (`https://www.facebook.com/.../videos/{id}`) funciona siempre sin requerir source_url → siempre tenerlo como backup confiable cuando el source_url es opcional.

---

## Error #S24-L2-METASYNC — Debuggear en UI lo que en realidad era bug en la ingesta

**Cuándo pasó**: Sesión 24. El drilldown L2 (AdSet detail) del Creativos Lab venía vacío para muchos adsets. Invertí 8+ commits intentando fixes en la UI / query / fallbacks:
- Fetch dedicado por adSet (`165bfbd`)
- Endpoint `/by-adset` (`4ff2d51`)
- Fallback a galleryCreatives filtrado (`abdd9d2`)
- Debug logging (`6697e57`)
- Fallback a campaña padre (`e694d0b`)
- No duplicar con multi-adsets (`50c97d9`)

Recién en el commit `188749a` identifiqué el **root cause real**: el sync de Meta **no estaba linkeando** `AdCreative -> AdSet` al upsertear. Sin ese link, cualquier query "creativos por adSet" iba a devolver vacío, no importa qué fallback tuviera.

### Causa raíz
- Cuando algo viene vacío de la DB, mi primer instinto fue "hagamos más fallbacks en el read path" en vez de "verifiquemos que la ingesta esté guardando el link correctamente".
- No corrí una query directa a Prisma tipo `AdCreative.findMany({ where: { adSetId: { not: null } } })` para ver si el campo estaba poblado. Si lo hubiera hecho, hubiera visto en 30 segundos que `adSetId` estaba null en casi todos los records.

### Regla
**Cuando un drilldown / filtro / relación venga vacío, el paso #1 es verificar que el DATO EXISTE en la DB con la relación esperada.** Query directa:
```ts
await prisma.adCreative.findMany({ where: { adSetId: { not: null } }, take: 5 })
```

**Si la relación no existe en la DB, arreglar la INGESTA primero. Después pensar en fallbacks del read-path.**

**Antipatrón**: agregar capas de fallback en el read-path para compensar un bug de la ingesta. Se vuelve código zombi imposible de mantener.

**Conexion con Error #S22-A**: misma regla. Siempre arreglar en la fuente de los datos primero.

---

## Error #NUEVO-S22-F — Pasar comandos con paths placeholder + asumir binarios locales

**Cuándo pasó**: Sesión 22 (Fase 1 de /campaigns). Le pasé a Tomy dos versiones del mismo flujo de git:

1. **Versión encadenada con `&&`**:
```
cd ~/path/a/nitrosales && git checkout main && git pull origin main && ./node_modules/.bin/tsc --noEmit && git add 'src/app/(app)/campaigns/page.tsx' && git commit -m "..." && git push origin main
```

2. **Versión multilínea** (los mismos comandos uno por uno).

**Qué pasó**: la encadenada falló en el primer paso (`cd: no such file or directory: /Users/tomylapidus/path/a/nitrosales`). El `&&` cortó toda la cadena → no se ejecutó nada más. La multilínea "funcionó" porque Tomy ya estaba en el directorio correcto, así que el `cd` falló de manera silenciosa pero los siguientes comandos corrieron en el cwd actual igual.

Además, `./node_modules/.bin/tsc` también tiró `zsh: no such file or directory` — ese binario no existe en su setup. En la encadenada hubiera cortado todo; en la multilínea pasó al siguiente comando sin drama.

**Reacción de Tomy**: identificó que mi explicación inicial sobre por qué falló estaba mal y me hizo revisarlo. Tenía razón.

### Causa raíz de mi error
- Usé un path **placeholder** (`~/path/a/nitrosales`) en un comando que el usuario iba a pegar literal. Para un usuario no técnico, "reemplazá esto" es fricción innecesaria y fuente de errores.
- Asumí que `./node_modules/.bin/tsc` existía en su máquina sin verificarlo (en sesiones anteriores ya había aprendido que `npx tsc` instala el paquete equivocado, pero no documenté cuál es la alternativa segura).
- Al combinar ambos errores en un comando con `&&`, el primer fallo cortó todo y el comando se volvió inútil.

### Regla
**Comandos para que Tomy pegue en su terminal:**
1. **NO usar paths placeholder** (`~/path/a/...`, `~/proyecto/...`). Si el path real no es conocido, **omitir el `cd`** y asumir que está en el repo. En el peor caso, decirle "asegurate de estar en el repo antes de pegar esto".
2. **NO referenciar binarios locales con paths como `./node_modules/.bin/tsc`** sin haber confirmado que existen. Alternativa segura: si Vercel valida el build, **saltar el `tsc --noEmit` local** y confiar en el build de Vercel para el deploy preview.
3. **Por defecto: comandos multilínea** (uno por línea, sin `&&`). Son más tolerantes a fallos parciales y permiten al usuario ver qué pasó en cada paso.
4. **Solo usar `&&`** cuando esté 100% seguro de que cada paso va a funcionar (rara vez).
5. **Quotear paths con paréntesis con comillas simples**: `'src/app/(app)/campaigns/page.tsx'` en lugar de `src/app/\(app\)/campaigns/page.tsx`. Más legible y robusto en zsh.

### Comando estándar de push (locked) para futuras sesiones
```
git status
git diff --stat 'src/app/(app)/campaigns/page.tsx'
git add 'src/app/(app)/campaigns/page.tsx'
git commit -m "mensaje"
git push origin main
```
Sin `cd`, sin `tsc` local, sin `&&`. Asumir que Tomy está en el repo. La validación de TS la hace Vercel en el deploy.

---

## Error #NUEVO-S22-A — Proponer backfill cuando el problema está en la ingesta

**Cuándo pasó**: Sesión 22. Tomy notó que productos en Stock Muerto mostraban el placeholder "MO" (iniciales) en vez de foto. Armé un endpoint `/api/backfill/product-images` que iba a VTEX/MELI a traer imágenes para productos con `imageUrl=NULL`.

**Reacción de Tomy (verbatim)**: _"No quiero resolverlo con syncs, me parece inescalable los syncs. Las imagenes tienen que tomarse bien de la plataforma"_.

**Causa raíz de mi error**: Tomé el camino fácil (backfill reactivo) en vez de arreglar el bug de ingesta. El webhook de órdenes VTEX creaba productos con `imageUrl: null` cuando el payload no la traía, y eso quedaba así para siempre.

### Regla
**Si un dato está mal o falta en la DB, primero investigar DÓNDE se está capturando en la ingesta y arreglarlo ahí.** Los backfills son un parche reactivo que hay que correr de por vida. El fix correcto va en webhooks y syncs — que tomen el dato completo de la fuente en el momento en que entra al sistema.

**Antipatrón**: `/api/backfill/X` para completar datos que deberían haber entrado bien desde el principio.
**Patrón correcto**: modificar el webhook/sync para que, si un campo crítico viene vacío, lo pida a la API de la plataforma en el mismo flujo de ingesta.

**Ejemplo aplicado**: webhook VTEX orders ahora llama a `/api/catalog_system/pvt/sku/stockkeepingunitbyid/{id}` si el payload no trae imageUrl → captura la imagen en la fuente.

---

## Error #NUEVO-S22-B — Tablas oscuras para analizar datos

**Cuándo pasó**: Sesión 22. Para dar "look premium" a las tablas de Stock Muerto y Alerta de Quiebre, las diseñé con tema oscuro (slate-900 gradiente, amber/gold accents).

**Reacción de Tomy (verbatim)**: _"No me gustó que hayas hecho las tablas en oscuro. Para analizar datos me gusta siempre claro. Yo me refería a poner algun icono de alerta animado que luzca bien premium. Y mantener la tabla clara."_

### Regla
**Las tablas de análisis de datos (números, precios, stocks, KPIs) SIEMPRE van en tema LIGHT** (blanco/gris). Oscuro es para dashboards de monitoreo o contenido de bajo análisis.
**El "premium feel" en tablas claras se logra con:**
- Iconos animados (`animate-ping` sobre un badge de color)
- Tipografía cuidada (tracking, tamaños)
- Micro-interacciones (hover, ring, shadow)
- NO con fondos oscuros.

---

## Error #NUEVO-S22-C — Tablas infinitas sin scroll interno

**Cuándo pasó**: Sesión 22. Tablas con 5000+ rows paginadas a 15 por página seguían siendo "muy largas" porque la página scrolleaba mucho.

**Reacción de Tomy (verbatim)**: _"achicarlas un poco y ponerles scroll interno. Sino siento que se hacen muy largas."_

### Regla
**Tablas de detalle en secciones que comparten página con otras tablas DEBEN tener `max-h-[Npx] overflow-auto` + `sticky top-0 z-10` en el `<thead>`.** Esto mantiene filtros, header y otros bloques accesibles sin scroll gigante.

Valores de referencia NitroSales: `max-h-[420px]` para tablas secundarias (Alerta de Quiebre), `max-h-[480px]` para tablas primarias (Stock Muerto).

---

## Error #NUEVO-S22-D — Alerta de Quiebre mostraba todos los stock=0

**Cuándo pasó**: Sesión 22. La "Alerta de Quiebre de Stock" listaba todos los productos con stock=0, incluidos los que nunca se vendían. Tomy: _"Ahí me gustaría que aparezcan productos que se estan vendiendo bien los ultimos días"_.

### Regla
**Alertas de quiebre deben filtrar por velocidad de venta, no solo por stock=0.** Sin velocity, la alerta se llena de ruido (productos descontinuados, errores de catálogo).

**Criterio correcto aplicado**:
```ts
velocity >= 0.2 uds/dia && (
  (stock === 0 && daysSinceSale <= 30) ||  // quiebre reciente con demanda
  (stock > 0 && daysOfStock < 14)          // inminente quiebre
)
```

---

## Error #NUEVO-S22-E — `npx tsc --noEmit` sin typescript local ⇒ instala paquete equivocado

**Cuándo pasó**: Sesión 22. Le pasé a Tomy el comando `npx tsc --noEmit`. `npx` no encontró `tsc` en node_modules y ofreció instalar `tsc@2.0.4` (legacy compiler, NO es TypeScript). Tomy: "Me apareció esto" (con prompt "Ok to proceed? (y)").

### Regla
**Nunca sugerir `npx tsc` sin ser explícito sobre el binario correcto.** Opciones seguras:
- `npx --no-install tsc --noEmit` (falla si no está instalado, pero no instala basura)
- `./node_modules/.bin/tsc --noEmit`
- `npx typescript --noEmit`
- `npm exec -- tsc --noEmit`

Si aparece el prompt "Ok to proceed? (y)" sugiriendo `tsc@2.0.4`, avisar INMEDIATAMENTE que hay que decir **n** — ese paquete es un compilador viejo de CoffeeScript-ish, no es TypeScript.

---

## Error #1 — Field mismatch entre API y frontend

**Cuándo pasó**: Sesión 18, deploy de Phase 2 Analytics
**Síntoma**: Página en blanco (client-side exception)
**Causa raíz**: El API devolvía `device` pero el frontend esperaba `deviceType`. Lo mismo con `url`/`pageUrl` y `pageViews`/`views`.

### Regla
**Antes de consumir datos de un endpoint en el frontend, verificar los nombres EXACTOS de los campos que devuelve la query SQL.** No asumir que el campo se llama como el type de TypeScript. Abrir el endpoint, leer la query, confirmar el alias SQL, y usar ese nombre (o mapearlo explícitamente con fallback).

**Patrón correcto**:
```ts
const devices = rawDevices.map((d: any) => ({
  deviceType: d.deviceType || d.device || "unknown",  // ← fallback explícito
  count: Number(d.count) || 0,
}));
```

---

## Error #2 — Zona nueva sin try-catch crashea toda la página

**Cuándo pasó**: Sesión 18, deploy de Phase 2 Analytics
**Síntoma**: Página en blanco por un error en una sola zona nueva
**Causa raíz**: Las 3 zonas nuevas no tenían try-catch. Un error en una zona mataba todo el render.

### Regla
**Cada zona del dashboard DEBE estar envuelta en un IIFE con try-catch** que retorne `null` en caso de error. Nunca agregar una zona "suelta" al JSX.

**Patrón correcto**:
```tsx
{(() => {
  try {
    // ... zona completa ...
    return <div>...</div>;
  } catch {
    return null;
  }
})()}
```

---

## Error #3 — COUNT(*) en vez de COUNT(DISTINCT) para métricas de páginas

**Cuándo pasó**: Sesión 18, query de Top Pages
**Síntoma**: Checkout aparecía con más "visitas" que Home (imposible)
**Causa raíz**: `COUNT(*)` cuenta eventos, no visitantes. Checkout tiene múltiples eventos por usuario (pasos del checkout), inflando el número.

### Regla
**Para métricas de "páginas visitadas" o "tráfico por página", siempre usar `COUNT(DISTINCT visitorId)`.** `COUNT(*)` solo es correcto cuando queremos contar eventos totales explícitamente.

---

## Error #4 — regexp_replace con backslash en Prisma template literals

**Cuándo pasó**: Sesión 18, rewrite de query Top Pages
**Síntoma**: HTTP 500 al llamar al API
**Causa raíz**: `regexp_replace(url, '\?.*', '')` — JavaScript consume el `\` en el template literal antes de que llegue a PostgreSQL. PostgreSQL recibe `?.*` sin escape, regex inválida.

### Regla
**NUNCA usar `regexp_replace` con caracteres escapados dentro de `Prisma.$queryRaw` con template literals.** Usar alternativas que no requieran regex:

```sql
-- ❌ ROTO en Prisma template literals
regexp_replace(pe."pageUrl", '\?.*', '')

-- ✅ CORRECTO — sin regex
SPLIT_PART(pe."pageUrl", '?', 1)
```

Si absolutamente necesitás regex en Prisma, usar `Prisma.sql` con `Prisma.raw()` para el string de regex (y testearlo).

---

## Error #5 — SQL LIMIT bajo + agrupación en frontend = pocos resultados

**Cuándo pasó**: Sesión 18, Top Pages mostraba solo 4 resultados
**Síntoma**: Solo aparecían 4 páginas en vez de 5-6
**Causa raíz**: SQL tenía `LIMIT 10`, pero el frontend agrupaba URLs por label simplificado (ej: `/producto/123?color=azul` y `/producto/123?color=rojo` → misma label). 10 rows SQL se colapsaban a 4 labels.

### Regla
**Si el frontend agrupa/simplifica resultados del SQL, el LIMIT del SQL debe ser significativamente mayor** que la cantidad final deseada. Regla de pulgar: `LIMIT` = 3x a 5x del número final esperado.

---

## Error #6 — URLs encoded sin decodificar en la UI

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: Paths mostraban `1%20a%203%20a%C3%B1os` en vez de `1 A 3 Años`
**Causa raíz**: Las URLs en la DB están URL-encoded. El frontend las mostraba raw.

### Regla
**Siempre aplicar `decodeURIComponent()` (envuelto en try-catch) antes de mostrar cualquier URL o path al usuario.** Los datos de la DB vienen encoded.

```ts
try { path = decodeURIComponent(path); } catch { /* usar raw */ }
```

---

## Error #7 — Mostrar product IDs numéricos como nombre de página

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: Aparecía "726" como nombre de página
**Causa raíz**: Paths como `/726` son IDs de producto en VTEX. Sin tratamiento, el número aparece como label.

### Regla
**Paths que son solo dígitos (`/^\d+$/`) son IDs de producto.** Mostrarlos como `Producto #726` o filtrarlos si no aportan valor.

---

## Error #8 — Checkout como "página de contenido" en métricas de tráfico

**Cuándo pasó**: Sesión 18, Top Pages
**Síntoma**: `/checkout` aparecía como top page, con más eventos que Home
**Causa raíz**: Checkout es transaccional (múltiples eventos por visita), no es una "página de contenido" que el usuario browseó.

### Regla
**Excluir `/checkout%` de queries de "top pages" y "páginas más visitadas".** Checkout es un flujo transaccional, no content. Incluirlo distorsiona las métricas de navegación.

```sql
AND pe."pageUrl" NOT LIKE '%/checkout%'
```

---

## Error #9 — Fix atrapado en staging, nunca llegó a main (histórico)

**Cuándo pasó**: Sesiones 9-10
**Síntoma**: Pérdida de 1,600 órdenes MELI durante 6 días
**Causa raíz**: El fix del webhook estaba en staging pero main seguía con el código roto. El modelo de branches era innecesariamente complejo.

### Regla
**Todo va directo a `main`. No existen branches extra** (ver CLAUDE.md, modelo vigente desde sesión 11).

---

## Error #10 — Query con JOIN a tabla grande + CAST en columna mixta

**Cuándo pasó**: Sesión 16, query de provincias
**Síntoma**: Timeout de la API → página en blanco
**Causa raíz**: `LEFT JOIN customers` sobre 60K+ orders + `CAST(LEFT(postalCode,4) AS int)` sobre postalCodes que pueden ser alfanuméricos (`B1754BCD`).

### Regla
**NO hacer JOIN a tablas grandes en queries analíticas. NO usar CAST sobre columnas que pueden tener datos mixtos.** Si necesitás datos de otra tabla, usar query separada y cruzar en JS. Comparaciones de texto para postalCode.

---

## Error #11 — Payment gateway aparece como canal de tráfico

**Cuándo pasó**: Sesión 17-18, gocuotas en analytics
**Síntoma**: "gocuotas" aparecía como fuente de tráfico con revenue atribuido
**Causa raíz**: El referrer del pixel capturaba `gocuotas.com` como fuente cuando el usuario volvía del gateway de pago. Estos no son canales de adquisición.

### Regla
**Mantener y expandir la lista PAYMENT_GATEWAY_SOURCES** para filtrar gateways de pago de los datos de atribución. Filtrar en el response del API, no en las queries (para no perder datos históricos).

```ts
const PAYMENT_GATEWAY_SOURCES = [
  "gocuotas", "mercadopago", "payway", "decidir", "mobbex",
  "todopago", "paypal", "stripe", /* ... */
];
```

---

## Error #12 — Tarea programada de Claude Desktop olvidada

**Cuándo pasó**: Sesiones previas
**Síntoma**: Pestañas del navegador se abrían solas mostrando JSON crudo de endpoints de sync
**Causa raíz**: Una tarea programada de Claude Desktop ("Inventory sync runner", cron `*/5`) creada para completar el sync inicial nunca se desactivó.

### Regla
**Cuando aparezcan comportamientos inexplicables en el navegador, verificar PRIMERO `list_scheduled_tasks`** antes de buscar bugs en el código. Y cuando se cree una tarea temporal, documentar y planificar su desactivación.

---

## Error #13 — Agregar un campo al schema.prisma ANTES de crear la columna en la DB

**Cuándo pasó**: Sesión 20, intento inicial de agregar `categoryPath` al modelo Product.
**Síntoma potencial**: Prisma genera queries con `SELECT ... "categoryPath" ...` contra una columna que no existe → **TODAS las páginas que leen productos rompen con error SQL** (`column "categoryPath" does not exist`). Se detectó a tiempo y se revirtió antes del push.
**Causa raíz**: Prisma 5 genera SELECTs EXPLÍCITOS con todas las columnas del modelo. Si el schema declara un campo que la DB no tiene, cada read del modelo explota.

### Regla
**El orden OBLIGATORIO para agregar una columna nueva es:**
1. Crear un endpoint admin idempotente con `ADD COLUMN IF NOT EXISTS` y auth-key.
2. Ejecutar ese endpoint en producción y confirmar `columnExistsNow: true`.
3. RECIÉN DESPUÉS agregar el campo al `schema.prisma`.
4. Desplegar el código que usa el campo.

Nunca alterar el orden. Nunca agregar el campo al schema "preventivamente" confiando en que el deploy va a sincronizar.

---

## Error #14 — Duplicar productos en la UI porque el mismo SKU vive en 2 rows distintos (VTEX + MELI)

**Cuándo pasó**: Sesión 20, tabla de productos en /rentabilidad.
**Síntoma**: Mismo SKU aparecía dos veces en la tabla — una con imagen (VTEX) y otra sin imagen (MELI). Además las ventas se "partían" entre los dos rows.
**Causa raíz**: La DB guarda un row `Product` por canal (mismo SKU, distinto `externalId`). La query agrupaba por `productId` en vez de por SKU, tratando a los dos rows como productos distintos. El frontend mostraba ambos.

### Regla
**En queries analíticas multi-canal, agrupar por SKU (el identificador del negocio), no por `productId` (el identificador del row DB).** El patrón correcto es un CTE `master_products` que elige UN row por SKU con `DISTINCT ON (sku)` y un CTE `sales_by_sku` que suma ventas JOIN-eando por `p.sku`.

**Priority order para elegir el master** (ya probado en producción):
```sql
ORDER BY sku,
  CASE WHEN "imageUrl" IS NOT NULL AND "imageUrl" != '' THEN 0 ELSE 1 END,
  CASE WHEN "categoryPath" IS NOT NULL AND "categoryPath" != '' THEN 0 ELSE 1 END,
  CASE WHEN "costPrice" IS NOT NULL THEN 0 ELSE 1 END,
  "createdAt" ASC
```

**Nunca** resolver el problema a nivel UI con un "fallback de imagen" o deduplicacion JS — el cliente no tiene que ver que existe el problema. La fuente de verdad tiene que devolver 1 row por SKU.

---

## Error #15 — URL de producción incorrecta en CLAUDE.md

**Cuándo pasó**: Arrastre histórico. Detectado por Tomy en sesión 20.
**Síntoma**: CLAUDE.md afirmaba que el URL de producción era `app.nitrosales.io`, cuando el real es `https://nitrosales.vercel.app`. Claude lo repetía en respuestas, generando confusión.
**Causa raíz**: CLAUDE.md quedó con un URL aspiracional/histórico que nunca se actualizó al URL real del deploy.

### Regla
**El URL de producción real es `https://nitrosales.vercel.app`** (Vercel deploy de la rama `main`). Si CLAUDE.md u otro doc mencionan otro URL, está desactualizado — corregirlo en la misma sesión. Nunca repetir URLs de docs sin verificarlos contra la realidad.

---

## Error #16 — Tomar arbitrariamente unos datos de MELI y otros de VTEX en vez de definir un master

**Cuándo pasó**: Sesión 20, pipeline inicial de la tabla de productos.
**Síntoma**: Para el mismo SKU, la tabla mostraba la imagen desde el row que viniera primero (a veces VTEX, a veces MELI), pero las ventas eran del row específico del canal. Resultado: data inconsistente y dependiente del orden de inserción.
**Causa raíz**: No existía un criterio explícito de "¿cuál es la fuente de verdad de la metadata del producto?". Cada query tomaba lo que le quedaba más cerca.

### Regla
**Definir explícitamente el "master" para cada entidad multi-canal y elegir TODOS los campos de metadata desde ese master.** Para productos en NitroSales: VTEX es master del catálogo (imagen, brand, category, categoryPath, costPrice). MELI aporta SOLO ventas. Este principio debe aplicarse en cualquier query/pipeline que una datos de más de un canal (ej. clientes, ordenes cross-canal).

**Patrón**: CTE `master_<entidad>` con priority explícito → JOIN por business-key (SKU, email, document id) en lugar de por ID interno.

---

## Error #17 — No documentar deploys/errores al cierre de una sesión

**Cuándo pasó**: Sesiones 19-20. Pasaron fixes al repo sin actualizar `CLAUDE_STATE.md` ni `ERRORES_CLAUDE_NO_REPETIR.md`. Tomy lo detectó explícitamente y pidió documentar.
**Síntoma**: Claude de la próxima sesión empieza sin saber qué está en producción, qué hay pendiente, y qué errores ya se cometieron. Riesgo de repetirlos.
**Causa raíz**: Falta de ritual de cierre. Claude priorizaba mandar los commits y "moverse rápido" por sobre dejar el estado claro.

### Regla
**Antes de cerrar cualquier sesión que haya deployado código, actualizar EN EL MISMO COMMIT (o en un commit dedicado):**
1. `CLAUDE_STATE.md`: agregar sección `## Sesion N — fecha: titulo` con resumen ejecutivo, archivos modificados, commits, estado final, y pendientes.
2. `ERRORES_CLAUDE_NO_REPETIR.md`: agregar Error #X por cada error cometido (aunque se haya detectado y corregido dentro de la misma sesión).
3. Si se descubre algo desactualizado en `CLAUDE.md` (URLs, reglas, etc.), fixearlo en la misma sesión.

La documentación no es opcional. Es parte del trabajo.

---

## Error #18 — Bajar `maxDuration` sin razón concreta

**Cuándo pasó**: Sesión 20. Después de optimizar el bulk backfill para correr en 277ms, propuse revertir `maxDuration = 300` a default (60s) "porque ya no se necesita". Tomy lo cuestionó.
**Síntoma potencial**: Otras acciones del mismo endpoint (fix-vtex, fix-categories, fix-category-paths) SÍ pueden pasar los 60s porque hacen llamadas a VTEX por producto. Bajarle el techo las habría matado.
**Causa raíz**: Confundí `maxDuration` con un costo. No es un costo, es un techo. La función no consume más recursos si termina rápido — solo le da aire si alguna vez lo necesita.

### Regla
**`maxDuration` es un techo, no un target.** Subirlo no cuesta nada si las funciones terminan rápido. Bajarlo sí puede romper acciones que ocasionalmente tardan más. Nunca bajar `maxDuration` "por prolijidad" o "por las dudas" — solo bajarlo si hay una razón concreta (ej: forzar que una función no loopee infinitamente por un bug).

**Pregunta previa antes de bajar maxDuration**: "¿Existe ALGUNA acción/branch de código que podría tardar más de X segundos?" Si la respuesta no es un NO rotundo, no bajarlo.

---

## Error #S36-SCHEMA-SIN-MIGRACION — Pushear schema.prisma con columnas nuevas sin migrar la DB

**Cuándo pasó**: Sesión 35-36. Se agregaron `isAlwaysOn` (InfluencerCampaign) y `excludeFromCommission` (InfluencerDeal) al schema de Prisma, se hizo commit y push a main. Vercel deployó. Pero la DB de producción no tenía esas columnas. Resultado: **la página de detalle de cada creador se rompió completamente** ("No pudimos cargar el creador") porque Prisma generaba `SELECT ... "isAlwaysOn" ...` contra una columna inexistente.

### Causa raíz
- El build de Vercel corre `prisma generate && next build`, **NO** `prisma db push` ni `prisma migrate deploy`. Prisma generate solo genera el client JS; no toca la DB.
- Se intentó correr `prisma db push` en el sandbox de Claude pero falló porque `DATABASE_URL_UNPOOLED` no estaba disponible. Se ignoró el error y se siguió adelante con el push.
- **Se violó el Error #13** que ya estaba documentado: "El orden OBLIGATORIO para agregar una columna nueva es: 1) endpoint admin, 2) ejecutar en prod, 3) RECIÉN agregar al schema." Se hizo exactamente al revés.

### Regla (refuerzo del Error #13 con lección nueva)
**El orden sigue siendo el mismo de siempre:**
1. Crear endpoint admin idempotente (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
2. Deployar el endpoint (push sin tocar el schema aún).
3. Ejecutar el endpoint en producción → columna existe.
4. RECIÉN agregar el campo al `schema.prisma` + el código que lo usa.
5. Pushear.

**Adición nueva**: Si `prisma db push` falla en el sandbox y el schema ya tiene las columnas, **NO pushear**. Revertir el campo del schema, pushear sin él, migrar primero, y después agregar el campo.

**Señal de alarma**: si ves `The column X does not exist in the current database` en producción, es casi seguro que se rompió esta regla.

---

## Error #S36-IGNORAR-FALLA-DB-PUSH — Ignorar que `prisma db push` falló y continuar con el deploy

**Cuándo pasó**: Sesión 35. `prisma db push` falló en el sandbox por falta de `DATABASE_URL_UNPOOLED`. En vez de detenerse y buscar cómo migrar la DB antes de pushear, el flujo continuó: `tsc --noEmit` pasó, se commiteó y se pusheó a main. La DB nunca se migró → página rota en producción.

### Causa raíz
- TypeScript check (`tsc --noEmit`) no valida contra la DB real — solo valida tipos. Que TypeScript pase no significa que la DB esté sincronizada.
- Se priorizó "el código compila" sobre "la DB tiene las columnas".

### Regla
**Si `prisma db push` falla, es un BLOCKER.** No se puede pushear código que referencia columnas nuevas hasta que la DB las tenga. Opciones válidas:
1. Migrar la DB por otro medio (endpoint admin + curl).
2. Sacar los campos del schema y del código, pushear sin ellos, migrar, y después re-agregar.
3. NO pushear y reportar el bloqueo.

**`tsc --noEmit` pasando ≠ DB sincronizada.** Son validaciones distintas. Ambas deben pasar antes de pushear schema changes.

---

## Error #S40-MODELO-SIN-BARANDAS — Exponer salidas crudas de modelo estadistico sin rails de sanidad

**Cuándo pasó**: Sesión 40, al cierre del rediseño `/bondly/ltv`. Tomy abre la tabla "Top clientes por pLTV predicho" y ve al cliente Ariel Lizárraga con **2 compras en 4 días** ($157k total) proyectado a **pLTV 365d = $4.874.306** con 54% de confianza. El modelo BG/NBD + Gamma-Gamma es matemáticamente correcto dado el input, pero el input es inadecuado: `x = 2 compras, T = 4 días` → frecuencia estimada = 0,5 compras/día → extrapolada a 365 días = ~182 compras/año × $78k ticket promedio = absurdo. El problema no es el modelo — es la falta de **rails de sanidad** alrededor del modelo. La UI está mostrando predicciones indefendibles que destruyen la credibilidad del producto entero.

### Causa raíz
- En la Sesión 40 el compromiso explícito fue "no tocar BG/NBD" para acotar el alcance del rediseño a UI + endpoints de lectura. Se respetó, pero nadie agregó rails de sanidad alrededor del modelo.
- **BG/NBD fue diseñado por Fader & Hardie (Wharton) para clientes con meses/años de historia.** Con T < 30 días y n ≤ 2, el prior bayesiano no aplana los extremos suficiente. El modelo devuelve lo que le pediste, pero lo que le pediste no tiene sentido.
- Se mostró el "punto estimado" directamente en la tabla sin bandas de confianza visibles en el ranking ni caps duros. El badge de 54% de confianza no alcanza para compensar un número que es 30x más alto que el gasto real.
- No se implementó un piso de antigüedad mínima (T ≥ 30 días) para activar BG/NBD vs. caer a segmento.

### Regla
**Cualquier modelo estadístico o ML expuesto en UI de producto necesita 3 capas de defensa obligatorias:**

1. **Piso de aplicabilidad**: criterios mínimos para que el modelo se active. Debajo de esos mínimos, fallback a método simple (promedio de segmento). Para BG/NBD de LTV: `T ≥ 30 días` y `n ≥ 2 compras` como mínimo. Si no cumple, usar segmento.
2. **Cap duro de sanidad**: ningún output del modelo puede exceder un techo razonable calculado independientemente. Para pLTV 365d: `cap = avgTicket × freqP95_segmento × 365`. El modelo puede decir $4.8M, pero nunca se expone más de lo que el cap permite.
3. **Confianza recalibrada al contexto**: un 54% de confianza con 4 días de historia es mentira matemática. Regla: `confianza_máxima = min(modelo_confianza, f(T))` donde `f(T)` crece con la antigüedad (ej: T<30d → 20%, T<90d → 50%, T<180d → 75%).

**Además**: cuando se fallback a segmento, mostrarlo explícitamente en la UI ("Historia insuficiente · promedio del segmento") para que quien mira sepa que no es una predicción personal.

**Señal de alarma**: si un cliente no-técnico (ej: Tomy) ve el output del modelo y dice "eso es imposible", es porque faltan rails. El modelo puede tener razón matemáticamente y estar mal expuesto.

**Antipatrón**: "el modelo dice X, entonces mostramos X". Correcto: "el modelo dice X, los rails dicen min(X, cap, sanity_check), eso es lo que mostramos".

---

## Error #S48-RBAC-MAPPING-INCOMPLETO — Sistema de permisos con rutas "no mapeadas = visibles"

**Cuándo pasó**: Sesión 48, commit `60b1112`. Diseñé `hrefToSection(href)` mapeando solo las secciones "principales" (finanzas, bondly, aura, campaigns, etc.). Las secciones sin mapeo (`/rentabilidad`, `/dashboard`, `/seo`, `/nitropixel`, `/chat`, `/sinapsis`, `/boveda`, `/pixel`, `/memory`) las dejé como `return null` con comentario "no mapeadas, siempre visibles". Tomy prueba con user custom "Contador de prueba" (permiso solo Fiscal) y ve Rentabilidad, SEO, NitroPixel, Centro de Control en el sidebar — secciones que NO debería ver. Fix en `e76ac77`.

### Causa raíz
- Asumí que "no mapeado = público" era default seguro. En RBAC es lo opuesto: **principle of least privilege** → todo bloqueado salvo lo explícitamente permitido.
- No hice inventario exhaustivo de rutas antes de diseñar.
- El comentario "no mapeadas, siempre visibles" es bomba de tiempo: cada feature nueva sin agregar al mapping crea agujero de seguridad.

### Regla
**Al diseñar RBAC, listar el 100% de las rutas navegables desde el principio.** No existe "público dentro de la app autenticada" — toda ruta detrás del login tiene que estar bajo alguna sección.

**Checklist al crear/actualizar `hrefToSection()`**:
1. `grep -n 'href: "/' layout.tsx` para listar TODOS los items del sidebar.
2. Cada `href` debe corresponder a una `Section` del enum.
3. Idealmente usar `satisfies Record<Href, Section>` de TS para garantizar completitud.
4. Los defaults por rol (`DEFAULT_PERMISSIONS`) cubren la nueva sección con nivel razonable.

**Señal de alarma**: si un user custom con permisos estrictos ve cosas que no debería — primer chequeo es `hrefToSection()`.

---

## Error #S48-ENFORCEMENT-SOLO-UI — Implementar enforcement a nivel UI sin proteger pages ni APIs

**Cuándo pasó**: Sesión 48, commit `60b1112`. Implementé `NavItemGate` que oculta items del sidebar. El user no ve el tab "Rentabilidad". **PERO** si pega `nitrosales.vercel.app/rentabilidad` en el navegador, ve toda la data igual. Las APIs `/api/metrics/*`, `/api/finance/*` tampoco validaban. Enforcement cosmético. Fix en `e76ac77` con `PathnameGuard` + quedaron APIs como deuda.

### Causa raíz
- Mezclar "UI-level hide" con "enforcement real". Son cosas distintas.
- Asumir "si no ve el botón, no puede llegar" = falso. Usuarios pegan URLs, usan extensiones, hacen bookmark.

### Regla
**Enforcement de permisos debe aplicarse en 3 niveles independientes**:

1. **UI-level (sidebar)**: `NavItemGate` + `NavGroupGate`. Previene ruido visual.
2. **Page-level (client)**: `PathnameGuard` o `useRequirePermission` redirigen a `/unauthorized`.
3. **API-level (server)**: `requirePermission(section, level)` devuelve 403 incluso si atacante modifica el JS.

Los 3 niveles son redundantes por diseño (defense-in-depth). Solo UI-level = 0 seguridad real.

**Antipatrón**: "por ahora solo escondo el tab, después agrego los guards". Los 3 niveles se agregan juntos o ninguno.

---

## Error #S48-NAVITEM-PADRE-HREF-ESTATICO — Ocultar grupo cuando el href del padre no es accesible pero los hijos sí

**Cuándo pasó**: Sesión 48. En el sidebar, item padre "Finanzas" tiene `href: "/finanzas/pulso"`. `NavItemGate` verificaba `pulso` y si no tenía acceso, ocultaba el grupo entero. El Contador tenía acceso solo a **Fiscal** (hijo de Finanzas). Resultado: no veía "Finanzas" aunque tenía un hijo accesible.

### Causa raíz
- Tratar items padres como items simples. El padre de un grupo es agrupador cuya visibilidad depende de los hijos, no del href default.
- El `href` del padre es shortcut de navegación, no requisito de permiso.

### Regla
**En sidebars jerárquicos, items padres deben chequear así**:

1. Si padre tiene section Y es accesible → mostrar.
2. Si padre tiene children → mostrar si al menos **un child** es accesible.
3. Al clickear padre, navegar al primer child accesible (no al href default).

Implementación: `NavItemGate` acepta `childHrefs?: string[]`. Ver commit `e76ac77`.

**Corolario**: headers de categoría (ej "MARKETING DIGITAL") también deben ocultarse si ningún item del grupo es visible. Usar `NavGroupGate`.

---

## Error #S48-LOADING-DEFAULT-TRUE — Durante loading retornar `true` en canAccess causa flash de items

**Cuándo pasó**: Sesión 48. Tomy reportó "cuando entro, aparecen todas las secciones por 1-2s y después desaparecen las que no tengo permiso". Causa: `canAccess(section, level)` durante `loading=true` devolvía `true` por default. Eso causaba flash de items que después se ocultaban. Fix en commit `4ef1a52`.

### Causa raíz
- Asumir que "mostrar de más" durante loading es mejor que "mostrar de menos". Depende del caso.
- Flash de contracción ("tenías esto, ya no") es psicológicamente peor que flash de expansión.

### Regla
**Durante loading de permisos, default = NO renderizar.** El sidebar arranca vacío y aparece con items filtrados cuando carga.

Implementación: `NavItemGate` retorna `null` si `loading === true`.

**Regla general**: para permisos/auth/roles, default durante estado incierto = "deny"/"hide". Para data/metrics/UI content, default = "skeleton"/"placeholder".

---

## Error #S48-PAGINA-ERROR-CON-CTA-REBOTADOR — CTAs en página de error que linkean a rutas protegidas

**Cuándo pasó**: Sesión 48. Página `/unauthorized` tenía "Volver al inicio" → `/` (que redirige a `/dashboard`) y "Ver mi rol actual" → `/settings/team` (solo admin). Si user tenía permiso solo para Fiscal, ambos botones lo rebotaban a `/unauthorized`. **Loop infinito**. Fix en commit `9fa2b83`.

### Causa raíz
- Al diseñar páginas de error, asumí que los CTAs eran "siempre accesibles" porque son navegación básica. Falso — `/dashboard` y `/settings/team` requieren permisos.
- No testé con user de bajos permisos.

### Regla
**Páginas de error (`/unauthorized`, `/404`, `/500`) deben tener CTAs que NO asuman permisos.** Opciones válidas:

1. **Calcular primera ruta accesible dinámicamente**: fetch `/api/me/permissions` + iterar `HOME_PRIORITY` hasta encontrar una con level !== "none".
2. **Solo CTAs universales**: "Cerrar sesión" (siempre accesible), "Contactar admin" (mailto).
3. **NO linkear a rutas protegidas** (settings/team, dashboard, admin panels).

**Antipatrón**: página de error que rebota al user al mismo error por CTAs que requieren el permiso que no tiene.

---

## Error #S48-EMAIL-PROVIDER-SANDBOX-SILENCIOSO — Asumir que los emails se envían cuando el proveedor está en sandbox mode

**Cuándo pasó**: Sesión 48. Implementé envío de invitaciones con Resend (reusando `sendEmail()` que usaba Aura). Aura había estado usándolo "hace meses". Probé: el email a mi propio email llegaba, pero a `tomylapidus1999@gmail.com` daba `Resend 403: You can only send testing emails to your own email address`. Aura había estado en el mismo limbo — todos sus emails iban a Tomy, nunca a creadores reales, sin que nadie lo notara hasta ahora.

### Causa raíz
- Resend/Postmark/SendGrid tienen **sandbox mode** inicial donde solo permiten mandar al email del dueño de la cuenta hasta verificar un dominio propio. No se anuncia explícitamente — silenciosamente falla con emails externos.
- `RESEND_FROM` default apuntaba a dominio no verificado (`nitrosales.com`).
- Nunca se había testeado con email externo real.

### Regla
**Al integrar proveedor de email transaccional, antes de asumir que funciona, verificar 3 cosas**:

1. **Dominio FROM verificado**: entrar al panel del proveedor, confirmar status "Verified". Configurar DKIM + SPF + MX + DMARC en el DNS provider.
2. **Probar envío a email externo** (NO al dueño de la cuenta). Si hay sandbox mode, falla con error 403 explícito.
3. **Loggear resultado del envío**: `console.log/warn` con status + errorMessage, devolver `emailSent: bool` en la response.

**Código defensivo mínimo**:

```ts
const hasApiKey = Boolean(process.env.RESEND_API_KEY);
if (!hasApiKey) return { ok: false, error: "API key not configured" };
const result = await provider.send(...);
if (!result.ok) console.warn("Email failed:", result.error);
return { ok: result.ok, error: result.error };
```

**Antipatrón**: "el email salió sin error en la respuesta = se envió". Falso con proveedores en sandbox. Verificar status del dominio Y probar con email externo real.

---

_Fin del archivo. Claude: si estás por cometer algo que se parece a uno de estos errores, PARÁ y releé la regla._
