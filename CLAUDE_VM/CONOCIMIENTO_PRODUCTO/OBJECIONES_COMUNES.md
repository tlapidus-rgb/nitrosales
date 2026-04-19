# OBJECIONES_COMUNES.md — Las 12 objeciones más probables y cómo responderlas

> **Propósito**: Biblioteca de respuestas a las objeciones que van a aparecer en conversación comercial. No son scripts rígidos — son **marcos de respuesta** alineados al posicionamiento, con honestidad y sin teatro.
>
> **Regla de oro**: una objeción es un **pedido de información**, no un "no". La respuesta debe ayudar al prospect a decidir mejor, no empujarlo. Si la respuesta honesta es "no somos para vos ahora", eso también se dice.

---

## Principios para responder objeciones

1. **Acknowledge primero, después respondé**. "Totalmente entendible que preguntes eso porque [razón]..." baja defensas.
2. **Honestidad antes que venta**. Si la app no cubre algo, se dice.
3. **Datos antes que promesas**. "En la beta X pasó" > "te imaginamos logrando Y".
4. **Preguntá de vuelta cuando no hay certeza**. "¿Qué necesitás para sentirte seguro con esto?" abre más que cierra.
5. **Nunca hables mal de la competencia**. Ni de Triple Whale, ni de Klaviyo, ni de Tiendanube. Ni aunque el prospect abra la puerta.

---

## Objeción #1 — "Es muy caro / no entra en mi presupuesto"

### Por qué aparece
Fundadores acostumbrados a la gratuidad de dashboards nativos (Tiendanube, VTEX admin) o a los precios bajos del SMB LATAM donde el ARPU está en USD 30-50.

### Qué NO hacer
- Justificar el precio listando features ("pero tiene esto, y esto, y esto...").
- Comparar con competidores caros ("Northbeam sale $1000, nosotros somos bajos").
- Ofrecer descuento sin entender el dolor real.

### Cómo responder
> "Entiendo. Antes de hablar de precio, ¿me contás cuánto te está costando hoy **no tener** la plata clara? Cuántas horas por semana de planilla, cuánto gastás en campañas sin saber si te están dando retorno, cuánta plata te quedó por cobrar por no hacer follow-up a clientes inactivos. Si la app te ahorra 2 horas por semana y te sube el ROAS blended 10%, se paga sola el primer mes. Si no, tenés razón: no tiene sentido."

**Sub-movida**: ofrecer el programa beta / onboarding partner con términos más flexibles mientras se valida ROI. Pero **no regalar** la app — el cliente que no paga no la usa en serio.

---

## Objeción #2 — "Ya uso Tiendanube / VTEX / Shopify y me alcanza con su dashboard"

### Por qué aparece
No diferencian entre un **dashboard operativo** (el de la plataforma de commerce) y una **plataforma de business intelligence unificada** (NitroSales).

### Qué NO hacer
- Minimizar lo que ya usan ("ese dashboard es malo"). No es malo, es otra cosa.

### Cómo responder
> "Si hoy estás todo el día adentro de un solo canal, ese dashboard te alcanza. La pregunta es: ¿cuándo querés mirar ventas totales (tienda + MercadoLibre + campañas), qué hacés? ¿Abrís 3 pestañas y armás una planilla? NitroSales vive **arriba** de todo tu stack. Tu [Tiendanube / VTEX] sigue siendo tu tienda. Nosotros somos la cabeza que mira todos los canales juntos y te da atribución real, P&L, creators — cosas que el dashboard de la tienda no te va a dar nunca porque no son su trabajo."

---

## Objeción #3 — "¿Por qué no uso Triple Whale / Polar / Northbeam?"

### Por qué aparece
El prospect escuchó de los referentes de atribución USA en Twitter, podcasts, grupos de ecommerce.

### Qué NO hacer
- Hablar mal de ellos.
- Minimizar su capacidad.
- Decir "son caros" como único argumento.

### Cómo responder
> "Triple Whale es un producto increíble para ecommerce Shopify en USA. Si tu negocio fuera eso, te lo recomendaría sin pensarlo. Para un ecommerce argentino hay tres cosas que ellos no cubren y nosotros sí:
>
> 1. **VTEX + MercadoLibre nativos**. Ellos no lo tienen. Acá el 90% de las marcas grandes tienen ML y la mayoría está en VTEX.
> 2. **AFIP, tri-currency, ajuste por inflación**. Ningún dashboard USA puede decirte cuánto creciste real descontando inflación. Nosotros sí.
> 3. **P&L + creators nativos**. Triple Whale es atribución. Nosotros somos atribución + P&L + Customer intelligence + creators, todo en un lugar, hablando español.
>
> Si tu única necesidad fuera atribución USA Shopify, te diría que vayas con ellos. Pero si tu contexto es Argentina/LATAM con stack VTEX+ML, nosotros somos 10x más productivos para ese contexto."

---

## Objeción #4 — "¿Y si se cae la app? Me quedo sin datos."

### Por qué aparece
Experiencia previa con SaaS que prometían mucho y fallaron. Preocupación legítima.

### Qué NO hacer
- Prometer 99.99% uptime sin respaldo.
- Minimizar el riesgo.

### Cómo responder
> "La infraestructura corre en Vercel con base de datos Postgres replicada, el mismo stack que usan Loom, Notion, Linear. Pero más importante: **los datos son tuyos**. Si algún día decidís irte, los datos de VTEX siguen en VTEX, los de ML siguen en ML, y los eventos de NitroPixel los podés exportar. No hay lock-in de data. Nosotros sumamos capa de análisis; no te secuestramos la información. Hoy corremos en beta con un cliente activo y no hemos tenido downtime material. A medida que escalemos, sumamos SLAs formales."

**Nota interna (NO compartir)**: ser honesto sobre que es beta. Hubo downtime antes (ver `ERRORES_CLAUDE_NO_REPETIR.md` — 1600 órdenes ML perdidas). Hoy está arreglado. Si un prospect exige SLA contractual con penalidad, evaluar si vale la pena el compromiso en esta etapa.

---

## Objeción #5 — "Mi equipo es chico, no tengo quién lo maneje"

### Por qué aparece
Fundadores solo o con equipos de 2-4 personas. Miedo a sumar herramienta que exija curva de aprendizaje.

### Cómo responder
> "Entiendo — por eso está Aurum. Vos no tenés que aprender la app. Le preguntás a Aurum en español qué pasó, qué recomienda, qué alerta hay que mirar hoy, y él te lleva a la pantalla relevante. Pensalo como un analista que trabaja para vos 24/7, no como un software más que hay que dominar."

**Sub-movida**: proponer onboarding 1:1 con sesiones cortas (30 min) vs capacitación formal larga. "Te acompañamos las primeras 2 semanas, y si a los 30 días no lo estás usando, ahí revisamos juntos."

---

## Objeción #6 — "¿Y mis datos? ¿A dónde van? ¿Quién los puede ver?"

### Por qué aparece
Preocupación legítima de privacidad. Muchas marcas LATAM no quieren que su data esté en servidores random.

### Qué NO hacer
- Sobre-tecnificar la respuesta.
- Evitar el tema.

### Cómo responder
> "Todos los datos de tu negocio viven en una base de datos Postgres dedicada a tu organización, con aislamiento por `organizationId`. No los compartimos, no los vendemos, no los agregamos con los de otras marcas para venderlos como data de mercado. La IA que usamos es Claude de Anthropic (empresa que no usa tus prompts para entrenar modelos según sus términos). Si tenés dudas contractuales, armamos un Data Processing Agreement puntual."

---

## Objeción #7 — "¿Funciona con mi CRM / mi Klaviyo / mi Zendesk actual?"

### Por qué aparece
Miedo a tirar todo lo que ya armó. Miedo a que "esto reemplace todo".

### Cómo responder
> "NitroSales NO reemplaza tu Klaviyo ni tu Zendesk. Nos integramos con Resend para los emails del sistema (alertas, reportes), pero tu email marketing sigue donde está. Tu Zendesk sigue siendo tu Zendesk. Lo que hacemos es vivir arriba de todo: atribución, customer intelligence, creators, P&L. Pensanos como una **capa de análisis + asistente**, no como un reemplazo de stack."

**Matiz importante**: si preguntan específicamente por integración nativa con su stack, ser honesto. Hoy no tenemos conectores Klaviyo o Zendesk directos. Eso está en roadmap.

---

## Objeción #8 — "¿Y si los cambios de IVA / AFIP / normativa rompen la app?"

### Por qué aparece
Fundadores argentinos saben que la normativa cambia seguido. Miedo legítimo.

### Cómo responder
> "Justamente por eso construimos con conexión a AFIP desde el core, no como plugin. Cuando cambia una normativa, actualizamos el producto — y ese es nuestro trabajo, no tuyo. Es una de las razones por las cuales no podés usar un producto USA para este contexto: si mañana cambian las alícuotas o aparece un régimen nuevo, Triple Whale no se entera. Nosotros sí."

---

## Objeción #9 — "Lo pienso y te aviso" / "Déjame discutirlo con mi socio"

### Por qué aparece
Clásica del ciclo de ventas. A veces es real, a veces es educada forma de decir "no".

### Cómo responder
> "Perfecto. Para que la conversación con tu socio sea concreta, ¿qué necesitarías de mí? ¿Un one-pager? ¿Un demo grabado de 5 min que le puedas mandar? ¿Una llamada con los dos? Podemos también arrancar con un proof of concept de 30 días donde vos probás con tu data real y decidís después. Decime qué te sirve más."

**Sub-movida**: pactar **fecha concreta de follow-up** ("¿el miércoles a las 3pm te mando un mensaje para saber cómo van?"). Sin fecha, el lead se enfría.

---

## Objeción #10 — "Vengo quemado de probar dashboards que no usé"

### Por qué aparece
Fundador que pagó 3 SaaS que abrió 3 veces y abandonó. Dolor real y frecuente.

### Qué NO hacer
- Prometer "vas a ver que con nosotros es distinto" sin fundamento.

### Cómo responder
> "Lo veo seguido. El 90% de los dashboards fallan por dos razones: 1) obligan a aprender mil menúes, y 2) no se abren solos cada mañana porque no hay un ritual. Por eso nosotros hicimos dos cosas: **Aurum**, para que no tengas que aprender la app (le preguntás y él te lleva); y **alertas + narrative engine**, para que haya algo que te chifle cuando hay que mirar. Si al mes 2 no lo estás abriendo todos los días, te devuelvo la plata (o lo que sea el trato)."

**Nota**: esa garantía hay que ofrecerla con criterio. Si Tomy no está en condiciones de sostener "te devuelvo la plata", reemplazar por "revisamos juntos si tiene sentido seguir."

---

## Objeción #11 — "¿Tienen soporte 24/7? ¿Y si me pasa algo un sábado?"

### Por qué aparece
Preocupación razonable, sobre todo en fin de semana (mucha venta).

### Cómo responder
> "Hoy estamos en beta — el soporte es directo con el fundador (Tomy) por WhatsApp. No hay un call center, pero sí hay una persona que conoce el producto en detalle y responde rápido. A medida que escalemos vamos armando soporte formal. Mientras tanto, tenés el canal más directo posible."

**Honestidad**: no tenemos soporte 24/7. Decilo. Mejor perder el deal que prometer algo que no se cumple.

---

## Objeción #12 — "¿Cuánto tiempo tarda el onboarding?"

### Por qué aparece
Miedo a que sea "proyecto de 3 meses" cuando hoy necesitan ventas ya.

### Cómo responder
> "Depende del stack, pero la mayoría está operativo en menos de 1 semana:
> - **VTEX + ML** conectados y sincronizando: 1-2 días (depende de la velocidad del cliente aprobando OAuth y webhooks).
> - **Meta + Google Ads**: mismo día (solo OAuth).
> - **NitroPixel instalado y emitiendo eventos**: 1 día si usás GTM, 2 días si necesitamos tocar theme.
> - **AFIP**: 1-2 días (requiere certificado digital).
> - **Primer dashboard útil con data real**: 3-5 días.
>
> No te cobramos setup fees en esta etapa beta. Onboarding lo hacemos nosotros, no tenés que contratar un implementador."

---

## Objeciones menos frecuentes pero posibles

### "¿Y cuando quiera cancelar?"
> "Se cancela cuando quieras. Los datos quedan exportables por 90 días después del fin del contrato. No tenemos contratos anuales forzados en la etapa beta."

### "¿Puedo probarlo gratis antes de pagar?"
> "En esta etapa beta tenemos un esquema de onboarding asistido pago porque necesitamos clientes con skin in the game. Lo que sí tenés es: demo en vivo de 30 min con tu data si nos conectás VTEX read-only, y garantía de que si a los 30 días no lo estás usando, revisamos juntos y salimos limpio."

### "¿Tiene app móvil?"
> "Hoy no hay app móvil nativa. La web está optimizada para mobile. App nativa está en roadmap, no tengo fecha."

### "¿Tiene Portugués / es válido para Brasil?"
> "Hoy la app está pensada para Argentina (AFIP, dolarapi, INDEC, español). Expansión a Brasil con su contexto fiscal propio está en roadmap. No prometemos timeline."

### "¿Cómo se compara con un Data Studio / Looker Studio armado por mi equipo?"
> "Un Data Studio bien armado puede hacer muchas cosas. Lo que no puede hacer es: tener atribución first-party (necesita pixel), escuchar webhooks en tiempo real, tener un asistente IA conversacional con memoria, y estar mantenido sin que un analista le dedique horas todas las semanas. Si tenés un equipo que quiere mantener esa infra, es una opción. Si no, somos la versión productizada que ya funciona."

---

## Señales de que NO somos para el prospect (y hay que decirlo)

A veces la respuesta honesta es: "no somos para vos ahora". Señales:

1. **No tiene canales digitales todavía** → es muy temprano. Volver cuando tenga tráfico.
2. **Es 100% Shopify USA sin intención LATAM** → mejor Triple Whale o Polar.
3. **Presupuesto incompatible con lo que vale el producto** → no forzar. Volver en 6 meses.
4. **Volumen < USD 20k/mes en GMV** → ROI difícil de demostrar. Tal vez el dashboard nativo de la plataforma le alcanza.
5. **No es el decisor** → pedir reunión con el decisor antes de avanzar.

Decir "no somos para vos ahora" es **ganar confianza**, no perder un deal. El prospect te recuerda cuando esté listo o cuando le pregunten por vos.

---

## Anti-patrones de Claude VM

- **No suenar defensivo** ante objeciones. Son conversación, no ataque.
- **No improvisar datos**. Si no está en `CASOS_DE_EXITO.md`, `COMPETIDORES.md`, `INTEGRACIONES.md`, no se afirma.
- **No prometer features futuros** con fecha.
- **No menospreciar al prospect**. Hasta la objeción más básica viene de una preocupación real.
- **No terminar la respuesta sin una pregunta**. Toda respuesta a objeción termina con una pregunta para mantener la conversación ("¿tiene sentido? ¿qué te preocupa puntualmente?").
