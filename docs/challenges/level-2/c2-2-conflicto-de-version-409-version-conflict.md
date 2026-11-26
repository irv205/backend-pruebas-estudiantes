# C2.2 — Conflicto de versión: 409 `VERSION_CONFLICT`

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 2:**
>
> El sandbox se crea sin login y se identifica con `x-space-id`. Recuerda: **ese header separa datos, pero no autentica a nadie**.

---


**Objetivo de aprendizaje:** aplicar control de concurrencia optimista en ediciones.

**Endpoints exactos**

- `PATCH {{baseUrl}}/public/products/:id` con `{ "version": 999, ... }`
- `PATCH {{baseUrl}}/public/products/:id` con la versión real

**Pasos**

1. Crea un producto en tu sandbox y anota su `version`.
2. Envía un `PATCH` con `version: 999` y observa el `409`.
3. Envía el mismo cambio con la versión correcta y observa el `200` y el nuevo valor de `version`.
4. Repite el paso 2 con la versión ya desactualizada: debe volver a fallar.
5. En Postman usa `Public Products › Sandbox anónimo: editar producto (usa {{publicVersion}})` y el request «con versión obsoleta (409)».

```bash
curl -i -X PATCH -H "x-space-id: $SANDBOX" -H 'Content-Type: application/json' \
  -d '{"name":"Cambio que falla","version":999}' \
  {{baseUrl}}/public/products/<uuid>
```

**Criterios de aceptación**

- [ ] Con `version` obsoleta: `409` y `error.code = VERSION_CONFLICT`.
- [ ] El cuerpo incluye `requestId`.
- [ ] Con la versión correcta: `200` y `version` incrementada.
- [ ] Tu cliente recarga la versión antes de reintentar; no sobrescribe cambios ajenos a ciegas.

**Pista:** la versión cambia en **cada** actualización; guárdala junto al producto en tu estado local.

**Errores comunes:** omitir `version` (da `422`, no `409`); enviar la versión como string; reintentar indefinidamente con la misma versión; confundir `409` de versión con el `409` de nombre de categoría duplicado.

**Extensión opcional:** implementa un reintento que, ante `409`, vuelva a pedir el detalle, actualice la versión y reaplique el cambio una sola vez.

---

[← Anterior](./c2-1-crea-tu-sandbox-y-haz-crud-de-productos.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c2-3-limite-de-peticiones-429-y-retry-after.md)
