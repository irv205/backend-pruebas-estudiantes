# C2.1 — Crea tu sandbox y haz CRUD de productos

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 2:**
>
> El sandbox se crea sin login y se identifica con `x-space-id`. Recuerda: **ese header separa datos, pero no autentica a nadie**.

---


**Objetivo de aprendizaje:** crear, leer, actualizar y borrar recursos aislados sin cuenta de usuario.

**Endpoints exactos**

- `POST {{baseUrl}}/public/sandboxes`
- `POST {{baseUrl}}/public/products` (header `x-space-id`)
- `GET {{baseUrl}}/public/products?page=1&limit=10` (header `x-space-id`)
- `GET {{baseUrl}}/public/products/:id` (header `x-space-id`)
- `PATCH {{baseUrl}}/public/products/:id` (header `x-space-id`)
- `DELETE {{baseUrl}}/public/products/:id` (header `x-space-id`)

**Pasos**

1. Crea el sandbox y guarda `data.spaceId`:
   ```bash
   SANDBOX=$(curl -s -X POST {{baseUrl}}/public/sandboxes | jq -r .data.spaceId)
   echo "$SANDBOX"
   ```
2. Crea un producto (precio en centavos, moneda de 3 letras):
   ```bash
   curl -i -H "x-space-id: $SANDBOX" -H 'Content-Type: application/json' \
     -d '{"name":"Teclado","description":"Mecánico","price":49900,"currency":"MXN","stock":10}' \
     {{baseUrl}}/public/products
   ```
3. Lista y detalla el producto con el mismo header; guarda su `id` y `version`.
4. Actualiza el nombre:
   ```bash
   curl -X PATCH -H "x-space-id: $SANDBOX" -H 'Content-Type: application/json' \
     -d '{"name":"Teclado mecánico","version":1}' \
     {{baseUrl}}/public/products/<uuid>
   ```
5. Borra el producto y comprueba que el borrado no trae cuerpo:
   ```bash
   curl -i -X DELETE -H "x-space-id: $SANDBOX" \
     {{baseUrl}}/public/products/<uuid>
   ```

**Criterios de aceptación**

- [ ] `POST /public/sandboxes` responde `201` con un UUID en `data.spaceId`.
- [ ] `POST /public/products` responde `201` con `data.id` y `data.version` (empieza en 1).
- [ ] `GET` listado y detalle devuelven el producto creado.
- [ ] `PATCH` con la versión correcta responde `200` y aumenta `version`.
- [ ] `DELETE` responde `204` **sin cuerpo**; el detalle posterior responde `404`.
- [ ] Un `POST` a la demo pública sin `x-space-id` responde `403 DEMO_READ_ONLY`.

**Pista:** en Postman usa los requests marcados «Sandbox anónimo» de la carpeta *Public Products*; la variable `anonymousSpaceId` se autopuebla al crear el sandbox.

**Errores comunes:** reutilizar el `spaceId` del environment sin crear uno; olvidar el header en el `PATCH`/`DELETE`; enviar `"price": 499.00` en vez de `49900`; esperar JSON en una respuesta `204`.

**Extensión opcional:** escribe un helper en JavaScript que centralice el header:

```js
const BASE = '{{baseUrl}}';
const sandboxId = process.env.SANDBOX_ID;

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'x-space-id': sandboxId, 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${body.error.code}: ${body.error.message}`);
  return body.data;
}
```

---

[← Anterior](../level-1/c1-4-estado-vacio-controlado-con-el-simulador.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c2-2-conflicto-de-version-409-version-conflict.md)
