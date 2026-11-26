# Backend de práctica para estudiantes — Etapas 1 a 4

API REST de práctica construida con **NestJS + TypeScript + Prisma + PostgreSQL**, ejecutada con **Docker Compose**. La Etapa 2 añade **categorías, archivos, tareas, roles de equipo y simulador**; la Etapa 3, **carrito, pedidos transaccionales, pagos simulados e idempotencia**; la Etapa 4 añade **notificaciones, WebSocket/chat con replay, exportaciones asíncronas (Redis/BullMQ + worker) y login web con cookies HttpOnly + CSRF**. El **portal del estudiante** (`http://localhost:3100/portal`) es una UI vanilla servida por la propia aplicación y reutiliza esos endpoints.

> **Persistencia: código vs datos.** El código fuente vive en este repositorio Git (`.gitignore` excluye `node_modules`, `dist`, `.env` y backups; `.gitattributes` fuerza `eol=lf` en `*.sh`/`*.bash`). Docker guarda la **ejecución** y los **datos**: PostgreSQL, Redis, Mailpit y el almacenamiento de archivos usan **volúmenes nombrados** (`postgres_data`, `redis_data`, `mailpit_data`, `files_data` y `minio_data`, reservado). Borrar contenedores no borra volúmenes.

## Guías

- [Guía de coding challenges para estudiantes (índice)](docs/coding-challenges.md) — 24 desafíos, uno por archivo en `docs/challenges/`.
- [Colección y environment de Postman](postman/README.md)
- [Exponer la API con Cloudflare Tunnel](#exponer-la-api-con-cloudflare-tunnel) — URL pública para estudiantes; los datos siguen en tu máquina.

## Flujo del estudiante (sin instalación)

Los estudiantes **no instalan ni arrancan nada**: el backend corre en tu máquina y solo consumen la URL pública.

1. Reciben de ti la URL `https://<TU-TUNNEL>.trycloudflare.com` (temporal: cambia en cada ejecución del túnel).
2. Importan la [colección y el environment de Postman](postman/README.md) y **pegan esa única URL en `tunnelUrl`**. Un script de la collection deriva `hostUrl` (raíz), `baseUrl` (raíz + `/api/v1`) y `wsBaseUrl` (con `wss://`); ejecutar **Portal › Manifiesto** las refresca desde la URL vigente que devuelve la app. No copian la URL en cuatro sitios ni instalan nada.
3. Abren el portal y Swagger en `https://<TUNNEL>/portal` y `https://<TUNNEL>/docs`. La UI de Mailpit **no se expone**: cada estudiante ve solo sus correos en el portal (`GET /api/v1/mail/me`).
4. Hacen el [Nivel 0 del índice de challenges](docs/coding-challenges.md#nivel-0--conexión-a-la-api-pública) y continúan en orden.

> Si el túnel se reinicia, comparte la URL nueva: las anteriores dejan de funcionar. El profesor no edita `.env`: el túnel escribe la URL en `run/tunnel-url.txt` y la app la usa en runtime. El estudiante solo vuelve a pegar la URL en `tunnelUrl` y ejecuta el manifiesto. El profesor puede abrir el túnel al terminar `./start.sh` (la terminal le pregunta) o manualmente; los comandos de esta guía siguen siendo solo para el anfitrión.

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

## Instalación (guía reproducible en macOS / Linux)

Sigue estos pasos **en orden** en macOS o Linux. Todos los comandos se ejecutan desde una terminal bash situada en la carpeta del proyecto. Si algo falla, salta a [Solución de problemas](#solución-de-problemas).

### Instalación automática

El instalador ejecuta estos pasos por ti (raíz del proyecto, requisitos, `.env`, puerto, `docker compose config` y arranque), e imprime un resumen final con las URLs reales.

```bash
git clone <URL> && cd <REPO> && ./install.sh
```

Sustituye `<URL>` y `<REPO>` por tu repositorio real (son marcadores de posición). Si ya tienes el código, ejecuta desde la raíz `./install.sh` o `npm run project:install`.

| Opción | Efecto |
|---|---|
| `--no-seed` | Omite el seed (se reenvía al script de arranque). |
| `--yes`, `--non-interactive` | Acepta defaults; **no** sobrescribe un `.env` existente. |
| `--repo-url URL` | Repositorio a clonar si no se está en la raíz (también `REPO_URL`). |
| `--target DIR` | Directorio destino del clon. |
| `--install-deps` | Permite intentar instalar dependencias del sistema **solo tras confirmación explícita**; `--yes` **no** la otorga. |
| `-h`, `--help` | Muestra la ayuda. |

> El instalador **no sube nada a GitHub** (no configura remote ni hace push) y **no instala dependencias del sistema sin confirmación**; `--yes` tampoco autoriza esa instalación. La guía manual detallada sigue a continuación.

### 1. Requisitos previos

| Requisito | macOS | Linux | Cómo comprobarlo |
|---|---|---|---|
| Docker | **Docker Desktop for Mac** (con el motor arrancado) | **Docker Engine 29+** y el plugin **Docker Compose v5+** (`docker compose`, con espacio; no el `docker-compose` clásico) | `docker --version` y `docker compose version` |
| Git | Git del sistema (Xcode Command Line Tools o Homebrew) | Git del sistema | `git --version` |
| Node.js y npm | **Solo si vas a trabajar fuera de Docker**: Node `20.18.1` (ver `.nvmrc`; `engines: >=20.18.1 <21`) y npm | Igual | `node --version` → `v20.18.1` |
| `curl` | Opcional | Opcional | `curl --version` |
| Puertos | **3100** (API) y **8025** (Mailpit) libres en el host | Igual | `docker ps` / `lsof -i :3100` |

> No necesitas instalar PostgreSQL, Prisma ni Node dentro de Docker: las imágenes ya los traen. El contenedor siempre escucha en `3000`; el host publica `APP_HOST_PORT` (por defecto `3100`).

### 2. Clonar el repositorio

```bash
git clone https://github.com/<TU-USUARIO>/<REPO>.git
cd <REPO>
```

Sustituye `<TU-USUARIO>` y `<REPO>` por tu usuario y nombre de repositorio reales (son marcadores de posición, no un usuario inventado). Si ya descargaste el código como ZIP, puedes omitir `git clone` pero **no** omitir el paso 3.

### 3. Configurar el entorno

```bash
cp .env.example .env
```

Reglas importantes:

- `.env.example` es la **única** plantilla versionada y contiene solo valores de desarrollo/placeholders (`CHANGE_ME_*`, `dev_password_change_me`).
- `.env` es **local y nunca se versiona** (`git check-ignore -v .env` debe mostrar la regla de `.gitignore`). No lo compartas ni lo subas a GitHub.
- Con los valores de ejemplo no hay que editar nada. Si cambias el puerto, **actualiza `APP_HOST_PORT` y `PUBLIC_BASE_URL`** (p. ej. `http://localhost:4000`); las variables de Postman se derivan solas desde `tunnelUrl`. Los correos construyen enlaces como `${PUBLIC_BASE_URL}/api/v1/...` salvo que haya un archivo de túnel vigente.
- `POSTGRES_PASSWORD` y la contraseña dentro de `DATABASE_URL` deben ser la misma (`dev_password_change_me` en la plantilla). Si cambias una, cambia la otra.

### 4. Arranque

Forma recomendada (espera a migraciones, healthcheck y seed idempotente automáticamente):

```bash
./start.sh
# o: npm run project:start
```

- Al terminar correctamente el arranque (después de health y seed), si la terminal es interactiva, `start.sh` ofrece abrir el túnel: `¿Quieres generar la URL pública con Cloudflare Tunnel para compartirla con tus estudiantes? [y/N]`. Responde `y` y se imprimirá la URL temporal; con `N` o Enter sigues en local y se te indica el comando manual. Ver [Exponer la API con Cloudflare Tunnel](#exponer-la-api-con-cloudflare-tunnel).
- Los scripts `.sh` funcionan tal cual en macOS/Linux (`.gitattributes` garantiza finales de línea LF).
- Alternativa manual: `docker compose up -d --build`, esperar a `migrate` con `docker compose logs -f migrate` y ejecutar `docker compose exec -T app npm run prisma:seed`.

`docker compose` espera a PostgreSQL y Redis *healthy* (Redis es opcional con `JOBS_QUEUE_MODE=inline`), ejecuta las migraciones (`migrate`, una sola vez) y solo después arranca la API y el `worker`. El código se monta desde el host y `start:dev` recarga cambios; `node_modules` vive en un volumen anónimo separado. Con `docker compose ps` deben aparecer `postgres`, `redis`, `mailpit`, `migrate` (`Exited(0)`), `app` (*healthy*) y `worker` (*up*, sin puerto HTTP). El seed es **idempotente** (IDs/slugs fijos + `upsert`): incluye la demo pública (8 productos en 3 categorías), el espacio personal (3 categorías, 2 productos, 2 notas y 3 tareas con subtareas) y el usuario de prueba. Repetirlo no duplica nada.

### 5. Verificación

```bash
curl -i http://localhost:3100/health/ready        # espera 200
curl -i 'http://localhost:3100/api/v1/public/products?page=1&limit=20'
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

### URLs y usuario de prueba

Las URLs de la API usan el puerto host configurado en `APP_HOST_PORT` (`3100` en este entorno; la plantilla usa el mismo valor). Si cambias ese valor, sustituye `3100` por él en los ejemplos **y actualiza `PUBLIC_BASE_URL`** con el mismo puerto. Ese valor es el fallback: cuando el túnel publica una URL, `run/tunnel-url.txt` tiene prioridad sobre él.

| Recurso | URL |
|---|---|
| API | `http://localhost:${APP_HOST_PORT:-3100}/api/v1` |
| Swagger UI | `http://localhost:${APP_HOST_PORT:-3100}/docs` |
| Liveness / Readiness | `http://localhost:${APP_HOST_PORT:-3100}/health/live`, `/health/ready` |
| UI de Mailpit (solo host) | `http://127.0.0.1:8025` |
| Portal del estudiante | `http://localhost:${APP_HOST_PORT:-3100}/portal` |

```
email:    estudiante@practicas.local
password: Estudiante.123
```

> **Credencial SOLO de desarrollo / práctica; no usar en producción.** La crea el seed y sirve para probar la API. Cámbiala o elimínala antes de desplegar.

> Nota operativa: si el puerto host `3000` está ocupado por otro proyecto, **no lo detengas**. Este workspace define `APP_HOST_PORT=3100` en `.env` (y en `.env.example`) y el compose publica `3100:3000` sin tocar el contenedor ajeno. Los scripts usan `3000` solo como respaldo si la variable no existe.

## Portal del estudiante

URL: **`http://localhost:3100/portal`** (sustituye `3100` por `APP_HOST_PORT` si cambiaste el puerto). Es HTML/CSS/JavaScript **vanilla**, servido por la propia NestJS en `/portal` con assets en `/portal/assets/...`; no usa frameworks ni CDN y no interfiere con `/docs`, `/health/*` ni `/api/v1`.

Qué permite:

- **Login web** con el flujo existente `POST /api/v1/auth/web/login` (cookies `HttpOnly` + CSRF), renovación automática con `POST /auth/web/refresh` y cierre de sesión con `POST /auth/web/logout`. El **access token y el token CSRF se guardan solo en memoria** del navegador: nunca en `localStorage`/`sessionStorage`. Las mutaciones con Bearer no necesitan CSRF; `refresh`/`logout` envían `X-CSRF-Token` (si se perdió tras recargar, se obtiene con `GET /auth/csrf`).
- **Información base**: URL de la API, Swagger, descargas de la collection y el environment de Postman y guía Markdown.
- **Espacios**: listado (personal, equipos del usuario y demo pública), selección, creación de sandbox anónimo y de equipo, y visualización del `spaceId` activo.
- **Datos iniciales / reset**: reinicio del espacio activo con confirmación. Reutiliza `POST /spaces/me/reset`, `POST /spaces/:spaceId/reset` y `POST /public/sandboxes/:spaceId/reset`. En la demo pública ese reset **restaura los datos canónicos del seed**; no borra volúmenes ni la base completa.
- **Simulador**: las 12 claves reales (`slowResponse` … `failedAsyncJob`), activables por espacio con `GET/PATCH /spaces/me/scenarios` (personal) o `GET/PATCH /spaces/:spaceId/scenarios` (equipo, solo `ADMINISTRADOR`). En sandbox/demo se muestran deshabilitadas porque no hay memberships.
- **Correos propios**: bandeja mediada por `GET /api/v1/mail/me`. El backend consulta la API interna de Mailpit con `to:<email del usuario>` y **filtra de nuevo** por los destinatarios antes de responder. Nunca se expone la UI de Mailpit (`127.0.0.1:8025` sigue siendo solo host) ni se devuelven cuerpos/snippets, porque contienen tokens de verificación/recuperación.
- **Ejercicios**: resumen de los niveles 0-6 de `docs/coding-challenges.md` con ejemplos `curl`, JavaScript y Kotlin, y enlace a la guía completa.

Endpoints nuevos del portal (todos requieren `Authorization: Bearer <accessToken>`, salvo la página):

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/portal` | Página HTML (fuera de `/api/v1`, sin autenticación). |
| `GET` | `/api/v1/portal/manifest` | URLs base, Swagger, descargas, 12 escenarios y niveles 0-6. |
| `GET` | `/api/v1/portal/spaces` | Espacios seleccionables y `spaceId` activo. |
| `GET` | `/api/v1/portal/guide` | Guía de challenges en Markdown (`text/markdown`). |
| `GET` | `/api/v1/portal/postman/collection` | Descarga autorizada del JSON de la collection. |
| `GET` | `/api/v1/portal/postman/environment` | Descarga autorizada del JSON del environment. |
| `GET` | `/api/v1/mail/me` | Correos de prueba **solo del usuario autenticado**. |

> Los enlaces de descarga y de guía del portal se resuelven con `fetch` + Bearer y se entregan como `Blob`: un `<a href>` normal no enviaría la cabecera. No existe acceso directo al filesystem ni a la UI de Mailpit desde el navegador del estudiante. El manifiesto incluye `error.code`, `message` y `requestId` en cualquier fallo (mostrados en la UI).

> `MAILPIT_API_URL` (opcional) permite fijar la API interna de Mailpit; por defecto se deriva como `http://${SMTP_HOST}:8025/api/v1` (en Compose, `http://mailpit:8025/api/v1`). Ver [variables nuevas de la Etapa 4](#variables-nuevas-de-la-etapa-4).

## Secretos y seguridad

- **Nunca commitees `.env`**, ni `.env.test`, ni exports de Postman con tokens. Versiona solo `.env.example` con placeholders (`CHANGE_ME_*` / `dev_password_change_me`). Verifica con `git check-ignore -v .env`.
- **Antes de desplegar**, genera JWT secrets nuevos y aleatorios (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, ≥32 caracteres), cambia `POSTGRES_PASSWORD` (y `DATABASE_URL`) y cualquier credencial S3/MinIO. Rotar el JWT secret invalida los tokens emitidos con el anterior.
- **No expongas Mailpit fuera de localhost**: `docker-compose.yml` lo enlaza a `127.0.0.1:8025`. No publiques PostgreSQL (sin `ports`) ni MinIO a la red; tampoco pongas `S3_PRESIGN=true` con un endpoint público accesible desde estudiantes.
- **No compartas tokens** de acceso/refresh ni los pegues en issues, capturas o archivos del repo. Los tokens se guardan revocables en PostgreSQL; la UI de Postman limpia `initialValue` y marca `password` como `secret`.
- **Si subiste un secreto por accidente:** 1) rota ese secreto **ya** (JWT, contraseña de BD, claves S3) y revoca sesiones; 2) trata el valor como comprometido aunque borres el archivo después; 3) reescribe el historial (`git filter-repo`/BFG) **antes** de hacer push; 4) si ya hiciste push, avisa al equipo/proveedor y rota de nuevo. Borrar el archivo en un commit nuevo **no** es suficiente.

## Uso diario y ciclo de vida

Los scripts canónicos están en `scripts/`; en la raíz hay wrappers bash para ejecutarlos directamente (macOS/Linux).

| Acción | bash (macOS / Linux) | npm |
|---|---|---|
| Arrancar (con seed) | `./start.sh` | `npm run project:start` |
| Detener (sin borrar volúmenes) | `./stop.sh` | `npm run project:stop` |
| Reiniciar sin seed | `./restart.sh --no-seed` | `npm run project:restart -- --no-seed` |
| Instalar | `./install.sh` | `npm run project:install` |
| Aplicar migraciones | `docker compose exec app npm run prisma:migrate` | `npm run prisma:migrate` si trabajas fuera de Docker |
| Seed idempotente | `docker compose exec app npm run prisma:seed` | `npm run prisma:seed` fuera de Docker |
| Regenerar cliente Prisma | `docker compose exec app npm run prisma:generate` | Tras editar `prisma/schema.prisma` |
| Pruebas unitarias | `docker compose exec app npm test` | `npm test` con Node 20.18.1 en el host |
| Pruebas e2e (`practicas_test`) | Ver [Ejecutar pruebas](#ejecutar-pruebas); **nunca** contra la BD de estudiantes | Igual |
| Ver logs | `docker compose logs -f app` | `docker compose logs --tail=100 migrate` (migraciones), `worker` (exports) o `redis` (cola) |
| Ver estado | `docker compose ps` | Incluye `migrate` (`Exited(0)` = OK), `redis` (*healthy*) y `worker` (*up*) |

`start.sh` localiza la raíz del proyecto desde su ubicación, lee `APP_HOST_PORT` de `.env` (default `3000`), avisa si el puerto está ocupado por un contenedor ajeno **sin detenerlo**, ejecuta `docker compose up -d --build`, espera a que `migrate` termine con código 0 y a que `GET /health/ready` responda 200 (60 s cada espera), y aplica el seed idempotente. La opción `--no-seed` omite el seed. Al terminar imprime las URLs reales con el puerto configurado y, en terminal interactiva, ofrece abrir el túnel público. En ejecuciones no interactivas (sin TTY, p. ej. CI) y con las variables de omisión (`SKIP_TUNNEL_PROMPT=1`, `SKIP_PUBLIC_URL_PROMPT=1`, `SKIP_PUBLIC_URL=1` y sus alias) **no se hace la pregunta ni se abre el túnel**: se imprime el comando manual para abrirlo después. Si aceptas, reutiliza `scripts/start-with-public-url.mjs` en modo `--tunnel-only` con `PORT=$APP_HOST_PORT`: no recompila, no levanta otro backend y no repite la pregunta. `Ctrl+C` cierra el túnel sin detener Docker.

`stop.sh` ejecuta `docker compose down` **sin `-v`**: los volúmenes `postgres_data`, `redis_data`, `mailpit_data` y `files_data` se conservan, así como `minio_data` (reservado). No acepta opciones que borren datos (p. ej. `-v` o `--volumes`). `restart.sh` encadena el apagado y el arranque, reenviando argumentos como `--no-seed`.

El puerto publicado se controla únicamente con `APP_HOST_PORT` en `.env` (en este entorno, `3100` porque el `3000` lo ocupa otro proyecto).

## Postman y guías de estudio

1. Abre Postman → **Import → Upload Files** y selecciona `postman/backend-practicas.postman_collection.json` y `postman/backend-practicas.postman_environment.json`.
2. Selecciona el environment **Backend Prácticas - URL pública (estudiantes)**. Pega la URL del túnel **solo en `tunnelUrl`**; un script a nivel collection deriva `hostUrl`, `baseUrl` y `wsBaseUrl`, y **Portal › Manifiesto** las vuelve a derivar desde la URL vigente de la app. Solo repite eso cuando el túnel dé una URL nueva; ver [Flujo del estudiante](#flujo-del-estudiante-sin-instalación).
3. Ejecuta primero **Health › Readiness** y luego **Auth › Login**: los scripts autopueblan `accessToken`, IDs y `version`. Si no hay login, las peticiones con Bearer devuelven 401.
4. Detalles, flujo recomendado, roles, simulador, Etapa 3 y la nueva carpeta **Portal** (manifiesto, descargas, espacios y bandeja propia): [postman/README.md](postman/README.md).
5. Ejercicios y retos para estudiantes: [docs/coding-challenges.md](docs/coding-challenges.md). El [portal](#portal-del-estudiante) muestra el mismo resumen con ejemplos.

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
| `MAILPIT_API_URL` | `http://${SMTP_HOST}:8025/api/v1` | API interna de Mailpit usada solo por `/api/v1/mail/me`. Opcional; no expone la UI de Mailpit. |

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

## Exponer la API con Cloudflare Tunnel

Cloudflared abre un **túnel saliente**: el proceso corre en tu máquina y conecta con Cloudflare; las peticiones a `https://xxxx.trycloudflare.com` se reenvían a `http://127.0.0.1:<puerto>` de tu equipo. **No abres puertos entrantes**, no necesitas IP pública y solo se publica HTTP hacia la API: PostgreSQL, Redis y Mailpit siguen siendo internos. Todo se guarda en tu máquina; Cloudflare únicamente transporta peticiones.

> **Lo que hace realmente el código:** `scripts/start-with-public-url.mjs` lanza un **quick tunnel anónimo** con `cloudflared tunnel --url http://127.0.0.1:$PORT`. No hay túnel nombrado, ni `config.yml`, ni token de Cloudflare. La URL `https://*.trycloudflare.com` es aleatoria, se lee de la salida del proceso y cambia en cada ejecución. `./start.sh` ofrece este mismo túnel al final del arranque, invocando el script con `--tunnel-only` y `PORT=$APP_HOST_PORT` para apuntar al puerto real de la API.

### Requisitos

- `cloudflared` instalado. En macOS (Homebrew): `brew install cloudflare/cloudflare/cloudflared`. En otras plataformas: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/. Verifica con `cloudflared --version`.
- La aplicación corriendo. Dos modos (elige **uno**, no los mezcles):
  - **Docker (recomendado, ya usado en esta guía):** `./start.sh` y, cuando pregunte al final, acepta el túnel hacia `http://127.0.0.1:$APP_HOST_PORT` (3100 por defecto). Si lo rechazas, ábrelo después con el comando manual de abajo.
  - **Directo (script Node):** `npm start` / `npm run start:public`, que usa `PORT` (default 3000, **no** `APP_HOST_PORT`).
- Node 20.18.1 y npm solo para el modo directo; `curl` para comprobar la API.

Si `cloudflared` no está en el `PATH`, el script avisa y deja el backend funcionando solo en local.

### Comandos exactos (según el script)

```bash
# Modo directo: arranca backend y pregunta si quieres el túnel (interactivo)
npm start                    # = node scripts/start-with-public-url.mjs
# Equivalente sin pregunta (fija PUBLIC_URL_AUTO=1):
npm run start:public         # o: npm run start:tunnel
# Reinicia liberando el puerto y vuelve al flujo interactivo:
npm run restart              # = node scripts/start-with-public-url.mjs --restart

# Modo Docker (recomendado): arranca la app y pregunta si quieres el túnel
./start.sh
#   ... migrate + health + seed ...
#   ¿Quieres generar la URL pública con Cloudflare Tunnel para compartirla con tus estudiantes? [y/N]
#   y -> imprime la URL temporal; N/Enter -> sigue solo en local

# Si respondiste N (o no hay TTY), ábrelo después en una terminal:
cloudflared tunnel --url http://127.0.0.1:3100   # 3100 = APP_HOST_PORT; usa el tuyo
```

Flujo del script en modo directo: compila si falta `dist/main.js` → arranca `node dist/main.js` en `PORT` → espera `/health/ready` → pregunta `¿Quieres generar la URL pública (Cloudflare Tunnel) para compartir con tus estudiantes? [y/N]` → si respondes `y`, lanza `cloudflared tunnel --url http://127.0.0.1:$PORT`, extrae la URL y la imprime destacada con Swagger/API/Health. `Ctrl+C` cierra túnel y backend.

Flujo en modo Docker: `./start.sh` hace build/up, espera migrate/health y aplica el seed **antes** de preguntar; si aceptas, llama a `PORT=$APP_HOST_PORT node scripts/start-with-public-url.mjs --tunnel-only`. Ese modo solo comprueba `/health/ready` y abre el túnel: no compila, no inicia un segundo backend (evita `EADDRINUSE`) y no vuelve a preguntar. `Ctrl+C` cierra el túnel; los contenedores siguen activos.

La URL impresa (`https://xxxx.trycloudflare.com`) es la **única** que compartes con los estudiantes. Ya no hace falta copiarla en `.env` ni en cuatro variables de Postman.

### Propagación automática de la URL (ciclo de vida del profesor)

1. Al detectar la URL, `scripts/start-with-public-url.mjs` crea `run/` si hace falta y escribe `run/tunnel-url.txt`: **texto plano, una sola línea con la URL raíz** (sin `/api/v1`, sin credenciales, sin query/fragmento). Ejemplo: `https://xxxx.trycloudflare.com\n`. No contiene tokens.
2. Docker monta `./run:/app/run:ro` en `app` y `worker` (solo lectura; no se tocan los volúmenes existentes ni se hace `down -v`). La app lee ese archivo en **cada uso** a través de `PublicUrlService`: si cambia el túnel, basta con compartir la URL nueva; **no hay que editar `.env` ni reiniciar**.
3. El servicio valida el contenido (http/https, raíz, sin credenciales/query/fragmento). Si el archivo no existe, está inválido o se eliminó, usa exactamente el comportamiento anterior con `PUBLIC_BASE_URL` (raíz; el código sigue añadiendo `/api/v1`). En `NODE_ENV=test` o con `PUBLIC_URL_FILE_DISABLED=true` el archivo se ignora para no afectar e2e.
4. Al cerrar el túnel (`Ctrl+C`, `SIGINT`/`SIGTERM`, salida del proceso, error de `cloudflared` o muerte del backend en modo directo), el script borra el archivo: no quedan URLs muertas apuntando en correos ni en el manifiesto.
5. Si el proceso se mata con `SIGKILL` no hay limpieza posible: borra `run/tunnel-url.txt` a mano antes de volver a compartir enlaces (ver [Solución de problemas](#solución-de-problemas)).

Variables relacionadas: `PUBLIC_URL_FILE` (default `./run/tunnel-url.txt`, relativa al cwd; `/app/run/...` dentro de Docker) y `PUBLIC_URL_FILE_DISABLED` (escape para e2e). `run/` está gitignored y es local/efímero.

### Cómo configurar la URL pública (fallback)

1. **`.env` (solo fallback de enlaces generados):** `PUBLIC_BASE_URL` debe ser la raíz **sin `/api/v1`**. En local, `http://localhost:3100` (mismo puerto que `APP_HOST_PORT`). **No lo cambies al abrir el túnel**: el archivo del túnel tiene prioridad. Si no hay archivo, el código sigue construyendo `${PUBLIC_BASE_URL}/api/v1/...`, `${PUBLIC_BASE_URL}/docs` y `${PUBLIC_BASE_URL}/portal` como siempre.
2. **Postman:** pega la URL del profesor **solo en `tunnelUrl`**; el script de la collection deriva `hostUrl`, `baseUrl` y `wsBaseUrl`, y **Portal › Manifiesto** las actualiza desde `data.baseUrl` (la URL vigente que devuelve la app). Consulta [postman/README.md](postman/README.md#usar-la-url-pública-de-cloudflare-tunnel).
3. **Portal y Swagger:** abre `https://xxxx.trycloudflare.com/portal` y `https://xxxx.trycloudflare.com/docs`. El manifiesto (`GET /api/v1/portal/manifest`, con Bearer) y los enlaces de los correos usan la URL vigente resuelta en runtime.

### Qué NO exponer

- La UI de **Mailpit** (`http://127.0.0.1:8025`): es solo del host; el portal lee los correos por `/api/v1/mail/me`.
- **PostgreSQL, Redis, tokens JWT, `.env` ni archivos de configuración/credenciales de cloudflared.** El túnel solo publica el puerto HTTP de la API.

### Persistencia

Los datos siguen en los volúmenes Docker de tu máquina (`postgres_data`, `mailpit_data`, `files_data`, `redis_data`), no en la nube. Cloudflare no almacena tu base ni tus archivos: solo transporta peticiones. Los [backups](#backup-y-restore) se siguen haciendo en local.

### Seguridad y recomendaciones

- La URL es **temporal y aleatoria**: cada reinicio genera una nueva; trátala como un secreto compartido solo con tus estudiantes. Si se filtra, reinicia el túnel para rotarla: el archivo se reescribe solo y los estudiantes pegan la nueva en `tunnelUrl` + ejecutan el manifiesto.
- El quick tunnel **no tiene autenticación**: cualquiera con la URL accede. Úsalo solo para práctica/demo con datos de ejemplo; para un despliegue real, migrar a un túnel nombrado con **Cloudflare Access** (config/credenciales en local, fuera del repo).
- No compartas correos reales, contraseñas ni tokens en capturas o logs, y no subas `.env`, tokens ni config de cloudflared a Git (`.env` ya está gitignored).
- **No apto para producción** ni datos sensibles. Cloudflare puede limitar o cerrar túneles sin aviso.
- El backend corre en tu máquina: si la apagas o cierras la terminal, la URL deja de funcionar.
- En entornos sin TTY (CI/Docker) no se ofrece ni abre el túnel y `start.sh` imprime el comando manual. Para forzar el túnel sin pregunta usa `PUBLIC_URL_AUTO=1`.
- No se instala `cloudflared` automáticamente: si falta, se muestran las instrucciones de instalación y el arranque termina sin error.

### Variables de entorno del script

| Variable | Efecto real |
|---|---|
| `PUBLIC_URL_AUTO=1` / `CLOUDFLARE_TUNNEL_AUTO=1` / `START_WITH_PUBLIC_URL=1` | Genera el túnel sin preguntar (también en `./start.sh`). |
| `SKIP_PUBLIC_URL=1` / `NO_PUBLIC_URL=1` / `PUBLIC_URL=0` | No crea túnel ni pregunta. |
| `SKIP_TUNNEL_PROMPT=1` / `SKIP_PUBLIC_URL_PROMPT=1` | Igual que `SKIP_PUBLIC_URL`: `./start.sh` no ofrece ni abre el túnel (útil en CI); imprime el comando manual para abrirlo después. |
| `PORT` | Puerto del backend en modo directo (default 3000). Distinto de `APP_HOST_PORT`. |
| `TUNNEL_ONLY=1` / `--tunnel-only` | Modo interno usado por `./start.sh`: no compila ni arranca backend, solo abre el túnel en `PORT`. |
| `READY_TIMEOUT_MS` | Espera máxima a `/health/ready` en el script (default 60000). |
| `FORCE_BUILD=1` / `SKIP_BUILD=1` | Fuerza u omite `npm run build`. |
| `PUBLIC_URL_FILE` | Ruta del archivo efímero propagado (default `./run/tunnel-url.txt`). Lo usan el script y la app. |
| `PUBLIC_URL_FILE_DISABLED=true` | Ignora el archivo y fuerza el fallback `PUBLIC_BASE_URL` (útil en e2e; `NODE_ENV=test` ya lo hace). |

No hay variables de token ni de nombre de túnel: el quick tunnel no las usa. Plantilla comentada en [.env.example](.env.example).

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Bind for 0.0.0.0:3100 failed: port is already allocated` o `./start.sh` avisa de puerto ocupado | Otro proyecto/contenedor usa 3100 | **No detengas** el contenedor ajeno. Identifícalo con `docker ps --format '{{.Names}} {{.Ports}}'` y cambia `APP_HOST_PORT` y `PUBLIC_BASE_URL` en `.env`; en Postman pega la nueva raíz en `tunnelUrl`. |
| Enlaces de correos/manifiesto apuntan a un dominio `trycloudflare.com` viejo | `run/tunnel-url.txt` quedó stale (túnel reiniciado con `SIGKILL` o archivo copiado de otra sesión) | Comprueba `cat run/tunnel-url.txt`; si la URL ya no responde, `rm run/tunnel-url.txt` (o abre/cierra el túnel para que se reescriba). La app volverá a `PUBLIC_BASE_URL` o a la URL nueva sin reinicio. |
| La app sigue usando `localhost` con el túnel activo | El archivo no existe, no es texto plano con la URL raíz o el contenedor no ve el bind mount | Verifica `cat run/tunnel-url.txt` (una sola línea, sin `/api/v1`), `docker compose config` (montaje `./run:/app/run:ro` en `app`/`worker`) y reinicia el túnel. Si quieres forzar el fallback: `PUBLIC_URL_FILE_DISABLED=true`. |
| Servicio `migrate` en `Exited(1)` | Migración fallida o `DATABASE_URL`/contraseña incoherente; a veces PostgreSQL aún no estaba *healthy* | `docker compose logs --tail=100 migrate`; comprueba que `POSTGRES_PASSWORD` coincide con la contraseña de `DATABASE_URL`. Corrige `.env` y vuelve a `./start.sh` (las migraciones son idempotentes). No borres volúmenes. |
| Errores de módulos / `Cannot find module` tras cambiar dependencias | `node_modules` del contenedor quedó viejo (el volumen anónimo **no** se actualiza solo al reconstruir la imagen) | `docker compose build app worker`, luego `docker compose exec app npm ci && docker compose exec app npx prisma generate` (y lo mismo en `worker`) y `docker compose restart app worker`. No mezcles `node_modules` del host con el del contenedor. |
| `npm` se queja de la versión de Node en el host (EBADENGINE) o `nest: not found` | Node del host fuera de rango (p. ej. Node 25) | Usa Docker, o `nvm use` (lee `.nvmrc` → `20.18.1`). El rango soportado es `>=20.18.1 <21`. |
| `/health/ready` no devuelve 200 | Primera vez que arranca o la app cayó | Espera unos segundos; revisa `docker compose logs --tail=100 app` y `docker compose ps`. El healthcheck comprueba PostgreSQL, **no** Redis. Para verificar Redis: `docker compose exec redis redis-cli ping` (debe devolver `PONG`) o `docker compose ps redis`. |
| `redis` no está *healthy* o el arranque espera a Redis | Imagen caída o `REDIS_URL` mal escrita (debe ser `redis://redis:6379` dentro de Compose) | Revisa `docker compose logs --tail=100 redis` y `docker compose config`. Si solo quieres probar la API sin cola, pon `JOBS_QUEUE_MODE=inline` en `.env`: `depends_on` de Redis es `required: false` y la app arranca igual. |
| Mensaje `$'\r': command not found` al ejecutar `./start.sh` | Finales de línea CRLF en el checkout | El repo incluye `.gitattributes` con `eol=lf` para `*.sh`; vuelve a clonar o normaliza con `git add --renormalize .`. |
| No aparece la pregunta del túnel al terminar `./start.sh` | Terminal sin TTY, variable de omisión (`SKIP_TUNNEL_PROMPT`/`SKIP_PUBLIC_URL`) o `cloudflared` ausente | Usa una terminal interactiva, revisa esas variables y `command -v cloudflared`. Para abrirlo a mano: `cloudflared tunnel --url http://127.0.0.1:$APP_HOST_PORT`. |
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

Estado: **16 suites e2e, 93/93 pruebas** (67 de Etapas 1-3 + notificaciones, realtime/chat/replay, jobs inline/descarga/`failedAsyncJob`, cookies/CSRF y portal: `/portal`, assets, manifiesto con los nuevos campos de URL, descargas, espacios, guía y `/mail/me` con filtro por usuario) y **5 suites unitarias, 20/20** (la nueva suite de `PublicUrlService`: archivo válido, cambios en runtime, contenidos inválidos, fallback y modo test). Los archivos no requieren MinIO en CI: se usa un stub inyectado en el token `STORAGE_PROVIDER`.

> Las e2e se ejecutan **dentro del contenedor `app`** (donde el host `postgres` existe) contra `practicas_test`, como muestra el comando anterior. Nunca apuntes las pruebas a la BD de los estudiantes ni borres volúmenes.

## Estructura

Vista rápida de la raíz del repositorio:

```
backendPruebas/
├── README.md                       esta guía
├── propuesta_backend_estudiantes.md
├── .env.example                    plantilla VERSIONADA (placeholders)
├── .env                            local, NUNCA versionado (ignorado por Git)
├── .gitignore, .gitattributes      ignorados; eol=lf para *.sh y *.bash
├── docker-compose.yml, Dockerfile  app, worker, postgres, redis, mailpit, migrate (MinIO comentado)
├── install.sh, start.sh,           wrappers bash en la raíz (macOS / Linux)
│   stop.sh, restart.sh
├── scripts/                        lógica del ciclo de vida (.sh) y script opcional de URL pública (.mjs)
├── src/                            código NestJS (detalle abajo)
├── prisma/                         schema.prisma, migrations/, seed.ts
├── test/                           suites e2e y utilidades
├── docs/                           coding-challenges.md
├── public/portal/                  UI vanilla del portal (index.html + assets)
├── postman/                        collection + environment + README
├── storage/uploads/                archivos locales (contenido ignorado por Git)
├── run/                            local/efímero, ignorado: tunnel-url.txt del túnel
├── package.json, package-lock.json, tsconfig*.json, nest-cli.json, .nvmrc
```

Detalle de `src/`:

```
src/
  main.ts, app.module.ts, app.configure.ts  bootstrap, prefijo /api/v1, Swagger, ValidationPipe
  config/, common/, prisma/, health/        entorno, URL pública en runtime, logs/errores/paginación, BD, health
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
  mail/, database/                           SMTP de pruebas, bandeja mediada y datos canónicos
  portal/                                    manifest, descargas, guía, página y espacios del portal
prisma/
  schema.prisma, migrations/ (init, stage2, stage3, stage4), seed.ts
test/                                       16 suites e2e + utils (JOBS_QUEUE_MODE=inline)
Dockerfile, docker-compose.yml, .env.example
```

## Pendiente real

- Guías cliente completas (JS/Kotlin/Retrofit) para el Nivel 5: el portal incluye ejemplos resumidos, no una guía exhaustiva.
- MinIO sigue comentado (imagen no verificable desde el entorno original); las exportaciones usan storage local.
- El replay cubre los eventos persistidos por espacio; no hay suscripción selectiva por tipo de recurso.

## Limitaciones conocidas

- MinIO queda comentado: la imagen fijada no se pudo verificar desde este entorno (Docker Hub `insufficient_scope`, quay.io exige autenticación). Ver instrucciones exactas en `docker-compose.yml` y arriba.
- La limpieza S3 no es transaccional con PostgreSQL; se registran claves pendientes para reconciliación.
- El host de generación tenía Node 25; la imagen y `.nvmrc` fijan Node 20.18.1, que es el entorno objetivo.
- El puerto host 3000 estaba ocupado por un proyecto ajeno durante el smoke test; no se detuvo ese contenedor.
- Las salas WebSocket se resuelven al conectar: si cambia la membresía de un equipo, reconecta para refrescar las suscripciones.
- BullMQ no garantiza exactly-once: se usa un `updateMany` condicional para evitar procesar dos veces un trabajo ya `COMPLETED`. Para despliegues con varios workers, revisar la estrategia de concurrencia.
