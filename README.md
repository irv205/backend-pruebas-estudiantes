# Backend de práctica para estudiantes — Etapas 1 a 4

API REST de práctica construida con **NestJS + TypeScript + Prisma + PostgreSQL**, ejecutada con **Docker Compose**. La Etapa 2 añade **categorías, archivos, tareas, roles de equipo y simulador**; la Etapa 3, **carrito, pedidos transaccionales, pagos simulados e idempotencia**; la Etapa 4 añade **notificaciones, WebSocket/chat con replay, exportaciones asíncronas (Redis/BullMQ + worker) y login web con cookies HttpOnly + CSRF**.

> **Persistencia: código vs datos.** El código fuente vive en este repositorio Git (`.gitignore` excluye `node_modules`, `dist`, `.env` y backups; `.gitattributes` fuerza `eol=lf` en `*.sh`/`*.bash` y `eol=crlf` en `*.ps1`/`*.cmd`). Docker guarda la **ejecución** y los **datos**: PostgreSQL, Redis, Mailpit y el almacenamiento de archivos usan **volúmenes nombrados** (`postgres_data`, `redis_data`, `mailpit_data`, `files_data` y `minio_data`, reservado). Borrar contenedores no borra volúmenes.

## Guías

- [Guía de coding challenges para estudiantes](docs/coding-challenges.md)
- [Colección y environment de Postman](postman/README.md)

## Decisiones mantenidas

- **Una sola base PostgreSQL compartida.** Aislamiento lógico por `spaceId` obligatorio. **No** se crean contenedores, bases ni volúmenes por estudiante.
- **Modalidades:** demo pública (solo lectura), sandbox anónimo (`x-space-id`, TTL y cuota de productos), espacio personal persistente y espacio de equipo compartido con roles (`LECTOR`, `EDITOR`, `ADMINISTRADOR`).
- **Roles efectivos:** el propietario siempre es `ADMINISTRADOR`; `LECTOR` solo consulta; `EDITOR` crea/edita/elimina recursos; `ADMINISTRADOR` además gestiona miembros, escenarios y resets.
- **Secretos** solo como ejemplos en `.env.example`; `.env` está gitignored. Versiones fijadas, prohibido `latest`.
- **Logs** JSON a `stdout` con `requestId`; nunca contraseñas ni tokens.
- **Migraciones incrementales:** `20241124000000_init` (Etapa 1), `20241125000000_stage2` (Etapa 2), `20241126000000_stage3` (Etapa 3) y `20241127000000_stage4` (Etapa 4). Las anteriores no se han modificado.
- **Etapa 3:** importes como enteros en unidad mínima con `currency` explícita; stock descontado dentro de la transacción de creación del pedido; precios/nombres comprados guardados como snapshot; idempotencia persistida por `(spaceId, userId, key)`; pagos simulados sin cobros reales.
- **Etapa 4:** Redis/BullMQ es **solo transporte** de la cola; PostgreSQL es la **fuente de verdad** del estado de los trabajos (`ExportJob`). El worker usa la misma imagen que la API con otro comando. En CI/e2e se usa `JOBS_QUEUE_MODE=inline` (sin Redis).
- **Etapa 4:** los eventos se persisten en `RealtimeEvent` para poder hacer replay; los permisos de sala se comprueban contra la BD en cada conexión/mensaje. El espacio personal solo lo usa su propietario.

### Qué pasó con MinIO

Se prefirió una imagen fijada y verificable, pero **no fue verificable desde este entorno**:

- `docker manifest inspect minio/minio:RELEASE.2024-10-02T17-50-41Z` → `authentication required`; con token anónimo de Docker Hub → `insufficient_scope` (`access: []`).
- `quay.io/minio/minio:<varios tags fijados>` → `no such manifest` / API que exige autenticación.

Por ello el servicio **queda comentado** en `docker-compose.yml`, con el comando exacto de activación y nota. La API de archivos funciona igual con `FILES_STORAGE=local` (volumen `files_data`), y las pruebas usan un **stub del cliente S3**, así que CI no depende de MinIO. Ver la sección [Archivos](#archivos-y-avatares).

## Instalación (guía reproducible en cualquier computadora)

Sigue estos pasos **en orden** en Windows, macOS o Linux. Todos los comandos se ejecutan desde una terminal situada en la carpeta del proyecto. Si algo falla, salta a [Solución de problemas](#solución-de-problemas).

### Instalación automática

El instalador ejecuta estos pasos por ti (raíz del proyecto, requisitos, `.env`, puerto, `docker compose config` y arranque), e imprime un resumen final con las URLs reales.

**Windows ya no necesita Git Bash ni WSL para ninguna etapa del ciclo de vida** (instalar, arrancar, detener o reiniciar). Todo se hace con PowerShell nativo o con los wrappers `.cmd` para `cmd.exe` / doble clic. Git sigue siendo necesario para clonar y verificar que `.env` está ignorado, pero **no se invoca `bash`**.

```powershell
# Windows PowerShell (nativo, sin bash)
git clone <URL>; cd <REPO>; .\install.ps1
```

```cmd
:: Windows: alternativa para cmd.exe / doble clic
install.cmd
```

```bash
# macOS / Linux (bash)
git clone <URL> && cd <REPO> && ./install.sh
```

Sustituye `<URL>` y `<REPO>` por tu repositorio real (son marcadores de posición). Si ya tienes el código, ejecuta desde la raíz `.\install.ps1` / `.\install.cmd` (Windows) o `./install.sh` (macOS/Linux); también `npm run project:install:win` en Windows y `npm run project:install` en macOS/Linux.

| Opción (bash / PowerShell) | Efecto |
|---|---|
| `--no-seed` / `-NoSeed` | Omite el seed (se reenvía al script de arranque). |
| `--yes`, `--non-interactive` / `-Yes`, `-NonInteractive` | Acepta defaults; **no** sobrescribe un `.env` existente. |
| `--repo-url URL` / `-RepoUrl URL` | Repositorio a clonar si no se está en la raíz (también `REPO_URL`). |
| `--target DIR` / `-Target DIR` | Directorio destino del clon. |
| `--install-deps` / `-InstallDeps` | Permite intentar instalar dependencias del sistema **solo tras confirmación explícita**; `-Yes` **no** la otorga. |
| `-h`, `--help` / `-Help` | Muestra la ayuda. |

> El instalador **no sube nada a GitHub** (no configura remote ni hace push) y **no instala dependencias del sistema sin confirmación**; `--yes`/`-Yes` tampoco autoriza esa instalación. En Windows el arranque usa `scripts/start.ps1` (PowerShell puro): espera a `migrate` con `docker inspect` y comprueba `/health/ready` con `Invoke-WebRequest`, sin `curl` ni `bash`. La guía manual detallada sigue a continuación.

### Ciclo de vida Windows (resumen)

Sin Git Bash ni WSL: cada acción tiene su script PowerShell, su wrapper `.cmd` y su script npm.

- **Instalar:** `.\install.ps1` / `install.cmd` / `npm run project:install:win`
- **Arrancar:** `.\start.ps1` / `start.cmd` / `npm run project:start:win`
- **Detener:** `.\stop.ps1` / `stop.cmd` / `npm run project:stop:win`
- **Reiniciar sin seed:** `.\restart.ps1 -NoSeed` / `restart.cmd -NoSeed` / `npm run project:restart:win -- -NoSeed`

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
cp .env.example .env                 # macOS / Linux
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

```powershell
# Windows (PowerShell nativo, sin bash)
.\start.ps1
# o: .\start.cmd   |   npm run project:start:win
```

```bash
# macOS / Linux
./start.sh
# o: npm run project:start
```

- **Windows:** no necesitas Git Bash ni WSL; `start.ps1` hace lo mismo que `start.sh` usando Docker Compose, `docker inspect` e `Invoke-WebRequest`.
- **macOS/Linux:** los scripts `.sh` funcionan tal cual (`.gitattributes` garantiza finales de línea LF).
- Alternativa manual en cualquier sistema: `docker compose up -d --build`, esperar a `migrate` con `docker compose logs -f migrate` y ejecutar `docker compose exec -T app npm run prisma:seed`.

`docker compose` espera a PostgreSQL y Redis *healthy* (Redis es opcional con `JOBS_QUEUE_MODE=inline`), ejecuta las migraciones (`migrate`, una sola vez) y solo después arranca la API y el `worker`. El código se monta desde el host y `start:dev` recarga cambios; `node_modules` vive en un volumen anónimo separado. Con `docker compose ps` deben aparecer `postgres`, `redis`, `mailpit`, `migrate` (`Exited(0)`), `app` (*healthy*) y `worker` (*up*, sin puerto HTTP). El seed es **idempotente** (IDs/slugs fijos + `upsert`): incluye la demo pública (8 productos en 3 categorías), el espacio personal (3 categorías, 2 productos, 2 notas y 3 tareas con subtareas) y el usuario de prueba. Repetirlo no duplica nada.

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

Los scripts canónicos están en `scripts/`; en la raíz hay wrappers para ejecutarlos directamente. Windows usa los `.ps1` (o los `.cmd` con doble clic) y **no necesita Git Bash ni WSL**.

| Acción | bash (macOS / Linux) | Windows nativo (PowerShell / .cmd) | npm |
|---|---|---|---|
| Arrancar (con seed) | `./start.sh` | `.\start.ps1` o `.\start.cmd` | `npm run project:start` / `npm run project:start:win` |
| Detener (sin borrar volúmenes) | `./stop.sh` | `.\stop.ps1` o `.\stop.cmd` | `npm run project:stop` / `npm run project:stop:win` |
| Reiniciar sin seed | `./restart.sh --no-seed` | `.\restart.ps1 -NoSeed` o `.\restart.cmd -NoSeed` | `npm run project:restart -- --no-seed` / `npm run project:restart:win -- -NoSeed` |
| Instalar | `./install.sh` | `.\install.ps1` o `.\install.cmd` | `npm run project:install` / `npm run project:install:win` |
| Aplicar migraciones | `docker compose exec app npm run prisma:migrate` | Igual | `npm run prisma:migrate` si trabajas fuera de Docker |
| Seed idempotente | `docker compose exec app npm run prisma:seed` | Igual | `npm run prisma:seed` fuera de Docker |
| Regenerar cliente Prisma | `docker compose exec app npm run prisma:generate` | Igual | Tras editar `prisma/schema.prisma` |
| Pruebas unitarias | `docker compose exec app npm test` | Igual | `npm test` con Node 20.18.1 en el host |
| Pruebas e2e (`practicas_test`) | Ver [Ejecutar pruebas](#ejecutar-pruebas) | Igual; **nunca** contra la BD de estudiantes | Igual |
| Ver logs | `docker compose logs -f app` | Igual | `docker compose logs --tail=100 migrate` (migraciones), `worker` (exports) o `redis` (cola) |
| Ver estado | `docker compose ps` | Igual | Incluye `migrate` (`Exited(0)` = OK), `redis` (*healthy*) y `worker` (*up*) |

`start.sh` / `start.ps1` localizan la raíz del proyecto desde su ubicación, leen `APP_HOST_PORT` de `.env` (default `3000`), avisan si el puerto está ocupado por un contenedor ajeno **sin detenerlo**, ejecutan `docker compose up -d --build`, esperan a que `migrate` termine con código 0 y a que `GET /health/ready` responda 200 (60 s cada espera), y aplican el seed idempotente. La opción `--no-seed` / `-NoSeed` omite el seed. Al terminar imprimen las URLs reales con el puerto configurado. La versión de Windows usa `Invoke-WebRequest` en lugar de `curl`.

`stop.sh` / `stop.ps1` ejecutan `docker compose down` **sin `-v`**: los volúmenes `postgres_data`, `redis_data`, `mailpit_data` y `files_data` se conservan, así como `minio_data` (reservado). No aceptan opciones que borren datos (p. ej. `-v`, `--volumes`, `-Volumes` o `-V`). `restart.sh` / `restart.ps1` encadenan el apagado y el arranque, reenviando argumentos como `--no-seed` / `-NoSeed`.

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

### Variables nuevas de la Etapa 4

| Variable | Default | Uso |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379` | Conexión interna a Redis para BullMQ (solo red de Compose). |
| `JOBS_QUEUE_MODE` | `redis` | `redis`: la API encola y el worker procesa; `inline`: la API procesa de forma síncrona (CI/e2e, sin Redis). |
| `JOBS_RETENTION_HOURS` | `24` | El worker purga exportaciones finalizadas más antiguas y sus objetos al arrancar. |
| `WORKER_MODE` | `false` | Lo fija Compose en el servicio `worker`; no lo pongas a `true` en la API. |

La dependencia de Redis en `app`/`worker` es `required: false`: con `JOBS_QUEUE_MODE=inline` la API arranca aunque Redis esté parado. El worker se declara con la **misma imagen** y `command: ["npm", "run", "worker:dev"]` (en producción, `worker:prod` → `node dist/worker/main.js`). No publica puerto HTTP.

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
| Trabajo asíncrono fallido | `failedAsyncJob` | `{"failedAsyncJob":true}` | Todos los exports del espacio terminan en `FAILED` con error reproducible; ver [Etapa 4](#etapa-4-notificaciones-tiempo-real-trabajos-y-sesión-web). |

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

## Etapa 4: notificaciones, tiempo real, trabajos y sesión web

### Notificaciones

Todas bajo `/api/v1`, con `Authorization: Bearer <token>` y `x-space-id` opcional. Se generan al aprobar/cancelar un pedido y al completar/fallar un export job. Cada notificación pertenece a un `(spaceId, userId)`; otro usuario nunca la ve.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/notifications?page=1&limit=20&unreadOnly=true` | Listado paginado del usuario en el espacio. |
| `GET` | `/notifications/unread-count` | `{ "data": { "count": n } }`. |
| `GET` | `/notifications/:id` | Detalle (404 si es de otro usuario/espacio). |
| `PATCH` | `/notifications/:id/read` | Marca una como leída y fija `readAt`. |
| `PATCH` | `/notifications/read-all` | Marca todas las del usuario en el espacio. |

Tipos: `ORDER_APPROVED`, `ORDER_CANCELLED`, `JOB_COMPLETED`, `JOB_FAILED`, `CHAT_MESSAGE`. `resourceType`/`resourceId` apuntan al recurso de origen.

### WebSocket y chat

El servidor Socket.IO se monta en el mismo puerto que la API (path por defecto `/socket.io`). Se conecta con el **JWT de acceso**:

```js
const socket = io('http://localhost:3100', {
  auth: { token: accessToken },          // también acepta Authorization: Bearer <token>
  transports: ['websocket'],
});
socket.on('connection:ready', ({ user, spaces }) => { /* salas ya suscritas */ });
```

La conexión une automáticamente las salas `user:<userId>`, `space:<spaceId>` (espacio personal + equipos donde hay membresía) y `chat:<roomId>` (salas donde el usuario es miembro). Un token inválido produce `ws:error` (`AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED`) y desconexión.

| Evento cliente → servidor | Payload | Respuesta |
|---|---|---|
| `chat:send` | `{ roomId, content }` | ACK con el mensaje guardado; difunde `chat:message` a `chat:<roomId>`. |
| `events:replay` | `{ lastEventId, spaceId?, limit? }` (limit ≤ 100) | `events:replay` con `{ events, lastEventId, hasMore }`. |

| Evento servidor → cliente | Payload |
|---|---|
| `chat:message` | `{ id, roomId, spaceId, senderId, content, sequence, createdAt }` |
| `resource:changed` | `{ id, spaceId, type, action, resourceType, resourceId, createdAt }` |
| `notification:new` | Notificación completa (`id`, `type`, `title`, `body`, `isRead`, …) |
| `job:updated` | `{ id, status, progress, fileObjectId, error }` |
| `events:replay` | `{ events: [{ id, spaceId, type, payload, createdAt }], lastEventId, hasMore }` |
| `ws:error` | `{ code, message }` (`CHAT_ROOM_NOT_FOUND`, `SPACE_ACCESS_DENIED`, `CHAT_MEMBER_REQUIRED`, `VALIDATION_ERROR`, …) |

`resource:changed` se emite al crear/editar/borrar productos, notas, tareas y categorías; al crear/pagar/cancelar pedidos; al exportar; y al resetear un espacio. `type` y `resourceType` usan el mismo valor (`PRODUCT`, `NOTE`, `TASK`, `CATEGORY`, `ORDER`, `EXPORT_JOB`, `SPACE`); `action` es `created`, `updated`, `deleted` o `reset`.

Para recuperar eventos perdidos tras una reconexión, guarda el último `id` recibido y solicita:

```js
socket.emit('events:replay', { lastEventId: 42, spaceId: mySpaceId, limit: 100 });
socket.on('events:replay', ({ events, lastEventId, hasMore }) => { /* aplica en orden */ });
```

Si omites `spaceId`, se devuelven eventos de **todos** los espacios a los que pertenezca el usuario. El reset del espacio borra sus eventos antiguos para evitar replay de recursos ya inexistentes.

Endpoints REST auxiliares del chat (Bearer + `x-space-id`):

- `POST /chat/rooms` `{ name, memberIds? }` (solo EDITOR/ADMIN; por defecto todos los miembros del espacio).
- `GET /chat/rooms` → salas visibles para el usuario.
- `GET /chat/rooms/:id/messages?page=1&limit=20` → historial ordenado por `sequence`.

### Exportaciones asíncronas

Ciclo de vida: `PENDING` → `PROCESSING` (progreso 10) → `COMPLETED` (progreso 100, `fileObjectId`, `finishedAt`) o `FAILED` (`error`, `finishedAt`). El CSV se guarda como `FileObject` en storage local (`spaces/<spaceId>/exports/<jobId>.csv`) y se descarga por la API con `Content-Disposition: attachment`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/jobs/exports` `{ kind, filters? }` | `kind`: `PRODUCTS_CSV` o `NOTES_CSV`; filtros: `search`, `categoryId` (productos), `isArchived` (notas). |
| `GET` | `/jobs/exports?status=COMPLETED&page=1&limit=20` | Paginado por espacio (no-admin ve solo los suyos). |
| `GET` | `/jobs/exports/:id` | Estado y metadatos. |
| `GET` | `/jobs/exports/:id/download` | CSV solo si `COMPLETED`; si no → `409 EXPORT_NOT_READY`. |

```bash
JOB=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"kind":"PRODUCTS_CSV","filters":{"search":"teclado"}}' \
  http://localhost:3100/api/v1/jobs/exports | jq -r .data.id)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/jobs/exports/$JOB
curl -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/v1/jobs/exports/$JOB/download
```

Con `JOBS_QUEUE_MODE=redis` (default en Docker), la API encola en BullMQ y el servicio **`worker`** (misma imagen, sin puerto HTTP) procesa: actualiza PostgreSQL, genera el CSV, guarda el `FileObject`, emite `job:updated` y crea la notificación. Al arrancar, el worker **reencola trabajos `PENDING`/`PROCESSING` huérfanos**. Con `JOBS_QUEUE_MODE=inline` la API misma procesa de forma síncrona (recomendado para CI/e2e; no necesita Redis ni worker).

Escenario `failedAsyncJob`: `PATCH /spaces/me/scenarios` `{ "failedAsyncJob": true }` hace que **todos** los exports del espacio terminen en `FAILED` con un error reproducible (`failedAsyncJob está activo`). Desactívalo para volver a exportar. No altera las respuestas HTTP ni otros espacios.

### Login web con cookies HttpOnly + CSRF

El flujo Bearer actual **no cambia**. Para navegador se añade:

1. `POST /auth/web/login` `{ email, password }` → access token en el body, cookies `refresh_token` y `csrf_token` (`HttpOnly`, `SameSite=Lax`, `Path=/api/v1`, `Secure` si `NODE_ENV=production`). El body **no incluye** el refresh token.
2. `GET /auth/csrf` → `{ data: { csrfToken } }` y actualiza la cookie `csrf_token` (double-submit).
3. Enviar el access token como `Authorization: Bearer …` en las rutas de API y, en las mutaciones donde la autenticación provenga de cookie, la cabecera `X-CSRF-Token` con ese valor.
4. `POST /auth/web/refresh` lee la cookie, rota el refresh token, actualiza la cookie y devuelve un access token nuevo.
5. `POST /auth/web/logout` revoca el refresh y limpia ambas cookies.

El guard de CSRF se aplica **solo** a mutaciones con cookie de sesión y sin `Authorization: Bearer`; devuelve `403 CSRF_TOKEN_INVALID` si falta o no coincide `X-CSRF-Token`. CORS se configura con `credentials: true`: en producción usa un `CORS_ORIGIN` explícito (con `*` se refleja el origen, nunca se envía el comodín con credenciales).

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

El reset borra solo los datos de ese espacio (productos, categorías, tareas, notas, archivos, escenarios y eventos de replay; emite un evento `SPACE` de reset), deja constancia en `SpaceResetAudit` y restaura los datos canónicos en la demo. Nunca toca volúmenes ni la base completa.

## Migraciones y seeds

```bash
docker compose exec app npm run prisma:migrate      # deploy idempotente
docker compose exec app npm run prisma:seed         # upserts idempotentes
docker compose exec app npm run prisma:generate     # tras editar schema.prisma
```

La migración `20241125000000_stage2` recrea el enum `MembershipRole` (`LECTOR`, `EDITOR`, `ADMINISTRADOR`), añade `isActive`/`version` a `Category` y crea `Task`, `Subtask`, `FileObject` y `SpaceScenarioConfig`. La migración `20241126000000_stage3` añade los enums `OrderStatus`/`PaymentOutcome`, la columna `duplicateOrder` del simulador y las tablas `Cart`, `CartItem`, `Order`, `OrderItem`, `PaymentSimulation` e `IdempotencyRecord`. La migración `20241127000000_stage4` añade los enums `NotificationType`, `ExportKind` y `ExportStatus`, la columna `failedAsyncJob` de `SpaceScenarioConfig` y las tablas `Notification`, `ChatRoom`, `ChatMember`, `ChatMessage`, `RealtimeEvent` y `ExportJob`. No se reescriben las migraciones anteriores.

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Bind for 0.0.0.0:3100 failed: port is already allocated` o `./start.sh` avisa de puerto ocupado | Otro proyecto/contenedor usa 3100 | **No detengas** el contenedor ajeno. Identifícalo con `docker ps --format '{{.Names}} {{.Ports}}'` y cambia `APP_HOST_PORT` en `.env` (junto con `PUBLIC_BASE_URL` y las variables de Postman). |
| Servicio `migrate` en `Exited(1)` | Migración fallida o `DATABASE_URL`/contraseña incoherente; a veces PostgreSQL aún no estaba *healthy* | `docker compose logs --tail=100 migrate`; comprueba que `POSTGRES_PASSWORD` coincide con la contraseña de `DATABASE_URL`. Corrige `.env` y vuelve a `./start.sh` (las migraciones son idempotentes). No borres volúmenes. |
| Errores de módulos / `Cannot find module` tras cambiar dependencias | `node_modules` del contenedor quedó viejo (el volumen anónimo **no** se actualiza solo al reconstruir la imagen) | `docker compose build app worker`, luego `docker compose exec app npm ci && docker compose exec app npx prisma generate` (y lo mismo en `worker`) y `docker compose restart app worker`. No mezcles `node_modules` del host con el del contenedor. |
| `npm` se queja de la versión de Node en el host (EBADENGINE) o `nest: not found` | Node del host fuera de rango (p. ej. Node 25) | Usa Docker, o `nvm use` (lee `.nvmrc` → `20.18.1`). El rango soportado es `>=20.18.1 <21`. |
| `/health/ready` no devuelve 200 | Primera vez que arranca o la app cayó | Espera unos segundos; revisa `docker compose logs --tail=100 app` y `docker compose ps`. El healthcheck comprueba PostgreSQL, **no** Redis. Para verificar Redis: `docker compose exec redis redis-cli ping` (debe devolver `PONG`) o `docker compose ps redis`. |
| `redis` no está *healthy* o el arranque espera a Redis | Imagen caída o `REDIS_URL` mal escrita (debe ser `redis://redis:6379` dentro de Compose) | Revisa `docker compose logs --tail=100 redis` y `docker compose config`. Si solo quieres probar la API sin cola, pon `JOBS_QUEUE_MODE=inline` en `.env`: `depends_on` de Redis es `required: false` y la app arranca igual. |
| Mensaje `$'\r': command not found` al ejecutar `./start.sh` en Windows | Finales de línea CRLF | El repo incluye `.gitattributes` con `eol=lf` para `*.sh` (y `eol=crlf` para `*.ps1`/`*.cmd`); vuelve a clonar o normaliza con `git add --renormalize .`. Mejor: usa `.\start.ps1`, que no depende de bash. |
| `curl` no existe en Windows | No viene instalado por defecto | Usa el equivalente con `Invoke-WebRequest` / `Invoke-RestMethod` mostrado arriba, o instala curl. |
| No aparece MinIO / errores al activar `FILES_STORAGE=s3` | El servicio está **comentado** a propósito (imagen no verificable desde el entorno original) | No es un fallo: con `FILES_STORAGE=local` los archivos van al volumen `files_data` y las pruebas usan un stub. Solo descomenta MinIO si verificas el tag y configuras `MINIO_ROOT_*` y `S3_*`. |
| Los export jobs se quedan en `PENDING` | Modo `redis` sin worker, Redis caído o `WORKER_MODE` no fijado | `docker compose ps` y `docker compose logs --tail=100 worker`; debe aparecer `Worker BullMQ escuchando exports`. Para pruebas sin Redis usa `JOBS_QUEUE_MODE=inline`. |
| El worker se reinicia en bucle con `exit 0` | `WORKER_MODE` no llegó al contenedor (ConfigModule valida antes del `main`) | Verifica que el servicio `worker` de `docker-compose.yml` incluya `WORKER_MODE: "true"` y reinícialo. |
| WebSocket devuelve `ws:error AUTH_TOKEN_INVALID` | Token de acceso vencido o se envió el refresh token | Usa un `accessToken` vigente en `auth.token` o `Authorization: Bearer`; renueva con `/auth/refresh`. |
| Mutación web devuelve `403 CSRF_TOKEN_INVALID` | Falta `X-CSRF-Token` o la cookie `csrf_token` cambió | Llama a `GET /auth/csrf`, guarda `data.csrfToken` y envíalo en la cabecera. Con Bearer el guard no se aplica. |

## Backup y restore

> **Los volúmenes no son backups.** `postgres_data`, `files_data`, `redis_data` y `minio_data` residen en el mismo host: desaparecen si se borran, se corrompen o falla el disco. `redis_data` guarda solo el transporte de la cola: el estado de los trabajos está en PostgreSQL y el worker reencola los huérfanos al arrancar, pero una pérdida de Redis puede retrasar los trabajos pendientes. Guarda los archivos generados **fuera del host** y **prueba la restauración** en una BD separada antes de necesitarla de verdad. Para una copia estrictamente consistente (BD + archivos), detén la API primero con `docker compose stop app` y vuelve a levantarla con `docker compose up -d app`. Los backups generados (`backup.sql`, `*.tgz`, `backups/`) están ignorados por Git: **no los subas al repositorio** y guárdalos en almacenamiento externo/cifrado.

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

# Comprobación rápida: deben aparecer init, stage2, stage3 y stage4 con finished_at
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
  -e JOBS_QUEUE_MODE=inline \
  -e DATABASE_URL='postgresql://practicas:dev_password_change_me@postgres:5432/practicas_test?schema=public' \
  app sh -c 'npm run prisma:migrate && npm run test:e2e'
```

El `setupFiles` de Jest también fija `JOBS_QUEUE_MODE=inline` y `WORKER_MODE=false`, así que las e2e **no dependen de Redis ni del worker** aunque el `.env` diga `redis`. Para no hardcodear la contraseña también puedes derivar la URL dentro del contenedor:

```bash
docker compose exec -T -e JOBS_QUEUE_MODE=inline app sh -c \
  'TEST_URL="$(printf "%s" "$DATABASE_URL" | sed "s|/practicas?|/practicas_test?|")"; \
   DATABASE_URL="$TEST_URL" npm run test:e2e'
```

Estado: **15 suites e2e, 87/87 pruebas** (67 de Etapas 1-3 + notificaciones, realtime/chat/replay, jobs inline/descarga/`failedAsyncJob` y cookies/CSRF) y **4 suites unitarias, 9/9**. Los archivos no requieren MinIO en CI: se usa un stub inyectado en el token `STORAGE_PROVIDER`.

> Las e2e se ejecutan **dentro del contenedor `app`** (donde el host `postgres` existe) contra `practicas_test`, como muestra el comando anterior. Nunca apuntes las pruebas a la BD de los estudiantes ni borres volúmenes.

## Estructura

Vista rápida de la raíz del repositorio:

```
backendPruebas/
├── README.md                       esta guía
├── propuesta_backend_estudiantes.md
├── .env.example                    plantilla VERSIONADA (placeholders)
├── .env                            local, NUNCA versionado (ignorado por Git)
├── .gitignore, .gitattributes      ignorados; eol=lf para *.sh, eol=crlf para *.ps1/*.cmd
├── docker-compose.yml, Dockerfile  app, worker, postgres, redis, mailpit, migrate (MinIO comentado)
├── install.sh, start.sh,           wrappers bash en la raíz (macOS / Linux)
│   stop.sh, restart.sh
├── install.ps1, start.ps1,         wrappers PowerShell en la raíz (Windows nativo)
│   stop.ps1, restart.ps1
├── install.cmd, start.cmd,         wrappers cmd.exe / doble clic (Windows)
│   stop.cmd, restart.cmd
├── scripts/                        lógica del ciclo de vida (.sh y .ps1)
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
  simulator/                                 config por espacio, interceptor, endpoints (12 escenarios)
  notifications/                             notificaciones por usuario/espacio + WS notification:new
  realtime/                                  gateway Socket.IO, chat, replay, emisores de eventos
  jobs/, worker/                             export jobs, cola BullMQ/inline, worker y retención
  web-auth/                                  cookies HttpOnly, CSRF double-submit, login web
  mail/, database/                           SMTP de pruebas y datos canónicos
prisma/
  schema.prisma, migrations/ (init, stage2, stage3, stage4), seed.ts
test/                                       15 suites e2e + utils (JOBS_QUEUE_MODE=inline)
Dockerfile, docker-compose.yml, .env.example
```

## Pendiente real

- Portal del estudiante (UI) y guías cliente (JS/Kotlin/Retrofit) para el Nivel 5.
- MinIO sigue comentado (imagen no verificable desde el entorno original); las exportaciones usan storage local.
- El replay cubre los eventos persistidos por espacio; no hay suscripción selectiva por tipo de recurso.

## Limitaciones conocidas

- MinIO queda comentado: la imagen fijada no se pudo verificar desde este entorno (Docker Hub `insufficient_scope`, quay.io exige autenticación). Ver instrucciones exactas en `docker-compose.yml` y arriba.
- La limpieza S3 no es transaccional con PostgreSQL; se registran claves pendientes para reconciliación.
- El host de generación tenía Node 25; la imagen y `.nvmrc` fijan Node 20.18.1, que es el entorno objetivo.
- El puerto host 3000 estaba ocupado por un proyecto ajeno durante el smoke test; no se detuvo ese contenedor.
- Las salas WebSocket se resuelven al conectar: si cambia la membresía de un equipo, reconecta para refrescar las suscripciones.
- BullMQ no garantiza exactly-once: se usa un `updateMany` condicional para evitar procesar dos veces un trabajo ya `COMPLETED`. Para despliegues con varios workers, revisar la estrategia de concurrencia.
