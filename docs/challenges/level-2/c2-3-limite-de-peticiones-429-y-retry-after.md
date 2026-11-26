# C2.3 — Límite de peticiones: 429 y `Retry-After`

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 2:**
>
> El sandbox se crea sin login y se identifica con `x-space-id`. Recuerda: **ese header separa datos, pero no autentica a nadie**.

---


**Objetivo de aprendizaje:** respetar límites de tasa y esperar el tiempo indicado por el servidor antes de reintentar.

**Endpoints exactos**

- `PATCH {{baseUrl}}/spaces/me/scenarios` con `{ "rateLimit": true }`
- `GET {{baseUrl}}/products?page=1&limit=10` (para observar el `429`)
- `PATCH {{baseUrl}}/spaces/me/scenarios` con `{ "rateLimit": false }`

> El sandbox anónimo tiene cuotas propias, pero para practicar el `429` **determinista con `Retry-After`** usa el simulador en tu espacio personal autenticado. Los escenarios se configuran por espacio y solo los puede cambiar el propietario o un `ADMINISTRADOR`.

**Pasos**

1. Activa `rateLimit` en tu espacio personal con el token.
2. Pide `GET /products` con `-i` para ver las cabeceras:
   ```bash
   curl -i -H "Authorization: Bearer $TOKEN" \
     {{baseUrl}}/products?page=1&limit=10
   ```
3. Lee `HTTP/1.1 429`, `error.code = RATE_LIMITED` y la cabecera `Retry-After: 5`.
4. Espera el número de segundos indicado y repite: debe volver a `200`.
5. Desactiva el escenario.

**Criterios de aceptación**

- [ ] La respuesta es `429` con `error.code = RATE_LIMITED` y `requestId`.
- [ ] La cabecera `Retry-After` está presente y tu cliente la lee.
- [ ] El reintento ocurre **después** de esperar, no inmediatamente.
- [ ] El escenario queda desactivado al terminar.

**Pista:** `curl -i` muestra las cabeceras; en Postman mira la pestaña *Headers* de la respuesta.

**Errores comunes:** reintentar en bucle sin esperar (empeora el límite); ignorar `Retry-After` y usar un valor fijo; olvidar desactivar el escenario y creer que la API está caída.

**Extensión opcional:** reintento con backoff leyendo la cabecera:

```js
async function getWithRetry(path, token, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`{{baseUrl}}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) {
      const seconds = Number(res.headers.get('Retry-After') ?? '1');
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    return res;
  }
  throw new Error('Demasiados reintentos');
}
```

---

[← Anterior](./c2-2-conflicto-de-version-409-version-conflict.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c2-4-aislamiento-entre-sandboxes-y-reset.md)
