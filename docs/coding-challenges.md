# Guía de coding challenges — Backend de prácticas

Esta guía es tu hoja de ruta para practicar integración de clientes (web, Android, iOS o escritorio) contra el backend de prácticas. Cada desafío se puede resolver **con la colección de Postman o con `curl`**: no necesitas permisos especiales ni tocar el código del servidor.

> **No instales nada.** El backend corre en la máquina del profesor y se consume a través de una URL pública de Cloudflare (`https://<URL_PUBLICA>`, p. ej. `https://xxxx.trycloudflare.com`). Recibe esa URL, importa la colección/environment de Postman y empieza por el Nivel 0. La URL es temporal: **cambia en cada ejecución** del túnel; actualiza las variables cuando el profesor te dé una nueva.

> **Estado real del backend:** Etapas **1, 2, 3 y 4 implementadas**. Los niveles 5 (carrito, pedidos, pagos e idempotencia) y 6 (WebSocket, notificaciones y exportaciones) **están disponibles**. El portal del estudiante (`{{hostUrl}}/portal`) permite hacer todo el flujo desde el navegador; las guías cliente JS/Kotlin/Retrofit completas siguen pendientes (el portal incluye ejemplos resumidos).

---

## 1. Introducción

### Cómo usar esta guía

1. Pide al profesor la URL pública y pégala **solo en `tunnelUrl`**; un script de la collection deriva `hostUrl`, `baseUrl` y `wsBaseUrl`, y **Portal › Manifiesto** las refresca, como se explica en [postman/README.md](../postman/README.md).
2. Empieza por el **Nivel 0** y avanza en orden. Cada nivel reutiliza lo anterior.
3. Para cada desafío lee el **objetivo**, sigue los **pasos**, y comprueba los **criterios de aceptación** antes de pasar al siguiente.
4. Usa la **pista** si te atascas, y la **extensión opcional** si quieres subir el nivel.
5. Al terminar un nivel, anota qué comprobaste y guarda tus capturas/logs según la sección [Cómo entregar la solución](#7-cómo-entregar-la-solución).

No modifiques el código del backend: aquí el objetivo es **consumir** la API, no cambiarla.

### Requisitos (estudiante)

- Un navegador para abrir el portal y Swagger en la URL pública.
- Postman (app o web) para usar la [colección y el environment](../postman/README.md); `curl` es opcional (y `jq` si quieres leer JSON en terminal).
- La URL pública que te dé el profesor. No necesitas Docker, Node, Git ni permisos sobre el repositorio.
- Un editor para escribir tus clientes de ejemplo (JavaScript/TypeScript o Kotlin/Retrofit).

> **Solo anfitrión/profesor:** Docker Engine 29+, Docker Compose v5+ y, si quiere, Node 20.18.1. El arranque del backend, las migraciones, el seed y la apertura del túnel están descritos en el [README principal](../README.md#exponer-la-api-con-cloudflare-tunnel). No son requisitos ni pasos del estudiante.

> Los ejemplos opcionales con `curl` de esta guía funcionan tal cual en bash (macOS/Linux).

### URLs y variables (URL pública)

| Recurso | Variable / URL |
|---|---|
| API (prefijo `/api/v1`) | `{{baseUrl}}` = `<URL_PUBLICA>/api/v1` |
| Swagger UI | `{{hostUrl}}/docs` |
| Health (fuera de `/api/v1`) | `{{hostUrl}}/health/live` y `{{hostUrl}}/health/ready` |
| Portal del estudiante | `{{hostUrl}}/portal` |
| Correos propios | `{{baseUrl}}/mail/me` desde el portal; la UI de Mailpit **no** se expone |
| WebSocket | `{{wsBaseUrl}}/socket.io` = `wss://<host-publico>/socket.io` |

`<URL_PUBLICA>` es la raíz que imprime el túnel del profesor, p. ej. `https://<TU-TUNNEL>.trycloudflare.com`. Pégala solo en `tunnelUrl`: la collection deriva `hostUrl` (raíz), `baseUrl` (raíz + `/api/v1`) y `wsBaseUrl` (con `wss://`); el manifiesto las actualiza desde la URL vigente. Si el profesor reinicia el túnel, vuelve a pegar la URL nueva y ejecuta el manifiesto. `PUBLIC_BASE_URL` es solo el fallback del anfitrión y se escribe sin `/api/v1` porque el código añade el sufijo; el profesor no lo edita cuando cambia el túnel.

**Usuario de prueba del seed (solo desarrollo, compartido):**

```
email:    estudiante@practicas.local
password: Estudiante.123
```

Con una sola URL pública, todos los estudiantes que usen ese usuario caen en el **mismo espacio personal**. Para aislarte, usa un sandbox anónimo propio (`x-space-id`) o registra tu propia cuenta (Nivel 3). **No cambies la contraseña sembrada**.

### Portal del estudiante (Nivel 0)

Abre **`{{hostUrl}}/portal`** con la URL pública y entra con el usuario de prueba (o crea tu propio sandbox/cuenta). La UI usa el mismo flujo web de cookies `HttpOnly` + CSRF; el access token se conserva solo en memoria del navegador. Desde el portal puedes:

- Ver la URL base de la API, Swagger, la colección/environment de Postman y la guía completa (`GET /api/v1/portal/manifest`).
- Listar y seleccionar tu espacio personal, equipos, la demo pública o un sandbox anónimo; crear sandbox/equipo y ver el `spaceId` activo (`GET /api/v1/portal/spaces` y los endpoints existentes de `/spaces` y `/public/sandboxes`).
- Reiniciar el espacio con confirmación (en la demo, restaurar los datos iniciales) y activar/desactivar los **12 escenarios** reales por espacio (`GET/PATCH /spaces/me/scenarios` o `/spaces/:spaceId/scenarios`).
- Ver **solo tus correos de prueba** en el panel *Mis correos de prueba*: el backend media con `GET /api/v1/mail/me`, filtra por tu correo y no muestra la UI de Mailpit ni los cuerpos de los mensajes. Para generar uno, ejecuta *Auth › Forgot password* o registra otro usuario y vuelve a cargar la bandeja.
- Seguir los niveles 0-6 con ejemplos `curl`, JavaScript y Kotlin; la guía completa se abre desde el enlace *Guía*.

> En el Nivel 4 localiza el panel **Simulador**: ahí se activan los escenarios que luego usarás en los niveles 5 y 6 (por ejemplo `duplicateOrder` y `failedAsyncJob`). Desactívalos al terminar.

### Importar Postman

1. Importa **los dos archivos**: `postman/backend-practicas.postman_collection.json` y `postman/backend-practicas.postman_environment.json` (detalles en [postman/README.md](../postman/README.md)).
2. Selecciona el environment **Backend Prácticas - URL pública (estudiantes)**.
3. Pega la URL que te dio el profesor **solo en `tunnelUrl`** (raíz, sin `/api/v1`). El pre-request de la collection calcula `hostUrl`, `baseUrl` y `wsBaseUrl`; después ejecuta **Portal › Manifiesto** (con tu `accessToken`) para confirmar que apuntan a la URL vigente. Repite solo si el túnel genera una URL nueva.
4. **Ejecuta primero `Auth › Login (pobla accessToken/refreshToken)`**. Sin ese paso, los requests con Bearer devuelven `401`. Los scripts de test autopueblan `accessToken`, `refreshToken`, `userId` y los IDs/versiones de productos, notas, categorías, tareas y archivos.
5. No instales ni arranques nada en local: si eres el anfitrión trabajando en tu máquina, consulta el [README principal](../README.md#exponer-la-api-con-cloudflare-tunnel).

### Convenciones de la API

| Convención | Valor |
|---|---|
| Prefijo | `/api/v1` (health y Swagger quedan fuera) |
| Formato | JSON; `multipart/form-data` para archivos |
| Identificadores | UUID |
| Fechas | ISO 8601 en UTC, p. ej. `2030-01-01T00:00:00Z` |
| Importes | Entero en **unidad mínima** de la moneda (p. ej. `49900` = 499.00 MXN) + `currency` de 3 letras |
| Listados | `{ "data": [...], "meta": { page, limit, total, totalPages } }` |
| Detalle | `{ "data": { ... } }` |
| Creación | `201 Created` |
| Borrado | `204 No Content`, **sin cuerpo** |
| Errores | `{ "error": { "code", "message", "fields?" }, "requestId" }` |
| Validación | `422` con `error.fields` por campo |
| Conflicto | `409` (versión obsoleta → `VERSION_CONFLICT`) |
| Límites | `429` con cabecera `Retry-After` |
| Simulación | `503 SIMULATED_503` controlado por espacio |

### Modalidades y aislamiento

| Modalidad | Cómo acceder | Comportamiento |
|---|---|---|
| Demo pública | Sin login, sin `x-space-id` | Solo lectura; un write responde `403 DEMO_READ_ONLY` |
| Sandbox anónimo | Header `x-space-id` con el UUID devuelto por `POST /public/sandboxes` | CRUD aislado, temporal y con cuotas. **No es autenticación** |
| Espacio personal | `Authorization: Bearer <accessToken>` | Datos privados y persistentes; sin `x-space-id` se usa este espacio |
| Espacio de equipo | Bearer + `x-space-id: <teamSpaceId>` | Datos compartidos con roles `LECTOR`, `EDITOR`, `ADMINISTRADOR` |

El propietario de un equipo siempre es `ADMINISTRADOR`; `LECTOR` solo consulta, `EDITOR` hace CRUD y `ADMINISTRADOR` además gestiona miembros, escenarios y resets.

### Qué módulos puedes usar ya

Disponibles (Etapas 1-2): health, auth, users, spaces/roles, categories, products y public/products, notes, tasks/subtasks, files (multipart) y simulator.

Disponibles desde la Etapa 3: carrito, pedidos, pagos simulados e idempotencia (Nivel 5). Disponibles desde la Etapa 4 (Nivel 6): notificaciones, WebSocket/chat con replay, export jobs con worker/Redis y login web con cookies `HttpOnly` + CSRF. El portal del estudiante reúne todos esos flujos en `{{hostUrl}}/portal`; las guías cliente JS/Kotlin/Retrofit completas siguen pendientes.

---

## 2. Ruta de nivel

| Nivel | Tema | Proyecto sugerido | Estado | Desafíos |
|---|---|---|---|---|
| 0 | Conexión a la API pública | Conectar a la URL pública y ejecutar Postman | Disponible | 2 |
| 1 | Inicial | Catálogo público: listado y detalle | Disponible | 4 |
| 2 | Básico | CRUD de productos en sandbox anónimo | Disponible | 4 |
| 3 | Intermedio | Registro, login, perfil y notas privadas | Disponible | 5 |
| 4 | Intermedio avanzado | Categorías, tareas, archivos, roles y simulador | Disponible | 5 |
| 5 | Avanzado | Carrito, pedidos, stock, pagos e idempotencia | Disponible | 2 |
| 6 | Integraciones | WebSockets, notificaciones y exportaciones | Disponible | 2 |

Después del Nivel 6 encontrarás el **proyecto final sugerido**. **Total: 24 desafíos.**

Cada desafío tiene su **propio archivo** en [`docs/challenges/`](challenges/); los ejemplos usan las variables de la URL pública de Cloudflare configuradas en Postman (`{{baseUrl}}`, `{{hostUrl}}` y `{{wsBaseUrl}}`).

> Convención de los ejemplos: `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta, y `<spaceId>` el UUID de tu sandbox o equipo. Sustituye siempre los marcadores por valores reales.


---

## 3. Desafíos por nivel

Cada enlace abre el desafío completo (objetivo, endpoints, pasos, criterios, pista, errores comunes, extensión y ejemplos).

### Nivel 0 — Conexión a la API pública

No instalas ni arrancas nada: solo recibes la URL pública del profesor, configuras Postman y compruebas health, Swagger y portal.

- [C0.1 — Conéctate a la API pública y comprueba que está viva](./challenges/level-0/c0-1-conectate-a-la-api-publica-y-comprueba-que-esta-viva.md)
- [C0.2 — Importa Postman y ejecuta tu primer flujo autenticado](./challenges/level-0/c0-2-importa-postman-y-ejecuta-tu-primer-flujo-autenticado.md)

---

### Nivel 1 — Inicial: catálogo público


Aquí no hay login: solo lectura de la demo pública. Todo lo que escribas en la demo sin `x-space-id` debe fallar con `403 DEMO_READ_ONLY`.

- [C1.1 — Listar el catálogo público](./challenges/level-1/c1-1-listar-el-catalogo-publico.md)
- [C1.2 — Detalle de producto y errores 404](./challenges/level-1/c1-2-detalle-de-producto-y-errores-404.md)
- [C1.3 — Paginación, búsqueda, filtros y orden](./challenges/level-1/c1-3-paginacion-busqueda-filtros-y-orden.md)
- [C1.4 — Estado vacío controlado con el simulador](./challenges/level-1/c1-4-estado-vacio-controlado-con-el-simulador.md)

---

### Nivel 2 — Básico: CRUD en sandbox anónimo


El sandbox se crea sin login y se identifica con `x-space-id`. Recuerda: **ese header separa datos, pero no autentica a nadie**.

- [C2.1 — Crea tu sandbox y haz CRUD de productos](./challenges/level-2/c2-1-crea-tu-sandbox-y-haz-crud-de-productos.md)
- [C2.2 — Conflicto de versión: 409 `VERSION_CONFLICT`](./challenges/level-2/c2-2-conflicto-de-version-409-version-conflict.md)
- [C2.3 — Límite de peticiones: 429 y `Retry-After`](./challenges/level-2/c2-3-limite-de-peticiones-429-y-retry-after.md)
- [C2.4 — Aislamiento entre sandboxes y reset](./challenges/level-2/c2-4-aislamiento-entre-sandboxes-y-reset.md)

---

### Nivel 3 — Intermedio: cuenta, sesión y notas privadas


A partir de aquí usas `Authorization: Bearer <accessToken>`. Sin `x-space-id` trabajas en tu espacio personal.

- [C3.1 — Registrar una cuenta nueva](./challenges/level-3/c3-1-registrar-una-cuenta-nueva.md)
- [C3.2 — Login y uso seguro del token de acceso](./challenges/level-3/c3-2-login-y-uso-seguro-del-token-de-acceso.md)
- [C3.3 — Refresh y logout: rotación y revocación](./challenges/level-3/c3-3-refresh-y-logout-rotacion-y-revocacion.md)
- [C3.4 — Perfil y avatar](./challenges/level-3/c3-4-perfil-y-avatar.md)
- [C3.5 — Notas privadas: CRUD, filtros y propiedad](./challenges/level-3/c3-5-notas-privadas-crud-filtros-y-propiedad.md)

---

### Nivel 4 — Intermedio avanzado: categorías, tareas, archivos, roles y simulador



- [C4.1 — Categorías y su relación con productos](./challenges/level-4/c4-1-categorias-y-su-relacion-con-productos.md)
- [C4.2 — Tareas, subtareas y transiciones de estado](./challenges/level-4/c4-2-tareas-subtareas-y-transiciones-de-estado.md)
- [C4.3 — Subida, descarga y borrado de archivos (multipart)](./challenges/level-4/c4-3-subida-descarga-y-borrado-de-archivos-multipart.md)
- [C4.4 — Roles de equipo: LECTOR, EDITOR, ADMINISTRADOR](./challenges/level-4/c4-4-roles-de-equipo-lector-editor-administrador.md)
- [C4.5 — Simulador de errores: timeouts, 503 y conflictos](./challenges/level-4/c4-5-simulador-de-errores-timeouts-503-y-conflictos.md)

---

### Nivel 5 — Avanzado: carrito, pedidos, stock, pagos e idempotencia


Estos endpoints **ya existen** (Etapa 3, disponibles en `/docs`). Requieren `Authorization: Bearer <accessToken>`; sin `x-space-id` usan tu espacio personal. Un `LECTOR` solo consulta; `EDITOR` y `ADMINISTRADOR` pueden crear pedidos y pagar/cancelar.

- [C5.1 — Carrito, pedidos, stock e idempotencia](./challenges/level-5/c5-1-carrito-pedidos-stock-e-idempotencia.md)
- [C5.2 — Pagos simulados y cancelación con reposición](./challenges/level-5/c5-2-pagos-simulados-y-cancelacion-con-reposicion.md)

---

### Nivel 6 — Integraciones: WebSockets, notificaciones y exportaciones


> **Nivel 6 disponible.** El estudiante solo conecta con `{{wsBaseUrl}}` y usa los endpoints; no instala ni arranca nada. **Solo anfitrión/profesor:** asegúrate de que `redis` y `worker` estén arrancados (`docker compose up -d --build`); en CI/e2e se usa `JOBS_QUEUE_MODE=inline` y no se necesita Redis.

- [C6.1 — WebSockets, chat y notificaciones](./challenges/level-6/c6-1-websockets-chat-y-notificaciones.md)
- [C6.2 — Exportaciones asíncronas](./challenges/level-6/c6-2-exportaciones-asincronas.md)

---

### Proyecto final sugerido

- [Proyecto final sugerido](./challenges/proyecto-final/proyecto-final.md)

---

## 4. Tabla de escenarios del simulador

La configuración se guarda **por espacio** y persiste. Actívala con `PATCH /spaces/me/scenarios` (espacio personal) o `PATCH /spaces/:spaceId/scenarios` (equipo, solo `ADMINISTRADOR`). Los cambios solo afectan al espacio resuelto por tu token o `x-space-id`. **Desactiva siempre al terminar.**

| Escenario | Clave | Activación (`PATCH .../scenarios`) | Qué debe observar el estudiante |
|---|---|---|---|
| Respuesta lenta | `slowResponse` | `{"slowResponse":true}` | Misma respuesta tras ~1 s: spinner/indicador de carga y cancelación |
| Latencia > timeout | `timeout` | `{"timeout":true}` | Respuesta tras el tope configurado (3 s): tu cliente debe abortar y avisar |
| Error temporal | `temporary503` | `{"temporary503":true}` | `503` con `error.code = SIMULATED_503`: reintento con backoff |
| Sesión vencida | `sessionExpired` | `{"sessionExpired":true}` | `401 AUTH_TOKEN_EXPIRED`: renovar con `/auth/refresh` y repetir la petición |
| Permiso insuficiente | `insufficientPermission` | `{"insufficientPermission":true}` | `403 INSUFFICIENT_ROLE`: distinguir autenticación de autorización |
| Lista vacía | `emptyList` | `{"emptyList":true}` | `200` con `data: []` y `meta.total: 0`: estado vacío, no error |
| Gran volumen | `largeVolume` | `{"largeVolume":true}` | Lista grande acotada (≤ 500): paginación y rendimiento de UI |
| Edición simultánea | `concurrentEdit` | `{"concurrentEdit":true}` | `409 VERSION_CONFLICT` en `PATCH`/`PUT`: recargar versión y resolver |
| Límite alcanzado | `rateLimit` | `{"rateLimit":true}` | `429 RATE_LIMITED` con `Retry-After: 5`: esperar antes de reintentar |
| Archivo inválido | `invalidFile` | `{"invalidFile":true}` | `400 INVALID_FILE_TYPE` al subir multipart: validar antes de enviar |
| Pedido repetido | `duplicateOrder` | `{"duplicateOrder":true}` | `201` con el mismo pedido al repetir `POST /orders`: misma idempotencia, sin doble descuento de stock; ver Nivel 5 |
| Trabajo asíncrono fallido | `failedAsyncJob` | `{"failedAsyncJob":true}` | Los export jobs del espacio terminan en `FAILED` con error reproducible; ver Nivel 6 |

Comprobación rápida de limpieza en Postman: `Simulator › Desactivar todos los escenarios (limpieza)`, o (opcional, con `curl` contra la URL pública):

```bash
BASE_URL='https://<TU-TUNNEL>.trycloudflare.com/api/v1'
curl -X PATCH -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"slowResponse":false,"timeout":false,"temporary503":false,"sessionExpired":false,
       "insufficientPermission":false,"emptyList":false,"largeVolume":false,
       "concurrentEdit":false,"rateLimit":false,"invalidFile":false,"duplicateOrder":false,
       "failedAsyncJob":false}' \
  "$BASE_URL/spaces/me/scenarios"
```

---

## 5. Rúbrica de evaluación simple

Cada dimensión se puntúa de **0 a 4** por nivel. La nota del nivel es el promedio; el proyecto final promedia los niveles 1-6 (si no entregas el Nivel 6, indícalo explícitamente en la tabla de challenges resueltos).

| Puntuación | Funcional | Errores | Persistencia | Aislamiento | Documentación |
|---|---|---|---|---|---|
| **0** | No implementado | No los maneja | No comprueba | No lo considera | No entrega |
| **1** | Solo con ayuda | Muestra el error crudo | Recarga y pierde datos | Mezcla espacios | Sin instrucciones |
| **2** | Flujo feliz funciona | Cubre 401/404 | Recarga y conserva datos | Distingue su espacio | README básico |
| **3** | Flujo feliz + validación | Cubre 409/422/429 y `requestId` | Recarga tras PATCH/DELETE | Demuestra reset y roles | Capturas y pasos reproducibles |
| **4** | Casos límite y UX | Reintenta con backoff y timeouts | Concurrencia y consistencia | Demuestra dos espacios y dos usuarios | Guía reproducible + decisiones |

**Interpretación rápida:** 3 es «aprobado con buen nivel»; 4 implica que otra persona puede repetir tu demostración sin preguntarte nada.

---

## 6. Checklist anti-errores

Marca antes de entregar:

- [ ] **Precio en unidad mínima:** `49900` es 499.00 MXN; nunca `499.00` como entero ni sumas decimales.
- [ ] **UUIDs reales:** IDs y `categoryId` son UUID; los texts/no-UUID dan `422`, no `500`.
- [ ] **ISO 8601 UTC:** `2030-01-01T00:00:00Z` en `dueAt`, `dueBefore`, `dueAfter`.
- [ ] **204 sin cuerpo:** `DELETE` y `POST /auth/logout` no traen JSON; no llames `response.json()` en `204`.
- [ ] **`version` para conflictos:** todo `PATCH` de productos, notas, categorías y tareas la incluye; `409 VERSION_CONFLICT` se recarga y se reintenta una vez.
- [ ] **`x-space-id` no es autenticación:** separa datos; el token decide identidad y roles.
- [ ] **No exponer tokens:** ni en logs, ni capturas, ni README, ni archivos entregados; limpia `email`/`password` del environment antes de compartirlo.
- [ ] **Correos propios, sin UI de Mailpit:** abre `{{hostUrl}}/portal` → *Mis correos de prueba* (`GET {{baseUrl}}/mail/me`). La UI de Mailpit queda en el anfitrión y no se expone.
- [ ] **URL pública vigente:** usa la que te dio el profesor (cambia en cada ejecución); API en `{{baseUrl}}`, health en `{{hostUrl}}/health/...`, Swagger en `{{hostUrl}}/docs`. Si eres el anfitrión, tu puerto local por defecto es `3100`, pero nunca lo compartas como URL de estudiante.
- [ ] **Demo pública es solo lectura:** sin `x-space-id`, escribir responde `403 DEMO_READ_ONLY`.
- [ ] **Escenarios limpios:** desactivaste todos los del simulador al terminar.
- [ ] **Etapa 4:** conecta el socket por `/socket.io` con el access token, guarda `lastEventId` para el replay y desactiva `failedAsyncJob` al terminar.

---

## 7. Cómo entregar la solución

Entrega un paquete con:

1. **Código del cliente** (web/Android/iOS/escritorio) con un `README.md` propio: requisitos, arranque, la URL pública utilizada y credenciales de práctica (sin secretos reales). Si eres el anfitrión y documentas tu entorno local, etiquétalo como tal (`APP_HOST_PORT` / puerto 3100).
2. **Capturas** de los flujos principales: catálogo paginado, CRUD en sandbox, login/refresh/perfil, notas, tareas, archivos, roles y al menos un error con `requestId` visible.
3. **Logs** de `curl -i` o de la consola del cliente para: `201`, `204`, `404`, `422`, `409`, `429` y `503`. Incluye la cabecera `Retry-After` en el `429`.
4. **Evidencia de aislamiento**, que es la comprobación más importante. Entrega:
   - Los dos UUID de sandbox A y B (pueden ir en texto; no son secretos).
   - Captura o log del producto creado en A **visible en A** y **ausente en B**.
   - Captura o log del reset de A: A queda vacío y B intacto.
   - Para roles: captura del `403 INSUFFICIENT_ROLE` del `LECTOR` y del `POST` exitoso del `EDITOR`, ambos con `x-space-id: <teamSpaceId>`.
   - Para usuarios: captura del `404` al pedir una nota ajena con un token distinto.
5. **Tabla de challenges resueltos** con nivel, ID, criterios marcados y puntuación de la rúbrica.
6. **Decisiones tomadas**: por ejemplo, cómo guardas el refresh token, cómo reintentas un `429` y cómo evitas exponer tokens.

**Importante:** antes de compartir, revisa que no haya contraseñas, tokens ni correos reales en capturas o logs. Si exportas el environment de Postman, limpia `email` y `password` (`password` ya está marcado como `secret` y con `initialValue` vacío).

---

*Guía alineada con `propuesta_backend_estudiantes.md` (secciones 3, 4, 6-8, 10, 11 y 14) y con el estado real del código: Etapas 1 a 4 implementadas; Nivel 6 disponible.*
