#requires -Version 5.1
<#
  Ciclo de vida del proyecto — apagado SIN borrar volúmenes (nativo Windows).
#>
param(
  # Se declaran explícitamente para rechazarlos con un mensaje claro.
  [switch]$Volumes,
  [switch]$V,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

function Write-Log { param([string]$Text) Write-Host "[stop] $Text" }
function Reject-Volumes {
  Write-Host '[stop] ERROR: -Volumes/-V están prohibidos: este script NUNCA borra volúmenes.' -ForegroundColor Red
  exit 2
}
function Fail { param([string]$Text) Write-Host "[stop] ERROR: $Text" -ForegroundColor Red; exit 1 }

function Show-Help {
  Write-Host @'
Uso: .\stop.ps1 [-Help]

Detiene los servicios con "docker compose down" SIN -v. Los volúmenes
postgres_data, mailpit_data, files_data (y minio_data, reservado) se conservan.

Opciones:
  -Help     Muestra esta ayuda.

No se aceptan -Volumes, -V, -v ni --volumes: este script nunca borra datos.
No requiere Git Bash ni WSL.
'@
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string[]]$Arguments = @()
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # Out-Host evita que la salida del comando se capture junto al código.
    if ($Arguments.Count -gt 0) { & $Exe @Arguments | Out-Host } else { & $Exe | Out-Host }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  return $code
}

# ─────────────────────────────────────────────────────────────────────────────
if ($Help) { Show-Help; exit 0 }
if ($Volumes -or $V) { Reject-Volumes }
foreach ($arg in $args) {
  if ($arg -eq '-v' -or $arg -eq '-V' -or $arg -eq '-Volumes' -or
      $arg -eq '--volumes' -or $arg -eq '/v') {
    Reject-Volumes
  }
  if ($arg -eq '--help' -or $arg -eq '-h') { Show-Help; exit 0 }
  Fail "Opción desconocida: $arg (usa -Help para ver las opciones)."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'No se encontró Docker. Instala Docker Desktop y arranca el motor.'
}

$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path -Path $PSScriptRoot -ChildPath '..')).Path
Set-Location -LiteralPath $ProjectRoot

Write-Log 'Deteniendo servicios: docker compose down (SIN -v)...'
$downCode = Invoke-Native -Exe 'docker' -Arguments @('compose', 'down')
if ($downCode -ne 0) { Fail "docker compose down falló (código $downCode)." }

Write-Host ''
Write-Host '[stop] Servicios detenidos. Los volúmenes se conservan:'
Write-Host '  - postgres_data'
Write-Host '  - mailpit_data'
Write-Host '  - files_data'
Write-Host '  (minio_data queda reservado, sin cambios).'
Write-Host '[stop] Los datos siguen disponibles para el próximo .\start.ps1.'
exit 0
