# Habilitar secciones (ej: Aura) para los usuarios CLIENTE de una org

> Verificado contra prod el 2026-07-21. La primera versión de este doc apuntaba a
> `Organization.settings.rolePermissions`; **eso era incorrecto** y se comprobó
> con una query: las 4 orgs tienen ese override vacío. El switch real es el ROL
> CUSTOM de cada org. Se deja escrito el porqué para no volver a buscar ahí.
>
> Alternativa sin SQL: `/settings/team/permisos` hace lo mismo desde la UI.

## Dónde está el switch (y por qué no está donde parece)

Hay dos mecanismos distintos y se comportan **al revés** uno del otro:

| Mecanismo | Clave ausente significa | Para habilitar |
|---|---|---|
| `Organization.settings.rolePermissions` (override de la matriz de roles) | usar el **default** (`aura`: OWNER/ADMIN `admin`, MEMBER `read`) | **borrar** la clave |
| `custom_roles.permissions` (rol custom asignado al usuario) | **`none`** | **escribir** la clave |

El segundo es el que manda cuando el usuario tiene `customRoleId`.
`resolveUserPermissions` (`src/lib/permissions.ts:245-256`) no mergea con los
defaults: recorre TODAS las secciones y hace

```ts
out[sec.key] = validateLevel(v) ? v : "none";
```

Es decir, **lo que no está explícito en el JSON del rol custom queda en `none`**.
Un rol "Standard" sin la clave `aura` bloquea Aura sin que aparezca ningún
`"none"` en la base — por eso la query de inspección la muestra vacía y parece
que no hay nada apagado.

Excepción: `baseRole === "OWNER"` devuelve la matriz completa antes de mirar el
rol custom (línea 241). Un OWNER ve todo aunque tenga rol custom asignado.

## Estado encontrado en prod (2026-07-21)

| Org | Usuario | Rol base | Rol custom | Veía Aura |
|---|---|---|---|---|
| Arredo | mromero@ | MEMBER | Standard (sin `aura`) | ❌ |
| TeVe Compras | leandroc@ | MEMBER | Standard (sin `aura`) | ❌ |
| El Mundo del Juguete | gerencia@ | MEMBER | — (cae al default) | ✅ |

Los roles "Analista Ecommerce" y "Contador de prueba" de EMDJ tienen
`aura = "none"` explícito pero **0 usuarios**: no bloquean a nadie.

Tomy (`tlapidus@99media.com.ar`) es `isStaff = true` → bypass total del RBAC
(`isPathAllowed` corta en staff). **Él ya veía Aura en las 4 orgs** vía
View-as-Org; lo que estaba apagado era para los usuarios cliente.

## 1. Inspeccionar (read-only, correr siempre primero)

```sql
SELECT cr.id, o.name AS org, cr."name" AS rol, cr."isActive",
       cr.permissions->>'aura' AS aura, COUNT(u.id) AS usuarios
FROM custom_roles cr
JOIN organizations o ON o.id = cr."organizationId"
LEFT JOIN users u ON u."customRoleId" = cr.id
GROUP BY cr.id, o.name, cr."name", cr."isActive", cr.permissions
ORDER BY o.name, cr."name";
```

```sql
-- Quién entra a cada org y con qué rol.
SELECT o.name AS org, u.email, u.role, u."isStaff", cr."name" AS rol_custom
FROM users u
JOIN organizations o ON o.id = u."organizationId"
LEFT JOIN custom_roles cr ON cr.id = u."customRoleId"
ORDER BY o.name, u.email;
```

## 2. Habilitar

Por slug + nombre de rol a propósito: es autoverificable y no depende de
transcribir un cuid a mano. Confirmá que toque la cantidad de filas esperada.

```sql
UPDATE custom_roles cr
SET permissions = jsonb_set(cr.permissions, '{aura}', '"write"'::jsonb, true)
FROM organizations o
WHERE o.id = cr."organizationId"
  AND o.slug IN ('arredo', 'teve-compras')
  AND cr."name" = 'Standard';
```

El mismo patrón sirve para ir habilitando otras secciones de a poco: cambiá
`'{aura}'` por la sección (`'{bondly}'`, `'{seo}'`, …). Las claves válidas son
las de `SECTIONS` en `src/lib/permissions.ts`.

⚠️ **El nivel casi no importa hoy.** Ningún endpoint ni pantalla de Aura chequea
`write` vs `read`: el único control es el middleware, que pide `read` o más. O
sea que `"read"` **no** deja la sección en solo-lectura — el cliente igual va a
poder crear creadores y registrar pagos. Si alguna vez se quiere entregar una
sección en modo lectura de verdad, hay que construir ese control.

## 3. Verificar

```sql
SELECT o.name AS org, cr."name" AS rol, cr.permissions->>'aura' AS aura
FROM custom_roles cr
JOIN organizations o ON o.id = cr."organizationId"
WHERE cr."name" = 'Standard';
```

⚠️ El permiso viaja en el JWT (`allowedSections`, snapshot que arma `auth.ts`).
**El usuario tiene que cerrar sesión y volver a entrar** para que le aparezca.
No alcanza con recargar la página.

Después, en la app: que "Aura" aparezca en el sidebar y que `/aura/inicio` cargue
sin redirigir a `/unauthorized`.

## Rollback

```sql
UPDATE custom_roles cr
SET permissions = cr.permissions - 'aura'
FROM organizations o
WHERE o.id = cr."organizationId"
  AND o.slug IN ('arredo', 'teve-compras')
  AND cr."name" = 'Standard';
```

Borrar la clave la devuelve a `none` (que es como estaba), en vez de dejar un
`"none"` explícito que ensucia el JSON.
