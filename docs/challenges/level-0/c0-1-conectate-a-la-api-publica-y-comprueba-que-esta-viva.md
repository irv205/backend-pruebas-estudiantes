# C0.1 — Conéctate a la API pública y comprueba que está viva

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---

**Objetivo de aprendizaje:** distinguir los endpoints de operación (health, fuera de `/api/v1`) de los de negocio (`/api/v1`) y verificar que la API pública responde antes de consumirla. **No instalas ni arrancas nada:** el backend corre en la máquina del profesor.

**Antes de empezar**

1. Recibe del profesor la URL pública, p. ej. `https://<TU-TUNNEL>.trycloudflare.com`. Es temporal y aleatoria: **cambia en cada ejecución** del túnel. Si el profesor reinicia el túnel, actualiza las variables.
2. Importa la colección y el environment de Postman siguiendo [postman/README.md](../../../postman/README.md).
3. Configura el environment: `tunnelUrl = <URL_PUBLICA>` (solo la raíz), `hostUrl = <URL_PUBLICA>` y `baseUrl = <URL_PUBLICA>/api/v1`. `PUBLIC_BASE_URL` es ajuste del anfitrión y también se escribe sin `/api/v1`.

**Endpoints exactos**

- `GET {{hostUrl}}/health/live`
- `GET {{hostUrl}}/health/ready`
- `GET {{baseUrl}}/public/products?page=1&limit=20`
- Swagger: `{{hostUrl}}/docs`
- Portal del estudiante: `{{hostUrl}}/portal`

**Pasos**

1. Comprueba liveness y readiness con Postman o con `curl` (sustituye `<URL_PUBLICA>` por la que te dio el profesor):
   ```bash
   URL_PUBLICA='https://<TU-TUNNEL>.trycloudflare.com'
   curl -i "$URL_PUBLICA/health/live"
   curl -i "$URL_PUBLICA/health/ready"
   ```
2. Pide la demo pública (sin login, sin `x-space-id`):
   ```bash
   curl -i "$URL_PUBLICA/api/v1/public/products?page=1&limit=20"
   ```
   En Postman usa `GET {{baseUrl}}/public/products?page=1&limit=20`.
3. Abre `{{hostUrl}}/docs` (Swagger) y `{{hostUrl}}/portal` en el navegador con la URL pública. Localiza en Swagger `public/products`, `auth`, `users`, `spaces`, `categories`, `products`, `notes`, `tasks` y `files`.
4. Guarda evidencia de los tres `200`: capturas o salida de `curl -i`. **No incluyas tokens, cookies ni credenciales**; en este nivel no debes usar ninguno.

**Criterios de aceptación**

- [ ] `/health/live` y `/health/ready` responden `200` en la URL pública y **sin** el prefijo `/api/v1`.
- [ ] El listado de demo responde `200` con `data` y `meta` (no un array suelto).
- [ ] Swagger y el portal cargan en `https://<TU-TUNNEL>.trycloudflare.com/docs` y `/portal`.
- [ ] La evidencia no contiene tokens, cookies ni contraseñas.
- [ ] No intentaste instalar ni arrancar el backend: solo consumiste la URL pública.

**Pista:** si los health checks fallan, pregunta al profesor si el túnel sigue activo y si te dio la URL más reciente; `readiness` puede responder `503` mientras la app termina de arrancar. Repite sin cambiar nada más.

**Errores comunes:** buscar `/api/v1/health/live`; poner `<URL_PUBLICA>/api/v1` en `hostUrl` y obtener `/api/v1/api/v1/...`; usar una URL de una ejecución anterior del túnel; pegar la URL con una barra final duplicada.

**Extensión opcional:** guarda la salida de los dos health checks en `evidencia/health.txt` con `curl -sS ... | tee`, sin cabeceras de autorización ni tokens.

---

[Índice](../../coding-challenges.md) · [Siguiente →](./c0-2-importa-postman-y-ejecuta-tu-primer-flujo-autenticado.md)
