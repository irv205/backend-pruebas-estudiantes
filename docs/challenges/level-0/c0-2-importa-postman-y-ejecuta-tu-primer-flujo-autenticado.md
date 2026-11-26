# C0.2 — Importa Postman y ejecuta tu primer flujo autenticado

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---


**Objetivo de aprendizaje:** entender el flujo de la collection y cómo los scripts de test autopueblan tokens e IDs.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/login`
- `GET {{baseUrl}}/users/me`
- `GET {{hostUrl}}/health/ready`

**Pasos**

1. Importa collection y environment (sección [Importar Postman](#importar-postman)). Selecciona el environment.
2. Ejecuta `Health › Readiness`.
3. Ejecuta `Auth › Login (pobla accessToken/refreshToken)` con `estudiante@practicas.local` / `Estudiante.123`.
4. Abre la pestaña *Tests* del request de login y comprueba que `accessToken`, `refreshToken` y `userId` quedaron escritos en el environment.
5. Ejecuta `Users › Obtener mi perfil` y repite lo mismo con `curl`:
   ```bash
   TOKEN=$(curl -s -H 'Content-Type: application/json' \
     -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
     {{baseUrl}}/auth/login | jq -r .data.tokens.accessToken)

   curl -i -H "Authorization: Bearer $TOKEN" {{baseUrl}}/users/me
   ```

**Criterios de aceptación**

- [ ] Login responde `200` y `data.tokens.accessToken` / `data.tokens.refreshToken` no están vacíos.
- [ ] `GET /users/me` responde `200` con `{ "data": { ... } }` usando el token.
- [ ] Sin header `Authorization`, `GET /users/me` responde `401`.
- [ ] Los IDs y versiones se autopueblan tras crear recursos.

**Pista:** si los requests con Bearer devuelven `401`, ejecuta `Auth › Login` otra vez; es el primer paso de la collection.

**Errores comunes:** no seleccionar environment; olvidar la palabra `Bearer`; borrar las credenciales del environment y no volver a escribirlas; pegar el `refreshToken` donde va el `accessToken`.

**Extensión opcional:** crea una carpeta propia en Postman con solo los requests de tu nivel y un `Pre-request Script` que valide que `accessToken` no esté vacío.

---

[← Anterior](./c0-1-arranca-el-backend-y-comprueba-que-esta-vivo.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../level-1/c1-1-listar-el-catalogo-publico.md)
