# C4.4 — Roles de equipo: LECTOR, EDITOR, ADMINISTRADOR

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
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
