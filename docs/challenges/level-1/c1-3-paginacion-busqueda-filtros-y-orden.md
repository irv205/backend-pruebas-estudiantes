# C1.3 — Paginación, búsqueda, filtros y orden

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 1:**
>
> Aquí no hay login: solo lectura de la demo pública. Todo lo que escribas en la demo sin `x-space-id` debe fallar con `403 DEMO_READ_ONLY`.

---


**Objetivo de aprendizaje:** dominar query params y validarlos desde el cliente.

**Endpoints exactos**

- `GET {{baseUrl}}/public/products?page=1&limit=5&sort=price&order=asc`
- `GET {{baseUrl}}/public/products?search=keyboard`
- `GET {{baseUrl}}/public/products?status=ACTIVE`
- `GET {{baseUrl}}/public/products?categoryId=<uuid>`

Campos de orden válidos para productos: `name`, `price`, `stock`, `createdAt`, `updatedAt`; `order` es `asc` o `desc`. `limit` va de 1 a 100. `search` busca en nombre y descripción.

**Pasos**

1. Pide `page=1&limit=5&sort=price&order=asc` y luego `page=2` con el mismo `limit`.
2. Compara que los ítems de la página 2 no se repitan y que los precios estén ordenados.
3. Prueba `search=keyboard` y `status=ACTIVE`.
4. Prueba `sort=precio` (inválido) y `limit=0` para ver la validación.

```bash
curl '{{baseUrl}}/public/products?page=1&limit=5&sort=price&order=asc'
curl '{{baseUrl}}/public/products?search=keyboard'
curl '{{baseUrl}}/public/products?sort=precio'
```

**Criterios de aceptación**

- [ ] La página 2 respeta `limit` y no repite IDs de la página 1.
- [ ] `sort=price&order=asc` ordena de menor a mayor; `desc` invierte el orden.
- [ ] `search` devuelve solo productos cuyo nombre o descripción coinciden.
- [ ] Parámetros inválidos responden `422` con `error.fields`.

**Pista:** en `curl`, encierra la URL entre comillas simples para que `&` no sea interpretado por el shell.

**Errores comunes:** enviar `order` sin `sort`; `limit=0` o `limit>100`; construir la URL sin escapar acentos/espacios; asumir que `search` diferencia mayúsculas sin comprobarlo.

**Extensión opcional:** declara el servicio en Kotlin/Retrofit y comprueba la paginación desde Android:

```kotlin
interface ProductsApi {
    @GET("public/products")
    suspend fun list(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        @Query("search") search: String? = null,
        @Query("sort") sort: String? = null,
        @Query("order") order: String? = null,
    ): Response<Paged<ProductDto>>
}

data class Paged<T>(val data: List<T>, val meta: Meta)
data class Meta(val page: Int, val limit: Int, val total: Int, val totalPages: Int)
```

---

[← Anterior](./c1-2-detalle-de-producto-y-errores-404.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c1-4-estado-vacio-controlado-con-el-simulador.md)
