# C4.2 — Tareas, subtareas y transiciones de estado

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---


**Objetivo de aprendizaje:** modelar flujos de trabajo con estados válidos y validar reglas de negocio en el cliente.

**Endpoints exactos**

- `GET/POST {{baseUrl}}/tasks`
- `GET {{baseUrl}}/tasks/:id`
- `PATCH/DELETE {{baseUrl}}/tasks/:id`
- `POST {{baseUrl}}/tasks/:id/subtasks`
- `PATCH/DELETE {{baseUrl}}/tasks/:id/subtasks/:subtaskId`

Prioridades: `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Estados: `TODO`, `IN_PROGRESS`, `DONE`, `CANCELLED`. Filtros: `status` (separado por comas), `priority`, `dueBefore`, `dueAfter`, `search`, `mine`, `sort`, `order`.

**Transiciones válidas:** `TODO → IN_PROGRESS | CANCELLED`; `IN_PROGRESS → TODO | DONE | CANCELLED`; `DONE → IN_PROGRESS`; `CANCELLED → TODO`. Cualquier otra da `409 INVALID_STATUS_TRANSITION`.

**Pasos**

1. Crea una tarea con subtareas:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"title":"Preparar entorno","priority":"HIGH","dueAt":"2030-01-01T00:00:00Z",
          "subtasks":[{"title":"Node 20"},{"title":"Docker"}]}' \
     {{baseUrl}}/tasks
   ```
2. Lista con `?status=TODO,IN_PROGRESS&priority=HIGH&dueBefore=2031-01-01T00:00:00Z`.
3. Mueve la tarea `TODO → IN_PROGRESS → DONE` con `PATCH` y `version`.
4. Intenta `DONE → TODO`: debe responder `409 INVALID_STATUS_TRANSITION`.
5. Añade, marca y elimina una subtarea con los endpoints exactos.

**Criterios de aceptación**

- [ ] Creación `201` con subtareas incluidas en `data`.
- [ ] Los filtros por estado/prioridad/fecha devuelven el subconjunto correcto.
- [ ] Las transiciones válidas responden `200` e incrementan `version`.
- [ ] Una transición inválida responde `409` con `error.code = INVALID_STATUS_TRANSITION`.
- [ ] Las subtareas se pueden editar/borrar por su propio `subtaskId`.

**Pista:** en `PATCH`, `dueAt: null` quita la fecha límite; las fechas van en ISO 8601 UTC.

**Errores comunes:** saltar directamente `TODO → DONE`; usar `priority="ALTA"` en español; enviar `dueAt` sin zona horaria; actualizar una tarea con `version` viejo y culpar al filtro de estado.

**Extensión opcional:** dibuja un tablero Kanban y deshabilita en la UI los botones de transiciones no permitidas.

---

[← Anterior](./c4-1-categorias-y-su-relacion-con-productos.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c4-3-subida-descarga-y-borrado-de-archivos-multipart.md)
