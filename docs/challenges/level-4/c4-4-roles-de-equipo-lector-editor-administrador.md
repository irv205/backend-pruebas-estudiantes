# C4.4 — Roles de equipo: LECTOR, EDITOR, ADMINISTRADOR

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---


**Objetivo de aprendizaje:** distinguir autenticación de autorización y trabajar en un espacio compartido.

**Endpoints exactos**

- `POST {{baseUrl}}/spaces/teams`
- `GET/POST {{baseUrl}}/spaces/:spaceId/members`
- `PATCH/DELETE {{baseUrl}}/spaces/:spaceId/members/:userId`
- `POST {{baseUrl}}/spaces/:spaceId/reset`
- `GET {{baseUrl}}/spaces/me`
- Cualquier CRUD con `x-space-id: <teamSpaceId>` (products, categories, notes, tasks, files)

**Pasos**

1. Crea un equipo con tu usuario administrador:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"name":"Equipo de prácticas"}' \
     {{baseUrl}}/spaces/teams
   ```
2. Invita al segundo usuario de C3.1 como `EDITOR` con `POST /spaces/:spaceId/members`.
3. Haz login con ese usuario y crea una tarea enviando `x-space-id: <teamSpaceId>`: debe funcionar.
4. Cambia su rol a `LECTOR` con `PATCH /spaces/:spaceId/members/:userId`; repite la creación: `403 INSUFFICIENT_ROLE`.
5. Comprueba que un `LECTOR` sí puede hacer `GET /tasks` con la cabecera del equipo.
6. Como administrador, lista miembros y reinicia el equipo con `POST /spaces/:spaceId/reset`.

**Criterios de aceptación**

- [ ] El creador queda como `ADMINISTRADOR` y puede invitar/cambiar roles/remover/resetear.
- [ ] `EDITOR` crea/edita/elimina recursos del equipo, pero no gestiona miembros.
- [ ] `LECTOR` solo consulta; un `POST` responde `403 INSUFFICIENT_ROLE`.
- [ ] Sin `x-space-id`, cada usuario ve su espacio personal, no el del equipo.
- [ ] Un usuario que no es miembro no puede operar en el equipo.

**Pista:** el header `x-space-id` selecciona el espacio; el token decide **quién** eres. Necesitas ambos.

**Errores comunes:** invitar a un correo no registrado; creer que `x-space-id` otorga permisos; usar `userId` donde va `spaceId`; esperar que un `EDITOR` pueda cambiar roles.

**Extensión opcional:** escribe una tabla cliente de permisos por rol y comprueba que tu UI oculta las acciones no permitidas.

---

[← Anterior](./c4-3-subida-descarga-y-borrado-de-archivos-multipart.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c4-5-simulador-de-errores-timeouts-503-y-conflictos.md)
