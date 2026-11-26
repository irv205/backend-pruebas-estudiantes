#!/usr/bin/env bash
# Ciclo de vida del proyecto — reinicio: stop.sh y luego start.sh.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

log() { printf '[restart] %s\n' "$*"; }

log "Deteniendo el proyecto..."
bash "$SCRIPT_DIR/stop.sh"

log "Arrancando el proyecto de nuevo (argumentos: $* )..."
exec bash "$SCRIPT_DIR/start.sh" "$@"
