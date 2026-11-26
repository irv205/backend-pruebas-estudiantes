#!/usr/bin/env bash
# Instalador guiado del backend de práctica (macOS / Linux).
# Reutiliza scripts/start.sh: NO duplica lógica de migraciones, health ni seed.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

TOTAL_STEPS=7
NO_SEED=0
NON_INTERACTIVE=0
INSTALL_DEPS=0
REPO_URL_ARG="${REPO_URL:-}"
TARGET_DIR_ARG=""

log()  { printf '[install] %s\n' "$*"; }
warn() { printf '[install] AVISO: %s\n' "$*" >&2; }
err()  { printf '[install] ERROR: %s\n' "$*" >&2; }
step() { printf '\n[Paso %s/%s] %s\n' "$1" "$TOTAL_STEPS" "$2"; }

help() {
  cat <<'EOF'
Uso: ./install.sh [opciones]

Instala y arranca el backend de práctica con Docker Compose.

Opciones:
  --no-seed               No ejecuta el seed (se reenvía a scripts/start.sh).
  --yes, --non-interactive Acepta defaults; NO sobrescribe un .env existente.
  --repo-url URL          Repositorio a clonar si no estamos en la raíz.
                          También se lee la variable de entorno REPO_URL.
  --target DIR            Directorio destino del clon.
  --install-deps          Permite intentar instalar dependencias del sistema
                          SOLO tras confirmación explícita (ver nota abajo).
  -h, --help              Muestra esta ayuda.

El instalador NO hace push ni configura remotos, y NO instala paquetes del
sistema sin confirmación explícita. --yes/--non-interactive no autoriza
instalaciones de sistema: en ese caso se muestran instrucciones y se sale.
EOF
}

while (( $# )); do
  case "$1" in
    --no-seed) NO_SEED=1; shift ;;
    --yes|--non-interactive) NON_INTERACTIVE=1; shift ;;
    --install-deps) INSTALL_DEPS=1; shift ;;
    --repo-url)
      (( $# >= 2 )) || { err "Falta el valor para --repo-url."; exit 2; }
      REPO_URL_ARG="$2"; shift 2 ;;
    --repo-url=*) REPO_URL_ARG="${1#*=}"; shift ;;
    --target)
      (( $# >= 2 )) || { err "Falta el valor para --target."; exit 2; }
      TARGET_DIR_ARG="$2"; shift 2 ;;
    --target=*) TARGET_DIR_ARG="${1#*=}"; shift ;;
    -h|--help) help; exit 0 ;;
    *) err "Opción desconocida: $1"; printf 'Usa --help para ver las opciones.\n' >&2; exit 2 ;;
  esac
done

# Confirmación separada: --yes NO autoriza instalar paquetes del sistema.
confirm_explicit() {
  local answer=""
  read -r -p "$1 [s/N] " answer || return 1
  case "$answer" in
    s|S|si|SI|sí|Sí|y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# Pregunta interactiva normal: devuelve 1 (default) en modo no interactivo.
ask_yes_no() {
  (( NON_INTERACTIVE )) && return 1
  confirm_explicit "$1"
}

read_env_key() {
  local key="$1" value=""
  if [[ -f .env ]]; then
    value="$(sed -n "s|^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\([^[:space:]#]*\).*|\1|p" \
      .env | tail -n 1 | tr -d '\r')"
  fi
  printf '%s' "$value"
}

# Actualiza SOLO APP_HOST_PORT y PUBLIC_BASE_URL; no toca secretos ni otros valores.
update_env_port() {
  local port="$1" url="$2"
  sed -i.bak \
    -e "s|^[[:space:]]*APP_HOST_PORT[[:space:]]*=.*|APP_HOST_PORT=${port}|" \
    -e "s|^[[:space:]]*PUBLIC_BASE_URL[[:space:]]*=.*|PUBLIC_BASE_URL=${url}|" \
    .env
  grep -q '^[[:space:]]*APP_HOST_PORT[[:space:]]*=' .env || printf 'APP_HOST_PORT=%s\n' "$port" >> .env
  grep -q '^[[:space:]]*PUBLIC_BASE_URL[[:space:]]*=' .env || printf 'PUBLIC_BASE_URL=%s\n' "$url" >> .env
  rm -f .env.bak
}

port_from_url() {
  local url="$1"
  printf '%s' "$url" | sed -nE 's|^https?://[^/]+:([0-9]+)(/.*)?$|\1|p'
}

set_url_port() {
  local url="$1" port="$2" result=""
  if [[ "$url" =~ ^https?://[^/]+:[0-9]+(/.*)?$ ]]; then
    result="$(printf '%s' "$url" | sed -E "s@:[0-9]+(/.*)?\$@:${port}\\1@")"
  else
    result="${url%/}:${port}"
  fi
  printf '%s' "$result"
}

valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

os_name() {
  case "$(uname -s 2>/dev/null || printf 'Desconocido')" in
    Darwin) printf 'macOS' ;;
    Linux)  printf 'Linux' ;;
    *)      uname -s 2>/dev/null || printf 'Desconocido' ;;
  esac
}

print_deps_instructions() {
  local os="$1"
  printf '\nInstrucciones para instalar los requisitos:\n' >&2
  printf '  - Git: https://git-scm.com/downloads\n' >&2
  if [[ "$os" == "macOS" ]]; then
    printf '  - Docker Desktop para Mac: https://docs.docker.com/desktop/install/mac-install/\n' >&2
    printf '    (o: brew install --cask docker; abre la app hasta que el motor arranque).\n' >&2
    printf '  - curl: viene incluido en macOS.\n' >&2
  elif [[ "$os" == "Linux" ]]; then
    printf '  - Docker Engine + plugin Compose: https://docs.docker.com/engine/install/\n' >&2
    printf '    Verifica con: docker --version && docker compose version\n' >&2
    printf '  - curl: p. ej. sudo apt-get install curl  o  sudo dnf install curl\n' >&2
  else
    printf '  - Docker: https://docs.docker.com/get-docker/ (incluye Compose).\n' >&2
  fi
  printf 'Después vuelve a ejecutar: ./install.sh\n' >&2
}

# ─────────────────────────────────────────────────────────────────────────────
step 1 "Verificar que estamos en la raíz del proyecto (o clonar el repositorio)"
if [[ -f docker-compose.yml && -f package.json && -f scripts/start.sh ]]; then
  PROJECT_ROOT="$PWD"
  log "Raíz del proyecto detectada: $PROJECT_ROOT"
else
  log "No se encontraron docker-compose.yml, package.json y scripts/start.sh aquí."
  if [[ -z "$REPO_URL_ARG" ]]; then
    if (( NON_INTERACTIVE )); then
      err "Sin URL de repositorio no se puede clonar en modo no interactivo."
      err "Usa --repo-url <URL> o define REPO_URL (no se inventa ninguna URL)."
      exit 1
    fi
    read -r -p "URL del repositorio Git a clonar: " REPO_URL_ARG
  fi
  [[ -n "$REPO_URL_ARG" ]] || { err "La URL del repositorio está vacía."; exit 1; }

  if [[ -z "$TARGET_DIR_ARG" ]]; then
    if (( NON_INTERACTIVE )); then
      TARGET_DIR_ARG="$(printf '%s' "$REPO_URL_ARG" | sed -E 's|/+$||; s|\.git$||; s|.*/||')"
      log "Destino derivado de la URL: $TARGET_DIR_ARG"
    else
      read -r -p "Directorio destino del clon [nombre del repo]: " TARGET_DIR_ARG
      if [[ -z "$TARGET_DIR_ARG" ]]; then
        TARGET_DIR_ARG="$(printf '%s' "$REPO_URL_ARG" | sed -E 's|/+$||; s|\.git$||; s|.*/||')"
      fi
    fi
  fi
  [[ -n "$TARGET_DIR_ARG" ]] || { err "El directorio destino está vacío."; exit 1; }
  if [[ -e "$TARGET_DIR_ARG" ]] && [[ -n "$(ls -A -- "$TARGET_DIR_ARG" 2>/dev/null)" ]]; then
    err "El destino '$TARGET_DIR_ARG' ya existe y no está vacío; no se sobrescribe."
    exit 1
  fi

  if ! command -v git >/dev/null 2>&1; then
    err "git no está instalado; se necesita para clonar."
    print_deps_instructions "$(os_name)"
    exit 1
  fi
  log "Clonando el repositorio proporcionado en '$TARGET_DIR_ARG'..."
  git clone -- "$REPO_URL_ARG" "$TARGET_DIR_ARG"
  cd "$TARGET_DIR_ARG"
  PROJECT_ROOT="$PWD"
  [[ -f docker-compose.yml && -f package.json && -f scripts/start.sh ]] || {
    err "Tras clonar no aparecen los archivos esperados en la raíz."
    exit 1
  }
  log "Repositorio listo en: $PROJECT_ROOT"
fi

# ─────────────────────────────────────────────────────────────────────────────
step 2 "Comprobar requisitos (git, Docker, Compose; curl es recomendable)"
OS_NAME="$(os_name)"
missing=0
if command -v git >/dev/null 2>&1; then
  log "git: OK ($(git --version 2>/dev/null || printf 'versión desconocida'))"
else
  err "Falta git."; missing=1
fi
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    log "Docker y Compose: OK ($(docker compose version 2>/dev/null | head -n 1))"
  else
    err "docker existe pero 'docker compose version' falla (se necesita el plugin Compose v2+)."
    missing=1
  fi
else
  err "Falta Docker (motor de Docker Desktop o Docker Engine)."; missing=1
fi
if command -v curl >/dev/null 2>&1; then
  log "curl: OK (lo usa scripts/start.sh para esperar /health/ready)."
else
  warn "No se encontró curl en '$OS_NAME'; scripts/start.sh lo necesita para verificar /health/ready."
  missing=1
fi

if (( missing )); then
  if (( INSTALL_DEPS )); then
    if (( NON_INTERACTIVE )); then
      err "--install-deps necesita confirmación explícita; --yes NO la otorga."
      print_deps_instructions "$OS_NAME"
      exit 1
    fi
    if [[ "$OS_NAME" == "macOS" ]] && command -v brew >/dev/null 2>&1; then
      installed_any=0
      if ! command -v docker >/dev/null 2>&1; then
        if confirm_explicit "¿Instalar Docker Desktop con 'brew install --cask docker'?"; then
          brew install --cask docker
          installed_any=1
        fi
      fi
      if ! command -v git >/dev/null 2>&1; then
        if confirm_explicit "¿Instalar git con 'brew install git'?"; then
          brew install git
          installed_any=1
        fi
      fi
      if ! command -v curl >/dev/null 2>&1; then
        if confirm_explicit "¿Instalar curl con 'brew install curl'?"; then
          brew install curl
          installed_any=1
        fi
      fi
      if (( installed_any )); then
        log "Dependencias instaladas. Abre Docker Desktop si hace falta y vuelve a ejecutar ./install.sh."
      else
        log "No se instaló nada. Revisa las instrucciones y vuelve a ejecutar ./install.sh."
      fi
      print_deps_instructions "$OS_NAME"
      exit 0
    fi
    err "Instalación automática de dependencias no disponible de forma segura en '$OS_NAME' sin brew."
    print_deps_instructions "$OS_NAME"
    exit 1
  fi
  err "Faltan requisitos previos. No se instala nada automáticamente."
  print_deps_instructions "$OS_NAME"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
step 3 "Configurar .env desde .env.example (sin tocar secretos existentes)"
if [[ ! -f .env ]]; then
  [[ -f .env.example ]] || { err "No existe .env.example; no se puede crear .env."; exit 1; }
  cp .env.example .env
  log "Creado .env a partir de .env.example (valores solo de desarrollo)."
elif (( NON_INTERACTIVE )); then
  log "Ya existe .env; se conserva sin sobrescribir (--yes/--non-interactive)."
elif ask_yes_no "Ya existe .env. ¿Sobrescribirlo con .env.example? (se perderían tus valores)"; then
  cp .env.example .env
  log ".env sobrescrito desde .env.example."
else
  log "Se conserva el .env existente."
fi

if git check-ignore -q .env 2>/dev/null; then
  log ".env sigue ignorado por Git (git check-ignore OK)."
else
  err ".env NO está ignorado por Git; revisa .gitignore antes de continuar."
  exit 1
fi

APP_HOST_PORT="$(read_env_key APP_HOST_PORT)"
PUBLIC_BASE_URL="$(read_env_key PUBLIC_BASE_URL)"
if ! valid_port "$APP_HOST_PORT"; then
  warn "APP_HOST_PORT='$APP_HOST_PORT' no es válido; se usa 3100."
  APP_HOST_PORT="3100"
fi
if [[ -z "$PUBLIC_BASE_URL" ]]; then
  PUBLIC_BASE_URL="http://localhost:${APP_HOST_PORT}"
fi

url_port="$(port_from_url "$PUBLIC_BASE_URL")"
if [[ -z "$url_port" ]]; then
  PUBLIC_BASE_URL="$(set_url_port "$PUBLIC_BASE_URL" "$APP_HOST_PORT")"
  update_env_port "$APP_HOST_PORT" "$PUBLIC_BASE_URL"
  log "PUBLIC_BASE_URL no tenía puerto; se ajustó a $PUBLIC_BASE_URL."
elif [[ "$url_port" != "$APP_HOST_PORT" ]]; then
  warn "Puertos incoherentes: APP_HOST_PORT=$APP_HOST_PORT, PUBLIC_BASE_URL=$PUBLIC_BASE_URL."
  PUBLIC_BASE_URL="$(set_url_port "$PUBLIC_BASE_URL" "$APP_HOST_PORT")"
  update_env_port "$APP_HOST_PORT" "$PUBLIC_BASE_URL"
  log "Ajustado PUBLIC_BASE_URL=$PUBLIC_BASE_URL (APP_HOST_PORT intacto)."
else
  log "Puertos coherentes: APP_HOST_PORT=$APP_HOST_PORT, PUBLIC_BASE_URL=$PUBLIC_BASE_URL."
fi

if ! (( NON_INTERACTIVE )); then
  read -r -p "Puerto host de la API [$APP_HOST_PORT]: " chosen_port
  chosen_port="${chosen_port:-$APP_HOST_PORT}"
  if valid_port "$chosen_port"; then
    if [[ "$chosen_port" != "$APP_HOST_PORT" ]]; then
      APP_HOST_PORT="$chosen_port"
      PUBLIC_BASE_URL="$(set_url_port "$PUBLIC_BASE_URL" "$APP_HOST_PORT")"
      update_env_port "$APP_HOST_PORT" "$PUBLIC_BASE_URL"
      log "Puerto actualizado en .env: APP_HOST_PORT=$APP_HOST_PORT, PUBLIC_BASE_URL=$PUBLIC_BASE_URL."
    fi
  else
    warn "Puerto '$chosen_port' no válido; se mantiene $APP_HOST_PORT."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
step 4 "Verificar que el puerto $APP_HOST_PORT esté libre (sin detener contenedores ajenos)"
port_busy=0
port_owner=""
if command -v lsof >/dev/null 2>&1; then
  port_owner="$(lsof -nP -iTCP:"$APP_HOST_PORT" -sTCP:LISTEN 2>/dev/null \
    | sed -n '2p' | awk '{print $1" (PID "$2")' || true)"
  if [[ -n "$port_owner" ]]; then
    port_busy=1
  fi
elif command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | grep -q "[:.]${APP_HOST_PORT}[[:space:]]"; then
    port_busy=1
  fi
elif command -v nc >/dev/null 2>&1; then
  if nc -z 127.0.0.1 "$APP_HOST_PORT" >/dev/null 2>&1; then
    port_busy=1
  fi
fi

if (( port_busy )); then
  warn "El puerto $APP_HOST_PORT ya está en uso${port_owner:+ por $port_owner}."
  warn "NO se detendrá ningún contenedor ni proceso ajeno. Sugerencia: usar otro puerto."
  if ! (( NON_INTERACTIVE )) && ask_yes_no "¿Cambiar el puerto ahora en .env?"; then
    read -r -p "Nuevo puerto (p. ej. $((10#$APP_HOST_PORT + 1))): " new_port
    if valid_port "$new_port"; then
      APP_HOST_PORT="$new_port"
      PUBLIC_BASE_URL="$(set_url_port "$PUBLIC_BASE_URL" "$APP_HOST_PORT")"
      update_env_port "$APP_HOST_PORT" "$PUBLIC_BASE_URL"
      log "Nuevo puerto configurado: $APP_HOST_PORT (PUBLIC_BASE_URL=$PUBLIC_BASE_URL)."
    else
      warn "Puerto no válido; se mantiene $APP_HOST_PORT."
    fi
  fi
else
  log "Puerto $APP_HOST_PORT libre (o no se pudo consultar con las herramientas disponibles)."
fi

# ─────────────────────────────────────────────────────────────────────────────
step 5 "Validar la configuración de Docker Compose"
if docker compose config --quiet; then
  log "docker compose config --quiet: OK."
else
  err "docker compose config --quiet falló; revisa docker-compose.yml y .env."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
step 6 "Arrancar el proyecto reutilizando scripts/start.sh"
if (( NO_SEED )); then
  log "Reenviando --no-seed a scripts/start.sh."
  bash scripts/start.sh --no-seed
else
  bash scripts/start.sh
fi

# ─────────────────────────────────────────────────────────────────────────────
step 7 "Resumen final"
APP_HOST_PORT="$(read_env_key APP_HOST_PORT)"
[[ -n "$APP_HOST_PORT" ]] || APP_HOST_PORT="3100"
cat <<EOF

[install] Instalación completada.

  API:      http://localhost:${APP_HOST_PORT}/api/v1
  Swagger:  http://localhost:${APP_HOST_PORT}/docs
  Health:   http://localhost:${APP_HOST_PORT}/health/live  y  /health/ready
  Mailpit:  http://127.0.0.1:8025 (solo en el host)

  Usuario de prueba (SOLO DESARROLLO / PRÁCTICA, no usar en producción):
    email:    estudiante@practicas.local
    password: Estudiante.123

  Apagar:    ./stop.sh        (o: npm run project:stop)
  Reiniciar: ./restart.sh     (o: npm run project:restart -- --no-seed)
  Instalar de nuevo: ./install.sh

  Guías:
    - postman/README.md
    - docs/coding-challenges.md

  Seguridad: NO commitees .env (ya está gitignored). No subas tokens ni secretos.
EOF
