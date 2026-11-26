# C2.4 — Aislamiento entre sandboxes y reset

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 2:**
>
> El sandbox se crea sin login y se identifica con `x-space-id`. Recuerda: **ese header separa datos, pero no autentica a nadie**.

---


**Objetivo de aprendizaje:** demostrar que dos espacios anónimos no comparten datos y que un reset afecta solo al espacio pedido.

**Endpoints exactos**

- `POST {{baseUrl}}/public/sandboxes` (dos veces)
- `POST {{baseUrl}}/public/products` con cada `x-space-id`
- `GET {{baseUrl}}/public/products` con cada `x-space-id`
- `POST {{baseUrl}}/public/sandboxes/:spaceId/reset`
- `POST {{baseUrl}}/public/sandboxes/demo-publico/reset` (restaurar demo)

**Pasos**

1. Crea dos sandboxes A y B; guarda ambos UUID.
2. Crea un producto solo en A.
3. Lista productos con `x-space-id: A` y con `x-space-id: B`.
4. Reinicia A con `POST /public/sandboxes/A/reset`.
5. Lista A (vacío) y B (sin cambios).
6. Restaura la demo con `POST /public/sandboxes/demo-publico/reset` si la modificaste.

```bash
A=$(curl -s -X POST {{baseUrl}}/public/sandboxes | jq -r .data.spaceId)
B=$(curl -s -X POST {{baseUrl}}/public/sandboxes | jq -r .data.spaceId)

curl -H "x-space-id: $A" -H 'Content-Type: application/json' \
  -d '{"name":"Solo en A","price":1000,"stock":1}' \
  {{baseUrl}}/public/products

curl -H "x-space-id: $A" {{baseUrl}}/public/products
curl -H "x-space-id: $B" {{baseUrl}}/public/products

curl -X POST {{baseUrl}}/public/sandboxes/$A/reset
```

**Criterios de aceptación**

- [ ] El producto aparece con A y **no** aparece con B.
- [ ] Tras el reset de A, `meta.total = 0` en A y B conserva sus datos (o sigue vacío).
- [ ] El reset no afectó a la demo ni al espacio personal de otros estudiantes.
- [ ] Puedes explicar con tus propias palabras por qué `x-space-id` no es autenticación.

**Pista:** imprime los dos UUID en tu log y compruébalos en cada `curl`; el error más común es mezclarlos.

**Errores comunes:** usar el mismo header en ambas peticiones; creer que el reset borra volúmenes o la base completa; usar el slug `demo-publico` como si fuera tu sandbox.

**Extensión opcional:** automatiza la comprobación en un script que falle si B ve el producto de A.

---

[← Anterior](./c2-3-limite-de-peticiones-429-y-retry-after.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../level-3/c3-1-registrar-una-cuenta-nueva.md)
