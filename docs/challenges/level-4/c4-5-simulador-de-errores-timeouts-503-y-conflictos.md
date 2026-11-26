# C4.5 — Simulador de errores: timeouts, 503 y conflictos

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---


**Objetivo de aprendizaje:** hacer que tu cliente sea resistente a latencia, errores temporales y conflicts controlados.

**Endpoints exactos**

- `GET/PATCH {{baseUrl}}/spaces/me/scenarios`
- `GET/PATCH {{baseUrl}}/spaces/:spaceId/scenarios` (solo `ADMINISTRADOR`)
- `GET {{baseUrl}}/products?page=1&limit=10` (endpoint «víctima» de los escenarios)

**Pasos**

1. Consulta la configuración actual con `GET /spaces/me/scenarios`.
2. Activa un escenario a la vez y observa la respuesta; por ejemplo:
   ```bash
   curl -X PATCH -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"temporary503":true}' {{baseUrl}}/spaces/me/scenarios

   curl -i -H "Authorization: Bearer $ACCESS" \
     {{baseUrl}}/products?page=1&limit=10
   ```
3. Repite con `slowResponse`, `timeout`, `concurrentEdit` y `rateLimit` (ver tabla completa abajo).
4. Implementa en tu cliente: spinner con `slowResponse`, timeout con `timeout`, backoff con `temporary503` y `429`, y recarga de versión con `concurrentEdit`.
5. **Ejecuta siempre `Simulator › Desactivar todos los escenarios (limpieza)`** al terminar.

**Criterios de aceptación**

- [ ] `temporary503` produce `503 SIMULATED_503` y tu cliente reintenta con backoff.
- [ ] `timeout` hace que tu cliente aborte y muestre un mensaje, sin colgarse.
- [ ] `concurrentEdit` produce `409 VERSION_CONFLICT` en `PATCH`/`PUT`.
- [ ] `rateLimit` produce `429` y se respeta `Retry-After`.
- [ ] La configuración queda limpia; los escenarios no afectan a otros espacios.

**Pista:** los endpoints `/scenarios` y `/reset` están excluidos del interceptor: puedes desactivar los fallos aunque estén activos.

**Errores comunes:** activar todos los escenarios a la vez y no saber cuál causa cada síntoma; olvidar la limpieza (la configuración persiste por espacio); probar escenarios de equipo sin ser administrador; reintentar un `503` sin espera.

**Extensión opcional:** centraliza tus reintentos en una sola función `safeFetch(path, {timeoutMs, maxRetries})` y reutilízala en todos los niveles.

---

[← Anterior](./c4-4-roles-de-equipo-lector-editor-administrador.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../level-5/c5-1-carrito-pedidos-stock-e-idempotencia.md)
