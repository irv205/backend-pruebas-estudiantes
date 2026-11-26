# C6.2 — Exportaciones asíncronas

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 6:**
>
> **Disponible desde la Etapa 4.** Requiere `docker compose up -d --build` para que arranquen `redis` y `worker`. En CI/e2e se usa `JOBS_QUEUE_MODE=inline` y no se necesita Redis.

---


**Objetivo de aprendizaje:** lanzar trabajos, consultar progreso con polling y descargar un CSV autorizado.

**Endpoints reales**

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/jobs/exports` | `{ "kind": "PRODUCTS_CSV" \| "NOTES_CSV", "filters": { "search": "...", "categoryId": "<uuid>", "isArchived": true } }` → `201` con `data.id`. |
| `GET` | `/jobs/exports?status=COMPLETED&page=1&limit=20` | Listado paginado del espacio. |
| `GET` | `/jobs/exports/:id` | `status`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`; `progress`, `error`, `finishedAt`. |
| `GET` | `/jobs/exports/:id/download` | CSV (`attachment`) solo si `COMPLETED`; si no → `409 EXPORT_NOT_READY`. |

Con `JOBS_QUEUE_MODE=redis` la creación responde `PENDING` y el worker la lleva a terminal; con `inline` responde directamente `COMPLETED`. PostgreSQL guarda el estado en ambos modos, y el worker recupera trabajos huérfanos al arrancar.

**Especificación**

1. Crea notas/productos, solicita `POST /jobs/exports` y guarda `data.id`.
2. Haz polling de `GET /jobs/exports/:id` con intervalo creciente y tope de intentos hasta `COMPLETED` o `FAILED`.
3. Activa `PATCH /spaces/me/scenarios` con `{ "failedAsyncJob": true }`, lanza otro export y comprueba `FAILED` con `error` que menciona `failedAsyncJob` y una notificación `JOB_FAILED`. Desactívalo después.
4. Descarga el CSV terminado con la cabecera Bearer; comprueba que otro usuario recibe `404` y que el archivo no es público.

**Criterios de aceptación**

- [ ] El estado evoluciona hasta terminal y `progress` llega a 100 en `COMPLETED`.
- [ ] `job:updated` se emite al propietario en cada cambio relevante.
- [ ] La descarga exige autorización y solo funciona si `COMPLETED`.
- [ ] `failedAsyncJob` produce fallos reproducibles sin afectar a otros espacios.

**Errores comunes:** hacer polling sin límite; compartir la URL de descarga; tratar `PROCESSING` como error; activar el escenario en el espacio equivocado.

**Extensión opcional:** patrón de polling en JavaScript:

```js
async function waitForExport(id, token, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`{{baseUrl}}/jobs/exports/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (data.status === 'COMPLETED') return data;
    if (data.status === 'FAILED') throw new Error(data.error ?? 'Exportación fallida');
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** i, 10000)));
  }
  throw new Error('Tiempo de espera agotado');
}
```

---

[← Anterior](./c6-1-websockets-chat-y-notificaciones.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../proyecto-final/proyecto-final.md)
