# Proyecto final sugerido

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 6:**
>
> **Solo anfitrión/profesor:** disponible desde la Etapa 4; el anfitrión asegura que `redis` y `worker` estén arrancados (`docker compose up -d --build`). En CI/e2e se usa `JOBS_QUEUE_MODE=inline` y no se necesita Redis. **Tú, como estudiante, no instalas ni arrancas nada:** solo conectas con `{{wsBaseUrl}}` y usas los endpoints.

---


Construye una aplicación web, Android, iOS o de escritorio que combine **los niveles 1 a 6** (todo lo que existe hoy). Mínimo imprescindible:

1. Catálogo público con listado paginado, búsqueda, orden y estado vacío.
2. CRUD de productos en un sandbox anónimo con `x-space-id`, control de `version` y manejo de `429`.
3. Registro/login, renovación de sesión y perfil editable con avatar.
4. Notas privadas con filtros, favoritos y conflictos de edición.
5. Categorías, tareas con subtareas y transiciones, y archivos multipart.
6. Un espacio de equipo con al menos dos roles demostrados.
7. Carrito con totales del servidor, pedido idempotente y pago simulado con reposición de stock.
8. Bandeja de notificaciones y contador de no leídas, eventos en tiempo real por `/socket.io` (chat y replay con `lastEventId`) y al menos una exportación CSV descargada tras hacer polling de su estado.
9. Manejo visible de errores con `error.code` y `requestId`, y limpieza de escenarios del simulador.

**Entrega:** código cliente, capturas de los flujos, un `README` con instrucciones de arranque y el registro de evidencias descrito en la sección 7. No incluyas tokens ni contraseñas en capturas.

---

[← Anterior](../level-6/c6-2-exportaciones-asincronas.md) · [Índice](../../coding-challenges.md)
