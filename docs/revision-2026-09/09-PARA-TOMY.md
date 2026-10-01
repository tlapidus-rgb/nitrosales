# Tomy: lo que necesito que decidas

> **Al 1 de octubre de 2026.** El trabajo de preparar el sistema para sumar clientes está
> **terminado y probado**: más de 2.000 pruebas automáticas en verde. Para publicarlo faltan
> tus decisiones de esta lista y tres cosas que hace Axel (al final).
>
> Hay **una cosa urgente que no depende del trabajo nuevo**: está pasando en la versión que hoy
> usan los clientes. Va primero.
>
> Cada punto dice qué pasa, qué recomiendo y qué cambia si decís que sí o que no. Este documento
> reemplaza a `05-DECISIONES-PARA-TOMY.md` como lista a decidir; lo de ahí está incluido acá.

---

## 🔴 1. Un cliente puede ver datos de los compradores de otro cliente

**Qué pasa.** Para conectar VTEX, la pantalla de integración le muestra a cada cliente una
dirección que tiene adentro una de nuestras claves maestras. Esa clave abre también la mayoría
de nuestras herramientas internas: **106 de 165**. Algunas muestran la lista de todos nuestros
clientes, y otras, **nombres y emails de los compradores** de cualquier cliente que se les pida.

O sea: cualquier persona con usuario en NitroSales, de cualquier cliente, podría ver datos de
los compradores de los demás. Hoy, en la versión publicada.

No sabemos si alguien lo hizo. Lo encontré leyendo el código, no probándolo contra los datos
reales.

**Qué recomiendo, en tres pasos:**
1. **Ya:** un arreglo chico que publicamos por separado, sin esperar el resto. Las
   herramientas internas dejan de abrirse con esa clave y piden que entre alguien del equipo
   con su usuario. A los clientes no les cambia nada.
2. **Cuando publiquemos el trabajo nuevo:** ya trae el arreglo de otra parte del mismo
   problema (con esa clave también se podía hacer pasar por alguien del equipo).
3. **Después, con calma:** dejar de mostrarle esa clave a los clientes. Hay que cambiar la
   configuración de VTEX de cada uno. La parte técnica ya está preparada.

**Lo que necesito de vos:** el sí para el paso 1. Es urgente.

**Por qué ahora y no antes:** habíamos decidido no cambiar las claves por ahora, sabiendo que
una estaba escrita en un archivo interno. Lo que no sabíamos es que **cualquier cliente la
tiene a la vista** y que abre datos de los demás. Eso cambia el riesgo.

---

## 🔴 2. Cinco tareas automáticas pueden estar abiertas a cualquiera

Si a la app le falta una configuración llamada `SYNC_KEY`, cinco tareas automáticas se pueden
disparar desde internet sin ninguna clave: entre otras cosas, mandan los mails de alertas a
todos los clientes.

**Lo que hay que hacer:** que Axel se fije en Vercel si `SYNC_KEY` existe. Es un minuto. Si
no existe, se crea y queda cerrado.

---

## 🟠 3. Cambios que los clientes van a notar y nadie aprobó

El otro programador (Codex) resolvió varias cosas por su cuenta. Están bien hechas, pero
cambian lo que ve el cliente, así que te toca aprobarlas o pedir que se vuelvan atrás. **Esto sí
tiene que estar decidido antes de publicar.**

### 3a. El Estado de Resultados desaparece si faltan costos

Si un cliente tiene cargado el costo de menos del 20% de sus productos, ya no ve su Estado de
Resultados: en su lugar aparece una vista reducida, con ventas pero sin ganancia ni márgenes.
Hoy lo ve completo con un aviso.

Además tiene un efecto raro: mirando el día de hoy antes de la primera venta, le dice "faltan
cargar costos" a un cliente que los tiene todos cargados. Eso lo arreglamos igual.

**Recomiendo:** no ocultar toda la pantalla. Mostrar ventas y gastos, y ocultar **sólo** la
ganancia y el margen, con el aviso de que faltan costos. Así no le mostramos un número
inventado, pero tampoco le sacamos lo que sí es cierto.

### 3b. La alerta "tu margen se achicó" casi deja de salir

Antes salía si el cliente tenía al menos el 20% de los costos cargados. Ahora exige el 100%,
exacto, en las dos semanas que compara. Con un solo producto sin costo, la alerta no sale.

**Recomiendo:** un punto medio alto pero alcanzable, por ejemplo el 90%.

### 3c. Los textos de las alertas son más secos

Antes la IA escribía una explicación ("las ventas cayeron porque…"). Ahora el texto dice qué
cambió y cuánto, pero aclara que no sabe la causa. Lo hizo porque la IA a veces inventaba
causas.

**Recomiendo:** aprobarlo. Es más honesto.

### 3d. Aurum, el asistente: qué pasa cuando no puede medir cuánto gastó

Dos cosas:
- **Si no puede calcular el costo**, Aurum sigue contestando, pero en el modo rápido y más
  barato, y le avisa al cliente por qué. Esto es lo que recomendé en su momento.
- **Problema nuevo:** si el proveedor de la IA falla una sola vez (pasa a veces), ese cliente
  queda en modo rápido **hasta fin de mes**.

**Recomiendo:** aprobar lo primero. Para lo segundo, contar esa consulta fallida como el
promedio de lo que gastó en el mes, en vez de castigarlo el mes entero.

### 3e. El detector de tareas caídas vigila 7 de 29

Codex eligió vigilar sólo las 7 tareas que avisan que están vivas. El mail de control ya no se
llena de falsas alarmas, pero la tarea que motivó todo este trabajo, la que estuvo caída cinco
semanas sin que nadie se enterara, sigue sin vigilancia.

**Recomiendo:** sumar las 9 tareas que tocan datos de clientes. Es medio día de trabajo.

### 3f. Activar un cliente nuevo ahora es más estricto, y no tiene excepción

Para activar a un cliente, el sistema exige que todas sus conexiones funcionen en ese momento
y que haya terminado de traer su historia. Está bien como regla, pero si una conexión
secundaria falla (por ejemplo, venció el permiso de Google Ads), **no hay forma de activarlo**
salvo tocando la base de datos a mano.

**Recomiendo:** mantener la regla, pero que el equipo pueda activar igual dejando escrito por
qué.

### 3g. Suspender a un cliente ahora funciona de verdad

Antes, "suspender" era una marca que la app no miraba. Ahora un cliente suspendido no puede
entrar y ve un cartel de cuenta suspendida.

**Recomiendo:** aprobarlo.

---

## 🟡 4. Decisiones de producto que no frenan la publicación

| | Qué decidir | Recomiendo |
|---|---|---|
| 4a | El formulario de alta les pide datos de VTEX a quienes usan **Shopify, Tiendanube o WooCommerce**, y no los deja terminar. ¿Sacamos esas opciones hasta integrarlas? | Sí, salvo que alguna integración esté por llegar |
| 4b | El alta ofrece **Search Console** y "traer 2 años de historia de Meta/Google Ads", y ninguna de las dos hace nada. ¿Las sacamos? | Sí |
| 4c | Cuando un cliente pide que borremos todo, ¿borramos también su cuenta? | Sí, pero como un paso aparte que haya que pedir |
| 4d | Algunas alertas salen por pura casualidad (una semana de cada seis para clientes medianos). ¿Subimos la vara aunque lleguen menos alertas? | Sí |
| 4e | ¿El alta queda trabada si falta configurar el aviso de ventas de VTEX? (Le pasó a TeVe Compras: 0 de 8 ventas registradas) | Sí |
| 4f | "El pixel está instalado" puede basarse en datos de hace meses. ¿Mostramos la fecha del último dato? | Sí, con la fecha |
| 4g | Una herramienta interna procesa 2.000 registros y dice que terminó, aunque haya 50.000. ¿La arreglamos para que termine de verdad? | Sí |
| 4h | Al traer la historia de VTEX de un cliente nuevo, si **una venta** no se puede leer nunca, todo el proceso se frena y el alta queda trabada. ¿La salteamos y la dejamos anotada a la vista, o seguimos frenando? | Saltearla, pero en una lista visible de "ventas que no se pudieron completar" |
| 4i | Alguien que conozca el usuario de un creador puede trabarle el acceso a su panel, mandando claves equivocadas. Arreglarlo sin abrir otra puerta lleva diseño. | Dejarlo para después; hoy no hay abuso conocido |

---

## 🟢 5. Para más adelante

- **Cuántos clientes aguantamos.** El número que circuló (44 tamaño Arredo) estaba mal y se
  retiró. El honesto hoy es ≈2 tamaño Arredo. **Recomiendo no recalcularlo todavía:** depende
  de una decisión técnica pendiente.
- La lista anterior tenía un punto sobre "dos herramientas que filtran una clave". Quedó
  incluido en el punto 1.

---

## Lo que hace Axel (no es decisión tuya)

1. **Hoy:** mirar `SYNC_KEY` en Vercel (punto 2).
2. **Antes de publicar:** correr unos cambios en la base de datos que el trabajo nuevo
   necesita. Están preparados y probados, y se corren a mano en unos minutos. Si se publicara sin hacerlos,
   **dejarían de entrar las ventas de MercadoLibre** en el momento.
3. **Dar la orden de publicar.** Nada se publica sin que él lo diga.

---

# En una tabla

| # | Qué | Recomiendo | Cuándo |
|---|---|---|---|
| 1 | Clientes que pueden ver datos de otros | Arreglo chico ya, aparte | 🔴 **Ya** |
| 2 | ¿Existe `SYNC_KEY`? | Que Axel lo mire | 🔴 **Hoy** |
| 3a | Estado de Resultados oculto si faltan costos | Ocultar sólo ganancia y margen | 🟠 Antes de publicar |
| 3b | Alerta de margen exige el 100% | Bajarlo a ~90% | 🟠 |
| 3c | Textos de alertas sin "causa" | Aprobar | 🟠 |
| 3d | Aurum ante errores | Aprobar + no castigar todo el mes | 🟠 |
| 3e | Vigilar 7 de 29 tareas | Sumar las 9 importantes | 🟠 |
| 3f | Activación sin excepción | Excepción con motivo escrito | 🟠 |
| 3g | Suspensión real | Aprobar | 🟠 |
| 4a–4i | Producto | Ver la tabla del punto 4 | 🟡 |
| 5 | Capacidad | Todavía no | 🟢 |
