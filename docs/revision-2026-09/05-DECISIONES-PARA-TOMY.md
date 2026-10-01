# Lo que necesita tu decisión, Tomy

> **Al 2026-09-17.** Revisamos el sistema entero antes de sumar clientes nuevos. Se
> encontraron 37 problemas: **24 ya están arreglados**. De los 13 que quedan, **12 necesitan
> que vos decidas algo** — no son cosas que se puedan resolver solas, porque cambian lo que el
> cliente ve, recibe o puede hacer.
>
> Nada de esto está publicado todavía. Todo el trabajo está guardado, esperando.
>
> Están ordenadas por lo que cuesta postergarlas. Cada una tiene mi recomendación, pero la
> decisión es tuya.

---

## 🔴 1. Esto puede estar pasando ahora mismo

**Hay cinco tareas automáticas del sistema que, si les falta una configuración, cualquiera
desde internet puede activar sin ninguna clave.**

Qué conseguiría alguien que lo haga: la lista completa de todos nuestros clientes con sus
nombres, y además puede disparar los mails de alertas a **todos** ellos cuando quiera.

Lo raro del problema: si alguien prueba con una clave *equivocada*, el sistema lo rechaza
bien. Sólo se abre si no manda **nada**. Por eso no lo encontró nadie antes.

**Esto no lo trajo el trabajo nuevo — está en la versión que hoy está publicada.**

### Qué hay que hacer

Alguien tiene que entrar a Vercel (donde vive la app) y fijarse si existe una configuración
llamada `SYNC_KEY`.

- **Si existe** → estamos cerrados, no hay apuro, el arreglo entra cuando publiquemos.
- **Si no existe** → está abierto ahora. Se cierra en un minuto creando esa variable, sin
  necesidad de publicar nada.

**Mi recomendación: que Axel lo mire hoy.** Es un minuto y es lo único de esta lista que corre
contra el reloj.

---

## 🟠 2. El alta de clientes que no usan VTEX está rota

Si viene un prospecto que usa **Shopify, Tiendanube o WooCommerce**, no puede completar el
formulario de alta. El sistema le pide datos de VTEX —que no tiene y nunca va a tener— y lo
rechaza sin darle salida. No hay forma de terminar desde la pantalla.

Esto es directamente comercial: hoy perdemos a cualquiera que no sea VTEX.

**Mi recomendación: sacarlo.** Esas plataformas no están integradas todavía, así que el
formulario no tiene por qué pedirles credenciales — alcanza con registrarlos como interesados.

**Lo que necesito de vos:** confirmar que no estamos por integrar Shopify en las próximas
semanas. Si viene en camino, se queda y arreglamos el texto en vez de sacarlo.

---

## 🟠 3. Dos cosas más que el formulario pide y no existen

Del mismo tipo que la anterior:

| Qué pide la pantalla | Qué pasa de verdad |
|---|---|
| **Search Console** | El cliente la elige, ve todo en verde, y **no se conecta nada**. Si es lo único que eligió, el alta queda muerta — y a nosotros nos dice "el cliente no completó el formulario", que es mentira |
| **Cuántos meses de historia traer de Meta Ads y Google Ads** | Elige "2 años", se guarda… y no existe ningún proceso que traiga esa historia. No se trae una sola fila |

**Mi recomendación: sacar las dos.** Prometer algo que no hacemos es peor que no ofrecerlo.

**Lo que necesito de vos:** lo mismo que arriba — confirmar que no están por implementarse.

---

## 🟠 4. El sistema que avisa cuando algo se rompe vigila 7 de 29 tareas

Hace unos meses una tarea automática dejó de correr **cinco semanas** y nadie se enteró.
Construimos un detector para que no vuelva a pasar.

El detector mira 29 tareas, pero **sólo 7 avisan que están vivas**. Y la que motivó todo el
trabajo no está entre esas 7: si mañana se vuelve a caer, el detector no lo va a notar.

Peor: las otras 22 van a aparecer en rojo en el mail de control **cada 6 horas, para
siempre**, diciendo que están caídas cuando funcionan bien. A las tres semanas nadie abre ese
mail — y adentro está el único aviso de que un alta de cliente quedó trabada.

**Mi recomendación:** hacer que avisen las 9 que de verdad importan (las que tocan datos de
clientes), y sacar las otras de la lista vigilada con una nota de por qué. Es medio día de
trabajo.

La alternativa —dejar de vigilar las 22 y listo— saca el ruido del mail hoy, pero deja el
agujero original igual de abierto que antes.

> **Actualizado 2026-09-30 — ya está hecho, falta que lo apruebes.** El otro programador (Codex)
> eligió la alternativa sin esperar tu decisión: ahora el detector **sólo vigila las 7 tareas que
> avisan que están vivas**. El mail ya no se llena de falsas alarmas, pero las otras 22 —incluida
> la que motivó todo— siguen sin nadie que las mire. Queda en vos decir si eso alcanza o si
> querés que se sumen las 9 importantes.

---

## 🟡 5. Cuando borramos los datos de un cliente, ¿borramos también su cuenta?

Tenemos **dos** borrados distintos, y cada uno está completo donde el otro falla:

- El **viejo** borra la cuenta del cliente y sus datos de contacto (CUIT, teléfono, WhatsApp,
  claves de sus plataformas) — pero deja 26 tablas de datos sin tocar.
- El **nuevo** no se le escapa ninguna tabla de datos… pero **no borra la cuenta ni los datos
  de contacto**.

Hoy conviven los dos y nada en el sistema lo dice.

**La decisión de fondo:** cuando un cliente se va y pide que borremos todo, ¿borramos también
su organización? Es irreversible, y se lleva sus usuarios, permisos e invitaciones. Capaz
preferís conservar la cuenta vacía para poder reactivarlo si vuelve.

**Mi recomendación:** que el borrado cubra todo, pero que **borrar la cuenta sea un paso
aparte que haya que pedir explícitamente**. Y después eliminar el borrado viejo: mientras
exista, alguien lo va a usar y va a creer que borró todo.

**Por qué es tuya:** cambia qué significa "borramos todos tus datos" en lo que le prometemos
al cliente.

---

## 🟡 6. Las alertas automáticas avisan de más

Le mandamos a los clientes alertas del tipo *"tu facturación cayó 30 %"*. Encontramos un error
en la matemática que decide cuándo eso es una caída real y cuándo es simple variación normal.

Efecto medido: para un cliente con **45 o más pedidos en el período**, esa alerta salta por
pura casualidad **una semana de cada seis**.

Hay otras tres del mismo tipo, incluida una que dice *"tu margen se comprimió 45 puntos"*
cuando en realidad **no hubo ventas** esa semana.

**Por qué es tuya:** corregirlo sube la vara, así que algunos clientes van a recibir **menos**
alertas que hoy.

**Mi recomendación: corregirlo.** Una alerta falsa cada seis semanas es exactamente lo que
hace que la gente deje de leer los mails — y ahí perdemos el único canal por el que les
avisamos algo.

---

## 🟡 7. ¿Se puede dar de alta un cliente sin el webhook de VTEX configurado?

Hay un paso en el alta —configurar el "Orders Broadcaster" de VTEX— que si no se hace,
**no nos llega una sola venta** de ese cliente. Ya le pasó a TeVe Compras: 0 de 8 pedidos
atribuidos.

Hoy el semáforo del alta dice **"listo"** aunque ese paso falte. Muestra el problema más abajo,
pero el titular es verde.

**Mi recomendación: que bloquee el alta.** El costo de un alta trabada es una llamada; el de
un cliente habilitado sin webhook es alguien que ve cero ventas y no sabe por qué.

**Por qué es tuya:** si el flujo real es "habilito primero y configuro después", esto va a
trabar trabajo que hoy funciona.

*(Dato que baja el riesgo: el sistema ya configura ese webhook solo al habilitar. Lo que
quedaría trabado es el caso en que de verdad falló.)*

---

## 🟡 8. "El pixel está instalado" puede basarse en datos de hace seis meses

Cuando un cliente instala nuestro pixel, le confirmamos que funciona. Pero esa confirmación da
verde con **cualquier** dato histórico, aunque sea viejísimo.

El escenario: el cliente lo instala, funciona, y meses después una actualización de su sitio
lo borra. Si vuelve a verificar, le seguimos diciendo **"el pixel está instalado"** con cero
datos entrando.

**Mi recomendación intermedia:** que diga **"recibimos datos tuyos hasta el 3 de marzo"**, con
la fecha. No bloquea a nadie, y el cliente al que se le rompió lo entiende solo.

**Por qué es tuya:** la opción más estricta —exigir datos recientes— haría que clientes que
hoy ven verde vean rojo, y algunos con razón y otros no (una tienda con poco tráfico puede
pasar media hora sin una visita).

---

## 🟡 9. El tope de gasto de la IA puede no frenar nunca

Aurum (nuestro asistente) tiene un tope de gasto mensual por cliente. Ese tope se calcula
sumando lo que cuesta cada consulta, usando una tabla de precios.

Si alguien cambia el modelo de IA sin agregarlo a esa tabla, **cada consulta cuenta como $0** y
el tope no frena nunca. Y el sistema informa que la medición está bien.

**Mi recomendación:** que si hay consumo que no se puede costear, el sistema **frene igual** y
avise. Nuestro propio código lo dice mejor que yo: *"un costo de cero es una mentira que
además da tranquilidad"*.

**Por qué es tuya:** frenar puede degradarle el servicio a un cliente que está pagando, por un
error de configuración nuestro.

> **Actualizado 2026-09-30 — ya está hecho, falta que lo apruebes.** El otro programador (Codex)
> lo resolvió como se recomendaba, sin esperar tu decisión: si hay consumo que no se puede
> costear, Aurum **sigue contestando pero en el modo rápido y más barato**, y le avisa al cliente
> por qué. Y si el sistema no puede llevar la cuenta de cuánto se gastó (por ejemplo, si la base
> de datos no responde), **Aurum no contesta** y le pide al cliente que pruebe de nuevo. Queda en
> vos aprobarlo.

---

## 🟡 10. Un proceso que sólo hace la mitad del trabajo y dice que terminó

Una herramienta interna que recalcula a qué canal se le atribuye cada venta procesa **2.000
registros y se detiene**, informando que terminó bien. Un cliente con 50.000 queda con 48.000
sin procesar.

Antes del trabajo nuevo procesaba todo (lento, pero completo).

**Mi recomendación: arreglarlo** para que procese todo por tandas hasta terminar.

**Por qué te lo cuento:** cambia cómo se usa la herramienta — pasa a haber que llamarla varias
veces en vez de una. Si alguien tiene instrucciones escritas de cómo usarla, dejan de servir.

---

## 🟢 11. El número de cuántos clientes aguantamos hay que recalcularlo

El número que circuló (**44 clientes tamaño Arredo**) **estaba mal y ya se retiró** de todos
los documentos. La medición era real; la cuenta que la convertía en ese número, no.

El número honesto hoy es **≈2 clientes del tamaño de Arredo**, o ≈8 con la mezcla actual.

**Mi recomendación: no recalcularlo todavía.** El número correcto depende de una decisión
técnica que está pendiente (si el trabajo se puede partir entre varias corridas). Recalcular
ahora da un número exacto para una arquitectura que quizás cambie.

**Lo importante:** no cites 44 en ningún lado. Ya está corregido en todos los documentos.

---

## 🟢 12. Dos cosas que sólo importan si cambiamos las claves

Decidiste no rotar las claves de acceso por ahora, y eso sigue bien.

Cuando se haga, hay dos herramientas internas que filtran una clave a quien tenga la otra. Hoy
da lo mismo porque **las dos claves son la misma**, pero el día que se separen, separarlas no
va a servir de nada mientras esas dos existan así.

**Mi recomendación:** nada ahora. Queda anotado como el paso 0 de cuando se haga la rotación.

---

# Resumen en una tabla

| # | Qué decidir | Mi recomendación | Cuándo |
|---|---|---|---|
| 1 | ¿Existe `SYNC_KEY` en Vercel? | Que Axel lo mire hoy | 🔴 **Hoy** |
| 2 | ¿Sacamos Shopify/Tiendanube del formulario? | Sí | 🟠 Perdemos prospectos |
| 3 | ¿Sacamos Search Console y el historial de Ads? | Sí | 🟠 |
| 4 | ¿Hacemos que avisen las 29 tareas o sólo vigilamos 7? | Las 9 que importan · *ya se hizo "sólo las 7": falta tu aprobación* | 🟠 Antes de publicar |
| 5 | ¿El borrado incluye la cuenta del cliente? | Sí, pero como paso aparte | 🟡 |
| 6 | ¿Corregimos los umbrales de las alertas? | Sí | 🟡 |
| 7 | ¿El webhook de VTEX bloquea el alta? | Sí | 🟡 |
| 8 | ¿"Pixel instalado" puede basarse en datos viejos? | Que muestre la fecha | 🟡 |
| 9 | ¿El tope de gasto frena si no puede medir? | Sí · *ya se hizo así: falta tu aprobación* | 🟡 |
| 10 | ¿Arreglamos la herramienta que hace la mitad? | Sí | 🟡 |
| 11 | ¿Recalculamos cuántos clientes aguantamos? | Todavía no | 🟢 |
| 12 | Las dos herramientas que filtran la otra clave | Nada ahora | 🟢 |

---

## Una cosa más, que no es decisión pero conviene saber

Hay un arreglo ya hecho que tiene un efecto lateral: los **backfills de clientes grandes van a
tardar más** y a hacer más consultas contra MercadoLibre.

El motivo es que se estaban **perdiendo pedidos en silencio**: cuando un cliente tiene muchas
ventas en poco tiempo, MercadoLibre corta la respuesta y el sistema tomaba eso como "ya
traje todo". Arredo hace unos 1.600 pedidos por semana, así que le pasaba siempre.

Tardar más me parece claramente mejor que perder pedidos sin avisar, así que lo dejé hecho.
Si preferís lo contrario, se revierte.
