# TODOS

Trabajo identificado y diferido a propósito. Cada item tiene contexto suficiente para
retomarlo sin la conversación que lo originó.

---

## 1. Completar el catálogo: arreglar y agendar `sync/catalog`

**Qué:** hacer que `products` contenga todos los productos de la tienda, no solo los que
alguna vez se vendieron.

**Por qué:** hoy el catálogo de Arredo lo creó íntegramente el webhook de órdenes (6931
filas, 0 con `stockUpdatedAt`). Consecuencias medidas:
- 643 de 853 productos que la gente visita no existen en `products` → el CR queda
  subestimado aunque el mapeo de IDs funcione perfecto.
- Las categorías se muestran como `/1/11/` en vez de nombres legibles: el webhook guarda
  lo que trae el ítem de la orden; los nombres los devuelve la API de catálogo.
- Es la causa del "faltan productos" de LEGO (16-jul).

**Estado:** `sync/catalog` existe pero **nunca corrió** y **no está en `vercel.json`**.

### ⛔ Seis blockers verificados contra el código (leer antes de tocar nada)

1. **Cola de desactivación — el peor.** `sync/catalog/route.ts:154-165` desactiva todo lo
   que no esté en `vtexIds` y tenga `stockUpdatedAt` no nulo. `vtexIds` junta
   `String(p.productId)`. Si el sync empareja filas existentes por `sku` (que conservan
   `externalId = skuId`) y les setea `stockUpdatedAt`, **cada fila que toca con éxito
   queda desactivada**. Hoy el bloque es inerte solo porque `stockUpdatedAt` es nulo en las
   6931 filas. Cualquier cambio de emparejamiento lo arma. `vtexIds` tiene que juntar la
   clave por la que realmente se emparejó.
2. **`getOrganizationId()` sin org explícita** (líneas 194 y 211) → `AmbiguousOrgError` con
   2+ orgs en prod. Ver [[nitrosales-prod-multitenant-transition]].
3. **Fallback de credenciales.** `getVtexCredentials` (`src/lib/vtex-credentials.ts:78-90`)
   cae a `VTEX_APP_KEY`/`VTEX_ACCOUNT_NAME` globales si la org no tiene credenciales
   propias. El modo de fallar no es "no corre" sino **"corre contra la cuenta equivocada y
   escribe el catálogo de otro cliente"**. Verificar `Connection.credentials` de Arredo
   antes que nada.
4. **Throughput.** `maxDuration = 60`, `PAGE_SIZE 50 × 10 páginas = 500 productos por
   invocación`, y la ruta devuelve `nextPage` pero nadie la encadena (`sync/catalog` no
   está en `sync/chain`). Agendarla como está sincroniza 500 de 7000+ por día.
5. **`sku` no tiene constraint de unicidad.** `schema.prisma` solo tiene
   `@@unique([organizationId, externalId])`. `upsertProductBySku` usa `findFirst` → ganador
   arbitrario si hay duplicados. Además el webhook escribe
   `sku: item.refId || item.sellerSku || productExtId`, así que filas sin refId tienen el
   skuId numérico como sku, que puede colisionar con un referenceId del catálogo.
6. **Viola su propia regla.** `sync/catalog:117` llama a `prisma.product.upsert` directo;
   `src/lib/products/upsert-by-sku.ts` dice explícitamente que nunca hay que hacerlo desde
   código de sync. Esa función se escribió en la Sesión 21 contra este mismo problema.

**Antes de empezar:** tomar snapshot.
`CREATE TABLE products_backup_YYYYMMDD AS SELECT * FROM products WHERE "organizationId"='...'`

**Relacionado:** `docs/PLAN-VTEX-PRODUCT-ID.md` (el proyecto 1, que resuelve el CR sin
tocar `products`).

---

## 2. Clave de admin hardcodeada en `vercel.json`

**Qué:** `nitrosales-secret-key-2024-production` está en texto plano en `vercel.json`,
repetida en los 19 crons.

**Por qué:** cualquiera con acceso al repo puede disparar cualquier cron administrativo,
incluido `admin/replay-attribution`, que **escribe** atribuciones.

**Ojo:** la clave está en el historial de git. Borrarla del archivo no la borra del pasado
— hay que **rotarla** en Vercel, no solo moverla.

**Cómo:** rotar en Vercel → los crons la leen de una variable de entorno.
`src/lib/admin-key.ts` ya lee `process.env.ADMIN_API_KEY`; falta el cambio en `vercel.json`
y setear la variable.

**Riesgo hoy:** bajo si el repo es privado y con acceso controlado. Alto si alguna vez se
abre, se comparte con un contratista, o se filtra.
