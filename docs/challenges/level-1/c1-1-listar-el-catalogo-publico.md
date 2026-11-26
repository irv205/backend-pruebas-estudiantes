# C1.1 — Listar el catálogo público

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 1:**
>
> Aquí no hay login: solo lectura de la demo pública. Todo lo que escribas en la demo sin `x-space-id` debe fallar con `403 DEMO_READ_ONLY`.

---


**Objetivo de aprendizaje:** interpretar la forma estándar de un listado paginado y reconocer importes en unidad mínima.

**Endpoints exactos**

- `GET {{baseUrl}}/public/products?page=1&limit=10`
- `GET {{baseUrl}}/public/categories?page=1&limit=10`

**Pasos**

1. Pide el listado con `curl` o con `Public Products › Demo pública: listar productos (sin x-space-id)`.
2. Identifica `data`, `meta.page`, `meta.limit`, `meta.total` y `meta.totalPages`.
3. Comprueba que `price` es un entero y que viene acompañado de `currency`.
4. Pide también `GET /public/categories`; en la demo solo aparecen categorías **activas**.

```bash
curl '{{baseUrl}}/public/products?page=1&limit=10'
curl '{{baseUrl}}/public/categories?page=1&limit=10'
```

**Criterios de aceptación**

- [ ] Respuesta `200` con `{ data, meta }`.
- [ ] `data.length <= limit` y `meta.totalPages >= 1`.
- [ ] Ningún `price` tiene decimales ni coma: es un entero en unidad mínima.
- [ ] Tu cliente muestra nombre, precio formateado (p. ej. `49900` → `499.00 MXN`) y moneda.

**Pista:** `meta.total` es el total de registros, no el tamaño de la página actual.

**Errores comunes:** dividir el precio entre 100 en el servidor (no debes modificarlo); asumir que `data` es un array directo; pensar que puedes crear productos en la demo.

**Extensión opcional:** muestra el catálogo como tabla en consola con `fetch` y formatea la moneda con `Intl.NumberFormat`.

---

[← Anterior](../level-0/c0-2-importa-postman-y-ejecuta-tu-primer-flujo-autenticado.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c1-2-detalle-de-producto-y-errores-404.md)
