# C5.1 — Carrito, pedidos, stock e idempotencia

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 5:**
>
> Estos endpoints **ya existen** (Etapa 3, disponibles en `/docs`). Requieren `Authorization: Bearer <accessToken>`; sin `x-space-id` usan tu espacio personal. Un `LECTOR` solo consulta; `EDITOR` y `ADMINISTRADOR` pueden crear pedidos y pagar/cancelar.

---


**Objetivo de aprendizaje:** diseñar flujos de negocio con totales calculados en servidor, stock consistente y pedidos sin duplicados.

**Endpoints exactos (bajo `/api/v1`)**

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/cart` | Carrito del usuario en el espacio, con totales del servidor |
| `POST` | `/cart/items` | Añadir `{ "productId": "<uuid>", "quantity": 2 }` |
| `PATCH` | `/cart/items/:productId` | Cambiar cantidad con `{ "quantity": 1 }` |
| `DELETE` | `/cart/items/:productId` | Quitar una línea (`204`) |
| `DELETE` | `/cart` | Vaciar el carrito (`204`) |
| `POST` | `/orders` | Crear pedido; exige cabecera `Idempotency-Key` |
| `GET` | `/orders?page=1&limit=10&status=PAID` | Listado paginado (filtro opcional) |
| `GET` | `/orders/:id` | Detalle con `items` y `payments` |
| `POST` | `/orders/:id/cancel` | Cancelar y reponer stock |

**Pasos**

1. Crea productos con stock (Etapa 2) y añádelos con `POST /cart/items`. El mismo producto acumula cantidad; se validan visibilidad en el espacio, stock, `quantity >= 1` y una sola moneda por carrito.
2. Pide `GET /cart`: `data` trae `items` (con datos del producto), `currency`, `itemCount`, `subtotal` y `total`; `meta` repite los totales. **No** sumes `price * quantity` en el cliente para decidir el importe final.
3. Crea el pedido con una clave estable generada por tu cliente (se recomienda UUID) y guárdala aunque la petición falle por timeout.
4. Repite el mismo `POST /orders` con la **misma** clave: respuesta `201` con el mismo `id`, `status` e `items`; el stock no se descuenta dos veces.
5. Fuerza una cantidad mayor al stock (o modifica el carrito directamente) y comprueba `409 INSUFFICIENT_STOCK` sin stock negativo ni pedido creado.
6. Cancela el pedido y verifica la reposición exacta de stock.

```http
POST /api/v1/orders
Authorization: Bearer <accessToken>
Content-Type: application/json
Idempotency-Key: 7c1f0e2a-9b44-4c1e-8f3a-2d5e6a7b8c90

{}
```

> El cuerpo es `{}`: el pedido se construye **desde el carrito del servidor**. No envíes `cartId`, `total` ni precios. Sin la cabecera: `422 VALIDATION_ERROR`; con carrito vacío: `409 EMPTY_CART`.

**Criterios de aceptación**

- [ ] `GET /cart` devuelve `{ data, meta }` con totales enteros en unidad mínima (p. ej. `2250` = 22.50 MXN).
- [ ] Cada `order.items[].unitPrice` y `name` son un snapshot del momento de la compra: cambiar el precio del producto después no altera el pedido.
- [ ] La misma `Idempotency-Key` devuelve el mismo `orderId` y estado, sin duplicar pedido ni descuento de stock.
- [ ] El stock se descuenta en una transacción y nunca queda negativo (`409 INSUFFICIENT_STOCK`).
- [ ] Un usuario distinto no ve tu pedido (`404 ORDER_NOT_FOUND`); un administrador del espacio sí puede ver los del equipo.
- [ ] Errores con `error.code` estable y `requestId`.

**Pista:** guarda la `Idempotency-Key` en tu cliente junto al intento; regenerarla en cada reintento rompe la idempotencia. Concuerda con la clave que envías al pagar.

**Errores comunes:** calcular totales en el cliente; reutilizar una clave para pedidos distintos; no persistir la clave ante un timeout; enviar `total` en el body; mezclar monedas en el carrito.

**Extensión opcional:** diseña la pantalla de confirmación con estados `PENDING_PAYMENT → PAID/FAILED → CANCELLED` y una cola local de reintentos.

---

[← Anterior](../level-4/c4-5-simulador-de-errores-timeouts-503-y-conflictos.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c5-2-pagos-simulados-y-cancelacion-con-reposicion.md)
