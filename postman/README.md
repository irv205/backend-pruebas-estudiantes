# Postman — Backend de prácticas (Etapas 1-4)

Collection y environment derivados del código real del proyecto (`src/**/*.controller.ts`, DTOs y `src/app.configure.ts`). No se modificó lógica de negocio, migraciones, seed ni la propuesta.

Archivos:

- `backend-practicas.postman_collection.json` (Postman Collection v2.1)
- `backend-practicas.postman_environment.json` (Postman Environment)

## Flujo del estudiante (sin instalación)

No necesitas Docker, Node ni acceso al repositorio: el profesor arranca el backend y abre un túnel.

1. Recibe del profesor la URL pública `https://<TU-TUNNEL>.trycloudflare.com`. Es temporal: **cambia en cada ejecución**.
2. Importa ambos archivos JSON y selecciona el environment **Backend Prácticas - URL pública (estudiantes)** (pasos abajo).
3. Pega la URL en `tunnelUrl`; deriva `hostUrl` (raíz), `baseUrl` (raíz + `/api/v1`) y `wsBaseUrl` (raíz con `wss://`). Actualiza las cuatro si el túnel genera una URL nueva.
4. Abre portal y Swagger en `https://<TUNNEL>/portal` y `https://<TUNNEL>/docs`; la UI de Mailpit no se expone, tus correos están en el portal (`GET {{baseUrl}}/mail/me`).
5. Empieza por el [Nivel 0 del índice](../docs/coding-challenges.md#nivel-0--conexión-a-la-api-pública).

## Importar

1. En Postman: **Import → Upload Files** y selecciona ambos archivos JSON (también puedes arrastrar la carpeta `postman/`).
2. En el selector de environment (arriba a la derecha) elige **Backend Prácticas - URL pública (estudiantes)**.
3. Pega la URL del profesor en `tunnelUrl` y `hostUrl` = `<URL_PUBLICA>` (raíz, **sin** `/api/v1`). Escribe `baseUrl` = `<URL_PUBLICA>/api/v1` y `wsBaseUrl` = `wss://<host-publico>`. Los valores que trae el archivo son placeholders con `<TU-TUNNEL>.trycloudflare.com`, no URLs reales. Además de los IDs de las etapas anteriores, están `orderId`, `paymentId`, `idempotencyKey` (Etapa 3), `notificationId`, `jobId`, `roomId`, `csrfToken`, `webRefreshToken` (Etapa 4) y `portalSpaceId` (portal).
4. La documentación interactiva de la API está en `{{hostUrl}}/docs` (Swagger) y el portal en `{{hostUrl}}/portal`.

> Los health checks (`/health/live`, `/health/ready`) están fuera de `/api/v1`: usa `{{hostUrl}}`, no `{{baseUrl}}`. Si eres el anfitrión trabajando en local, consulta [la sección Cloudflare del README](../README.md#exponer-la-api-con-cloudflare-tunnel); los comandos de arranque son solo para ti.

## Flujo recomendado de ejecución

1. **Health › Liveness / Readiness**. Están fuera del prefijo `/api/v1`, por eso usan `{{hostUrl}}` y no `{{baseUrl}}`.
2. **Auth › Login** (primero, siempre). Usa las credenciales de desarrollo del environment y guarda `accessToken`, `refreshToken` y `userId` en los scripts de test. Sin este paso, los requests con Bearer devuelven 401.
3. Opcional: **Auth › Refresh** guarda el nuevo par de tokens y comprueba que el refresh rotó. Recuerda que el token anterior queda revocado.
4. **Spaces & Roles › Crear espacio de equipo** guarda `spaceId` (el creador queda como `ADMINISTRADOR`).
5. **Categories › Crear categoría** guarda `categoryId` y `version`.
6. **Products › Crear producto** guarda `productId` y `version` (usa `{{categoryId}}`).
7. **Notes › Crear nota**, **Tasks › Crear tarea**, **Files › Subir archivo** (selecciona un archivo local en *Body → form-data*, campo `file`).
8. Edita con los requests **Editar … (usa `{{version}}`)**; la versión se actualiza sola tras cada PATCH.
9. Los requests **… con versión obsoleta (409)** envían `version: 999` y validan `409` con `error.code = VERSION_CONFLICT` y `requestId`.
10. Los listados validan la forma `{ data: [...], meta: { page, limit, total, totalPages } }`. Los detalles validan `{ data }`.

> Los IDs y las versiones **se autopueblan** con los scripts de test: si hay un environment seleccionado escriben ahí; si no, escriben en las variables de la collection. No ejecutes PATCH/DELETE antes de los correspondientes POST.

## Etapa 3: carrito, pedidos, pagos e idempotencia

La carpeta **Cart & Orders** sigue este orden (usa el `productId` autopoblado por *Products › Crear producto*, con stock suficiente):

1. **Ver carrito** → `{ data: { items, currency, itemCount, subtotal, total }, meta }`. Los importes son enteros en unidad mínima (centavos) y los calcula el servidor: el cliente nunca envía `total`.
2. **Añadir item al carrito** con `{ "productId": "{{productId}}", "quantity": 2 }`. El mismo producto se acumula; se validan producto visible, stock, cantidad positiva y una sola moneda (`409 CURRENCY_MISMATCH`).
3. **Cambiar cantidad** / **Quitar item** / **Vaciar carrito**. El carrito es por usuario y espacio, nunca por cliente.
4. **Crear pedido con Idempotency-Key**: el script *pre-request* genera una clave con `{{$guid}}` y la guarda en `idempotencyKey`. La respuesta `201` trae `orderId`, `status: PENDING_PAYMENT`, `total`, `items` con `unitPrice`/`name`/`currency` (snapshot) y `payments: []`. El stock se descuenta en la creación y el carrito queda vacío.
5. **Reintentar mismo pedido**: reenvía la **misma** clave; el script comprueba que el `id` y el `status` son idénticos (no hay doble descuento). **Sin Idempotency-Key** la API responde `422 VALIDATION_ERROR`.
6. **Listar pedidos** admite `?status=PENDING_PAYMENT|PAID|FAILED|CANCELLED&page=1&limit=10`; **Detalle de pedido** muestra ítems y pagos y autopuebla `paymentId`.
7. **Pagar: APPROVED** → `PAID`; **Pagar: REJECTED** → `FAILED` y repone stock; **Pagar: PENDING** → mantiene `PENDING_PAYMENT` para reintentar.Son simulaciones: no hay cobros reales. Las transiciones inválidas (pagar un pedido pagado, cancelar uno fallido) responden `409 INVALID_STATUS_TRANSITION`.
8. **Cancelar pedido** → `CANCELLED` con reposición de stock una sola vez.

> Para demostrar la idempotencia desde cero, ejecuta **Vaciar carrito → Añadir item → Crear pedido → Reintentar mismo pedido** y compara el stock del producto antes y después con *Products › Detalle de producto*.

## Etapa 4: Realtime, Notifications, Jobs y Web Auth

- **Realtime:** el socket no se prueba con requests REST. Conecta desde tu cliente a `{{wsBaseUrl}}/socket.io` (`wss://<host-publico>/socket.io`) con `auth: { token: "{{accessToken}}" }`. La carpeta contiene la creación de sala (`roomId` se autopuebla), el listado y el historial. Eventos: `connection:ready`, `chat:send` → `chat:message`, `resource:changed`, `notification:new`, `job:updated`, `events:replay` (envía `{ lastEventId: 0, spaceId, limit: 50 }`) y `ws:error`. El replay es la forma de recuperar eventos tras reconectar.
- **Notifications:** ejecuta *Listar notificaciones* (autopuebla `notificationId`) después de pagar/cancelar un pedido o de completar/fallar un export; comprueba *Contar no leídas*, *Detalle*, *Marcar como leída* y *Marcar todas como leídas*.
- **Jobs:** *Crear export de productos/notas* autopuebla `jobId`. Con `JOBS_QUEUE_MODE=redis` el primer estado suele ser `PENDING`: usa *Consultar estado del trabajo* hasta `COMPLETED`/`FAILED` (o `inline` en tests, donde responde `COMPLETED`). Luego *Descargar CSV terminado* (antes devuelve `409 EXPORT_NOT_READY`). Para provocar un fallo: **Simulator › Activar failedAsyncJob**, crear otro export, verificar `FAILED`, y ejecutar **Simulator › Desactivar todos los escenarios (limpieza)**.
- **Web Auth (cookies/CSRF):** *Login web* guarda `webRefreshToken` y `csrfToken` desde las cookies `Set-Cookie` y actualiza `accessToken` (el body **no** devuelve el refresh token). *Obtener CSRF* rota el token double-submit. *Renovar sesión web* y *Logout web* envían `Cookie: refresh_token={{webRefreshToken}}; csrf_token={{csrfToken}}` y `X-CSRF-Token: {{csrfToken}}`. **Estos dos requests NO envían `Authorization: Bearer` a propósito**: el guard CSRF se salta cuando hay Bearer, así que con él no se estaría probando el flujo de cookies. El request *Renovar sesión web sin CSRF (403)* comprueba que, sin la cabecera `X-CSRF-Token`, la respuesta es `403 CSRF_TOKEN_INVALID`. Las rutas Bearer habituales siguen funcionando igual y no requieren CSRF.

> Los scripts de estas cuatro carpetas usan el mismo helper `setVar` que el resto de la colección: escriben en el environment cuando hay uno seleccionado y, si no, en las variables de la collection. Así `notificationId`, `jobId`, `roomId` y `csrfToken` se resuelven con el environment recomendado en lugar de quedar vacíos.

> En Postman las cookies se guardan en la *Cookie jar*, pero los scripts leen el valor de `Set-Cookie` y lo escriben en `webRefreshToken`/`csrfToken` porque las peticiones usan una cabecera `Cookie` explícita. Tras *Obtener CSRF*, vuelve a ejecutar *Renovar sesión web* para usar el token rotado. Si tu jar tiene cookies de otra sesión, limpia la jar o usa el environment recién importado.

## Portal del estudiante

La carpeta **Portal** contiene los requests de la UI disponible en `{{hostUrl}}/portal` (URL pública):

1. **UI del portal · GET {{hostUrl}}/portal** (sin Bearer) comprueba que la página HTML se sirve desde la propia app.
2. **Manifiesto** expone `apiBaseUrl`, `swaggerUrl`, descargas, los 12 escenarios reales y los niveles 0-6.
3. **Espacios seleccionables** autopuebla `portalSpaceId` con el espacio activo (personal por defecto). Para crear un sandbox o un equipo usa los requests existentes de **Spaces & Roles › Crear sandbox anónimo / Crear espacio de equipo**.
4. **Guía**, **Descargar collection** y **Descargar environment** devuelven archivos (Markdown/JSON). **Requieren `Authorization: Bearer`**: el portal los obtiene con `fetch` y un `Blob`, porque un enlace `<a>` normal no envía la cabecera. En Postman usa los requests de la carpeta; el body se descarga con *Save response → Save to a file* o se valida con el script de test.
5. **Mis correos · GET {{baseUrl}}/mail/me** muestra la bandeja **solo del usuario autenticado**. El backend filtra por `to:<email>` y vuelve a comprobar los destinatarios; la UI completa de Mailpit no está expuesta. Los mensajes no incluyen cuerpo ni `snippet` (evitan filtrar tokens de verificación/recuperación).

> Los correos de prueba se generan, por ejemplo, con **Auth › Register**, **Auth › Forgot password** o verificando el usuario sembrado. Para verlos en el portal, inicia sesión web con **Auth › Login web** (`Web Auth (cookies/CSRF)`) y abre el panel *Mis correos de prueba*. El login web rellena la *Cookie jar* de Postman y guarda `webRefreshToken`/`csrfToken` en el environment; **Renovar sesión web** y **Logout web** siguen enviando la cabecera `Cookie` explícita y `X-CSRF-Token` sin Bearer. Si tu jar tiene cookies de otra sesión, límpiala antes de repetir el flujo.

> Postman no sustituye al cliente WebSocket: la carpeta **Realtime** documenta las salas y el historial REST, pero los eventos se observan con un cliente Socket.IO. Ejemplo mínimo (Node, `npm i socket.io-client`):
>
> ```js
> import { io } from 'socket.io-client';
> const socket = io('{{wsBaseUrl}}', { auth: { token: accessToken } }); // wss://<TU-TUNNEL>.trycloudflare.com
> socket.on('connection:ready', ({ user, spaces }) => console.log(user.id, spaces));
> socket.on('chat:message', console.log);
> socket.on('notification:new', console.log);
> socket.emit('events:replay', { lastEventId: 0, limit: 50 });
> socket.on('events:replay', ({ events, lastEventId }) => console.log(events, lastEventId));
> socket.on('ws:error', console.error);
> ```
>
> Para probar el chat, crea una sala con *Realtime › Crear sala de chat* (guarda `roomId`) y emite `socket.emit('chat:send', { roomId, content: 'hola' })`. Guarda el `id` del último evento para reconectar con `lastEventId`.

## Solo anfitrión: puerto local

> Esto **no aplica al estudiante**, que solo usa la URL pública. El `docker-compose` publica la app en `http://localhost:3100` porque `.env` define `APP_HOST_PORT=3100`; `PUBLIC_BASE_URL` debe ser la **raíz pública sin `/api/v1`** porque el código añade el sufijo. Si el anfitrión cambia el puerto local, ajusta en su copia:

- `baseUrl` → `http://localhost:<PUERTO>/api/v1`
- `hostUrl` → `http://localhost:<PUERTO>` (para `/health/live` y `/health/ready`)

Para estudiantes, vuelve a las variables públicas del apartado [Importar](#importar).

## Usar la URL pública de Cloudflare Tunnel

> **Solo anfitrión/profesor:** los estudiantes no ejecutan estos comandos; solo reciben la URL impresa y actualizan sus variables de Postman. Ver [Flujo del estudiante](#flujo-del-estudiante-sin-instalación).

El script `scripts/start-with-public-url.mjs` crea un **quick tunnel anónimo** con `cloudflared tunnel --url http://127.0.0.1:$PORT` y muestra una URL temporal `https://xxxx.trycloudflare.com` (cambia en cada ejecución; no usa tokens ni config de Cloudflare). Si arrancas con `./start.sh`, abre el túnel a mano apuntando a `APP_HOST_PORT`: `cloudflared tunnel --url http://127.0.0.1:3100`.

Con la URL impresa en la terminal:

1. Pégala en `tunnelUrl` (viene con el placeholder `https://<TU-TUNNEL>.trycloudflare.com`; **no es una URL real**).
2. Copia la misma URL en `hostUrl` (para `/health/live`, `/health/ready`, `/docs` y `/portal`).
3. Copia la misma URL **más `/api/v1`** en `baseUrl`: `https://xxxx.trycloudflare.com/api/v1`.
4. Copia la raíz con `wss://` en `wsBaseUrl` para Socket.IO: `wss://xxxx.trycloudflare.com`.
5. Repite los pasos 1-4 cada vez que el túnel genere una URL nueva (compártela con tus estudiantes). Si quieres que los enlaces de correos y el manifiesto del portal usen la URL pública, pon `PUBLIC_BASE_URL=https://xxxx.trycloudflare.com` en `.env` (**sin `/api/v1`**) y reinicia la app.

Los correos de prueba **siguen en local**: la UI de Mailpit es solo `http://127.0.0.1:8025` y no se expone; los estudiantes ven los suyos con `GET {{baseUrl}}/mail/me` en el portal. El túnel solo transporta peticiones HTTP: PostgreSQL, Redis, `.env`, tokens y archivos de configuración de cloudflared nunca se publican; los datos permanecen en los volúmenes Docker de tu máquina. Comparte la URL solo con tus estudiantes y rota el túnel (reinícialo) si se filtra. Ver más en el [README principal](../README.md#exponer-la-api-con-cloudflare-tunnel).

## Sandbox anónimo (`x-space-id`)

- **Spaces & Roles › Crear sandbox anónimo** (`POST /public/sandboxes`, sin login) guarda el `spaceId` devuelto en `anonymousSpaceId`. Viene con un UUID de alta entropía de ejemplo que se sobrescribe al crear uno real.
- En la carpeta **Public Products**, los requests marcados **Sandbox anónimo** envían `x-space-id: {{anonymousSpaceId}}`. El sandbox tiene TTL y cuotas; para empezar de cero usa **Reiniciar sandbox anónimo**.
- **Sin la cabecera `x-space-id`**, `/public/products` y `/public/categories` consultan la **demo pública**, que es de solo lectura: un POST/PATCH/DELETE responde `403` con `DEMO_READ_ONLY`. La carpeta tiene requests de creación/edición/eliminación de categorías en sandbox (subcarpeta *Categorías públicas / sandbox*) y de productos en sandbox.
- **Restaurar demo pública** usa el slug real `demo-publico` (`POST /public/sandboxes/demo-publico/reset`).

## Probar roles (LECTOR / EDITOR / ADMINISTRADOR)

1. Crea un equipo con **Crear espacio de equipo**: el creador es `ADMINISTRADOR`.
2. Registra otro usuario con **Auth › Register** (o usa otro correo sembrado) y cópiale el `id` a `userId`.
3. **Invitar miembro** con `{ "email": "...", "role": "EDITOR" }`; luego **Cambiar rol de miembro** para probar `LECTOR` / `EDITOR` / `ADMINISTRADOR`. Solo el administrador puede listar/invitar/cambiar roles/remover y reiniciar el espacio.
4. Para actuar con ese rol, inicia sesión con ese usuario (**Auth › Login**) y envía `x-space-id: {{spaceId}}` en los requests de productos/categorías/notas/tareas/archivos. Sin esa cabecera se usa el espacio personal.
   - `LECTOR`: solo GET; un POST devuelve `403 INSUFFICIENT_ROLE`.
   - `EDITOR`: CRUD de recursos; no gestiona miembros ni resets.
   - `ADMINISTRADOR`: todo lo anterior + miembros, resets y escenarios (`/spaces/:spaceId/scenarios`).
5. Tras cambiar la contraseña de un usuario, vuelve a hacer Login: las demás sesiones quedan revocadas.

## Simulador

La carpeta **Simulator** usa las 12 claves reales del código (`src/simulator/scenarios.ts`): `slowResponse`, `timeout`, `temporary503`, `sessionExpired`, `insufficientPermission`, `emptyList`, `largeVolume`, `concurrentEdit`, `rateLimit`, `invalidFile`, `duplicateOrder` y `failedAsyncJob`. Hay requests para consultar/activar escenarios del espacio personal y de equipo (solo `ADMINISTRADOR`), activar todos, y una comprobación de `429 RATE_LIMITED` con cabecera `Retry-After`.

**Pedido repetido (`duplicateOrder`, Etapa 3):** ejecuta *Pedido repetido: activar duplicateOrder*, añade un item al carrito y usa *Pedido repetido: crear pedido dos veces (script)*. El interceptor sustituye la cabecera por `duplicate-order-<spaceId>`: el primer POST crea el pedido y el segundo (lanzado por el script) devuelve el mismo `id` y `status` sin descontar stock otra vez. Límites: solo afecta a `POST /orders` y a un espacio a la vez; una clave por espacio. **`failedAsyncJob` (Etapa 4)** está disponible: ver la carpeta **Jobs** y el request *Simulator › Activar failedAsyncJob*.

**Ejecuta siempre «Desactivar todos los escenarios (limpieza)» al terminar**, porque la configuración persiste por espacio y afecta a las respuestas posteriores. El request de limpieza ya incluye `duplicateOrder: false` y `failedAsyncJob: false`.

## Respuestas y errores

- Listados: `{ data, meta }`; detalle: `{ data }`.
- Errores: `{ error: { code, message, fields }, requestId }`.
- Validación: `422`; conflictos de versión: `409 VERSION_CONFLICT`; límite de tasa: `429` con `Retry-After`.

## Credenciales de desarrollo (importante)

El environment incluye `email = estudiante@practicas.local` y `password = Estudiante.123` porque son el usuario sembrado del seed: **solo desarrollo / práctica, no usar en producción**. Con una sola URL pública, todos los estudiantes que lo usen comparten el mismo espacio personal: recomienda sandbox propio o cuenta propia y **no cambiar la contraseña sembrada**. `password` está marcado como `secret` y ambos tienen `initialValue` vacío. No hay secretos de producción. Si vas a compartir/exportar el environment, limpia esos dos valores y vuelve a escribirlos localmente.

Los requests **Cambiar contraseña** y **Eliminar mi cuenta** son destructivos para el usuario sembrado; úsalos con cuidado y vuelve a sembrar si hace falta.
