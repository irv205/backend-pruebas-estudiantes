# C3.4 — Perfil y avatar

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 3:**
>
> A partir de aquí usas `Authorization: Bearer <accessToken>`. Sin `x-space-id` trabajas en tu espacio personal.

---


**Objetivo de aprendizaje:** editar datos personales y subir un avatar multipart.

**Endpoints exactos**

- `GET {{baseUrl}}/users/me`
- `PATCH {{baseUrl}}/users/me` con `{ "name", "avatarUrl"?, "avatarFileId"? }`
- `POST {{baseUrl}}/users/me/avatar` (multipart, campo `avatar`)
- `PUT {{baseUrl}}/users/me/password` (cambia la contraseña y revoca otras sesiones)
- `GET {{baseUrl}}/files?page=1&limit=10`

**Pasos**

1. Consulta tu perfil y cambia solo el `name`.
2. Sube una imagen pequeña como avatar:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -F 'avatar=@./foto.png;type=image/png' \
     {{baseUrl}}/users/me/avatar
   ```
3. Comprueba que `GET /users/me` devuelve la referencia al avatar y que `GET /files` lista el objeto.
4. **Opcional y con cuidado:** cambia la contraseña de un usuario de prueba propio con `PUT /users/me/password`; vuelve a hacer login porque las demás sesiones quedan revocadas. Evita cambiar la contraseña del usuario del seed.

**Criterios de aceptación**

- [ ] `PATCH /users/me` responde `200` con el nombre actualizado.
- [ ] `POST /users/me/avatar` responde `201`.
- [ ] El perfil refleja el avatar (o `avatarFileId`) y el archivo aparece en `GET /files`.
- [ ] `PUT /users/me/password` con contraseña actual incorrecta responde error, no `500`.

**Pista:** el campo del formulario se llama `avatar`, no `file`; para subir otros archivos usa `POST /files` con campo `file`.

**Errores comunes:** enviar el avatar en base64 dentro de JSON; usar el campo `file`; subir un tipo no permitido; cambiar la contraseña sembrada y dejar a otros estudiantes sin login.

**Extensión opcional:** sube primero a `POST /files` con `kind=AVATAR` y luego usa el `id` devuelto en `PATCH /users/me` con `avatarFileId`.

---

[← Anterior](./c3-3-refresh-y-logout-rotacion-y-revocacion.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c3-5-notas-privadas-crud-filtros-y-propiedad.md)
