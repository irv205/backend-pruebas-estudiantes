# C3.2 — Login y uso seguro del token de acceso

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.
> **Cuenta de práctica compartida:** el usuario sembrado `estudiante@practicas.local` es solo de demostración. Con una sola URL pública, todos los que lo usen comparten el mismo espacio personal: usa un sandbox propio o registra tu propia cuenta cuando el challenge lo permita, y **no cambies la contraseña sembrada**.

> **Contexto del nivel 3:**
>
> A partir de aquí usas `Authorization: Bearer <accessToken>`. Sin `x-space-id` trabajas en tu espacio personal.

---


**Objetivo de aprendizaje:** obtener tokens y enviarlos correctamente en cada petición protegida.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/login`
- `GET {{baseUrl}}/users/me`

**Pasos**

1. Haz login con tu usuario (o con el del seed):
   ```bash
   LOGIN=$(curl -s -H 'Content-Type: application/json' \
     -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
     {{baseUrl}}/auth/login)
   ACCESS=$(echo "$LOGIN" | jq -r .data.tokens.accessToken)
   ```
2. Pide `GET /users/me` con y sin el Bearer.
3. Comprueba que un token incorrecto da `401` y no `403`.
4. En Kotlin, configura un interceptor (nunca imprimas el token):

```kotlin
class AuthInterceptor(private val tokenProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider()
        val request = if (token.isNullOrBlank()) chain.request()
        else chain.request().newBuilder()
            .header("Authorization", "Bearer $token")
            .build()
        return chain.proceed(request)
    }
}
```

**Criterios de aceptación**

- [ ] Login `200` con `data.tokens.accessToken` y `data.tokens.refreshToken`.
- [ ] `GET /users/me` con token: `200` con `{ data }`.
- [ ] Sin token o con token inválido: `401`.
- [ ] El token nunca aparece en consola, capturas ni archivos entregados.

**Pista:** `401` = «no sé quién eres»; `403` = «sé quién eres pero no puedes».

**Errores comunes:** enviar `Authorization: Token ...`; usar el refresh token como Bearer; guardar tokens en un archivo versionado; mostrar el token en la UI.

**Extensión opcional:** guarda el access token en memoria y el refresh en almacenamiento seguro del dispositivo; no los persistas en `localStorage` sin más.

---

[← Anterior](./c3-1-registrar-una-cuenta-nueva.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c3-3-refresh-y-logout-rotacion-y-revocacion.md)
