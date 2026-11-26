# C6.1 — WebSockets, chat y notificaciones

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 6:**
>
> **Solo anfitrión/profesor:** disponible desde la Etapa 4; el anfitrión asegura que `redis` y `worker` estén arrancados (`docker compose up -d --build`). En CI/e2e se usa `JOBS_QUEUE_MODE=inline` y no se necesita Redis. **Tú, como estudiante, no instalas ni arrancas nada:** solo conectas con `{{wsBaseUrl}}` y usas los endpoints.

---


**Objetivo de aprendizaje:** recibir eventos en tiempo real con autenticación, autorización por sala y reconexión con replay.

**Endpoints reales**

| Tipo | Ruta | Función |
|---|---|---|
| WS | `{{wsBaseUrl}}/socket.io` (path por defecto) | Conexión con `auth: { token: accessToken }` o header `Authorization: Bearer`. |
| `GET` | `/notifications?page=1&limit=20&unreadOnly=true` | Bandeja paginada del usuario en el espacio. |
| `GET` | `/notifications/unread-count` | `{ data: { count } }`. |
| `GET` | `/notifications/:id` | Detalle (404 si no es tuyo). |
| `PATCH` | `/notifications/:id/read` | Marca una como leída (`isRead`, `readAt`). |
| `PATCH` | `/notifications/read-all` | Marca todas como leídas. |
| `POST`/`GET` | `/chat/rooms`, `/chat/rooms/:id/messages` | Crear sala y consultar historial paginado. |

**Eventos WS:** `connection:ready`, `chat:send` (ACK), `chat:message`, `resource:changed`, `notification:new`, `job:updated`, `events:replay`, `ws:error`.

**Especificación**

1. Conecta dos usuarios (propietario y miembro de un equipo), crea una sala con `POST /chat/rooms` y envía `chat:send`; ambos deben recibir `chat:message` con `sequence` consecutivo.
2. Intenta usar una sala del espacio personal de otro usuario: debes recibir `ws:error` con `SPACE_ACCESS_DENIED`.
3. Crea un producto con `x-space-id` del equipo y comprueba `resource:changed` con `{ type: "PRODUCT", action: "created", resourceType: "PRODUCT", resourceId }`.
4. Paga un pedido con `outcome: APPROVED` y verifica `notification:new` (`ORDER_APPROVED`) y que el contador de no leídas sube.
5. Guarda el último `id` de evento recibido, desconecta, reconecta y envía `events:replay` con `{ lastEventId, spaceId, limit: 100 }`; debes recuperar solo los eventos posteriores.

**Criterios de aceptación**

- [ ] Sin JWT válido hay `ws:error AUTH_TOKEN_INVALID` y desconexión.
- [ ] Las salas se autorizan por espacio/membresía; el espacio personal solo lo usa su propietario.
- [ ] Los eventos incluyen `id`, `spaceId`, `type`, `action`, `resourceType`, `resourceId`, `createdAt`.
- [ ] Tras reconectar, `events:replay` devuelve los eventos perdidos en orden y `lastEventId` avanza.
- [ ] Leer una notificación baja el contador de no leídas exactamente en uno.

**Errores comunes:** enviar el refresh token en `auth.token`; esperar eventos en `/api/v1/ws` (el path es `/socket.io`); no registrar el listener antes de emitir; olvidar `x-space-id` en equipos.

**Extensión opcional:** reducer del cliente que aplique eventos idempotentemente usando `id`/`sequence`.

---

[← Anterior](../level-5/c5-2-pagos-simulados-y-cancelacion-con-reposicion.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c6-2-exportaciones-asincronas.md)
