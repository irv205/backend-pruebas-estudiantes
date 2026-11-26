#!/usr/bin/env bash
# Ciclo de vida del proyecto — arranque completo y verificación.
# No modifica lógica de negocio, migraciones ni seed.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="$PROJECT_ROOT/.env"
DEFAULT_PORT="3000"

log()  { printf '[start] %s\n' "$*"; }
warn() { printf '[start] AVISO: %s\n' "$*" >&2; }
err()  { printf '[start] ERROR: %s\n' "$*" >&2; }

# Lee una sola variable sin "sourcear" el .env (SMTP_FROM contiene espacios).
read_host_port() {
  local port=""
  if [[ -f "$ENV_FILE" ]]; then
    port="$(sed -n 's/^[[:space:]]*APP_HOST_PORT[[:space:]]*=[[:space:]]*\([^[:space:]#]*\).*/\1/p' \
      "$ENV_FILE" | tail -n 1 | tr -d '\r')"
  fi
  if [[ -z "$port" ]]; then
    port="$DEFAULT_PORT"
  fi
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    warn "APP_HOST_PORT='$port' no es un puerto válido; se usa $DEFAULT_PORT."
    port="$DEFAULT_PORT"
  fi
  printf '%s' "$port"
}

APP_HOST_PORT="$(read_host_port)"

skip_seed=0
for arg in "$@"; do
  case "$arg" in
    --no-seed)
      skip_seed=1
      ;;
    -h|--help)
      printf 'Uso: %s [--no-seed]\n' "$0"
      exit 0
      ;;
    *)
      err "Opción desconocida: $arg"
      printf 'Uso: %s [--no-seed]\n' "$0" >&2
      exit 2
      ;;
  esac
done

# Devuelve el nombre del contenedor AJENO que publica el puerto, o vacío.
foreign_port_owner() {
  local port="$1"
  local own_names name rest ports owner=""
  own_names="$(docker compose ps -a --format '{{.Name}}' 2>/dev/null || true)"
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    name="${line%%|*}"
    rest="${line#*|}"
    ports="${rest#*|}"
    [[ "$ports" == *":${port}->"* ]] || continue
    if printf '%s\n' "$own_names" | grep -Fxq -- "$name"; then
      continue
    fi
    owner="$name"
  done < <(docker ps --format '{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Ports}}' \
    2>/dev/null || true)
  printf '%s' "$owner"
}

wait_for_migrate() {
  local deadline=$((SECONDS + 60)) ids cid status code
  while true; do
    ids="$(docker compose ps -aq migrate 2>/dev/null || true)"
    for cid in $ids; do
      status="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true)"
      code="$(docker inspect -f '{{.State.ExitCode}}' "$cid" 2>/dev/null || true)"
      if [[ "$status" == "exited" || "$status" == "dead" ]]; then
        if [[ "$status" == "exited" && "$code" == "0" ]]; then
          log "Migraciones aplicadas (migrate Exited(0))."
          return 0
        fi
        err "migrate terminó con estado='$status' y código='$code'."
        docker compose logs --tail=100 migrate || true
        return 1
      fi
    done
    if (( SECONDS >= deadline )); then
      err "Timeout: migrate no terminó en 60 s."
      docker compose logs --tail=100 migrate || true
      return 1
    fi
    sleep 2
  done
}

wait_for_ready() {
  local deadline=$((SECONDS + 60)) code=""
  local url="http://localhost:${APP_HOST_PORT}/health/ready"
  while (( SECONDS < deadline )); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || true)"
    if [[ "$code" == "200" ]]; then
      log "Readiness OK: $url -> 200."
      return 0
    fi
    sleep 2
  done
  err "Timeout: $url no devolvió 200 en 60 s (último código: '${code}')."
  docker compose logs --tail=100 app || true
  return 1
}

log "Puerto host configurado: $APP_HOST_PORT (desde ${ENV_FILE})."
foreign_owner="$(foreign_port_owner "$APP_HOST_PORT")"
if [[ -n "$foreign_owner" ]]; then
  warn "El puerto $APP_HOST_PORT ya está publicado por el contenedor ajeno '$foreign_owner'."
  warn "NO se detendrá ese contenedor. Si necesitas el puerto, cambia APP_HOST_PORT en .env."
fi

log "Levantando servicios: docker compose up -d --build..."
docker compose up -d --build

log "Esperando a que las migraciones terminen correctamente..."
wait_for_migrate || exit 1

log "Esperando a que /health/ready responda 200..."
wait_for_ready || exit 1

if (( skip_seed == 1 )); then
  log "Seed omitido (--no-seed)."
else
  log "Aplicando seed idempotente..."
  docker compose exec -T app npm run prisma:seed || {
    err "El seed falló; revisa los logs de 'app'."
    exit 1
  }
fi

printf '\n[start] Proyecto listo.\n'
printf '  API:     http://localhost:%s/api/v1\n' "$APP_HOST_PORT"
printf '  Swagger: http://localhost:%s/docs\n' "$APP_HOST_PORT"
printf '  Health:  http://localhost:%s/health/ready (y /health/live)\n' "$APP_HOST_PORT"
printf '  Mailpit: http://127.0.0.1:8025\n'
