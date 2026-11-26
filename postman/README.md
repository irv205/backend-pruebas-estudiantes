# Postman — Backend de prácticas (Etapas 1-3)

Collection y environment derivados del código real del proyecto (`src/**/*.controller.ts`, DTOs y `src/app.configure.ts`). No se modificó lógica de negocio, migraciones, seed ni la propuesta.

Archivos:

- `backend-practicas.postman_collection.json` (Postman Collection v2.1)
- `backend-practicas.postman_environment.json` (Postman Environment)

## Importar

1. En Postman: **Import → Upload Files** y selecciona ambos archivos JSON (también puedes arrastrar la carpeta `postman/`).
2. En el selector de environment (arriba a la derecha) elige **Backend Prácticas - Local (desarrollo)**.
3. Comprueba las variables `baseUrl` = `http://localhost:3100/api/v1` y `hostUrl` = `http://localhost:3100`. Además de los IDs de las etapas anteriores, están `orderId`, `paymentId` e `idempotencyKey` (Etapa 3).
4. La documentación interactiva de la API está en `http://localhost:3100/docs` (Swagger).

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

## Cambiar el puerto (baseUrl)

El `docker-compose` publica la app en `http://localhost:3100` porque `.env` (y la plantilla de este entorno) define `APP_HOST_PORT=3100`; `PUBLIC_BASE_URL` usa el mismo puerto. Si usas otro puerto, edita **dos** variables del environment:

- `baseUrl` → `http://localhost:<PUERTO>/api/v1`
- `hostUrl` → `http://localhost:<PUERTO>` (para `/health/live` y `/health/ready`)

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

La carpeta **Simulator** usa las claves reales del código (`src/simulator/scenarios.ts`): `slowResponse`, `timeout`, `temporary503`, `sessionExpired`, `insufficientPermission`, `emptyList`, `largeVolume`, `concurrentEdit`, `rateLimit`, `invalidFile` y `duplicateOrder`. Hay requests para consultar/activar escenarios del espacio personal y de equipo (solo `ADMINISTRADOR`), activar todos, y una comprobación de `429 RATE_LIMITED` con cabecera `Retry-After`.

**Pedido repetido (`duplicateOrder`, Etapa 3):** ejecuta *Pedido repetido: activar duplicateOrder*, añade un item al carrito y usa *Pedido repetido: crear pedido dos veces (script)*. El interceptor sustituye la cabecera por `duplicate-order-<spaceId>`: el primer POST crea el pedido y el segundo (lanzado por el script) devuelve el mismo `id` y `status` sin descontar stock otra vez. Límites: solo afecta a `POST /orders` y a un espacio a la vez; una clave por espacio. **`failedAsyncJob` sigue pendiente de Etapa 4** (worker/Redis), no intentes activarlo.

**Ejecuta siempre «Desactivar todos los escenarios (limpieza)» al terminar**, porque la configuración persiste por espacio y afecta a las respuestas posteriores. El request de limpieza ya incluye `duplicateOrder: false`.

## Respuestas y errores

- Listados: `{ data, meta }`; detalle: `{ data }`.
- Errores: `{ error: { code, message, fields }, requestId }`.
- Validación: `422`; conflictos de versión: `409 VERSION_CONFLICT`; límite de tasa: `429` con `Retry-After`.

## Credenciales de desarrollo (importante)

El environment incluye `email = estudiante@practicas.local` y `password = Estudiante.123` porque son el usuario sembrado del seed: **solo desarrollo / práctica, no usar en producción**. `password` está marcado como `secret` y ambos tienen `initialValue` vacío. No hay secretos de producción. Si vas a compartir/exportar el environment, limpia esos dos valores y vuelve a escribirlos localmente.

Los requests **Cambiar contraseña** y **Eliminar mi cuenta** son destructivos para el usuario sembrado; úsalos con cuidado y vuelve a sembrar si hace falta.
