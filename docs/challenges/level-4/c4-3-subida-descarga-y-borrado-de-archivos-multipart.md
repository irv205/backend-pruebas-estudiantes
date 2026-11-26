# C4.3 — Subida, descarga y borrado de archivos (multipart)

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

---


**Objetivo de aprendizaje:** enviar archivos con `multipart/form-data`, validar tipos/tamaños y respetar cuotas.

**Endpoints exactos**

- `POST {{baseUrl}}/files` (campo `file`, `kind` opcional: `AVATAR|IMAGE|DOCUMENT|OTHER`)
- `GET {{baseUrl}}/files?page=1&limit=10`
- `GET {{baseUrl}}/files/:id`
- `GET {{baseUrl}}/files/:id/download`
- `DELETE {{baseUrl}}/files/:id`

Límites: 5 MiB por archivo (`FILE_MAX_SIZE_BYTES=5242880`), tipos permitidos: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`; cuota: 50 objetos / 100 MiB por espacio.

**Pasos**

1. Sube una imagen:
   ```bash
   curl -i -H "Authorization: Bearer $ACCESS" -F 'file=@./foto.png;type=image/png' \
     {{baseUrl}}/files
   ```
2. Lista metadatos, pide el detalle y descarga el archivo:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" {{baseUrl}}/files/<uuid>/download -o descarga.png
   ```
3. Sube un `.exe` renombrado o usa el request del simulador: observa `400 INVALID_FILE_TYPE`.
4. Sube un archivo mayor a 5 MiB: observa `400 FILE_TOO_LARGE`.
5. Borra el archivo (`204`) y comprueba que el detalle da `404`.

**Criterios de aceptación**

- [ ] Subida correcta: `201` con `id`, `size`, `mimeType`, `kind`.
- [ ] La descarga devuelve los bytes originales (comprueba el hash o el tamaño).
- [ ] Tipo inválido: `400 INVALID_FILE_TYPE`; tamaño excedido: `400 FILE_TOO_LARGE`.
- [ ] Al superar la cuota: `429 FILE_QUOTA_EXCEEDED`.
- [ ] Borrado: `204` sin cuerpo.

**Pista:** en Postman selecciona el archivo en *Body → form-data* con clave `file` y tipo *File*; no escribas el contenido a mano.

**Errores comunes:** fijar `Content-Type: multipart/form-data` a mano en `curl` (deja que `-F` lo haga); usar el campo `avatar` en `/files`; esconder un binario detrás de otra extensión; olvidar que los objetos se guardan por espacio (`spaces/<spaceId>/<kind>/...`).

**Extensión opcional:** subida con Retrofit:

```kotlin
interface FilesApi {
    @Multipart
    @POST("files")
    suspend fun upload(
        @Part file: MultipartBody.Part,
        @Part("kind") kind: RequestBody? = null,
    ): Response<FileDto>
}

val part = MultipartBody.Part.createFormData("file", file.name, file.asRequestBody("image/png".toMediaType()))
```

---

[← Anterior](./c4-2-tareas-subtareas-y-transiciones-de-estado.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c4-4-roles-de-equipo-lector-editor-administrador.md)
