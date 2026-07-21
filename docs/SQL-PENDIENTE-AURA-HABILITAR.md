# SQL pendiente — volver a habilitar Aura por organización

> Correr en la consola de Neon (prod). **Empezá siempre por el paso 1**: sin ver
> el estado actual, los `UPDATE` de abajo son a ciegas.
>
> Alternativa sin SQL: la pantalla `/settings/team/permisos` hace exactamente
> esto desde la UI (`PUT /api/settings/permissions`). Si te sirve, es más segura
> — el SQL está acá porque lo pediste.

## Cómo está apagada hoy

`Organization.settings.rolePermissions` es un override JSON de la matriz de roles
del sistema. `mergePermissions()` (`src/lib/permissions.ts:140`) arranca de los
defaults y le pisa encima solo las claves presentes en el override.

Los defaults para `aura` son: **OWNER `admin`, ADMIN `admin`, MEMBER `read`** —
o sea, sin override Aura se ve. Está apagada porque en la sesión anterior se
escribió `aura: "none"` en el override de esa org.

Por eso lo correcto **no es escribir un valor nuevo, es BORRAR la clave** del
override: al desaparecer, vuelve a mandar el default. Escribir `"admin"` a mano
funcionaría, pero deja basura en el JSON y desincroniza a la org de los defaults
si mañana cambian.

⚠️ El permiso viaja en el JWT (`allowedSections`). Después de correr esto,
**Tomy tiene que cerrar sesión y volver a entrar** para que le aparezca Aura.

## 1. Ver el estado actual (read-only, corré esto primero)

```sql
-- Override por org: qué nivel tiene 'aura' en cada rol.
SELECT
  id,
  name,
  slug,
  settings->'rolePermissions'->'OWNER'->>'aura'  AS owner_aura,
  settings->'rolePermissions'->'ADMIN'->>'aura'  AS admin_aura,
  settings->'rolePermissions'->'MEMBER'->>'aura' AS member_aura,
  (settings ? 'rolePermissions')                 AS tiene_override
FROM organizations
ORDER BY name;
```

Leer así: `null` = sin override, manda el default (Aura **se ve**).
`"none"` = apagada explícitamente. Eso es lo que hay que borrar.

No asumas qué org es cuál por el id — la lista de arriba te lo dice por nombre.

```sql
-- Aura también puede estar apagada por un rol personalizado. Si algún usuario
-- de la org tiene customRoleId, este es el que manda para ese usuario.
SELECT
  cr.id,
  o.name        AS org,
  cr."name"     AS rol,
  cr."isActive",
  cr.permissions->>'aura' AS aura,
  COUNT(u.id)   AS usuarios
FROM custom_roles cr
JOIN organizations o ON o.id = cr."organizationId"
LEFT JOIN users u ON u."customRoleId" = cr.id
GROUP BY cr.id, o.name, cr."name", cr."isActive", cr.permissions
ORDER BY o.name, cr."name";
```

## 2. Habilitar Aura — override de la organización

Reemplazá la lista de slugs por las orgs que quieras habilitar (salen del paso 1).

```sql
UPDATE organizations
SET settings = jsonb_set(
      settings,
      '{rolePermissions}',
      (settings->'rolePermissions')
        #- '{OWNER,aura}'
        #- '{ADMIN,aura}'
        #- '{MEMBER,aura}'
    )
WHERE slug IN ('arredo', 'el-mundo-del-juguete', 'teve-compras')
  AND settings ? 'rolePermissions';   -- sin esto, una org sin override quedaría con settings = NULL
```

El `AND settings ? 'rolePermissions'` **no es opcional**: `jsonb_set` con un
valor NULL devuelve NULL y te dejaría la columna `settings` entera en null.

## 3. Si además hay un rol personalizado apagándola

Solo si el paso 1 mostró un `custom_roles` con `aura = "none"` y usuarios
colgando. Acá **sí hay que escribir un valor**, porque los roles custom no caen
a defaults: lo que no está en su JSON es `none`.

```sql
UPDATE custom_roles
SET permissions = jsonb_set(permissions, '{aura}', '"read"'::jsonb)
WHERE id = '<id_del_rol_del_paso_1>';
```

Usá `"read"` para solo ver, `"write"` para operar (crear creadores, registrar
pagos) o `"admin"` para todo.

## 4. Verificar

```sql
-- Repetir la query del paso 1: las orgs habilitadas tienen que dar null en las
-- tres columnas (= sin override = default = Aura visible).
SELECT
  name,
  settings->'rolePermissions'->'OWNER'->>'aura'  AS owner_aura,
  settings->'rolePermissions'->'ADMIN'->>'aura'  AS admin_aura,
  settings->'rolePermissions'->'MEMBER'->>'aura' AS member_aura
FROM organizations
ORDER BY name;
```

Después, en la app: cerrar sesión, volver a entrar, y confirmar que aparece
"Aura" en el sidebar y que `/aura/inicio` carga sin redirigir a `/unauthorized`.

## Rollback

```sql
-- Volver a apagarla para una org.
UPDATE organizations
SET settings = jsonb_set(
      settings,
      '{rolePermissions,MEMBER,aura}',
      '"none"'::jsonb,
      true
    )
WHERE slug = '<slug>';
-- (repetir cambiando MEMBER por OWNER y ADMIN)
```
