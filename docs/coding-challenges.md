# Guía de coding challenges — Backend de prácticas

Esta guía es tu hoja de ruta para practicar integración de clientes (web, Android, iOS o escritorio) contra el backend de prácticas. Cada desafío se puede resolver **con la colección de Postman o con `curl`**: no necesitas permisos especiales ni tocar el código del servidor.

> **Estado real del backend:** Etapas **1, 2 y 3 implementadas**. Etapa **4 pendiente**. El Nivel 5 (carrito, pedidos, stock, pagos e idempotencia) **ya está disponible**; el Nivel 6 sigue siendo especificación para la Etapa 4: **no intentes ejecutarlo todavía**.

---

## 1. Introducción

### Cómo usar esta guía

1. Empieza por el **Nivel 0** y avanza en orden. Cada nivel reutiliza lo anterior.
2. Para cada desafío lee el **objetivo**, sigue los **pasos**, y comprueba los **criterios de aceptación** antes de pasar al siguiente.
3. Usa la **pista** si te atascas, y la **extensión opcional** si quieres subir el nivel.
4. Al terminar un nivel, anota qué comprobaste y guarda tus capturas/logs según la sección [Cómo entregar la solución](#7-cómo-entregar-la-solución).

No modifiques el código del backend: aquí el objetivo es **consumir** la API, no cambiarla.

### Requisitos

- Docker Engine 29+ y Docker Compose v5+ para arrancar el servicio.
- Opcional: Node 20.18.1 (ver `.nvmrc`) y npm si prefieres los scripts `npm run project:*`.
- `curl` y, si quieres, `jq` para leer JSON en terminal.
- Postman (app o web) para usar la colección.
- Un editor para escribir tus clientes de ejemplo (JavaScript/TypeScript o Kotlin/Retrofit).

### Arranque rápido

```bash
cp .env.example .env       # macOS / Linux: revisa APP_HOST_PORT=3100; NUNCA versiones .env
./start.sh                 # equivalente: npm run project:start
```

```powershell
Copy-Item .env.example .env   # Windows: revisa APP_HOST_PORT=3100; NUNCA versiones .env
.\start.ps1                   # equivalente: .\start.cmd | npm run project:start:win
```

Espera a que `start.sh` / `start.ps1` termine: ejecuta migraciones, espera `GET /health/ready` y aplica el seed idempotente. Para apagar: `./stop.sh` / `.\stop.ps1` / `.\stop.cmd` / `npm run project:stop:win`. Para reiniciar: `./restart.sh` / `.\restart.ps1` / `.\restart.cmd` / `npm run project:restart:win` (acepta `--no-seed` / `-NoSeed` para no resembrar).

> Los ejemplos con `curl` de esta guía funcionan tal cual en bash y en PowerShell 7; en Windows también puedes usar `Invoke-WebRequest`.

**URLs base de este entorno:**

| Recurso | URL |
|---|---|
| API | `http://localhost:3100/api/v1` |
| Swagger UI | `http://localhost:3100/docs` |
| Health (fuera de `/api/v1`) | `http://localhost:3100/health/live` y `http://localhost:3100/health/ready` |
| Mailpit (solo en el host) | `http://127.0.0.1:8025` |

**Usuario de prueba del seed (solo desarrollo):**

```
email:    estudiante@practicas.local
password: Estudiante.123
```

Si tu `.env` usa otro puerto, cambia `3100` por `APP_HOST_PORT` en todos los ejemplos.

### Importar Postman

1. Importa **los dos archivos**: `postman/backend-practicas.postman_collection.json` y `postman/backend-practicas.postman_environment.json`.
2. Selecciona el environment **Backend Prácticas - Local (desarrollo)**.
3. Verifica `baseUrl = http://localhost:3100/api/v1` y `hostUrl = http://localhost:3100`.
4. **Ejecuta primero `Auth › Login (pobla accessToken/refreshToken)`**. Sin ese paso, los requests con Bearer devuelven `401`. Los scripts de test autopueblan `accessToken`, `refreshToken`, `userId` y los IDs/versiones de productos, notas, categorías, tareas y archivos.
5. Si usas otro puerto, edita **ambas** variables (`baseUrl` y `hostUrl`).

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

Disponible desde la Etapa 3: carrito, pedidos, pagos simulados e idempotencia (Nivel 5). Pendientes (Etapa 4): WebSockets, worker/Redis, notificaciones y exportaciones; portal del estudiante y flujo web con cookies `HttpOnly` + CSRF (hoy se usa `Authorization: Bearer`).

---

## 2. Ruta de nivel

| Nivel | Tema | Proyecto sugerido | Estado | Desafíos |
|---|---|---|---|---|
| 0 | Preparación del entorno | Arrancar la API y ejecutar Postman | Disponible | 2 |
| 1 | Inicial | Catálogo público: listado y detalle | Disponible | 4 |
| 2 | Básico | CRUD de productos en sandbox anónimo | Disponible | 4 |
| 3 | Intermedio | Registro, login, perfil y notas privadas | Disponible | 5 |
| 4 | Intermedio avanzado | Categorías, tareas, archivos, roles y simulador | Disponible | 5 |
| 5 | Avanzado | Carrito, pedidos, stock, pagos e idempotencia | **Disponible (Etapa 3)** | 2 |
| 6 | Integraciones | WebSockets, notificaciones y exportaciones | **Requiere Etapa 4 (pendiente)** | 2 |

Después del Nivel 6 encontrarás el **proyecto final sugerido**. **Total: 24 desafíos.**

> Convención de los ejemplos: `TOKEN` es tu `accessToken`, `<uuid>` un identificador real copiado de una respuesta, y `<spaceId>` el UUID de tu sandbox o equipo. Sustituye siempre los marcadores por valores reales.

---

## 3. Desafíos por nivel

### Nivel 0 — Preparación del entorno

#### C0.1 — Arranca el backend y comprueba que está vivo

**Objetivo de aprendizaje:** distinguir los endpoints de operación (health) de los de negocio (`/api/v1`) y verificar que el arranque terminó antes de consumir la API.

**Endpoints exactos**

- `GET http://localhost:3100/health/live`
- `GET http://localhost:3100/health/ready`
- `GET http://localhost:3100/api/v1/public/products?page=1&limit=20`
- Swagger: `http://localhost:3100/docs`

**Pasos**

1. Comprueba que `.env` existe y que `APP_HOST_PORT=3100`.
2. Ejecuta `./start.sh` (macOS/Linux) o `.\start.ps1` / `.\start.cmd` / `npm run project:start:win` (Windows) y espera a que imprima las URLs reales (incluye la espera de migraciones y health).
3. Comprueba liveness y readiness:
   ```bash
   curl -i http://localhost:3100/health/live
   curl -i http://localhost:3100/health/ready
   ```
4. Pide la demo pública:
   ```bash
   curl 'http://localhost:3100/api/v1/public/products?page=1&limit=20'
   ```
5. Abre `http://localhost:3100/docs` y localiza los mismos endpoints.

**Criterios de aceptación**

- [ ] `/health/live` y `/health/ready` responden `200` **sin** el prefijo `/api/v1`.
- [ ] El listado de demo responde `200` con `data` y `meta` (no un array suelto).
- [ ] Swagger carga y muestra `public/products`, `auth`, `users`, `spaces`, `categories`, `products`, `notes`, `tasks`, `files`.
- [ ] No detuviste contenedores de otros proyectos.

**Pista:** readiness puede responder `503` mientras las migraciones corren; espera y repite.

**Errores comunes:** usar `localhost:3000` aunque el entorno publique `3100`; buscar `/api/v1/health/live`; lanzar peticiones antes de que `start.sh` termine; ejecutar `docker compose down -v` y perder los volúmenes.

**Extensión opcional:** guarda la salida de los dos health checks en `evidencia/health.txt` con `curl -sS ... | tee`.

---

#### C0.2 — Importa Postman y ejecuta tu primer flujo autenticado

**Objetivo de aprendizaje:** entender el flujo de la collection y cómo los scripts de test autopueblan tokens e IDs.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/login`
- `GET {{baseUrl}}/users/me`
- `GET {{hostUrl}}/health/ready`

**Pasos**

1. Importa collection y environment (sección [Importar Postman](#importar-postman)). Selecciona el environment.
2. Ejecuta `Health › Readiness`.
3. Ejecuta `Auth › Login (pobla accessToken/refreshToken)` con `estudiante@practicas.local` / `Estudiante.123`.
4. Abre la pestaña *Tests* del request de login y comprueba que `accessToken`, `refreshToken` y `userId` quedaron escritos en el environment.
5. Ejecuta `Users › Obtener mi perfil` y repite lo mismo con `curl`:
   ```bash
   TOKEN=$(curl -s -H 'Content-Type: application/json' \
     -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
     http://localhost:3100/api/v1/auth/login | jq -r .data.tokens.accessToken)

   curl -i -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/users/me
   ```

**Criterios de aceptación**

- [ ] Login responde `200` y `data.tokens.accessToken` / `data.tokens.refreshToken` no están vacíos.
- [ ] `GET /users/me` responde `200` con `{ "data": { ... } }` usando el token.
- [ ] Sin header `Authorization`, `GET /users/me` responde `401`.
- [ ] Los IDs y versiones se autopueblan tras crear recursos.

**Pista:** si los requests con Bearer devuelven `401`, ejecuta `Auth › Login` otra vez; es el primer paso de la collection.

**Errores comunes:** no seleccionar environment; olvidar la palabra `Bearer`; borrar las credenciales del environment y no volver a escribirlas; pegar el `refreshToken` donde va el `accessToken`.

**Extensión opcional:** crea una carpeta propia en Postman con solo los requests de tu nivel y un `Pre-request Script` que valide que `accessToken` no esté vacío.

---

### Nivel 1 — Inicial: catálogo público

Aquí no hay login: solo lectura de la demo pública. Todo lo que escribas en la demo sin `x-space-id` debe fallar con `403 DEMO_READ_ONLY`.

#### C1.1 — Listar el catálogo público

**Objetivo de aprendizaje:** interpretar la forma estándar de un listado paginado y reconocer importes en unidad mínima.

**Endpoints exactos**

- `GET {{baseUrl}}/public/products?page=1&limit=10`
- `GET {{baseUrl}}/public/categories?page=1&limit=10`

**Pasos**

1. Pide el listado con `curl` o con `Public Products › Demo pública: listar productos (sin x-space-id)`.
2. Identifica `data`, `meta.page`, `meta.limit`, `meta.total` y `meta.totalPages`.
3. Comprueba que `price` es un entero y que viene acompañado de `currency`.
4. Pide también `GET /public/categories`; en la demo solo aparecen categorías **activas**.

```bash
curl 'http://localhost:3100/api/v1/public/products?page=1&limit=10'
curl 'http://localhost:3100/api/v1/public/categories?page=1&limit=10'
```

**Criterios de aceptación**

- [ ] Respuesta `200` con `{ data, meta }`.
- [ ] `data.length <= limit` y `meta.totalPages >= 1`.
- [ ] Ningún `price` tiene decimales ni coma: es un entero en unidad mínima.
- [ ] Tu cliente muestra nombre, precio formateado (p. ej. `49900` → `499.00 MXN`) y moneda.

**Pista:** `meta.total` es el total de registros, no el tamaño de la página actual.

**Errores comunes:** dividir el precio entre 100 en el servidor (no debes modificarlo); asumir que `data` es un array directo; pensar que puedes crear productos en la demo.

**Extensión opcional:** muestra el catálogo como tabla en consola con `fetch` y formatea la moneda con `Intl.NumberFormat`.

---

#### C1.2 — Detalle de producto y errores 404

**Objetivo de aprendizaje:** usar un UUID real desde el listado y entender la envoltura `{ data }` y el contrato de error.

**Endpoints exactos**

- `GET {{baseUrl}}/public/products/:id`
- `GET {{baseUrl}}/public/products/00000000-0000-0000-0000-000000000000` (UUID inexistente)

**Pasos**

1. Copia un `id` del listado anterior (o usa `{{productId}}` si ya lo autopoblaste).
2. Pide el detalle:
   ```bash
   curl -i http://localhost:3100/api/v1/public/products/<uuid>
   ```
3. Repite con un UUID inexistente y con un texto que no sea UUID.
4. Compara los códigos de estado y los cuerpos de error; anota el `requestId`.

**Criterios de aceptación**

- [ ] El detalle existente responde `200` con `{ "data": { "id", "name", "price", "stock", ... } }`.
- [ ] El UUID inexistente responde `404` con `{ error: { code, message }, requestId }`.
- [ ] Un ID no-UUID responde `422` (validación) y no `500`.
- [ ] Tu cliente muestra un mensaje de error al usuario en lugar de romperse.

**Pista:** el `requestId` sirve para reportar un fallo; guárdalo en tus logs.

**Errores comunes:** usar el `name` en lugar del `id`; esperar un array en el detalle; ignorar `requestId`; confundir `404` (no visible) con `403` (sin permiso).

**Extensión opcional:** escribe una función `getProduct(id)` en TypeScript que tipifique `data` y lance un error con `error.code` y `requestId`.

---

#### C1.3 — Paginación, búsqueda, filtros y orden

**Objetivo de aprendizaje:** dominar query params y validarlos desde el cliente.

**Endpoints exactos**

- `GET {{baseUrl}}/public/products?page=1&limit=5&sort=price&order=asc`
- `GET {{baseUrl}}/public/products?search=keyboard`
- `GET {{baseUrl}}/public/products?status=ACTIVE`
- `GET {{baseUrl}}/public/products?categoryId=<uuid>`

Campos de orden válidos para productos: `name`, `price`, `stock`, `createdAt`, `updatedAt`; `order` es `asc` o `desc`. `limit` va de 1 a 100. `search` busca en nombre y descripción.

**Pasos**

1. Pide `page=1&limit=5&sort=price&order=asc` y luego `page=2` con el mismo `limit`.
2. Compara que los ítems de la página 2 no se repitan y que los precios estén ordenados.
3. Prueba `search=keyboard` y `status=ACTIVE`.
4. Prueba `sort=precio` (inválido) y `limit=0` para ver la validación.

```bash
curl 'http://localhost:3100/api/v1/public/products?page=1&limit=5&sort=price&order=asc'
curl 'http://localhost:3100/api/v1/public/products?search=keyboard'
curl 'http://localhost:3100/api/v1/public/products?sort=precio'
```

**Criterios de aceptación**

- [ ] La página 2 respeta `limit` y no repite IDs de la página 1.
- [ ] `sort=price&order=asc` ordena de menor a mayor; `desc` invierte el orden.
- [ ] `search` devuelve solo productos cuyo nombre o descripción coinciden.
- [ ] Parámetros inválidos responden `422` con `error.fields`.

**Pista:** en `curl`, encierra la URL entre comillas simples para que `&` no sea interpretado por el shell.

**Errores comunes:** enviar `order` sin `sort`; `limit=0` o `limit>100`; construir la URL sin escapar acentos/espacios; asumir que `search` diferencia mayúsculas sin comprobarlo.

**Extensión opcional:** declara el servicio en Kotlin/Retrofit y comprueba la paginación desde Android:

```kotlin
interface ProductsApi {
    @GET("public/products")
    suspend fun list(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        @Query("search") search: String? = null,
        @Query("sort") sort: String? = null,
        @Query("order") order: String? = null,
    ): Response<Paged<ProductDto>>
}

data class Paged<T>(val data: List<T>, val meta: Meta)
data class Meta(val page: Int, val limit: Int, val total: Int, val totalPages: Int)
```

---

#### C1.4 — Estado vacío controlado con el simulador

**Objetivo de aprendizaje:** diseñar la interfaz para listas vacías usando un escenario reproducible.

**Endpoints exactos**

- `PATCH {{baseUrl}}/spaces/me/scenarios` con `{ "emptyList": true }`
- `GET {{baseUrl}}/products?page=1&limit=10` (espacio personal autenticado)
- `PATCH {{baseUrl}}/spaces/me/scenarios` con `{ "emptyList": false }` (limpieza)

**Pasos**

1. Ejecuta `Auth › Login` para tener `accessToken`.
2. Activa el escenario en tu espacio personal (la configuración persiste por espacio):
   ```bash
   curl -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"emptyList":true}' http://localhost:3100/api/v1/spaces/me/scenarios
   ```
3. Pide `GET /products` con el token; comprueba `data: []` y `meta.total: 0`.
4. Muestra en tu cliente un mensaje tipo «Aún no hay productos».
5. **Desactiva siempre el escenario** con `{"emptyList":false}` (o el request `Simulator › Desactivar todos los escenarios (limpieza)`).

**Criterios de aceptación**

- [ ] Respuesta `200`, no `404`: una lista vacía no es un error.
- [ ] `data` es `[]` y `meta.total = 0`.
- [ ] La interfaz muestra un estado vacío y no una tabla rota.
- [ ] El escenario queda desactivado al terminar.

**Pista:** usa `GET /products` (con token) y no `/public/products`: el escenario se configura en tu espacio personal, no en la demo.

**Errores comunes:** olvidar la limpieza y pensar que «la API se rompió»; activar escenarios en un espacio de equipo sin ser administrador; tratar `total: 0` como fallo de red.

**Extensión opcional:** añade un botón «Recargar» y un esqueleto de carga; combina con `slowResponse` en el desafío C4.5.

---

### Nivel 2 — Básico: CRUD en sandbox anónimo

El sandbox se crea sin login y se identifica con `x-space-id`. Recuerda: **ese header separa datos, pero no autentica a nadie**.

#### C2.1 — Crea tu sandbox y haz CRUD de productos

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
   SANDBOX=$(curl -s -X POST http://localhost:3100/api/v1/public/sandboxes | jq -r .data.spaceId)
   echo "$SANDBOX"
   ```
2. Crea un producto (precio en centavos, moneda de 3 letras):
   ```bash
   curl -i -H "x-space-id: $SANDBOX" -H 'Content-Type: application/json' \
     -d '{"name":"Teclado","description":"Mecánico","price":49900,"currency":"MXN","stock":10}' \
     http://localhost:3100/api/v1/public/products
   ```
3. Lista y detalla el producto con el mismo header; guarda su `id` y `version`.
4. Actualiza el nombre:
   ```bash
   curl -X PATCH -H "x-space-id: $SANDBOX" -H 'Content-Type: application/json' \
     -d '{"name":"Teclado mecánico","version":1}' \
     http://localhost:3100/api/v1/public/products/<uuid>
   ```
5. Borra el producto y comprueba que el borrado no trae cuerpo:
   ```bash
   curl -i -X DELETE -H "x-space-id: $SANDBOX" \
     http://localhost:3100/api/v1/public/products/<uuid>
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
const BASE = 'http://localhost:3100/api/v1';
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

#### C2.2 — Conflicto de versión: 409 `VERSION_CONFLICT`

**Objetivo de aprendizaje:** aplicar control de concurrencia optimista en ediciones.

**Endpoints exactos**

- `PATCH {{baseUrl}}/public/products/:id` con `{ "version": 999, ... }`
- `PATCH {{baseUrl}}/public/products/:id` con la versión real

**Pasos**

1. Crea un producto en tu sandbox y anota su `version`.
2. Envía un `PATCH` con `version: 999` y observa el `409`.
3. Envía el mismo cambio con la versión correcta y observa el `200` y el nuevo valor de `version`.
4. Repite el paso 2 con la versión ya desactualizada: debe volver a fallar.
5. En Postman usa `Public Products › Sandbox anónimo: editar producto (usa {{publicVersion}})` y el request «con versión obsoleta (409)».

```bash
curl -i -X PATCH -H "x-space-id: $SANDBOX" -H 'Content-Type: application/json' \
  -d '{"name":"Cambio que falla","version":999}' \
  http://localhost:3100/api/v1/public/products/<uuid>
```

**Criterios de aceptación**

- [ ] Con `version` obsoleta: `409` y `error.code = VERSION_CONFLICT`.
- [ ] El cuerpo incluye `requestId`.
- [ ] Con la versión correcta: `200` y `version` incrementada.
- [ ] Tu cliente recarga la versión antes de reintentar; no sobrescribe cambios ajenos a ciegas.

**Pista:** la versión cambia en **cada** actualización; guárdala junto al producto en tu estado local.

**Errores comunes:** omitir `version` (da `422`, no `409`); enviar la versión como string; reintentar indefinidamente con la misma versión; confundir `409` de versión con el `409` de nombre de categoría duplicado.

**Extensión opcional:** implementa un reintento que, ante `409`, vuelva a pedir el detalle, actualice la versión y reaplique el cambio una sola vez.

---

#### C2.3 — Límite de peticiones: 429 y `Retry-After`

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
     http://localhost:3100/api/v1/products?page=1&limit=10
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
    const res = await fetch(`http://localhost:3100/api/v1${path}`, {
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

#### C2.4 — Aislamiento entre sandboxes y reset

**Objetivo de aprendizaje:** demostrar que dos espacios anónimos no comparten datos y que un reset afecta solo al espacio pedido.

**Endpoints exactos**

- `POST {{baseUrl}}/public/sandboxes` (dos veces)
- `POST {{baseUrl}}/public/products` con cada `x-space-id`
- `GET {{baseUrl}}/public/products` con cada `x-space-id`
- `POST {{baseUrl}}/public/sandboxes/:spaceId/reset`
- `POST {{baseUrl}}/public/sandboxes/demo-publico/reset` (restaurar demo)

**Pasos**

1. Crea dos sandboxes A y B; guarda ambos UUID.
2. Crea un producto solo en A.
3. Lista productos con `x-space-id: A` y con `x-space-id: B`.
4. Reinicia A con `POST /public/sandboxes/A/reset`.
5. Lista A (vacío) y B (sin cambios).
6. Restaura la demo con `POST /public/sandboxes/demo-publico/reset` si la modificaste.

```bash
A=$(curl -s -X POST http://localhost:3100/api/v1/public/sandboxes | jq -r .data.spaceId)
B=$(curl -s -X POST http://localhost:3100/api/v1/public/sandboxes | jq -r .data.spaceId)

curl -H "x-space-id: $A" -H 'Content-Type: application/json' \
  -d '{"name":"Solo en A","price":1000,"stock":1}' \
  http://localhost:3100/api/v1/public/products

curl -H "x-space-id: $A" http://localhost:3100/api/v1/public/products
curl -H "x-space-id: $B" http://localhost:3100/api/v1/public/products

curl -X POST http://localhost:3100/api/v1/public/sandboxes/$A/reset
```

**Criterios de aceptación**

- [ ] El producto aparece con A y **no** aparece con B.
- [ ] Tras el reset de A, `meta.total = 0` en A y B conserva sus datos (o sigue vacío).
- [ ] El reset no afectó a la demo ni al espacio personal de otros estudiantes.
- [ ] Puedes explicar con tus propias palabras por qué `x-space-id` no es autenticación.

**Pista:** imprime los dos UUID en tu log y compruébalos en cada `curl`; el error más común es mezclarlos.

**Errores comunes:** usar el mismo header en ambas peticiones; creer que el reset borra volúmenes o la base completa; usar el slug `demo-publico` como si fuera tu sandbox.

**Extensión opcional:** automatiza la comprobación en un script que falle si B ve el producto de A.

---

### Nivel 3 — Intermedio: cuenta, sesión y notas privadas

A partir de aquí usas `Authorization: Bearer <accessToken>`. Sin `x-space-id` trabajas en tu espacio personal.

#### C3.1 — Registrar una cuenta nueva

**Objetivo de aprendizaje:** crear usuarios y entender validación de contraseña y correo único.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/register`

**Pasos**

1. Regístrate con un correo propio de prueba (no el del seed):
   ```bash
   curl -i -H 'Content-Type: application/json' \
     -d '{"email":"tu.alumno@practicas.local","name":"Tu Nombre","password":"Alumno.123"}' \
     http://localhost:3100/api/v1/auth/register
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

#### C3.2 — Login y uso seguro del token de acceso

**Objetivo de aprendizaje:** obtener tokens y enviarlos correctamente en cada petición protegida.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/login`
- `GET {{baseUrl}}/users/me`

**Pasos**

1. Haz login con tu usuario (o con el del seed):
   ```bash
   LOGIN=$(curl -s -H 'Content-Type: application/json' \
     -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
     http://localhost:3100/api/v1/auth/login)
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

#### C3.3 — Refresh y logout: rotación y revocación

**Objetivo de aprendizaje:** mantener la sesión y cerrarla correctamente.

**Endpoints exactos**

- `POST {{baseUrl}}/auth/refresh` con `{ "refreshToken": "..." }`
- `POST {{baseUrl}}/auth/logout` con `{ "refreshToken": "..." }` → `204`

**Pasos**

1. Tras el login, guarda `refreshToken` y llama a `POST /auth/refresh`.
2. Guarda el nuevo par de tokens y comprueba que el refresh anterior ya no sirve (se revoke al rotar).
3. Usa el nuevo access token en `GET /users/me`.
4. Cierra sesión con `POST /auth/logout` y comprueba que el último refresh token deja de funcionar.

```bash
curl -i -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}' \
  http://localhost:3100/api/v1/auth/refresh

curl -i -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshTokenNuevo>"}' \
  http://localhost:3100/api/v1/auth/logout
```

**Criterios de aceptación**

- [ ] Refresh `200` con un par nuevo de tokens distinto al anterior.
- [ ] Reutilizar el refresh token anterior falla con `401`.
- [ ] Logout responde `204` **sin cuerpo**.
- [ ] Después del logout, el refresh token revocado no permite obtener tokens.

**Pista:** en Postman ejecuta `Auth › Refresh (rota y guarda nuevos tokens)` y luego `Auth › Logout`; la rotación se comprueba guardando `previousRefreshToken`.

**Errores comunes:** enviar el access token en `/auth/refresh`; seguir usando el token viejo tras la rotación; esperar un cuerpo en el `204`; hacer logout con el token de otro usuario.

**Extensión opcional:** implementa en TypeScript un `fetch` que ante `401` haga refresh **una sola vez** y repita la petición original.

---

#### C3.4 — Perfil y avatar

**Objetivo de aprendizaje:** editar datos personales y subir un avatar multipart.

**Endpoints exactos**

- `GET {{baseUrl}}/users/me`
- `PATCH {{baseUrl}}/users/me` con `{ "name", "avatarUrl"?, "avatarFileId"? }`
- `POST {{baseUrl}}/users/me/avatar` (multipart, campo `avatar`)
- `PUT {{baseUrl}}/users/me/password` (cambia la contraseña y revoca otras sesiones)
- `GET {{baseUrl}}/files?page=1&limit=10`

**Pasos**

1. Consulta tu perfil y cambia solo el `name`.
2. Sube una imagen pequeña como avatar:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -F 'avatar=@./foto.png;type=image/png' \
     http://localhost:3100/api/v1/users/me/avatar
   ```
3. Comprueba que `GET /users/me` devuelve la referencia al avatar y que `GET /files` lista el objeto.
4. **Opcional y con cuidado:** cambia la contraseña de un usuario de prueba propio con `PUT /users/me/password`; vuelve a hacer login porque las demás sesiones quedan revocadas. Evita cambiar la contraseña del usuario del seed.

**Criterios de aceptación**

- [ ] `PATCH /users/me` responde `200` con el nombre actualizado.
- [ ] `POST /users/me/avatar` responde `201`.
- [ ] El perfil refleja el avatar (o `avatarFileId`) y el archivo aparece en `GET /files`.
- [ ] `PUT /users/me/password` con contraseña actual incorrecta responde error, no `500`.

**Pista:** el campo del formulario se llama `avatar`, no `file`; para subir otros archivos usa `POST /files` con campo `file`.

**Errores comunes:** enviar el avatar en base64 dentro de JSON; usar el campo `file`; subir un tipo no permitido; cambiar la contraseña sembrada y dejar a otros estudiantes sin login.

**Extensión opcional:** sube primero a `POST /files` con `kind=AVATAR` y luego usa el `id` devuelto en `PATCH /users/me` con `avatarFileId`.

---

#### C3.5 — Notas privadas: CRUD, filtros y propiedad

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
     http://localhost:3100/api/v1/notes
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

### Nivel 4 — Intermedio avanzado: categorías, tareas, archivos, roles y simulador

#### C4.1 — Categorías y su relación con productos

**Objetivo de aprendizaje:** gestionar catálogos jerárquicos y usar el ID de categoría como filtro.

**Endpoints exactos**

- `GET/POST {{baseUrl}}/categories`
- `GET {{baseUrl}}/categories/:id`
- `GET {{baseUrl}}/categories/:id/products?page=1&limit=10`
- `PATCH/DELETE {{baseUrl}}/categories/:id`
- Públicos: `GET {{baseUrl}}/public/categories`, `GET {{baseUrl}}/public/categories/:id`, `GET {{baseUrl}}/public/categories/:id/products`

Orden válido para categorías: `name`, `createdAt`, `updatedAt`; filtros `search`, `isActive`, `sort`, `order`.

**Pasos**

1. Crea una categoría con token:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"name":"Tecnología","isActive":true}' \
     http://localhost:3100/api/v1/categories
   ```
2. Crea un producto autenticado con `categoryId: <uuid>` y luego pide `GET /categories/:id/products`.
3. Cambia el nombre con `PATCH` y `version`; repite con versión obsoleta para ver el `409`.
4. Crea una categoría con el mismo nombre en el mismo espacio: `409 CATEGORY_NAME_CONFLICT`.
5. Compara `GET /categories` (todas) con `GET /public/categories` (solo activas de la demo).

**Criterios de aceptación**

- [ ] `POST /categories` responde `201` con `id` y `version`.
- [ ] `GET /categories/:id/products` devuelve `{ data, meta }` con los productos de esa categoría.
- [ ] Nombre duplicado en el mismo espacio: `409 CATEGORY_NAME_CONFLICT`.
- [ ] `PATCH` sin versión coincidente: `409 VERSION_CONFLICT`.
- [ ] La demo pública solo lista categorías activas y es de solo lectura.

**Pista:** `categoryId` debe ser un UUID; en Postman la variable `categoryId` se autopuebla al crear la categoría.

**Errores comunes:** usar el `slug` de la demo como `categoryId`; crear dos categorías con el mismo nombre esperando `422`; pensar que `/public/categories` muestra tus categorías privadas.

**Extensión opcional:** muestra un filtro por categoría en tu catálogo usando `?categoryId=<uuid>` en `GET /products`.

---

#### C4.2 — Tareas, subtareas y transiciones de estado

**Objetivo de aprendizaje:** modelar flujos de trabajo con estados válidos y validar reglas de negocio en el cliente.

**Endpoints exactos**

- `GET/POST {{baseUrl}}/tasks`
- `GET {{baseUrl}}/tasks/:id`
- `PATCH/DELETE {{baseUrl}}/tasks/:id`
- `POST {{baseUrl}}/tasks/:id/subtasks`
- `PATCH/DELETE {{baseUrl}}/tasks/:id/subtasks/:subtaskId`

Prioridades: `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Estados: `TODO`, `IN_PROGRESS`, `DONE`, `CANCELLED`. Filtros: `status` (separado por comas), `priority`, `dueBefore`, `dueAfter`, `search`, `mine`, `sort`, `order`.

**Transiciones válidas:** `TODO → IN_PROGRESS | CANCELLED`; `IN_PROGRESS → TODO | DONE | CANCELLED`; `DONE → IN_PROGRESS`; `CANCELLED → TODO`. Cualquier otra da `409 INVALID_STATUS_TRANSITION`.

**Pasos**

1. Crea una tarea con subtareas:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"title":"Preparar entorno","priority":"HIGH","dueAt":"2030-01-01T00:00:00Z",
          "subtasks":[{"title":"Node 20"},{"title":"Docker"}]}' \
     http://localhost:3100/api/v1/tasks
   ```
2. Lista con `?status=TODO,IN_PROGRESS&priority=HIGH&dueBefore=2031-01-01T00:00:00Z`.
3. Mueve la tarea `TODO → IN_PROGRESS → DONE` con `PATCH` y `version`.
4. Intenta `DONE → TODO`: debe responder `409 INVALID_STATUS_TRANSITION`.
5. Añade, marca y elimina una subtarea con los endpoints exactos.

**Criterios de aceptación**

- [ ] Creación `201` con subtareas incluidas en `data`.
- [ ] Los filtros por estado/prioridad/fecha devuelven el subconjunto correcto.
- [ ] Las transiciones válidas responden `200` e incrementan `version`.
- [ ] Una transición inválida responde `409` con `error.code = INVALID_STATUS_TRANSITION`.
- [ ] Las subtareas se pueden editar/borrar por su propio `subtaskId`.

**Pista:** en `PATCH`, `dueAt: null` quita la fecha límite; las fechas van en ISO 8601 UTC.

**Errores comunes:** saltar directamente `TODO → DONE`; usar `priority="ALTA"` en español; enviar `dueAt` sin zona horaria; actualizar una tarea con `version` viejo y culpar al filtro de estado.

**Extensión opcional:** dibuja un tablero Kanban y deshabilita en la UI los botones de transiciones no permitidas.

---

#### C4.3 — Subida, descarga y borrado de archivos (multipart)

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
     http://localhost:3100/api/v1/files
   ```
2. Lista metadatos, pide el detalle y descarga el archivo:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" http://localhost:3100/api/v1/files/<uuid>/download -o descarga.png
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

#### C4.4 — Roles de equipo: LECTOR, EDITOR, ADMINISTRADOR

**Objetivo de aprendizaje:** distinguir autenticación de autorización y trabajar en un espacio compartido.

**Endpoints exactos**

- `POST {{baseUrl}}/spaces/teams`
- `GET/POST {{baseUrl}}/spaces/:spaceId/members`
- `PATCH/DELETE {{baseUrl}}/spaces/:spaceId/members/:userId`
- `POST {{baseUrl}}/spaces/:spaceId/reset`
- `GET {{baseUrl}}/spaces/me`
- Cualquier CRUD con `x-space-id: <teamSpaceId>` (products, categories, notes, tasks, files)

**Pasos**

1. Crea un equipo con tu usuario administrador:
   ```bash
   curl -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"name":"Equipo de prácticas"}' \
     http://localhost:3100/api/v1/spaces/teams
   ```
2. Invita al segundo usuario de C3.1 como `EDITOR` con `POST /spaces/:spaceId/members`.
3. Haz login con ese usuario y crea una tarea enviando `x-space-id: <teamSpaceId>`: debe funcionar.
4. Cambia su rol a `LECTOR` con `PATCH /spaces/:spaceId/members/:userId`; repite la creación: `403 INSUFFICIENT_ROLE`.
5. Comprueba que un `LECTOR` sí puede hacer `GET /tasks` con la cabecera del equipo.
6. Como administrador, lista miembros y reinicia el equipo con `POST /spaces/:spaceId/reset`.

**Criterios de aceptación**

- [ ] El creador queda como `ADMINISTRADOR` y puede invitar/cambiar roles/remover/resetear.
- [ ] `EDITOR` crea/edita/elimina recursos del equipo, pero no gestiona miembros.
- [ ] `LECTOR` solo consulta; un `POST` responde `403 INSUFFICIENT_ROLE`.
- [ ] Sin `x-space-id`, cada usuario ve su espacio personal, no el del equipo.
- [ ] Un usuario que no es miembro no puede operar en el equipo.

**Pista:** el header `x-space-id` selecciona el espacio; el token decide **quién** eres. Necesitas ambos.

**Errores comunes:** invitar a un correo no registrado; creer que `x-space-id` otorga permisos; usar `userId` donde va `spaceId`; esperar que un `EDITOR` pueda cambiar roles.

**Extensión opcional:** escribe una tabla cliente de permisos por rol y comprueba que tu UI oculta las acciones no permitidas.

---

#### C4.5 — Simulador de errores: timeouts, 503 y conflictos

**Objetivo de aprendizaje:** hacer que tu cliente sea resistente a latencia, errores temporales y conflicts controlados.

**Endpoints exactos**

- `GET/PATCH {{baseUrl}}/spaces/me/scenarios`
- `GET/PATCH {{baseUrl}}/spaces/:spaceId/scenarios` (solo `ADMINISTRADOR`)
- `GET {{baseUrl}}/products?page=1&limit=10` (endpoint «víctima» de los escenarios)

**Pasos**

1. Consulta la configuración actual con `GET /spaces/me/scenarios`.
2. Activa un escenario a la vez y observa la respuesta; por ejemplo:
   ```bash
   curl -X PATCH -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
     -d '{"temporary503":true}' http://localhost:3100/api/v1/spaces/me/scenarios

   curl -i -H "Authorization: Bearer $ACCESS" \
     http://localhost:3100/api/v1/products?page=1&limit=10
   ```
3. Repite con `slowResponse`, `timeout`, `concurrentEdit` y `rateLimit` (ver tabla completa abajo).
4. Implementa en tu cliente: spinner con `slowResponse`, timeout con `timeout`, backoff con `temporary503` y `429`, y recarga de versión con `concurrentEdit`.
5. **Ejecuta siempre `Simulator › Desactivar todos los escenarios (limpieza)`** al terminar.

**Criterios de aceptación**

- [ ] `temporary503` produce `503 SIMULATED_503` y tu cliente reintenta con backoff.
- [ ] `timeout` hace que tu cliente aborte y muestre un mensaje, sin colgarse.
- [ ] `concurrentEdit` produce `409 VERSION_CONFLICT` en `PATCH`/`PUT`.
- [ ] `rateLimit` produce `429` y se respeta `Retry-After`.
- [ ] La configuración queda limpia; los escenarios no afectan a otros espacios.

**Pista:** los endpoints `/scenarios` y `/reset` están excluidos del interceptor: puedes desactivar los fallos aunque estén activos.

**Errores comunes:** activar todos los escenarios a la vez y no saber cuál causa cada síntoma; olvidar la limpieza (la configuración persiste por espacio); probar escenarios de equipo sin ser administrador; reintentar un `503` sin espera.

**Extensión opcional:** centraliza tus reintentos en una sola función `safeFetch(path, {timeoutMs, maxRetries})` y reutilízala en todos los niveles.

---

### Nivel 5 — Avanzado: carrito, pedidos, stock, pagos e idempotencia

Estos endpoints **ya existen** (Etapa 3, disponibles en `/docs`). Requieren `Authorization: Bearer <accessToken>`; sin `x-space-id` usan tu espacio personal. Un `LECTOR` solo consulta; `EDITOR` y `ADMINISTRADOR` pueden crear pedidos y pagar/cancelar.

#### C5.1 — Carrito, pedidos, stock e idempotencia

**Objetivo de aprendizaje:** diseñar flujos de negocio con totales calculados en servidor, stock consistente y pedidos sin duplicados.

**Endpoints exactos (bajo `/api/v1`)**

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/cart` | Carrito del usuario en el espacio, con totales del servidor |
| `POST` | `/cart/items` | Añadir `{ "productId": "<uuid>", "quantity": 2 }` |
| `PATCH` | `/cart/items/:productId` | Cambiar cantidad con `{ "quantity": 1 }` |
| `DELETE` | `/cart/items/:productId` | Quitar una línea (`204`) |
| `DELETE` | `/cart` | Vaciar el carrito (`204`) |
| `POST` | `/orders` | Crear pedido; exige cabecera `Idempotency-Key` |
| `GET` | `/orders?page=1&limit=10&status=PAID` | Listado paginado (filtro opcional) |
| `GET` | `/orders/:id` | Detalle con `items` y `payments` |
| `POST` | `/orders/:id/cancel` | Cancelar y reponer stock |

**Pasos**

1. Crea productos con stock (Etapa 2) y añádelos con `POST /cart/items`. El mismo producto acumula cantidad; se validan visibilidad en el espacio, stock, `quantity >= 1` y una sola moneda por carrito.
2. Pide `GET /cart`: `data` trae `items` (con datos del producto), `currency`, `itemCount`, `subtotal` y `total`; `meta` repite los totales. **No** sumes `price * quantity` en el cliente para decidir el importe final.
3. Crea el pedido con una clave estable generada por tu cliente (se recomienda UUID) y guárdala aunque la petición falle por timeout.
4. Repite el mismo `POST /orders` con la **misma** clave: respuesta `201` con el mismo `id`, `status` e `items`; el stock no se descuenta dos veces.
5. Fuerza una cantidad mayor al stock (o modifica el carrito directamente) y comprueba `409 INSUFFICIENT_STOCK` sin stock negativo ni pedido creado.
6. Cancela el pedido y verifica la reposición exacta de stock.

```http
POST /api/v1/orders
Authorization: Bearer <accessToken>
Content-Type: application/json
Idempotency-Key: 7c1f0e2a-9b44-4c1e-8f3a-2d5e6a7b8c90

{}
```

> El cuerpo es `{}`: el pedido se construye **desde el carrito del servidor**. No envíes `cartId`, `total` ni precios. Sin la cabecera: `422 VALIDATION_ERROR`; con carrito vacío: `409 EMPTY_CART`.

**Criterios de aceptación**

- [ ] `GET /cart` devuelve `{ data, meta }` con totales enteros en unidad mínima (p. ej. `2250` = 22.50 MXN).
- [ ] Cada `order.items[].unitPrice` y `name` son un snapshot del momento de la compra: cambiar el precio del producto después no altera el pedido.
- [ ] La misma `Idempotency-Key` devuelve el mismo `orderId` y estado, sin duplicar pedido ni descuento de stock.
- [ ] El stock se descuenta en una transacción y nunca queda negativo (`409 INSUFFICIENT_STOCK`).
- [ ] Un usuario distinto no ve tu pedido (`404 ORDER_NOT_FOUND`); un administrador del espacio sí puede ver los del equipo.
- [ ] Errores con `error.code` estable y `requestId`.

**Pista:** guarda la `Idempotency-Key` en tu cliente junto al intento; regenerarla en cada reintento rompe la idempotencia. Concuerda con la clave que envías al pagar.

**Errores comunes:** calcular totales en el cliente; reutilizar una clave para pedidos distintos; no persistir la clave ante un timeout; enviar `total` en el body; mezclar monedas en el carrito.

**Extensión opcional:** diseña la pantalla de confirmación con estados `PENDING_PAYMENT → PAID/FAILED → CANCELLED` y una cola local de reintentos.

---

#### C5.2 — Pagos simulados y cancelación con reposición

**Objetivo de aprendizaje:** modelar resultados de pago sin cobros reales y reconciliar pedidos.

**Endpoints exactos**

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/orders/:id/pay` | Simular pago con `{ "outcome": "APPROVED" \| "REJECTED" \| "PENDING" }` |
| `GET` | `/orders/:id` | Detalle con `payments[]` (`id`, `outcome`, `attempt`, `message`, `createdAt`) |
| `GET` | `/orders?status=FAILED` | Conciliar pedidos por estado |
| `POST` | `/orders/:id/cancel` | Cancelar pedido (del C5.1) |

No existen `/payments` ni `/payments/:id`: los intentos se consultan dentro del pedido.

**Transiciones válidas**

| Desde | Acción | Hasta | Stock |
|---|---|---|---|
| `PENDING_PAYMENT` | `APPROVED` | `PAID` | Sin cambios (ya descontado) |
| `PENDING_PAYMENT` | `REJECTED` | `FAILED` | Repuesto una sola vez |
| `PENDING_PAYMENT` | `PENDING` | `PENDING_PAYMENT` | Sin cambios; se registra el intento |
| `PENDING_PAYMENT` o `PAID` | `cancel` | `CANCELLED` | Repuesto una sola vez |

Cualquier otra transición responde `409 INVALID_STATUS_TRANSITION` (p. ej., pagar un pedido ya pagado, cancelar uno fallido o cancelar dos veces). Cancelar o rechazar **nunca** repone stock dos veces: campo `stockRestored` del pedido.

**Pasos**

1. Crea un pedido (C5.1) y simula un pago `APPROVED`: `200` con `status: PAID`.
2. Repite con otro pedido y `REJECTED`: `status: FAILED`, `payments[0].outcome = REJECTED` y stock repuesto.
3. Simula `PENDING` en un pedido nuevo: sigue `PENDING_PAYMENT` y puedes volver a pagar (nuevo `attempt`).
4. Cancela un pedido pagado y verifica la reposición de stock; repite la cancelación para ver el `409`.
5. Nunca introduzcas datos de tarjeta reales: es una simulación.

**Criterios de aceptación**

- [ ] `APPROVED`, `REJECTED` y `PENDING` producen estados verificables con intentos consecutivos.
- [ ] Un pago rechazado repone el stock exactamente una vez; un aprobado no lo modifica.
- [ ] Ningún cobro real: el servicio documenta que es simulado.
- [ ] Los errores siguen el contrato `{ error, requestId }`.

**Pista:** activa el escenario del simulador `duplicateOrder` (`PATCH /spaces/me/scenarios` con `{ "duplicateOrder": true }`) para forzar una clave repetida en `POST /orders` y practicar idempotencia sin gestionar claves a mano. Desactívalo al terminar.

**Errores comunes:** enviar tarjetas reales; confundir `PENDING` con `APPROVED`; cancelar dos veces y esperar doble reposición; usar `DECLINED` (el valor correcto es `REJECTED`).

**Extensión opcional:** implementa un webhook simulado en tu cliente con verificación de firma (Etapa 4).

---

### Nivel 6 — Integraciones: WebSockets, notificaciones y exportaciones

> ## ⚠️ REQUIERE ETAPA 4 (PENDIENTE)
>
> **Los endpoints de este nivel no existen hoy.** No hay WebSocket, worker/Redis, bandeja de notificaciones ni exportaciones. Esta sección describe el contrato previsto, no algo ejecutable.

#### C6.1 — WebSockets y notificaciones (requiere Etapa 4, pendiente)

**Objetivo de aprendizaje:** recibir eventos en tiempo real con autenticación, autorización por sala y reconexión.

**Endpoints previstos (pendientes)**

| Tipo | Ruta prevista | Función |
|---|---|---|
| WS | `/api/v1/ws?token=<accessToken>` | Conexión autenticada; suscripción a salas del espacio |
| `GET` | `/notifications?page=1&limit=20` | Bandeja paginada |
| `GET` | `/notifications/unread-count` | Contador de pendientes |
| `PATCH` | `/notifications/:id/read` | Marcar una como leída |
| `POST` | `/notifications/read-all` | Marcar todas como leídas |

**Especificación para cuando esté disponible**

1. Conecta el socket con el token y comprueba que un usuario de otro espacio no recibe tus eventos.
2. Crea una nota o cambia el estado de una tarea y verifica que llega el evento de actualización.
3. Desconecta y reconecta: la estrategia documentada debe permitir recuperar eventos perdidos.
4. Consulta la bandeja, marca una notificación como leída y actualiza el contador.

**Criterios de aceptación (cuando la Etapa 4 esté lista)**

- [ ] La conexión exige autenticación y la suscripción a salas exige pertenencia.
- [ ] Los eventos llegan con `resource`, `action` y `resourceId`.
- [ ] Tras reconectar, el cliente recupera los eventos perdidos.
- [ ] El contador de no leídas coincide con la bandeja.

**Pista:** hoy puedes simular la *idea* con `GET /notifications` implementado en tu propio frontend, pero **no** con endpoints del backend.

**Errores comunes:** asumir que el backend actual ya tiene `/ws`; enviar el token por query sin HTTPS en producción; no manejar reconexiones.

**Extensión opcional:** diseña el estado del cliente con un reducer que aplique eventos idempotentemente.

---

#### C6.2 — Exportaciones asíncronas (requiere Etapa 4, pendiente)

**Objetivo de aprendizaje:** lanzar trabajos largos, consultar progreso con polling y descargar un resultado temporal.

**Endpoints previstos (pendientes)**

| Método | Ruta prevista | Función |
|---|---|---|
| `POST` | `/exports` | `{ resource: "products", format: "csv" }` → `202` con `id` |
| `GET` | `/exports/:id` | `status`: `pending`, `processing`, `completed`, `failed` |
| `GET` | `/exports/:id/download` | Descarga temporal autorizada al terminar |

**Especificación para cuando esté disponible**

1. Solicita una exportación y guarda el `id`.
2. Haz polling de `GET /exports/:id` con intervalo creciente hasta `completed` o `failed`.
3. Si el estado es `failed`, muestra el error y permite reintentar.
4. Descarga el archivo con la URL/endpoint temporal; comprueba que no sea pública.

**Criterios de aceptación (cuando la Etapa 4 esté lista)**

- [ ] La creación responde `202` y el estado evoluciona hasta terminal.
- [ ] El polling respeta un intervalo y un máximo de intentos.
- [ ] La descarga exige autorización y caduca.
- [ ] El escenario «trabajo asíncrono fallido» permite probar `failed`.

**Pista:** hoy el escenario de trabajo fallido aparece en el simulador como **no implementado**; no intentes activarlo.

**Errores comunes:** hacer polling sin límite; compartir la URL de descarga; tratar `processing` como error; creer que el worker ya existe.

**Extensión opcional:** patrón de polling en JavaScript:

```js
async function waitForExport(id, token, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`http://localhost:3100/api/v1/exports/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (data.status === 'completed') return data;
    if (data.status === 'failed') throw new Error(data.error?.message ?? 'Exportación fallida');
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** i, 10000)));
  }
  throw new Error('Tiempo de espera agotado');
}
```

---

### Proyecto final sugerido

Construye una aplicación web, Android, iOS o de escritorio que combine **los niveles 1 a 5** (todo lo que existe hoy). Mínimo imprescindible:

1. Catálogo público con listado paginado, búsqueda, orden y estado vacío.
2. CRUD de productos en un sandbox anónimo con `x-space-id`, control de `version` y manejo de `429`.
3. Registro/login, renovación de sesión y perfil editable con avatar.
4. Notas privadas con filtros, favoritos y conflictos de edición.
5. Categorías, tareas con subtareas y transiciones, y archivos multipart.
6. Un espacio de equipo con al menos dos roles demostrados.
7. Carrito con totales del servidor, pedido idempotente y pago simulado con reposición de stock.
8. Manejo visible de errores con `error.code` y `requestId`, y limpieza de escenarios del simulador.

**Entrega:** código cliente, capturas de los flujos, un `README` con instrucciones de arranque y el registro de evidencias descrito en la sección 7. No incluyas tokens ni contraseñas en capturas.

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
| Trabajo asíncrono fallido | — | **No implementado (pendiente de Etapa 4)** | Requiere worker/Redis y consulta de estado; ver Nivel 6 |

Comprobación rápida de limpieza en Postman: `Simulator › Desactivar todos los escenarios (limpieza)`, o:

```bash
curl -X PATCH -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"slowResponse":false,"timeout":false,"temporary503":false,"sessionExpired":false,
       "insufficientPermission":false,"emptyList":false,"largeVolume":false,
       "concurrentEdit":false,"rateLimit":false,"invalidFile":false,"duplicateOrder":false}' \
  http://localhost:3100/api/v1/spaces/me/scenarios
```

---

## 5. Rúbrica de evaluación simple

Cada dimensión se puntúa de **0 a 4** por nivel. La nota del nivel es el promedio; el proyecto final promedia los niveles 1-4.

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
- [ ] **Mailpit solo localhost:** `http://127.0.0.1:8025`; no lo expongas a la red ni lo confundas con la API.
- [ ] **Puerto 3100:** API en `http://localhost:3100/api/v1`, health en `http://localhost:3100/health/...`, Swagger en `http://localhost:3100/docs`.
- [ ] **Demo pública es solo lectura:** sin `x-space-id`, escribir responde `403 DEMO_READ_ONLY`.
- [ ] **Escenarios limpios:** desactivaste todos los del simulador al terminar.
- [ ] **Etapa 4:** no inventes endpoints de WS, notificaciones ni exportaciones como si existieran; carrito/pedidos/pagos sí están en la Etapa 3.

---

## 7. Cómo entregar la solución

Entrega un paquete con:

1. **Código del cliente** (web/Android/iOS/escritorio) con un `README.md` propio: requisitos, arranque, puerto 3100 y credenciales de desarrollo (sin secretos reales).
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

*Guía alineada con `propuesta_backend_estudiantes.md` (secciones 3, 4, 6-8, 10, 11 y 14) y con el estado real del código: Etapas 1, 2 y 3 implementadas; Etapa 4 pendiente.*
