# Backend de práctica para estudiantes — Etapas 1, 2 y 3

API REST de práctica construida con **NestJS + TypeScript + Prisma + PostgreSQL**, ejecutada con **Docker Compose**. La Etapa 2 añade **categorías, archivos, tareas, roles de equipo y simulador de escenarios**; la Etapa 3 añade **carrito, pedidos con stock transaccional, pagos simulados, idempotencia persistida y el escenario `duplicateOrder`**.

> **Persistencia: código vs datos.** El código fuente vive en este repositorio Git (`.gitignore` excluye `node_modules`, `dist`, `.env` y backups; `.gitattributes` fuerza `eol=lf` en los scripts). Docker guarda la **ejecución** y los **datos**: PostgreSQL, Mailpit y el almacenamiento de archivos usan **volúmenes nombrados** (`postgres_data`, `mailpit_data`, `files_data` y `minio_data`, reservado). Borrar contenedores no borra volúmenes.

## Guías

- [Guía de coding challenges para estudiantes](docs/coding-challenges.md)
- [Colección y environment de Postman](postman/README.md)

## Decisiones mantenidas

- **Una sola base PostgreSQL compartida.** Aislamiento lógico por `spaceId` obligatorio. **No** se crean contenedores, bases ni volúmenes por estudiante.
- **Modalidades:** demo pública (solo lectura), sandbox anónimo (`x-space-id`, TTL y cuota de productos), espacio personal persistente y espacio de equipo compartido con roles (`LECTOR`, `EDITOR`, `ADMINISTRADOR`).
- **Roles efectivos:** el propietario siempre es `ADMINISTRADOR`; `LECTOR` solo consulta; `EDITOR` crea/edita/elimina recursos; `ADMINISTRADOR` además gestiona miembros, escenarios y resets.
- **Secretos** solo como ejemplos en `.env.example`; `.env` está gitignored. Versiones fijadas, prohibido `latest`.
- **Logs** JSON a `stdout` con `requestId`; nunca contraseñas ni tokens.
- **Migraciones incrementales:** `20241124000000_init` (Etapa 1), `20241125000000_stage2` (Etapa 2) y `20241126000000_stage3` (Etapa 3). Las dos primeras no se han modificado.
- **Etapa 3:** importes como enteros en unidad mínima con `currency` explícita; stock descontado dentro de la transacción de creación del pedido; precios/nombres comprados guardados como snapshot; idempotencia persistida por `(spaceId, userId, key)`; pagos simulados sin cobros reales.
- No se implementa la Etapa 4 (WebSockets, worker/Redis, notificaciones, exportaciones).

### Qué pasó con MinIO

Se prefirió una imagen fijada y verificable, pero **no fue verificable desde este entorno**:

- `docker manifest inspect minio/minio:RELEASE.2024-10-02T17-50-41Z` → `authentication required`; con token anónimo de Docker Hub → `insufficient_scope` (`access: []`).
- `quay.io/minio/minio:<varios tags fijados>` → `no such manifest` / API que exige autenticación.

Por ello el servicio **queda comentado** en `docker-compose.yml`, con el comando exacto de activación y nota. La API de archivos funciona igual con `FILES_STORAGE=local` (volumen `files_data`), y las pruebas usan un **stub del cliente S3**, así que CI no depende de MinIO. Ver la sección [Archivos](#archivos-y-avatares).

## Instalación (guía reproducible en cualquier computadora)

Sigue estos pasos **en orden** en Windows, macOS o Linux. Todos los comandos se ejecutan desde una terminal situada en la carpeta del proyecto. Si algo falla, salta a [Solución de problemas](#solución-de-problemas).

### 1. Requisitos previos

| Requisito | Windows / macOS | Linux | Cómo comprobarlo |
|---|---|---|---|
| Docker | **Docker Desktop** (con el motor arrancado) | **Docker Engine 29+** y el plugin **Docker Compose v5+** (`docker compose`, con espacio; no el `docker-compose` clásico) | `docker --version` y `docker compose version` |
| Git | Git for Windows / Git instalado | Git del sistema | `git --version` |
| Node.js y npm | **Solo si vas a trabajar fuera de Docker**: Node `20.18.1` (ver `.nvmrc`; `engines: >=20.18.1 <21`) y npm | Igual | `node --version` → `v20.18.1` |
| `curl` | Opcional (en PowerShell usa `Invoke-WebRequest`) | Opcional | `curl --version` |
| Puertos | **3100** (API) y **8025** (Mailpit) libres en el host | Igual | `docker ps` / `lsof -i :3100` (macOS/Linux) |

> No necesitas instalar PostgreSQL, Prisma ni Node dentro de Docker: las imágenes ya los traen. El contenedor siempre escucha en `3000`; el host publica `APP_HOST_PORT` (por defecto `3100`).

### 2. Clonar el repositorio

```bash
git clone https://github.com/<TU-USUARIO>/<REPO>.git
cd <REPO>
```

Sustituye `<TU-USUARIO>` y `<REPO>` por tu usuario y nombre de repositorio reales (son marcadores de posición, no un usuario inventado). Si ya descargaste el código como ZIP, puedes omitir `git clone` pero **no** omitir el paso 3.

### 3. Configurar el entorno

```bash
cp .env.example .env                 # macOS / Linux / Git Bash / WSL
```

```powershell
Copy-Item .env.example .env          # PowerShell en Windows
```

Reglas importantes:

- `.env.example` es la **única** plantilla versionada y contiene solo valores de desarrollo/placeholders (`CHANGE_ME_*`, `dev_password_change_me`).
- `.env` es **local y nunca se versiona** (`git check-ignore -v .env` debe mostrar la regla de `.gitignore`). No lo compartas ni lo subas a GitHub.
- Con los valores de ejemplo no hay que editar nada. Si cambias el puerto, **actualiza las tres referencias**: `APP_HOST_PORT`, `PUBLIC_BASE_URL` (p. ej. `http://localhost:4000`) y las variables `baseUrl`/`hostUrl` de Postman. Los correos construyen enlaces como `${PUBLIC_BASE_URL}/api/v1/...`.
- `POSTGRES_PASSWORD` y la contraseña dentro de `DATABASE_URL` deben ser la misma (`dev_password_change_me` en la plantilla). Si cambias una, cambia la otra.

### 4. Arranque

Forma recomendada (espera a migraciones, healthcheck y seed idempotente automáticamente):

```bash
./start.sh
# o, si prefieres npm:
npm run project:start
```

- **Windows con Git Bash o WSL:** los mismos comandos funcionan (`.gitattributes` garantiza que los `.sh` tengan finales de línea LF).
- **Windows con PowerShell** (sin scripts bash):

```powershell
docker compose up -d --build
docker compose logs -f migrate        # espera a "Exited(0)"; Ctrl+C para salir
docker compose exec app npm run prisma:seed
```

- Alternativa universal en primer arranque: `docker compose up --build` (en primer plano) y, en otra terminal, `docker compose exec app npm run prisma:seed`.

`docker compose` espera a PostgreSQL *healthy*, ejecuta las migraciones (`migrate`, una sola vez) y solo después arranca la API. El código se monta desde el host y `start:dev` recarga cambios; `node_modules` vive en un volumen anónimo separado. El seed es **idempotente** (IDs/slugs fijos + `upsert`): incluye la demo pública (8 productos en 3 categorías), el espacio personal (3 categorías, 2 productos, 2 notas y 3 tareas con subtareas) y el usuario de prueba. Repetirlo no duplica nada.

### 5. Verificación

```bash
curl -i http://localhost:3100/health/ready        # espera 200
curl -i 'http://localhost:3100/api/v1/public/products?page=1&limit=20'
```

En PowerShell:

```powershell
Invoke-WebRequest http://localhost:3100/health/ready | Select-Object StatusCode
```

Comprueba también:

| Recurso | URL |
|---|---|
| Swagger UI | `http://localhost:3100/docs` |
| UI de Mailpit (solo host) | `http://127.0.0.1:8025` |
| Liveness | `http://localhost:3100/health/live` |

Login de prueba y petición autenticada (sustituye `3100` si cambiaste `APP_HOST_PORT`):

```bash
TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
  http://localhost:3100/api/v1/auth/login | jq -r .data.tokens.accessToken)

curl -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/users/me
```

```powershell
$body = '{"email":"estudiante@practicas.local","password":"Estudiante.123"}'
$login = Invoke-RestMethod -Uri http://localhost:3100/api/v1/auth/login -Method Post -ContentType 'application/json' -Body $body
$token = $login.data.tokens.accessToken
Invoke-RestMethod -Uri http://localhost:3100/api/v1/users/me -Headers @{ Authorization = "Bearer $token" }
```

### URLs y usuario de prueba

Las URLs de la API usan el puerto host configurado en `APP_HOST_PORT` (`3100` en este entorno; la plantilla usa el mismo valor). Si cambias ese valor, sustituye `3100` por él en los ejemplos **y actualiza `PUBLIC_BASE_URL`** con el mismo puerto.

| Recurso | URL |
|---|---|
| API | `http://localhost:${APP_HOST_PORT:-3100}/api/v1` |
| Swagger UI | `http://localhost:${APP_HOST_PORT:-3100}/docs` |
| Liveness / Readiness | `http://localhost:${APP_HOST_PORT:-3100}/health/live`, `/health/ready` |
| UI de Mailpit (solo host) | `http://127.0.0.1:8025` |

```
email:    estudiante@practicas.local
password: Estudiante.123
```

> **Credencial SOLO de desarrollo / práctica; no usar en producción.** La crea el seed y sirve para probar la API. Cámbiala o elimínala antes de desplegar.

> Nota operativa: si el puerto host `3000` está ocupado por otro proyecto, **no lo detengas**. Este workspace define `APP_HOST_PORT=3100` en `.env` (y en `.env.example`) y el compose publica `3100:3000` sin tocar el contenedor ajeno. Los scripts usan `3000` solo como respaldo si la variable no existe.

## Secretos y seguridad

- **Nunca commitees `.env`**, ni `.env.test`, ni exports de Postman con tokens. Versiona solo `.env.example` con placeholders (`CHANGE_ME_*` / `dev_password_change_me`). Verifica con `git check-ignore -v .env`.
- **Antes de desplegar**, genera JWT secrets nuevos y aleatorios (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, ≥32 caracteres), cambia `POSTGRES_PASSWORD` (y `DATABASE_URL`) y cualquier credencial S3/MinIO. Rotar el JWT secret invalida los tokens emitidos con el anterior.
- **No expongas Mailpit fuera de localhost**: `docker-compose.yml` lo enlaza a `127.0.0.1:8025`. No publiques PostgreSQL (sin `ports`) ni MinIO a la red; tampoco pongas `S3_PRESIGN=true` con un endpoint público accesible desde estudiantes.
- **No compartas tokens** de acceso/refresh ni los pegues en issues, capturas o archivos del repo. Los tokens se guardan revocables en PostgreSQL; la UI de Postman limpia `initialValue` y marca `password` como `secret`.
- **Si subiste un secreto por accidente:** 1) rota ese secreto **ya** (JWT, contraseña de BD, claves S3) y revoca sesiones; 2) trata el valor como comprometido aunque borres el archivo después; 3) reescribe el historial (`git filter-repo`/BFG) **antes** de hacer push; 4) si ya hiciste push, avisa al equipo/proveedor y rota de nuevo. Borrar el archivo en un commit nuevo **no** es suficiente.

## Uso diario y ciclo de vida

Los scripts canónicos están en `scripts/`; en la raíz hay wrappers para ejecutarlos directamente.

| Acción | Directo (bash / Git Bash / WSL) | npm / Docker Compose |
|---|---|---|
| Arrancar (con seed) | `./start.sh` | `npm run project:start` |
| Detener (sin borrar volúmenes) | `./stop.sh` | `npm run project:stop` |
| Reiniciar sin seed | `./restart.sh --no-seed` | `npm run project:restart -- --no-seed` |
| Aplicar migraciones | `docker compose exec app npm run prisma:migrate` | `npm run prisma:migrate` si trabajas fuera de Docker |
| Seed idempotente | `docker compose exec app npm run prisma:seed` | `npm run prisma:seed` fuera de Docker |
| Regenerar cliente Prisma | `docker compose exec app npm run prisma:generate` | Tras editar `prisma/schema.prisma` |
| Pruebas unitarias | `docker compose exec app npm test` | `npm test` con Node 20.18.1 en el host |
| Pruebas e2e (`practicas_test`) | Ver [Ejecutar pruebas](#ejecutar-pruebas) | Igual; **nunca** contra la BD de estudiantes |
| Ver logs | `docker compose logs -f app` | `docker compose logs --tail=100 migrate` para migraciones |
| Ver estado | `docker compose ps` | Incluye el estado de `migrate` (`Exited(0)` = OK) |

`start.sh` localiza la raíz del proyecto desde su ubicación, lee `APP_HOST_PORT` de `.env` (default `3000`), avisa si el puerto está ocupado por un contenedor ajeno **sin detenerlo**, ejecuta `docker compose up -d --build`, espera a que `migrate` termine con código 0 y a que `GET /health/ready` responda 200 (60 s cada espera), y aplica el seed idempotente. La opción `--no-seed` omite el seed. Al terminar imprime las URLs reales con el puerto configurado.

`stop.sh` ejecuta `docker compose down` **sin `-v`**: los volúmenes `postgres_data`, `mailpit_data` y `files_data` se conservan, así como `minio_data` (reservado). No acepta opciones que borren datos (p. ej. `-v` / `--volumes`). `restart.sh` encadena `stop.sh` y `start.sh`, reenviando argumentos como `--no-seed`.

El puerto publicado se controla únicamente con `APP_HOST_PORT` en `.env` (en este entorno, `3100` porque el `3000` lo ocupa otro proyecto).

## Postman y guías de estudio

1. Abre Postman → **Import → Upload Files** y selecciona `postman/backend-practicas.postman_collection.json` y `postman/backend-practicas.postman_environment.json`.
2. Selecciona el environment **Backend Prácticas - Local (desarrollo)** y comprueba `baseUrl = http://localhost:3100/api/v1` y `hostUrl = http://localhost:3100` (cámbialos si usas otro puerto).
3. Ejecuta primero **Health › Readiness** y luego **Auth › Login**: los scripts autopueblan `accessToken`, IDs y `version`. Si no hay login, las peticiones con Bearer devuelven 401.
4. Detalles, flujo recomendado, roles, simulador y Etapa 3: [postman/README.md](postman/README.md).
5. Ejercicios y retos para estudiantes: [docs/coding-challenges.md](docs/coding-challenges.md).

> El environment trae `initialValue` vacío para `password` y `accessToken`: escríbelos solo en tu copia local y **no exportes el environment con valores reales**.

## Variables de entorno nuevas (Etapa 2)

| Variable | Default | Uso |
|---|---|---|
| `FILES_STORAGE` | `local` | `local` (disco + volumen `files_data`) o `s3` (MinIO). |
| `FILES_LOCAL_DIR` | `./storage/uploads` | Raíz de objetos en modo local. |
| `FILE_MAX_SIZE_BYTES` | `5242880` | Tamaño máximo por archivo (5 MiB). |
| `FILE_ALLOWED_MIME_TYPES` | `image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain` | Lista permitida. |
| `SPACE_FILE_QUOTA_BYTES` | `104857600` | Cuota de bytes por espacio (100 MiB). |
| `SPACE_FILE_QUOTA_COUNT` | `50` | Cuota de objetos por espacio. |
| `S3_ENDPOINT` | — | Endpoint **interno** servidor→S3 (`http://minio:9000`). |
| `S3_PUBLIC_ENDPOINT` | — | Endpoint **público** para URLs prefirmadas que consume navegador/móvil. Si falta, las descargas van por la API. |
| `S3_REGION`, `S3_BUCKET` | `us-east-1`, `practicas` | Región y bucket. |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | — | Credenciales (solo en `.env`, nunca en código). |
| `S3_FORCE_PATH_STYLE` | `true` | Necesario para MinIO. |
| `S3_PRESIGN`, `S3_PRESIGN_TTL_SECONDS` | `false`, `300` | Si `true` y hay endpoint público, `url` es prefirmada; si no, `url` apunta a la API. |
| `SCENARIO_MAX_DELAY_MS` | `3000` | Tope duro de latencia simulada. |
| `SCENARIO_MAX_CONCURRENCY` | `5` | Máximo de respuestas lentas simultáneas (excederlo da 429 `SIMULATOR_BUSY`). |
| `SCENARIO_LARGE_VOLUME_COUNT` | `500` | Tope de registros generados por "gran volumen". |

## Endpoints de la Etapa 2

Todos bajo `/api/v1`. Autenticación con `Authorization: Bearer <token>`; el header opcional `x-space-id` (UUID o slug) selecciona un espacio de equipo al que pertenece el usuario. Sin él se usa el espacio personal.

### Categorías

`GET/POST /categories`, `GET/PATCH/DELETE /categories/:id`, `GET /categories/:id/products`.
Público (sin login): `GET /public/categories`, `GET /public/categories/:id`, `GET /public/categories/:id/products`; la demo solo muestra categorías **activas** y es de solo lectura.

```bash
TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
  http://localhost:3100/api/v1/auth/login | jq -r .data.tokens.accessToken)

curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Tecnología"}' http://localhost:3100/api/v1/categories

# Productos de una categoría (o filtro ?categoryId=<uuid> en /products)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3100/api/v1/categories/<categoryId>/products?page=1\&limit=20
```

Nombre único por espacio (`409 CATEGORY_NAME_CONFLICT`); `PATCH` exige `version` y responde `409 VERSION_CONFLICT` si no coincide.

### Tareas

`GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id`, `POST /tasks/:id/subtasks`, `PATCH/DELETE /tasks/:id/subtasks/:subtaskId`.

```bash
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Preparar entorno","priority":"HIGH","dueAt":"2030-01-01T00:00:00Z",
       "subtasks":[{"title":"Node 20"},{"title":"Docker"}]}' \
  http://localhost:3100/api/v1/tasks

curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3100/api/v1/tasks?status=TODO,IN_PROGRESS&priority=HIGH&dueBefore=2031-01-01T00:00:00Z'
```

Transiciones válidas: `TODO → IN_PROGRESS|CANCELLED`, `IN_PROGRESS → TODO|DONE|CANCELLED`, `DONE → IN_PROGRESS`, `CANCELLED → TODO`. Cualquier otra respuesta `409 INVALID_STATUS_TRANSITION`. `PATCH` con `version` obsoleto → `409 VERSION_CONFLICT`.

### Equipos y roles

`POST /spaces/teams`, `GET/POST /spaces/:spaceId/members`, `PATCH/DELETE /spaces/:spaceId/members/:userId`, `POST /spaces/:spaceId/reset`. Solo `ADMINISTRADOR` (o el propietario) puede invitar, cambiar roles, remover miembros, configurar escenarios y resetear.

```bash
TEAM=$(curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Equipo de prácticas"}' http://localhost:3100/api/v1/spaces/teams | jq -r .data.id)

curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"email":"otro@practicas.local","role":"EDITOR"}' \
  http://localhost:3100/api/v1/spaces/$TEAM/members

# El editor trabaja en el espacio compartido; el lector recibe 403 al escribir
curl -H "Authorization: Bearer $EDITOR_TOKEN" -H "x-space-id: $TEAM" -H 'Content-Type: application/json' \
  -d '{"title":"Tarea compartida"}' http://localhost:3100/api/v1/tasks
```

El espacio personal sigue funcionando exactamente igual: el propietario administra sus recursos.

## Archivos y avatares

- `POST /files` — `multipart/form-data`, campo `file`, `kind` opcional (`AVATAR|IMAGE|DOCUMENT|OTHER`).
- `GET /files`, `GET /files/:id`, `GET /files/:id/download`, `DELETE /files/:id`.
- `POST /users/me/avatar` — campo `avatar`; reemplaza el avatar anterior borrando su objeto. `PATCH /users/me` también acepta `avatarFileId` de un archivo ya subido.

```bash
curl -H "Authorization: Bearer $TOKEN" -F 'file=@./foto.png;type=image/png' \
  http://localhost:3100/api/v1/files

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3100/api/v1/files/<fileId>/download -o descarga.png

curl -H "Authorization: Bearer $TOKEN" -F 'avatar=@./foto.png;type=image/png' \
  http://localhost:3100/api/v1/users/me/avatar
```

Los objetos se guardan con prefijo `spaces/<spaceId>/<kind>/<uuid><ext>`. Metadatos en PostgreSQL (`FileObject`). Descarga siempre autorizada por espacio/rol salvo que se activen URLs prefirmadas (`S3_PRESIGN=true` + `S3_PUBLIC_ENDPOINT`). Tipos y tamaño se validan antes de escribir (`400 INVALID_FILE_TYPE`, `400 FILE_TOO_LARGE`); exceder la cuota responde `429 FILE_QUOTA_EXCEEDED`.

**Activar MinIO** (una vez verificado el tag en tu registro):

```bash
# 1) docker manifest inspect minio/minio:RELEASE.2024-10-02T17-50-41Z
# 2) descomenta el bloque `minio:` y su `depends_on` en docker-compose.yml
# 3) en .env: FILES_STORAGE=s3, S3_ENDPOINT=http://minio:9000,
#    MINIO_ROOT_USER/PASSWORD, S3_ACCESS_KEY/SECRET_KEY, S3_BUCKET=practicas
#    (opcional: S3_PUBLIC_ENDPOINT=http://127.0.0.1:9000, S3_PRESIGN=true)
docker compose up -d minio && docker compose up -d --build app
```

**Limpieza y reconciliación:** el reset de espacio, la expiración de sandboxes, el borrado de cuenta, avatar, producto y nota eliminan los objetos S3 de forma **best-effort** antes/después de la transacción relacional. PostgreSQL y S3 no comparten transacción: si falla un borrado de objeto se registra un log JSON `file_cleanup_pending` con la clave para reconciliación manual (no se filtran credenciales). En el reset se escriben además los recursos `Task` y se desactivan los escenarios.

## Simulador de escenarios

Configuración **persistida por espacio** (`SpaceScenarioConfig`). Sin fila, la API es estable. Solo afecta al espacio resuelto (token o `x-space-id`). Los endpoints de gestión (`/scenarios`) y `/reset` quedan excluidos del interceptor para poder desactivar escenarios. Topes duros: retardo ≤ `SCENARIO_MAX_DELAY_MS`, concurrencia ≤ `SCENARIO_MAX_CONCURRENCY`, lista ≤ `SCENARIO_LARGE_VOLUME_COUNT`.

```bash
# Activar en el espacio personal (o /spaces/:spaceId/scenarios para equipos)
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"temporary503":true}' http://localhost:3100/api/v1/spaces/me/scenarios

curl -i -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/products
# HTTP 503 {"error":{"code":"SIMULATED_503", ...},"requestId":...}

# Desactivar
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"temporary503":false}' http://localhost:3100/api/v1/spaces/me/scenarios
```

| Escenario | Clave | Activación | Respuesta esperada |
|---|---|---|---|
| Respuesta lenta | `slowResponse` | `{"slowResponse":true}` | Misma respuesta tras ~1 s. |
| Latencia > timeout | `timeout` | `{"timeout":true}` | Misma respuesta tras `SCENARIO_MAX_DELAY_MS` (3 s). |
| Error temporal | `temporary503` | `{"temporary503":true}` | `503 SIMULATED_503`. |
| Sesión vencida | `sessionExpired` | `{"sessionExpired":true}` | `401 AUTH_TOKEN_EXPIRED`. |
| Permiso insuficiente | `insufficientPermission` | `{"insufficientPermission":true}` | `403 INSUFFICIENT_ROLE`. |
| Lista vacía | `emptyList` | `{"emptyList":true}` | `200` con `data: []`, `meta.total: 0`. |
| Gran volumen | `largeVolume` | `{"largeVolume":true}` | `200` con lista acotada (≤500). |
| Edición simultánea | `concurrentEdit` | `{"concurrentEdit":true}` | `409 VERSION_CONFLICT` en `PATCH`/`PUT`. |
| Límite alcanzado | `rateLimit` | `{"rateLimit":true}` | `429 RATE_LIMITED` con `Retry-After: 5`. |
| Archivo inválido | `invalidFile` | `{"invalidFile":true}` | `400 INVALID_FILE_TYPE` en subidas. |
| Pedido repetido | `duplicateOrder` | `{"duplicateOrder":true}` | Fuerza `Idempotency-Key: duplicate-order-<spaceId>` en `POST /orders`: el reintento devuelve el mismo pedido sin descontar stock dos veces. Solo `/orders`, una clave por espacio. |
| Trabajo asíncrono fallido | — | **No implementado (pendiente de Etapa 4)** | Requiere worker/Redis y consulta de estado. |

Los códigos de error estables siguen el contrato `{ error: { code, message, fields? }, requestId }`.

## Endpoints de la Etapa 3: carrito, pedidos y pagos

Todos bajo `/api/v1` y con `Authorization: Bearer <token>`. El header opcional `x-space-id` selecciona un espacio de equipo (rol `LECTOR`: solo lectura; `EDITOR`/`ADMINISTRADOR`: escritura). Los importes son **enteros en unidad mínima** (`1250` = 12.50) con `currency` ISO de 3 letras.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/cart` | Carrito del usuario+espacio con `data.items`, `data.total` y `meta` calculados en servidor |
| `POST` | `/cart/items` | `{ productId, quantity }`; valida visibilidad, stock y moneda (acumula si ya existe) |
| `PATCH` | `/cart/items/:productId` | `{ quantity }` |
| `DELETE` | `/cart/items/:productId` | Quita una línea (`204`) |
| `DELETE` | `/cart` | Vacía el carrito (`204`) |
| `POST` | `/orders` | Crea pedido desde el carrito; **requiere** `Idempotency-Key` (`201`) |
| `GET` | `/orders` | Listado paginado; filtros `status`, `page`, `limit` |
| `GET` | `/orders/:id` | Detalle con `items` (snapshot) y `payments` (intentos) |
| `POST` | `/orders/:id/pay` | `{ outcome: "APPROVED" \| "REJECTED" \| "PENDING" }` → `200` |
| `POST` | `/orders/:id/cancel` | Cancela y repone stock → `200` |

```bash
TOKEN=$(curl -s -H 'Content-Type: application/json' \
  -d '{"email":"estudiante@practicas.local","password":"Estudiante.123"}' \
  http://localhost:3100/api/v1/auth/login | jq -r .data.tokens.accessToken)
KEY=$(uuidgen | tr '[:upper:]' '[:lower:]')   # guárdalo para reintentos

curl -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/cart
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"productId":"<uuid>","quantity":2}' http://localhost:3100/api/v1/cart/items
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $KEY" -d '{}' http://localhost:3100/api/v1/orders
# Reintento con la MISMA clave: mismo id/status, sin segundo descuento de stock
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY" \
  -d '{}' http://localhost:3100/api/v1/orders
curl -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/orders?status=PENDING_PAYMENT
curl -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/orders/<orderId>
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"outcome":"APPROVED"}' http://localhost:3100/api/v1/orders/<orderId>/pay
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3100/api/v1/orders/<orderId>/cancel
```

### Reglas de idempotencia y stock

- La idempotencia se persiste en `IdempotencyRecord` por `(spaceId, userId, key)` con un **snapshot de la respuesta**. Un reintento devuelve exactamente el mismo `{ data: order }` (mismo `id`, `status`, `items` y `payments`) y **no** ejecuta de nuevo el descuento de stock. La clave es obligatoria (falta → `422 VALIDATION_ERROR`) y se recomienda un UUID; se conserva ante timeouts.
- El stock se descuenta **dentro de la transacción** de creación del pedido mediante actualizaciones condicionales (`stock >= quantity`): nunca queda negativo. Si no hay stock suficiente → `409 INSUFFICIENT_STOCK` y no se crea el pedido.
- `OrderItem` guarda `unitPrice`, `currency`, `name` y `description` como **snapshot**: cambiar el precio del producto después no altera el pedido. El carrito sí muestra el precio vigente.
- Un carrito solo admite una moneda (`409 CURRENCY_MISMATCH`). El body de `POST /orders` es `{}`: el servidor construye el pedido desde el carrito; no se aceptan `cartId`, `total` ni precios del cliente.
- `stockRestored` garantiza reposición **exactamente una vez** (rechazo o cancelación). Un producto con pedidos no se elimina (`409 PRODUCT_IN_USE`) para preservar el snapshot; el reset del espacio sí borra pedidos y carritos antes que productos.

### Transiciones de pedidos (pagos simulados, sin cobros reales)

| Desde | Acción | Hasta | Stock |
|---|---|---|---|
| `PENDING_PAYMENT` | `pay APPROVED` | `PAID` | Sin cambios (ya descontado) |
| `PENDING_PAYMENT` | `pay REJECTED` | `FAILED` | Repuesto una vez |
| `PENDING_PAYMENT` | `pay PENDING` | `PENDING_PAYMENT` | Sin cambios; se registra el intento (`attempt`) |
| `PENDING_PAYMENT` o `PAID` | `cancel` | `CANCELLED` | Repuesto una vez |

Cualquier otra transición → `409 INVALID_STATUS_TRANSITION` (pagar un pedido pagado, cancelar uno fallido o cancelar dos veces). Los intentos se consultan en `GET /orders/:id` → `data.payments[]` (`id`, `outcome`, `attempt`, `message`, `createdAt`). No existen `/payments` ni `/payments/:id`.

## Flujos rápidos de la Etapa 1 (sin cambios)

```bash
curl http://localhost:3100/api/v1/public/products?page=1\&limit=20

SANDBOX=$(curl -s -X POST http://localhost:3100/api/v1/public/sandboxes | jq -r .data.spaceId)
curl -H "x-space-id: $SANDBOX" -H 'Content-Type: application/json' \
  -d '{"name":"Teclado","price":49900,"stock":10}' \
  http://localhost:3100/api/v1/public/products

curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/spaces/me/reset
curl -X POST http://localhost:3100/api/v1/public/sandboxes/$SANDBOX/reset
```

El reset borra solo los datos de ese espacio (productos, categorías, tareas, notas, archivos y escenarios), deja constancia en `SpaceResetAudit` y restaura los datos canónicos en la demo. Nunca toca volúmenes ni la base completa.

## Migraciones y seeds

```bash
docker compose exec app npm run prisma:migrate      # deploy idempotente
docker compose exec app npm run prisma:seed         # upserts idempotentes
docker compose exec app npm run prisma:generate     # tras editar schema.prisma
```

La migración `20241125000000_stage2` recrea el enum `MembershipRole` (`LECTOR`, `EDITOR`, `ADMINISTRADOR`), añade `isActive`/`version` a `Category` y crea `Task`, `Subtask`, `FileObject` y `SpaceScenarioConfig`. La migración `20241126000000_stage3` añade los enums `OrderStatus`/`PaymentOutcome`, la columna `duplicateOrder` del simulador y las tablas `Cart`, `CartItem`, `Order`, `OrderItem`, `PaymentSimulation` e `IdempotencyRecord`. No se reescriben las migraciones anteriores.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Bind for 0.0.0.0:3100 failed: port is already allocated` o `./start.sh` avisa de puerto ocupado | Otro proyecto/contenedor usa 3100 | **No detengas** el contenedor ajeno. Identifícalo con `docker ps --format '{{.Names}} {{.Ports}}'` y cambia `APP_HOST_PORT` en `.env` (junto con `PUBLIC_BASE_URL` y las variables de Postman). |
| Servicio `migrate` en `Exited(1)` | Migración fallida o `DATABASE_URL`/contraseña incoherente; a veces PostgreSQL aún no estaba *healthy* | `docker compose logs --tail=100 migrate`; comprueba que `POSTGRES_PASSWORD` coincide con la contraseña de `DATABASE_URL`. Corrige `.env` y vuelve a `./start.sh` (las migraciones son idempotentes). No borres volúmenes. |
| Errores de módulos / `Cannot find module` tras cambiar dependencias | `node_modules` del contenedor quedó viejo | `docker compose build app` (o `docker compose build --no-cache app`) y reinicia. El contenedor usa un volumen anónimo para `node_modules`; no lo mezcles con el del host. |
| `npm` se queja de la versión de Node en el host (EBADENGINE) o `nest: not found` | Node del host fuera de rango (p. ej. Node 25) | Usa Docker, o `nvm use` (lee `.nvmrc` → `20.18.1`). El rango soportado es `>=20.18.1 <21`. |
| `/health/ready` no devuelve 200 | Primera vez que arranca o la app cayó | Espera unos segundos; revisa `docker compose logs --tail=100 app` y `docker compose ps`. El healthcheck comprueba PostgreSQL. |
| Mensaje `$'\r': command not found` al ejecutar `./start.sh` en Windows | Finales de línea CRLF | El repo incluye `.gitattributes` con `eol=lf` para `*.sh`; vuelve a clonar o normaliza con `git add --renormalize .`. En Git Bash/WSL también funciona. |
| `curl` no existe en Windows | No viene instalado por defecto | Usa el equivalente con `Invoke-WebRequest` / `Invoke-RestMethod` mostrado arriba, o instala curl. |
| No aparece MinIO / errores al activar `FILES_STORAGE=s3` | El servicio está **comentado** a propósito (imagen no verificable desde el entorno original) | No es un fallo: con `FILES_STORAGE=local` los archivos van al volumen `files_data` y las pruebas usan un stub. Solo descomenta MinIO si verificas el tag y configuras `MINIO_ROOT_*` y `S3_*`. |

## Backup y restore

> **Los volúmenes no son backups.** `postgres_data`, `files_data` y `minio_data` residen en el mismo host: desaparecen si se borran, se corrompen o falla el disco. Guarda los archivos generados **fuera del host** y **prueba la restauración** en una BD separada antes de necesitarla de verdad. Para una copia estrictamente consistente (BD + archivos), detén la API primero con `docker compose stop app` y vuelve a levantarla con `docker compose up -d app`. Los backups generados (`backup.sql`, `*.tgz`, `backups/`) están ignorados por Git: **no los subas al repositorio** y guárdalos en almacenamiento externo/cifrado.

Lee solo los nombres de usuario/base desde `.env` (no se "sourcea" el archivo porque `SMTP_FROM` contiene espacios). No se escriben secretos nuevos:

```bash
POSTGRES_USER=$(sed -n 's/^POSTGRES_USER=//p' .env | head -n1)
POSTGRES_DB=$(sed -n 's/^POSTGRES_DB=//p' .env | head -n1)
```

### PostgreSQL — backup lógico

`pg_dump` corre **dentro** del contenedor; `-T` desactiva el TTY para poder redirigir por pipes. El resultado es SQL plano, portable:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-privileges --clean --if-exists > backup.sql
```

### PostgreSQL — restore de prueba en BD separada

```bash
docker compose exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" practicas_restore_test
docker compose exec -T postgres createdb -U "$POSTGRES_USER" practicas_restore_test
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d practicas_restore_test \
  -v ON_ERROR_STOP=1 < backup.sql

# Comprobación rápida: deben aparecer init, stage2 y stage3 con finished_at
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d practicas_restore_test \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"
```

Solo después de verificar en la BD separada, restaura sobre la real. Esto **sobrescribe** el estado actual: haz antes un `pg_dump` de la BD real siguiendo el paso 1.

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 < backup.sql
```

### Archivos — volumen `files_data` (storage local)

El nombre del volumen deriva de `name: backend-pruebas` en `docker-compose.yml`; ajústalo si cambias el nombre del proyecto. Se usa una imagen fijada que ya usa el compose, sin `latest`:

```bash
mkdir -p backups/files_data

# Backup (contenedor temporal; el volumen se monta solo lectura)
docker run --rm \
  -v backend-pruebas_files_data:/data:ro \
  -v "$PWD/backups/files_data:/backup" \
  postgres:16.4-alpine \
  sh -c 'tar czf "/backup/files_data-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .'

# Restore: sustituye el nombre por el archivo real generado arriba
docker run --rm \
  -v backend-pruebas_files_data:/data \
  -v "$PWD/backups/files_data:/backup:ro" \
  postgres:16.4-alpine \
  sh -c 'tar xzf /backup/files_data-20261125-120000.tar.gz -C /data'
```

Restaurar archivos **sin** el `backup.sql` correspondiente deja metadatos `FileObject` huérfanos (o archivos sin registro): restaura siempre ambos del mismo momento. **Si activas MinIO**, respalda también el volumen `minio_data` con el mismo patrón (o usa `mc mirror`/versionado del bucket), además de `backup.sql`.

## Ejecutar pruebas

### Unitarias

```bash
docker compose exec app npm test        # dentro de Docker (recomendado)
npm test                                # en el host solo con Node 20.18.1 y npm install
```

### End-to-end (contra `practicas_test`, sin borrar volúmenes)

```bash
docker compose up -d postgres
docker compose exec postgres createdb -U practicas practicas_test   # si no existe
docker compose exec \
  -e DATABASE_URL='postgresql://practicas:dev_password_change_me@postgres:5432/practicas_test?schema=public' \
  app sh -c 'npm run prisma:migrate && npm run test:e2e'
```

Estado: **11 suites e2e, 67/67 pruebas** (las 49 anteriores + 18 nuevas de carrito/pedidos: carrito y totales, descuento de stock, snapshot de precio, idempotencia sin doble descuento, pagos `APPROVED`/`REJECTED`/`PENDING`, reposición en rechazo/cancelación, transiciones inválidas `409`, validación `422` y `duplicateOrder`) y **2 suites unitarias, 5/5**. Los archivos no requieren MinIO en CI: se usa un stub inyectado en el token `STORAGE_PROVIDER`.

> Las e2e se ejecutan **dentro del contenedor `app`** (donde el host `postgres` existe) contra `practicas_test`, como muestra el comando anterior. Nunca apuntes las pruebas a la BD de los estudiantes ni borres volúmenes.

## Estructura

Vista rápida de la raíz del repositorio:

```
backendPruebas/
├── README.md                       esta guía
├── propuesta_backend_estudiantes.md
├── .env.example                    plantilla VERSIONADA (placeholders)
├── .env                            local, NUNCA versionado (ignorado por Git)
├── .gitignore, .gitattributes      ignorados y eol=lf para *.sh
├── docker-compose.yml, Dockerfile  app, postgres, mailpit, migrate (MinIO comentado)
├── start.sh, stop.sh, restart.sh   wrappers en la raíz
├── scripts/                        lógica de los scripts de ciclo de vida
├── src/                            código NestJS (detalle abajo)
├── prisma/                         schema.prisma, migrations/, seed.ts
├── test/                           suites e2e y utilidades
├── docs/                           coding-challenges.md
├── postman/                        collection + environment + README
├── storage/uploads/                archivos locales (contenido ignorado por Git)
├── package.json, package-lock.json, tsconfig*.json, nest-cli.json, .nvmrc
```

Detalle de `src/`:

```
src/
  main.ts, app.module.ts, app.configure.ts  bootstrap, prefijo /api/v1, Swagger, ValidationPipe
  config/, common/, prisma/, health/        entorno, logs/errores/paginación, BD, health
  auth/, users/                              JWT + refresh revocable, perfil y avatar
  spaces/                                    resolución, sandboxes TTL, equipos, miembros, reset
  products/, notes/, public/*                CRUD Etapa 1 + x-space-id opcional
  access/                                    SpaceAccessService (roles y pertenencia)
  categories/                                CRUD por espacio + categorías públicas
  tasks/                                     tareas, subtareas, transiciones, versión
  files/                                     multipart, cuotas, storage S3/local, limpieza
  cart/                                      carrito por usuario+espacio, totales del servidor
  orders/                                    pedidos transaccionales, pagos simulados, idempotencia
  simulator/                                 config por espacio, interceptor, endpoints
  mail/, database/                           SMTP de pruebas y datos canónicos
prisma/
  schema.prisma, migrations/ (init, stage2, stage3), seed.ts
test/                                       11 suites e2e (10 anteriores + orders) + utils
Dockerfile, docker-compose.yml, .env.example
```

## Pendiente para Etapa 4

- WebSockets/notificaciones, worker/Redis y exportaciones asíncronas (incluido el escenario `failedAsyncJob`).
- Portal del estudiante (UI) y guías cliente (JS/Kotlin/Retrofit) para el Nivel 5.
- Flujo web con cookies `HttpOnly` + CSRF (hoy `Authorization: Bearer`).

## Limitaciones conocidas

- MinIO queda comentado: la imagen fijada no se pudo verificar desde este entorno (Docker Hub `insufficient_scope`, quay.io exige autenticación). Ver instrucciones exactas en `docker-compose.yml` y arriba.
- La limpieza S3 no es transaccional con PostgreSQL; se registran claves pendientes para reconciliación.
- El host de generación tenía Node 25; la imagen y `.nvmrc` fijan Node 20.18.1, que es el entorno objetivo.
- El puerto host 3000 estaba ocupado por un proyecto ajeno durante el smoke test; no se detuvo ese contenedor.
