# Decisiones pendientes — post-revisión de `fix/expansion-gate-e0`

> **Al 2026-09-15.** De los 37 hallazgos de `BP-REVISION-0914`, **8 están arreglados** y
> commiteados. De los 29 restantes, éstos son los que **no puedo cerrar yo**: cambian lo que
> ve o recibe un cliente, o eligen entre dos caminos igual de defendibles.
>
> Cada uno lleva mi recomendación. Las ordené por lo que cuesta postergarlas, no por
> esfuerzo.

---

## 1 · Verificar `SYNC_KEY` en Vercel

**No es una decisión, es un dato que sólo vos podés ver — y es lo único de toda la lista que
puede estar afectando producción hoy.**

Cinco crons se abrían mandando *nada* (R-01). **Ya está arreglado en la branch**, pero la
branch no está mergeada, así que **producción sigue con el código viejo**.

Si `SYNC_KEY` no está seteada en Vercel, ahora mismo cualquiera puede hacer
`curl https://app.nitrosales.ai/api/cron/anomalies` sin ningún parámetro y obtener la lista de
todas las organizaciones, además de dispararles el mail de anomalías a todos los clientes.

👉 **Mirá si existe la variable `SYNC_KEY` en las env vars de Vercel.**

- **Si existe** — producción está cerrada. El arreglo entra con el merge y no hay apuro.
- **Si no existe** — está abierto. Hay dos salidas: mergear sólo ese commit a `main`, o setear
  `SYNC_KEY` en Vercel con el mismo valor que ya usan los crons, que lo cierra sin tocar
  código.

**Mi recomendación:** miralo hoy. Si no está, setear la variable es de un minuto y no requiere
deploy.

---

## 2 · El detector de crons caídos vigila 7 de 29 (R-16)

**El problema.** E-20 se construyó porque `refresh-pixel-first-source` estuvo cinco semanas
desagendado sin que nadie se enterara. Hoy **ese cron no late**, y otros 21 tampoco. Los 22
van a aparecer en rojo como `nunca-latió` en cada mail, cada 6 horas, para siempre — y a las
tres semanas nadie abre ese mail.

**Las dos salidas:**

| | Qué implica |
|---|---|
| **A · Agregarle el latido a los 22** | Dos líneas por cron, mecánico, pero son 22 archivos y cada uno tiene su propio camino de salida (hay que latir también cuando falla, que es el caso que importa) |
| **B · Vigilar sólo los que laten** | Una línea: que `cronesAtrasados` itere la lista de los que reportan, no `vercel.json` entero. El mail deja de mentir hoy mismo — pero los 22 quedan sin vigilancia, incluido el que motivó todo |

**Mi recomendación: A, pero por partes.** Primero los que tocan datos de clientes
(`refresh-pixel-first-source`, `refresh-pixel-rollups`, `refresh-silver-orders`, los tres
`refresh-gold-*`, `ml-reconcile`, `vtex-sync-recent`, `attribution-reconcile`) — nueve crons,
que son los que si se caen alguien lo paga. El resto puede quedar fuera de la lista vigilada
con una línea que diga por qué.

Hacer B solo es tapar el síntoma: el mail deja de ser ruido y el agujero de E-20 queda igual
de abierto que antes de E-20.

---

## 3 · Qué hacer con `wipe-account` (R-07, R-08)

**El problema.** Hay **dos** endpoints de borrado y cada uno está completo donde el otro
falla:

- `wipe-account` (el viejo) borra `organizations` y `onboarding_requests` — con el CUIT, el
  teléfono, el WhatsApp y las credenciales de VTEX del cliente — pero deja atrás 26 tablas, y
  su propio encabezado promete 20 que no borra.
- `borrar-todo` (el nuevo) descubre las tablas solo y no se le escapa ninguna… salvo
  `organizations` y `onboarding_requests`, que no tienen columna `organizationId` y por eso
  ningún descubrimiento las alcanza.

Hoy conviven, y nada en el código lo dice.

**La decisión es si el borrado incluye la organización misma.** No es obvio: borrar la fila de
`organizations` es irreversible y se lleva el `settings` con roles, API keys e invitaciones.
Puede que quieras conservar la organización vacía para poder reactivar al cliente.

**Mi recomendación:** que `borrar-todo` cubra las dos tablas que le faltan, y que **borrar la
organización sea un parámetro explícito** (`?incluirLaOrganizacion=1`), no el default. Después
borrar `wipe-account` del repo: mientras exista, alguien lo va a llamar y a creerle al
encabezado.

Necesito tu OK porque cambia qué significa "borramos todo" en el contrato con el cliente.

---

## 4 · Los umbrales de las alertas de anomalías (R-14)

**El problema.** El piso de volumen tiene un error de factor √2: modela el ruido de *un*
conteo cuando compara *dos*. Y la facturación no es un conteo, es una suma de tickets, lo que
agrega otro ~1,41×.

Efecto medido: para cualquier cliente con **45 órdenes o más** en el período, la corrección
estadística es inerte y el umbral de −30 % queda a ~1σ del ruido real. Eso es una alerta
HIGH *"Facturación cayó 30 %"* falsa **una semana de cada seis**, por puro azar.

Hay tres defectos hermanos en el mismo archivo: `base = max()` es la base equivocada para las
reglas de *suba*, CPA y ROAS están atados al conteo de órdenes cuando su ruido viene de las
conversiones de ads, y la regla de margen no tiene ninguna corrección (dispara "el margen se
comprimió 45 puntos" cuando simplemente no hubo ventas).

**Por qué es tuya.** Corregirlo **sube las varas**, así que algunos clientes van a recibir
menos alertas que hoy. Es matemáticamente correcto y aun así es un cambio en lo que reciben.

**Mi recomendación: aplicarlo.** Una alerta falsa cada seis semanas es exactamente lo que
enseña a ignorar los mails, y el módulo entero se escribió para evitar eso. El arreglo es
multiplicar el ruido esperado por √2 y ajustar las tres reglas hermanas.

---

## 5 · El wizard pide cosas que no existen (R-23, R-24, R-29)

Tres casos del mismo tipo: **la pantalla ofrece algo que el backend no hace.**

| | Qué pasa hoy | Qué haría falta |
|---|---|---|
| **Search Console** | El cliente la elige, ve 100 % en verde, y se crean **cero** conexiones. Si es su única plataforma, el alta queda muerta y al admin le dice "el cliente no completó el wizard" | Sacarla del wizard, o soportarla en el backend |
| **Shopify / Tiendanube / Woo** | Recibe un 400 pidiendo App Key y App Token de VTEX — campos que nunca vio y que no existen para su plataforma. **Sin salida desde la interfaz** | Excluirlas de la validación de credenciales (son leads, no integraciones) |
| **Rango histórico de Meta y Google Ads** | Elige "2 años · 3-6 hs", se guarda… y no existe ningún backfill para esas dos plataformas | Sacar el selector para esas dos, o implementar el backfill |

**Mi recomendación:** las tres son "sacar lo que no existe", y las tres las puedo hacer sin
tocar backend. Lo que necesito de vos es confirmar que **no están por implementarse pronto** —
si el backfill de Meta Ads está planeado para la semana que viene, el selector se queda y lo
que se arregla es el texto.

De las tres, **Shopify es la urgente**: hoy rompe el alta de cualquier prospecto que no sea
VTEX, y eso es directamente comercial.

---

## 6 · `reattribute` perdió la mitad del trabajo (R-22)

**El problema.** `take: 2000` sin cursor y sin `orderBy`. El comentario dice "el caller
repite"; repetir devuelve **las mismas 2.000**. Responde `success: true`. Una org con 50.000
atribuciones reprocesa 2.000 y las otras 48.000 nunca. Antes de la branch procesaba todo
(lento, pero completo).

**Las dos salidas:** cursor real (el caller repite hasta que `hasMore` sea falso), o volver a
procesar todo de una con un tope de tiempo.

**Mi recomendación: cursor.** Es el patrón que la branch ya usa en cinco crons y hay módulo
hecho (`cursor-store.ts`). Lo puedo hacer yo; te lo listo acá porque cambia el contrato del
endpoint (pasa a devolver `hasMore` y hay que llamarlo en loop), y si alguien tiene un runbook
que lo llama una vez, deja de alcanzar.

---

## 7 · El tope de gasto de Aurum puede no frenar nunca (R-13)

**El problema.** La cuota se mide con `usdConocido`, que **excluye a propósito** los modelos
que no están en la tabla de precios. Si alguien cambia el id de modelo sin agregarlo a
`precios-de-modelos.ts`, cada llamada cuesta **$0 contra el tope** y reporta
`medicionDisponible: true` — un fail-open disfrazado de medición.

**La decisión:** qué hacer cuando hay consumo que no se sabe costear.

- **Fail-closed:** si hay filas sin precio, degradar igual y avisar.
- **Fail-open con ruido:** dejar pasar pero que el aviso lo diga fuerte.

**Mi recomendación: fail-closed**, y que la respuesta diga *"hay consumo que no puedo
costear"*. El módulo hermano ya tiene escrita la doctrina: *"un costo de cero es una mentira
que además da tranquilidad"*. Te lo consulto porque fail-closed puede degradar a un cliente
que está pagando, por un error de configuración nuestro.

---

## 8 · Recalcular el techo de organizaciones (R-36)

El número 44 ya se retiró de todos los documentos y el método está explicado. Falta
**recalcularlo bien**: con la restricción por invocación, corrigiendo `porHoraGithub` (dice 4,
el workflow hace 8) y la población que se mide (mide todas las orgs, el loop itera sólo las
que tienen pixel).

**Mi recomendación:** hacerlo **después** de decidir el punto 2, porque el techo real depende
de si el trabajo se puede partir entre invocaciones — y eso es lo que E-10 (la cola
persistida) cambiaría. Recalcular ahora da un número correcto para una arquitectura que quizás
cambie.

Mientras tanto, el número honesto para citar es **≈2 organizaciones tamaño Arredo**.

---

## 9 · Dos cosas que sólo importan si se rota (R-06)

`admin/debug-vtex-hook-config` y `admin/vtex-configure-broadcaster` devuelven la URL del
webhook de VTEX, que lleva `?key=<NEXTAUTH_SECRET>` adentro, a cualquiera que tenga
`ADMIN_API_KEY`.

Hoy da lo mismo, porque los dos secretos **son el mismo literal**. Pero el día que se roten a
valores distintos, quien tenga uno sigue leyendo el otro desde estos dos endpoints, y la
separación no separa nada.

**Mi recomendación:** ninguna acción ahora — ya decidiste no rotar. Que quede como **paso 0 del
plan de rotación**, para cuando se haga. Ya está anotado en el backlog.

---

# Resumen: qué necesito de vos

| | Decisión | Mi recomendación | Urgencia |
|---|---|---|---|
| 1 | ¿Existe `SYNC_KEY` en Vercel? | Miralo hoy | 🔴 **Hoy** |
| 5 | ¿Shopify/GSC/rango histórico se sacan del wizard? | Sacarlos; Shopify primero | 🟠 Rompe altas |
| 2 | ¿Latido a 22 crons, o vigilar sólo 7? | Latido a los 9 que tocan datos de clientes | 🟠 Antes de mergear |
| 3 | ¿El borrado incluye la organización? | Sí, pero como parámetro explícito. Y borrar `wipe-account` | 🟡 |
| 4 | ¿Se corrigen los umbrales de alertas? | Sí | 🟡 |
| 6 | ¿`reattribute` con cursor? | Sí | 🟡 |
| 7 | ¿La cuota de Aurum falla cerrada? | Sí | 🟡 |
| 8 | ¿Se recalcula el techo ahora? | No: después de decidir el punto 2 | 🟢 |
| 9 | Los dos endpoints que filtran el otro secreto | Nada ahora; paso 0 de la rotación | 🟢 |
