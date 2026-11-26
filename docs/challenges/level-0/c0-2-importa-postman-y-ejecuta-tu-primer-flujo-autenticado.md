# C0.2 — Importa Postman y ejecuta tu primer flujo autenticado

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Pega esa única URL en `tunnelUrl`: la collection deriva `{{hostUrl}}` (raíz), `{{baseUrl}}` (raíz + `/api/v1`) y `{{wsBaseUrl}}` (`wss://<host-publico>`), y **Portal › Manifiesto** las refresca. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.
> **Cuenta compartida:** el usuario sembrado de desarrollo es solo de práctica. Con una sola URL pública, todos los estudiantes que lo usen caen en el **mismo espacio personal**. Usa un sandbox propio (`x-space-id`) o registra tu propia cuenta cuando el desafío lo permita (Nivel 3), y **no cambies la contraseña sembrada**.

---

**Objetivo de aprendizaje:** entender el flujo de la collection y cómo los scripts de test autopueblan tokens e IDs contra la API pública. **No instalas ni arrancas nada.**

**Endpoints exactos**

- `POST {{baseUrl}}/auth/login`
- `GET {{baseUrl}}/users/me`
- `GET {{hostUrl}}/health/ready`

**Pasos**

1. Importa la colección y el environment siguiendo [postman/README.md](../../../postman/README.md) o la sección [Importar Postman](../../coding-challenges.md#importar-postman). Selecciona el environment **Backend Prácticas - URL pública (estudiantes)** y pega la URL del profesor **solo en `tunnelUrl`**; `hostUrl`, `baseUrl` y `wsBaseUrl` se derivan solas. Si el profesor te da una URL nueva, vuelve a pegarla ahí y ejecuta **Portal › Manifiesto**.
2. Ejecuta `Health › Readiness`.
3. Ejecuta `Auth › Login (pobla accessToken/refreshToken)` con `estudiante@practicas.local` / `Estudiante.123` (usuario de práctica, no real). Para no compartir espacio con otros estudiantes, crea tu propio sandbox anónimo o registra tu cuenta propia en el Nivel 3; no modifiques la contraseña del usuario sembrado.
4. Abre la pestaña *Tests* del request de login y comprueba que `accessToken`, `refreshToken` y `userId` quedaron escritos en el environment.
5. Ejecuta `Users › Obtener mi perfil` y repite lo mismo con `curl` (sustituye `<URL_PUBLICA>` por la URL que te dio el profesor):
   ```bash
   URL_PUBLICA='https://<TU-TUNNEL>.trycloudflare.com'
   TOKEN=$(curl -s -H 'Content-Type: application/json' \
     -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
     "$URL_PUBLICA/api/v1/auth/login" | jq -r .data.tokens.accessToken)

   curl -i -H "Authorization: Bearer $TOKEN" "$URL_PUBLICA/api/v1/users/me"
   ```
   En Postman usa `GET {{baseUrl}}/users/me`. No pegues el `TOKEN` en capturas ni logs.

**Criterios de aceptación**

- [ ] Login responde `200` y `data.tokens.accessToken` / `data.tokens.refreshToken` no están vacíos.
- [ ] `GET /users/me` responde `200` con `{ "data": { ... } }` usando el token contra la URL pública.
- [ ] Sin header `Authorization`, `GET /users/me` responde `401`.
- [ ] Los IDs y versiones se autopueblan tras crear recursos.
- [ ] No configuraste nada en local ni incluiste tokens en la evidencia.

**Pista:** si los requests con Bearer devuelven `401`, ejecuta `Auth › Login` otra vez; es el primer paso de la collection. Si devuelven `404` o fallan de red, pide al profesor la URL vigente del túnel.

**Errores comunes:** no seleccionar environment; olvidar la palabra `Bearer`; borrar las credenciales del environment y no volver a escribirlas; pegar el `refreshToken` donde va el `accessToken`; duplicar `/api/v1`; usar una URL de túnel anterior.

**Extensión opcional:** crea una carpeta propia en Postman con solo los requests de tu nivel y un `Pre-request Script` que valide que `accessToken` no esté vacío.

---

[← Anterior](./c0-1-conectate-a-la-api-publica-y-comprueba-que-esta-viva.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../level-1/c1-1-listar-el-catalogo-publico.md)
