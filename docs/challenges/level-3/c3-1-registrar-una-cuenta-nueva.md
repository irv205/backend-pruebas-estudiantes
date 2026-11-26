# C3.1 — Registrar una cuenta nueva

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL pública de Cloudflare que te entregue el profesor. Si eres el anfitrión y trabajas localmente, consulta la sección [Cloudflare Tunnel](../../../README.md#exponer-la-api-con-cloudflare-tunnel) del README. Las variables `{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}` deben apuntar a la URL pública: `{{hostUrl}}` y `tunnelUrl` son la raíz (`<URL_PUBLICA>`), `{{baseUrl}}` es `<URL_PUBLICA>/api/v1` y `{{wsBaseUrl}}` es `wss://<host-publico>`. El prefijo `/api/v1` **no** se duplica.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.
> **Cuenta de práctica compartida:** el usuario sembrado `estudiante@practicas.local` es solo de demostración. Con una sola URL pública, todos los que lo usen comparten el mismo espacio personal: usa un sandbox propio o registra tu propia cuenta cuando el challenge lo permita, y **no cambies la contraseña sembrada**.

> **Contexto del nivel 3:**
>
> A partir de aquí usas `Authorization: Bearer <accessToken>`. Sin `x-space-id` trabajas en tu espacio personal.

---


**Objetivo de aprendizaje:** crear usuarios y entender validación de contraseña y correo único.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/register`

**Pasos**

1. Regístrate con un correo propio de prueba (no el del seed):
   ```bash
   curl -i -H 'Content-Type: application/json' \
     -d '{"email":"tu.alumno@practicas.local","name":"Tu Nombre","password":"Alumno.123"}' \
     {{baseUrl}}/auth/register
   ```
2. Repite el mismo correo: observa el conflicto por duplicado.
3. Prueba una contraseña corta (`"abc"`) y observa el `422` con `error.fields`.
4. Registra un segundo usuario; lo necesitarás en C3.5 y C4.4.

**Criterios de aceptación**

- [ ] Registro correcto: `201` con `data.tokens` y `data.user.id`.
- [ ] Contraseña válida: al menos 8 caracteres, con letras y números (máximo 72).
- [ ] Correo duplicado: `409` con `error.code` estable.
- [ ] Contraseña inválida: `422` con `error.fields.password`.
- [ ] El registro crea el espacio personal del usuario.

**Pista:** usa correos `@...practicas.local` para no enviar correos reales; la recuperación se lee en Mailpit.

**Errores comunes:** usar el correo del seed (ya existe); contraseñas sin números; publicar el `password` en un log o captura; compartir el environment con credenciales sin limpiar.

**Extensión opcional:** valida la contraseña en el cliente antes de enviar y muestra los mismos requisitos que el servidor.

---

[← Anterior](../level-2/c2-4-aislamiento-entre-sandboxes-y-reset.md) · [Índice](../../coding-challenges.md) · [Siguiente →](./c3-2-login-y-uso-seguro-del-token-de-acceso.md)
