# C3.5 — Notas privadas: CRUD, filtros y propiedad

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

> **Contexto del nivel 3:**
>
> A partir de aquí usas `Authorization: Bearer <accessToken>`. Sin `x-space-id` trabajas en tu espacio personal.

---


**Objetivo de aprendizaje:** trabajar con recursos de propiedad exclusiva y comprobar que conocer un ID no autoriza a leerlo.

**Endpoints exactos**

- `POST {{baseUrl}}/notes`
- `GET {{baseUrl}}/notes?page=1&limit=10&search=&tags=&isFavorite=&isArchived=&sort=&order=`
- `GET {{baseUrl}}/notes/:id`
- `PATCH {{baseUrl}}/notes/:id` (requiere `version`)
- `DELETE {{baseUrl}}/notes/:id`

Campos: `title`, `content`, `tags` (hasta 10, máx. 30 caracteres cada una), `color` (`#RRGGBB`), `isFavorite`, `isArchived`, `version`. Orden válido: `createdAt`, `updatedAt`, `title`. Los filtros booleanos aceptan `true/false` o `1/0`; `tags` es una lista separada por comas.

**Pasos**

1. Crea dos notas, una favorita y una archivada:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"title":"Repaso","content":"JWT y refresh","tags":["api","repaso"],"color":"#3B82F6","isFavorite":true}' \
     {{baseUrl}}/notes
   ```
2. Lista con `search=JWT`, con `tags=api` y con `isFavorite=true`.
3. Edita una nota con su `version`; repite con una versión obsoleta para ver el `409`.
4. Archiva/restaura con `isArchived` y filtra por `isArchived=true`.
5. Con el token del **segundo usuario** de C3.1, pide `GET /notes/:id` de una nota del primero: debe responder `404`.

**Criterios de aceptación**

- [ ] Creación `201` con `id` y `version`.
- [ ] Los filtros devuelven solo las notas que cumplen; listados con `{ data, meta }`.
- [ ] `PATCH` con versión obsoleta: `409 VERSION_CONFLICT`.
- [ ] Un usuario distinto **no puede** consultar ni editar la nota: `404`, aunque conozca el UUID.
- [ ] `DELETE` responde `204` sin cuerpo.

**Pista:** `404` (no visible para el solicitante) es intencional: no reveles la existencia de recursos ajenos.

**Errores comunes:** interpretar el `404` como «falló la red»; compartir notas por UUID; olvidar `version` en el `PATCH`; enviar `tags` como array en la query en lugar de cadena separada por comas.

**Extensión opcional:** implementa búsqueda instantánea en tu cliente con debounce y muestra favoritos/archivados en pestañas separadas.

---

[← Anterior](./c3-4-perfil-y-avatar.md) · [Índice](../../coding-challenges.md) · [Siguiente →](../level-4/c4-1-categorias-y-su-relacion-con-productos.md)
