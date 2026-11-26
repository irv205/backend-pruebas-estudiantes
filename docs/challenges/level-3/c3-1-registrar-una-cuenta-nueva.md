# C3.1 — Registrar una cuenta nueva

[Índice de la guía](../../coding-challenges.md)

> **URLs:** usa la URL local o la URL pública de Cloudflare configurada en Postman. En los ejemplos, `{{baseUrl}}` es la raíz de la API (`http://localhost:3100/api/v1` o `https://xxxx.trycloudflare.com/api/v1`), `{{hostUrl}}` la raíz del host (`http://localhost:3100` o la URL del túnel) y `{{wsBaseUrl}}` el socket (`ws://localhost:3100` o `wss://<host-del-tunel>`). Sustituye los marcadores por tus valores reales; `baseUrl` y `hostUrl` son variables del environment de Postman.
> **Convención:** `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta y `<spaceId>` el UUID de tu sandbox o equipo.

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
