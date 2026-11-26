# C3.4 — Perfil y avatar

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.
> **Cuenta de práctica compartida:** el usuario sembrado `estudiante@practicas.local` es solo de demostración. Con una sola URL pública, todos los que lo usen comparten el mismo espacio personal: usa un sandbox propio o registra tu propia cuenta cuando el challenge lo permita, y **no cambies la contraseña sembrada**.

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
