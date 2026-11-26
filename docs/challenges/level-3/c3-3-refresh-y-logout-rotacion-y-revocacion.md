# C3.3 — Refresh y logout: rotación y revocación

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.
> **Cuenta de práctica compartida:** el usuario sembrado `estudiante@practicas.local` es solo de demostración. Con una sola URL pública, todos los que lo usen comparten el mismo espacio personal: usa un sandbox propio o registra tu propia cuenta cuando el challenge lo permita, y **no cambies la contraseña sembrada**.

> **Contexto del nivel 3:**
>
> A partir de aquí usas `Authorization: Bearer <accessToken>`. Sin `x-space-id` trabajas en tu espacio personal.

---


**Objetivo de aprendizaje:** mantener la sesión y cerrarla correctamente.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/refresh` con `{ "refreshToken": "..." }`
- `POST {{baseUrl}}/auth/logout` con `{ "refreshToken": "..." }` → `204`

**Pasos**

1. Tras el login, guarda `refreshToken` y llama a `POST /auth/refresh`.
2. Guarda el nuevo par de tokens y comprueba que el refresh anterior ya no sirve (se revoke al rotar).
3. Usa el nuevo access token en `GET /users/me`.
4. Cierra sesión con `POST /auth/logout` y comprueba que el último refresh token deja de funcionar.

```bash
curl -i -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}' \
  {{baseUrl}}/auth/refresh

curl -i -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshTokenNuevo>"}' \
  {{baseUrl}}/auth/logout
```

**Criterios de aceptación**

- [ ] Refresh `200` con un par nuevo de tokens distinto al anterior.
- [ ] Reutilizar el refresh token anterior falla con `401`.
- [ ] Logout responde `204` **sin cuerpo**.
- [ ] Después del logout, el refresh token revocado no permite obtener tokens.

**Pista:** en Postman ejecuta `Auth › Refresh (rota y guarda nuevos tokens)` y luego `Auth › Logout`; la rotación se comprueba guardando `previousRefreshToken`.

**Errores comunes:** enviar el access token en `/auth/refresh`; seguir usando el token viejo tras la rotación; esperar un cuerpo en el `204`; hacer logout con el token de otro usuario.

**Extensión opcional:** implementa en TypeScript un `fetch` que ante `401` haga refresh **una sola vez** y repita la petición original.

---

[← Anterior](./c3-2-login-y-uso-seguro-del-token-de-acceso.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c3-4-perfil-y-avatar.md)
