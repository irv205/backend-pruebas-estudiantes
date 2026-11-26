#requires -Version 5.1
<#
  Ciclo de vida del proyecto — reinicio nativo en Windows: stop.ps1 + start.ps1.
#>
param(
  [switch]$NoSeed,
  [switch]$Yes,
  [switch]$NonInteractive,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

function Write-Log { param([string]$Text) Write-Host "[restart] $Text" }
function Fail { param([string]$Text) Write-Host "[restart] ERROR: $Text" -ForegroundColor Red; exit 1 }

function Show-Help {
  Write-Host @'
Uso: .\restart.ps1 [-NoSeed] [-Help]

Detiene el proyecto con stop.ps1 (sin borrar volúmenes) y lo arranca de nuevo
con start.ps1, reenviando -NoSeed cuando se indica.

Opciones:
  -NoSeed               Reenviado a start.ps1: no ejecuta el seed.
  -Yes, -NonInteractive Acepta defaults (solo afectan al instalador).
  -Help                 Muestra esta ayuda.

También se aceptan --no-seed, --yes, --non-interactive y -h/--help.
No requiere Git Bash ni WSL.
'@
}

# ─────────────────────────────────────────────────────────────────────────────
$startArgs = @()
if ($NoSeed) { $startArgs += '-NoSeed' }

for ($i = 0; $i -lt $args.Count; $i++) {
  $arg = $args[$i]
  if ($arg -eq '--no-seed') { $startArgs += '-NoSeed' }
  elseif ($arg -eq '--yes' -or $arg -eq '--non-interactive') { $Yes = $true }
  elseif ($arg -eq '--help' -or $arg -eq '-h') { $Help = $true }
  else { Fail "Opción desconocida: $arg (usa -Help para ver las opciones)." }
}
if ($Help) { Show-Help; exit 0 }
if (($Yes -or $NonInteractive) -and -not $NoSeed) {
  Write-Log 'AVISO: -Yes/-NonInteractive solo afectan a install.ps1; se ignoran aquí.'
}

$stopScript = Join-Path -Path $PSScriptRoot -ChildPath 'stop.ps1'
$startScript = Join-Path -Path $PSScriptRoot -ChildPath 'start.ps1'

Write-Log 'Deteniendo el proyecto...'
& $stopScript
$stopCode = $LASTEXITCODE
if ($null -ne $stopCode -and $stopCode -ne 0) {
  Fail "stop.ps1 terminó con código $stopCode; no se arranca el proyecto."
}

Write-Log 'Arrancando el proyecto de nuevo...'
if ($startArgs.Count -gt 0) { & $startScript @startArgs } else { & $startScript }
$startCode = $LASTEXITCODE
if ($null -ne $startCode -and $startCode -ne 0) { exit $startCode }
exit 0
