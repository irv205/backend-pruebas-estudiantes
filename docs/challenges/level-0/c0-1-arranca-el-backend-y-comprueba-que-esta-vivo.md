# C0.1 — Arranca el backend y comprueba que está vivo

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---


**Objetivo de aprendizaje:** distinguir los endpoints de operación (health) de los de negocio (`/api/v1`) y verificar que el arranque terminó antes de consumir la API.

**Endpoints exactos**

- `GET {{hostUrl}}/health/live`
- `GET {{hostUrl}}/health/ready`
- `GET {{baseUrl}}/public/products?page=1&limit=20`
- Swagger: `{{hostUrl}}/docs`

**Pasos**

1. Comprueba que `.env` existe y que `APP_HOST_PORT=3100`.
2. Ejecuta `./start.sh` (o `npm run project:start`) y espera a que imprima las URLs reales (incluye la espera de migraciones y health).
3. Comprueba liveness y readiness:
   ```bash
   curl -i {{hostUrl}}/health/live
   curl -i {{hostUrl}}/health/ready
   ```
4. Pide la demo pública:
   ```bash
   curl '{{baseUrl}}/public/products?page=1&limit=20'
   ```
5. Abre `{{hostUrl}}/docs` y localiza los mismos endpoints.

**Criterios de aceptación**

- [ ] `/health/live` y `/health/ready` responden `200` **sin** el prefijo `/api/v1`.
- [ ] El listado de demo responde `200` con `data` y `meta` (no un array suelto).
- [ ] Swagger carga y muestra `public/products`, `auth`, `users`, `spaces`, `categories`, `products`, `notes`, `tasks`, `files`.
- [ ] No detuviste contenedores de otros proyectos.

**Pista:** readiness puede responder `503` mientras las migraciones corren; espera y repite.

**Errores comunes:** usar `localhost:3000` aunque el entorno publique `3100`; buscar `/api/v1/health/live`; lanzar peticiones antes de que `start.sh` termine; ejecutar `docker compose down -v` y perder los volúmenes.

**Extensión opcional:** guarda la salida de los dos health checks en `evidencia/health.txt` con `curl -sS ... | tee`.

---

[Índice](../../coding-challenges.md) · [Siguiente →](./c0-2-importa-postman-y-ejecuta-tu-primer-flujo-autenticado.md)
