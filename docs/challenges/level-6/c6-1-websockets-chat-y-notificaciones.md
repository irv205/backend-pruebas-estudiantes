# C6.1 — WebSockets, chat y notificaciones

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 6:**
>
> **Disponible desde la Etapa 4.** Requiere `docker compose up -d --build` para que arranquen `redis` y `worker`. En CI/e2e se usa `JOBS_QUEUE_MODE=inline` y no se necesita Redis.

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
