# C5.2 — Pagos simulados y cancelación con reposición

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 5:**
>
> Estos endpoints **ya existen** (Etapa 3, disponibles en `/docs`). Requieren `Authorization: Bearer <accessToken>`; sin `x-space-id` usan tu espacio personal. Un `LECTOR` solo consulta; `EDITOR` y `ADMINISTRADOR` pueden crear pedidos y pagar/cancelar.

---


**Objetivo de aprendizaje:** modelar resultados de pago sin cobros reales y reconciliar pedidos.

**Endpoints exactos**

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/orders/:id/pay` | Simular pago con `{ "outcome": "APPROVED" \| "REJECTED" \| "PENDING" }` |
| `GET` | `/orders/:id` | Detalle con `payments[]` (`id`, `outcome`, `attempt`, `message`, `createdAt`) |
| `GET` | `/orders?status=FAILED` | Conciliar pedidos por estado |
| `POST` | `/orders/:id/cancel` | Cancelar pedido (del C5.1) |

No existen `/payments` ni `/payments/:id`: los intentos se consultan dentro del pedido.

**Transiciones válidas**

| Desde | Acción | Hasta | Stock |
|---|---|---|---|
| `PENDING_PAYMENT` | `APPROVED` | `PAID` | Sin cambios (ya descontado) |
| `PENDING_PAYMENT` | `REJECTED` | `FAILED` | Repuesto una sola vez |
| `PENDING_PAYMENT` | `PENDING` | `PENDING_PAYMENT` | Sin cambios; se registra el intento |
| `PENDING_PAYMENT` o `PAID` | `cancel` | `CANCELLED` | Repuesto una sola vez |

Cualquier otra transición responde `409 INVALID_STATUS_TRANSITION` (p. ej., pagar un pedido ya pagado, cancelar uno fallido o cancelar dos veces). Cancelar o rechazar **nunca** repone stock dos veces: campo `stockRestored` del pedido.

**Pasos**

1. Crea un pedido (C5.1) y simula un pago `APPROVED`: `200` con `status: PAID`.
2. Repite con otro pedido y `REJECTED`: `status: FAILED`, `payments[0].outcome = REJECTED` y stock repuesto.
3. Simula `PENDING` en un pedido nuevo: sigue `PENDING_PAYMENT` y puedes volver a pagar (nuevo `attempt`).
4. Cancela un pedido pagado y verifica la reposición de stock; repite la cancelación para ver el `409`.
5. Nunca introduzcas datos de tarjeta reales: es una simulación.

**Criterios de aceptación**

- [ ] `APPROVED`, `REJECTED` y `PENDING` producen estados verificables con intentos consecutivos.
- [ ] Un pago rechazado repone el stock exactamente una vez; un aprobado no lo modifica.
- [ ] Ningún cobro real: el servicio documenta que es simulado.
- [ ] Los errores siguen el contrato `{ error, requestId }`.

**Pista:** activa el escenario del simulador `duplicateOrder` (`PATCH /spaces/me/scenarios` con `{ "duplicateOrder": true }`) para forzar una clave repetida en `POST /orders` y practicar idempotencia sin gestionar claves a mano. Desactívalo al terminar.

**Errores comunes:** enviar tarjetas reales; confundir `PENDING` con `APPROVED`; cancelar dos veces y esperar doble reposición; usar `DECLINED` (el valor correcto es `REJECTED`).

**Extensión opcional:** implementa un webhook simulado en tu cliente con verificación de firma.

---

[← Anterior](./c5-1-carrito-pedidos-stock-e-idempotencia.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../level-6/c6-1-websockets-chat-y-notificaciones.md)
