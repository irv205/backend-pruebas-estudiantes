#requires -Version 5.1
<#
  Ciclo de vida del proyecto — arranque 100% nativo en Windows (sin bash).
  No modifica lógica de negocio, migraciones ni seed.
#>
param(
  [switch]$NoSeed,
  [switch]$Yes,
  [switch]$NonInteractive,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

function Write-Log { param([string]$Text) Write-Host "[start] $Text" }
function Write-WarnMsg { param([string]$Text) Write-Host "[start] AVISO: $Text" -ForegroundColor Yellow }
function Fail { param([string]$Text) Write-Host "[start] ERROR: $Text" -ForegroundColor Red; exit 1 }

function Show-Help {
  Write-Host @'
Uso: .\start.ps1 [-NoSeed] [-Help]

Arranca el proyecto con Docker Compose, espera a que migrate termine con
ExitCode 0 y a que /health/ready devuelva 200, aplica el seed idempotente
e imprime las URLs reales. No requiere Git Bash ni WSL.

Opciones:
  -NoSeed               No ejecuta el seed.
  -Yes, -NonInteractive Acepta defaults (este script no hace preguntas).
  -Help                 Muestra esta ayuda.

También se aceptan --no-seed, --yes, --non-interactive y -h/--help.
'@
}

# Ejecuta un comando nativo dejando su salida visible y devolviendo su código.
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

# Captura salida (stdout + stderr) y código de un comando nativo, sin mostrarla.
function Get-NativeOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string[]]$Arguments = @()
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($Arguments.Count -gt 0) { $text = (& $Exe @Arguments 2>&1 | Out-String) }
    else { $text = (& $Exe 2>&1 | Out-String) }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  return [pscustomobject]@{ Code = $code; Text = $text }
}

# Lee UNA clave del .env sin "sourcearlo" (SMTP_FROM contiene espacios).
function Get-EnvValue {
  param([string]$Key)
  $path = Join-Path -Path $ProjectRoot -ChildPath '.env'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  $pattern = '^\s*' + [regex]::Escape($Key) + '\s*=\s*(.*)$'
  $found = @(Select-String -LiteralPath $path -Pattern $pattern | Select-Object -Last 1)
  if ($found.Count -eq 0) { return $null }
  $value = $found[0].Matches[0].Groups[1].Value
  return ($value -replace '\s+#.*$', '').Trim()
}

function Show-ServiceLogs {
  param([string]$Service)
  Write-Host "[start] Logs de '$Service' (últimas 100 líneas):" -ForegroundColor Yellow
  $null = Invoke-Native -Exe 'docker' -Arguments @('compose', 'logs', '--tail=100', $Service)
}

function Wait-ForMigrate {
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  while ($true) {
    $idsResult = Get-NativeOutput -Exe 'docker' -Arguments @('compose', 'ps', '-aq', 'migrate')
    $ids = @($idsResult.Text -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $failed = $false
    foreach ($cid in $ids) {
      $container = $cid.Trim()
      if ([string]::IsNullOrWhiteSpace($container)) { continue }
      $statusResult = Get-NativeOutput -Exe 'docker' -Arguments @('inspect', '-f', '{{.State.Status}}', $container)
      $codeResult = Get-NativeOutput -Exe 'docker' -Arguments @('inspect', '-f', '{{.State.ExitCode}}', $container)
      $status = $statusResult.Text.Trim()
      $exitCode = $codeResult.Text.Trim()
      if ($status -eq 'exited' -and $exitCode -eq '0') {
        Write-Log 'Migraciones aplicadas (migrate Exited(0)).'
        return $true
      }
      if ($status -eq 'exited' -or $status -eq 'dead') {
        Write-Host "[start] ERROR: migrate terminó con estado='$status' y código='$exitCode'." -ForegroundColor Red
        $failed = $true
        break
      }
    }
    if ($failed) {
      Show-ServiceLogs -Service 'migrate'
      return $false
    }
    if ([DateTime]::UtcNow -ge $deadline) {
      Write-Host '[start] ERROR: Timeout: migrate no terminó en 60 s.' -ForegroundColor Red
      Show-ServiceLogs -Service 'migrate'
      return $false
    }
    Start-Sleep -Seconds 2
  }
}

function Wait-ForReady {
  param([string]$Url)
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  $lastCode = ''
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
      $lastCode = [string][int]$response.StatusCode
      if ($response.StatusCode -eq 200) {
        Write-Log "Readiness OK: $Url -> 200."
        return $true
      }
    } catch {
      $lastCode = 'error'
      $resp = $null
      try { $resp = $_.Exception.Response } catch { }
      if ($null -ne $resp) {
        try { $lastCode = [string][int]$resp.StatusCode } catch { }
      }
    }
    Start-Sleep -Seconds 2
  }
  Write-Host "[start] ERROR: Timeout: $Url no devolvió 200 en 60 s (último código: '$lastCode')." -ForegroundColor Red
  Show-ServiceLogs -Service 'app'
  return $false
}

# ─────────────────────────────────────────────────────────────────────────────
# Opciones estilo -- llegan en $args (script simple: no se usa binder avanzado).
for ($i = 0; $i -lt $args.Count; $i++) {
  $arg = $args[$i]
  if ($arg -eq '--no-seed') { $NoSeed = $true }
  elseif ($arg -eq '--yes' -or $arg -eq '--non-interactive') { $Yes = $true }
  elseif ($arg -eq '--help' -or $arg -eq '-h') { $Help = $true }
  else { Fail "Opción desconocida: $arg (usa -Help para ver las opciones)." }
}
if ($Help) { Show-Help; exit 0 }

$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path -Path $PSScriptRoot -ChildPath '..')).Path
Set-Location -LiteralPath $ProjectRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'No se encontró Docker. Instala Docker Desktop y arranca el motor.'
}
$composeCheck = Get-NativeOutput -Exe 'docker' -Arguments @('compose', 'version')
if ($composeCheck.Code -ne 0) {
  Fail 'El plugin Docker Compose no está disponible (docker compose version falló).'
}

$envPath = Join-Path -Path $ProjectRoot -ChildPath '.env'
$port = Get-EnvValue -Key 'APP_HOST_PORT'
if ([string]::IsNullOrWhiteSpace($port) -or $port -notmatch '^\d+$' -or [int]$port -lt 1 -or [int]$port -gt 65535) {
  Write-WarnMsg "APP_HOST_PORT='$port' no es un puerto válido; se usa 3000."
  $port = '3000'
}
Write-Log "Puerto host configurado: $port (desde $envPath)."

# Avisar si un contenedor AJENO publica el puerto, sin detenerlo.
$ownResult = Get-NativeOutput -Exe 'docker' -Arguments @('compose', 'ps', '-a', '--format', '{{.Name}}')
$ownNames = @($ownResult.Text -split '\r?\n' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() })
$allResult = Get-NativeOutput -Exe 'docker' -Arguments @('ps', '--format', '{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Ports}}')
$foreign = ''
foreach ($line in ($allResult.Text -split '\r?\n')) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if ($line -match '^([^|]+)\|[^|]*\|(.*)$') {
    $name = $Matches[1].Trim()
    $portsText = $Matches[2]
    if ($portsText -like "*:$port->*") {
      if ($ownNames -notcontains $name) { $foreign = $name; break }
    }
  }
}
if (-not [string]::IsNullOrWhiteSpace($foreign)) {
  Write-WarnMsg "El puerto $port ya está publicado por el contenedor ajeno '$foreign'."
  Write-WarnMsg 'NO se detendrá ese contenedor. Si necesitas el puerto, cambia APP_HOST_PORT en .env.'
}

Write-Log 'Levantando servicios: docker compose up -d --build...'
$upCode = Invoke-Native -Exe 'docker' -Arguments @('compose', 'up', '-d', '--build')
if ($upCode -ne 0) { Fail "docker compose up -d --build falló (código $upCode)." }

Write-Log 'Esperando a que las migraciones terminen correctamente...'
if (-not (Wait-ForMigrate)) { exit 1 }

Write-Log 'Esperando a que /health/ready responda 200...'
$readyUrl = "http://localhost:$port/health/ready"
if (-not (Wait-ForReady -Url $readyUrl)) { exit 1 }

if ($NoSeed) {
  Write-Log 'Seed omitido (-NoSeed).'
} else {
  Write-Log 'Aplicando seed idempotente...'
  $seedCode = Invoke-Native -Exe 'docker' -Arguments @('compose', 'exec', '-T', 'app', 'npm', 'run', 'prisma:seed')
  if ($seedCode -ne 0) { Fail "El seed falló (código $seedCode); revisa los logs de 'app'." }
}

Write-Host ''
Write-Host '[start] Proyecto listo.'
Write-Host "  API:     http://localhost:$port/api/v1"
Write-Host "  Swagger: http://localhost:$port/docs"
Write-Host "  Health:  http://localhost:$port/health/ready (y /health/live)"
Write-Host '  Mailpit: http://127.0.0.1:8025'
exit 0
