# C4.1 — Categorías y su relación con productos

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---


**Objetivo de aprendizaje:** gestionar catálogos jerárquicos y usar el ID de categoría como filtro.

**Endpoints exactos**

- `GET/POST {{baseUrl}}/categories`
- `GET {{baseUrl}}/categories/:id`
- `GET {{baseUrl}}/categories/:id/products?page=1&limit=10`
- `PATCH/DELETE {{baseUrl}}/categories/:id`
- Públicos: `GET {{baseUrl}}/public/categories`, `GET {{baseUrl}}/public/categories/:id`, `GET {{baseUrl}}/public/categories/:id/products`

Orden válido para categorías: `name`, `createdAt`, `updatedAt`; filtros `search`, `isActive`, `sort`, `order`.

**Pasos**

1. Crea una categoría con token:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"name":"Tecnología","isActive":true}' \
     {{baseUrl}}/categories
   ```
2. Crea un producto autenticado con `categoryId: <uuid>` y luego pide `GET /categories/:id/products`.
3. Cambia el nombre con `PATCH` y `version`; repite con versión obsoleta para ver el `409`.
4. Crea una categoría con el mismo nombre en el mismo espacio: `409 CATEGORY_NAME_CONFLICT`.
5. Compara `GET /categories` (todas) con `GET /public/categories` (solo activas de la demo).

**Criterios de aceptación**

- [ ] `POST /categories` responde `201` con `id` y `version`.
- [ ] `GET /categories/:id/products` devuelve `{ data, meta }` con los productos de esa categoría.
- [ ] Nombre duplicado en el mismo espacio: `409 CATEGORY_NAME_CONFLICT`.
- [ ] `PATCH` sin versión coincidente: `409 VERSION_CONFLICT`.
- [ ] La demo pública solo lista categorías activas y es de solo lectura.

**Pista:** `categoryId` debe ser un UUID; en Postman la variable `categoryId` se autopuebla al crear la categoría.

**Errores comunes:** usar el `slug` de la demo como `categoryId`; crear dos categorías con el mismo nombre esperando `422`; pensar que `/public/categories` muestra tus categorías privadas.

**Extensión opcional:** muestra un filtro por categoría en tu catálogo usando `?categoryId=<uuid>` en `GET /products`.

---

[← Anterior](../level-3/c3-5-notas-privadas-crud-filtros-y-propiedad.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c4-2-tareas-subtareas-y-transiciones-de-estado.md)
