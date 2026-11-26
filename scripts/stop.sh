#!/usr/bin/env bash
# Ciclo de vida del proyecto — apagado SIN borrar volúmenes.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

log()  { printf '[stop] %s\n' "$*"; }
err()  { printf '[stop] ERROR: %s\n' "$*" >&2; }

if (( $# > 0 )); then
  err "stop.sh no acepta opciones: $*"
  err "En particular se prohíben -v / --volumes: este script NUNCA borra volúmenes."
  exit 2
fi

log "Deteniendo servicios: docker compose down (SIN -v)..."
docker compose down

printf '\n[stop] Servicios detenidos. Los volúmenes se conservan:\n'
printf '  - postgres_data\n'
printf '  - mailpit_data\n'
printf '  - files_data\n'
printf '  (minio_data queda reservado, sin cambios).\n'
printf '[stop] Los datos siguen disponibles para el próximo ./start.sh.\n'
