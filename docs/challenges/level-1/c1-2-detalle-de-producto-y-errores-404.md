# C1.2 — Detalle de producto y errores 404

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 1:**
>
> Aquí no hay login: solo lectura de la demo pública. Todo lo que escribas en la demo sin `x-space-id` debe fallar con `403 DEMO_READ_ONLY`.

---


**Objetivo de aprendizaje:** usar un UUID real desde el listado y entender la envoltura `{ data }` y el contrato de error.

**Endpoints exactos**

- `GET {{baseUrl}}/public/products/:id`
- `GET {{baseUrl}}/public/products/00000000-0000-0000-0000-000000000000` (UUID inexistente)

**Pasos**

1. Copia un `id` del listado anterior (o usa `{{productId}}` si ya lo autopoblaste).
2. Pide el detalle:
   ```bash
   curl -i {{baseUrl}}/public/products/<uuid>
   ```
3. Repite con un UUID inexistente y con un texto que no sea UUID.
4. Compara los códigos de estado y los cuerpos de error; anota el `requestId`.

**Criterios de aceptación**

- [ ] El detalle existente responde `200` con `{ "data": { "id", "name", "price", "stock", ... } }`.
- [ ] El UUID inexistente responde `404` con `{ error: { code, message }, requestId }`.
- [ ] Un ID no-UUID responde `422` (validación) y no `500`.
- [ ] Tu cliente muestra un mensaje de error al usuario en lugar de romperse.

**Pista:** el `requestId` sirve para reportar un fallo; guárdalo en tus logs.

**Errores comunes:** usar el `name` en lugar del `id`; esperar un array en el detalle; ignorar `requestId`; confundir `404` (no visible) con `403` (sin permiso).

**Extensión opcional:** escribe una función `getProduct(id)` en TypeScript que tipifique `data` y lance un error con `error.code` y `requestId`.

---

[← Anterior](./c1-1-listar-el-catalogo-publico.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c1-3-paginacion-busqueda-filtros-y-orden.md)
