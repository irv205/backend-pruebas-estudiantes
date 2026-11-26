# C1.4 — Estado vacío controlado con el simulador

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 1:**
>
> Aquí no hay login: solo lectura de la demo pública. Todo lo que escribas en la demo sin `x-space-id` debe fallar con `403 DEMO_READ_ONLY`.

---


**Objetivo de aprendizaje:** diseñar la interfaz para listas vacías usando un escenario reproducible.

**Endpoints exactos**

- `PATCH {{baseUrl}}/spaces/me/scenarios` con `{ "emptyList": true }`
- `GET {{baseUrl}}/products?page=1&limit=10` (espacio personal autenticado)
- `PATCH {{baseUrl}}/spaces/me/scenarios` con `{ "emptyList": false }` (limpieza)

**Pasos**

1. Ejecuta `Auth › Login` para tener `accessToken`.
2. Activa el escenario en tu espacio personal (la configuración persiste por espacio):
   ```bash
   curl -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"emptyList":true}' {{baseUrl}}/spaces/me/scenarios
   ```
3. Pide `GET /products` con el token; comprueba `data: []` y `meta.total: 0`.
4. Muestra en tu cliente un mensaje tipo «Aún no hay productos».
5. **Desactiva siempre el escenario** con `{"emptyList":false}` (o el request `Simulator › Desactivar todos los escenarios (limpieza)`).

**Criterios de aceptación**

- [ ] Respuesta `200`, no `404`: una lista vacía no es un error.
- [ ] `data` es `[]` y `meta.total = 0`.
- [ ] La interfaz muestra un estado vacío y no una tabla rota.
- [ ] El escenario queda desactivado al terminar.

**Pista:** usa `GET /products` (con token) y no `/public/products`: el escenario se configura en tu espacio personal, no en la demo.

**Errores comunes:** olvidar la limpieza y pensar que «la API se rompió»; activar escenarios en un espacio de equipo sin ser administrador; tratar `total: 0` como fallo de red.

**Extensión opcional:** añade un botón «Recargar» y un esqueleto de carga; combina con `slowResponse` en el desafío C4.5.

---

[← Anterior](./c1-3-paginacion-busqueda-filtros-y-orden.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../level-2/c2-1-crea-tu-sandbox-y-haz-crud-de-productos.md)
