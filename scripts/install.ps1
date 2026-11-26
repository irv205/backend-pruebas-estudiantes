#requires -Version 5.1
<#
  Instalador guiado del backend de práctica para Windows PowerShell.
  Reutiliza scripts/start.sh (a través de Git Bash): NO duplica la lógica de
  migraciones, healthcheck ni seed.
#>
param(
  [string]$RepoUrl = $env:REPO_URL,
  [string]$Target,
  [switch]$NoSeed,
  [switch]$Yes,
  [switch]$NonInteractive,
  [switch]$InstallDeps,
  [switch]$Help,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest = @()
)

$ErrorActionPreference = 'Stop'

function Write-Step { param([int]$Number, [string]$Text) Write-Host "`n[Paso $Number/7] $Text" -ForegroundColor Cyan }
function Write-Log   { param([string]$Text) Write-Host "[install] $Text" }
function Write-Warn  { param([string]$Text) Write-Host "[install] AVISO: $Text" -ForegroundColor Yellow }
function Fail        { param([string]$Text) Write-Host "[install] ERROR: $Text" -ForegroundColor Red; exit 1 }

function Show-Help {
  Write-Host @'
Uso: .\install.ps1 [opciones]

Instala y arranca el backend de práctica con Docker Compose.

Opciones:
  -NoSeed               No ejecuta el seed (se reenvía a scripts/start.sh).
  -Yes, -NonInteractive Acepta defaults; NO sobrescribe un .env existente.
  -RepoUrl URL          Repositorio a clonar si no estamos en la raíz.
                        También se lee la variable de entorno REPO_URL.
  -Target DIR           Directorio destino del clon.
  -InstallDeps          Permite intentar instalar dependencias del sistema
                        SOLO tras confirmación explícita.
  -Help                 Muestra esta ayuda.

También se aceptan las formas --no-seed, --yes, --non-interactive,
--repo-url URL, --target DIR, --install-deps y --help.

Requiere Git Bash (viene con Git for Windows) o WSL porque el arranque
reutiliza scripts/start.sh. El instalador NO hace push ni configura remotos,
y NO instala paquetes del sistema sin confirmación explícita.
'@
}

# Confirmación separada: -Yes/-NonInteractive NO autorizan instalar paquetes.
function Confirm-Explicit {
  param([string]$Text)
  $answer = Read-Host "$Text [s/N]"
  return ($answer -match '^(s|si|sí|y|yes)$')
}
function Ask-YesNo {
  param([string]$Text)
  if ($Yes -or $NonInteractive) { return $false }
  return (Confirm-Explicit $Text)
}

function Get-OsName {
  if ($IsWindows -or $env:OS -eq 'Windows_NT') { return 'Windows' }
  if ($IsMacOS) { return 'macOS' }
  if ($IsLinux) { return 'Linux' }
  return [Environment]::OSVersion.Platform.ToString()
}

function Print-DepsInstructions {
  param([string]$Os)
  Write-Host "`nInstrucciones para instalar los requisitos:" -ForegroundColor Yellow
  Write-Host "  - Git / Git Bash: https://git-scm.com/downloads"
  if ($Os -eq 'Windows') {
    Write-Host '  - Docker Desktop for Windows: https://docs.docker.com/desktop/install/windows-install/'
    Write-Host '    Tras instalarlo, arranca el motor (icono de Docker en la bandeja).'
    Write-Host '  - Git for Windows aporta el bash que necesita scripts/start.sh.'
  } elseif ($Os -eq 'macOS') {
    Write-Host '  - Docker Desktop para Mac: https://docs.docker.com/desktop/install/mac-install/'
    Write-Host '    (o: brew install --cask docker; abre la app hasta que el motor arranque).'
    Write-Host '  - curl: viene incluido en macOS.'
  } elseif ($Os -eq 'Linux') {
    Write-Host '  - Docker Engine + plugin Compose: https://docs.docker.com/engine/install/'
    Write-Host '    Verifica con: docker --version ; docker compose version'
    Write-Host '  - curl: p. ej. sudo apt-get install curl  o  sudo dnf install curl'
  } else {
    Write-Host '  - Docker: https://docs.docker.com/get-docker/ (incluye Compose).'
  }
  Write-Host 'Después vuelve a ejecutar: .\install.ps1 (o ./install.sh).'
}

function Get-EnvValue {
  param([string]$Key)
  if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) { return $null }
  $matchesLines = @(Select-String -LiteralPath '.env' -Pattern "^\s*$Key\s*=\s*(.*)$" | Select-Object -Last 1)
  if ($matchesLines.Count -eq 0) { return $null }
  $value = $matchesLines[0].Matches[0].Groups[1].Value
  return ($value -replace '\s+#.*$', '').Trim()
}

# Reescribe SOLO las claves indicadas; preserva secretos, comentarios y otros valores.
function Set-EnvValues {
  param([hashtable]$Values)
  $path = Join-Path (Get-Location).Path '.env'
  $lines = @(Get-Content -LiteralPath $path)
  $found = @{}
  foreach ($key in $Values.Keys) { $found[$key] = $false }

  $result = New-Object 'System.Collections.Generic.List[string]'
  foreach ($line in $lines) {
    $replaced = $false
    foreach ($key in $Values.Keys) {
      if ($replaced -or $found[$key]) { continue }
      $pattern = '^(\s*' + [regex]::Escape($key) + '\s*=\s*).*$'
      if ($line -match $pattern) {
        $result.Add(($line -replace $pattern, ('${1}' + $Values[$key])))
        $found[$key] = $true
        $replaced = $true
      }
    }
    if (-not $replaced) { $result.Add($line) }
  }
  foreach ($key in $Values.Keys) {
    if (-not $found[$key]) { $result.Add("$key=$($Values[$key])") }
  }

  $backup = Join-Path (Get-Location).Path '.env.bak'
  Copy-Item -LiteralPath $path -Destination $backup -Force
  # Sin BOM: docker compose no debe ver un caracter extra antes de la primera clave.
  [System.IO.File]::WriteAllLines($path, $result, (New-Object System.Text.UTF8Encoding($false)))
  Remove-Item -LiteralPath $backup -Force
}

function Set-EnvPort {
  param([string]$Port)
  $url = Get-EnvValue 'PUBLIC_BASE_URL'
  if ([string]::IsNullOrWhiteSpace($url)) { $url = "http://localhost:$Port" }
  if ($url -match '^(https?://[^/]+):\d+(/.*)?$') {
    $url = $Matches[1] + ':' + $Port + $Matches[2]
  } else {
    $url = $url.TrimEnd('/') + ':' + $Port
  }
  Set-EnvValues @{ 'APP_HOST_PORT' = $Port; 'PUBLIC_BASE_URL' = $url }
  return $url
}

function Test-PortBusy {
  param([int]$Port)
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($conns.Count -gt 0) { return $true }
  }
  if (Get-Command netstat -ErrorAction SilentlyContinue) {
    $lines = @(& netstat -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING")
    if ($lines.Count -gt 0) { return $true }
  }
  return $false
}

function Get-BashPath {
  $cmd = Get-Command bash -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $candidates = @()
  if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Git\bin\bash.exe') }
  if ($pf86) { $candidates += (Join-Path $pf86 'Git\bin\bash.exe') }
  if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe') }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  return $null
}

function Invoke-QuietNative {
  param([string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  try {
    $exe = $Arguments[0]
    $restArgs = @()
    if ($Arguments.Count -gt 1) { $restArgs = $Arguments[1..($Arguments.Count - 1)] }
    & $exe @restArgs 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
  } finally {
    $ErrorActionPreference = $previous
  }
}

# Aceptar también opciones estilo -- para quien copia comandos de la guía bash.
for ($i = 0; $i -lt $Rest.Count; $i++) {
  $arg = $Rest[$i]
  if ($arg -eq '--yes' -or $arg -eq '--non-interactive') { $Yes = $true }
  elseif ($arg -eq '--no-seed') { $NoSeed = $true }
  elseif ($arg -eq '--install-deps') { $InstallDeps = $true }
  elseif ($arg -eq '--help' -or $arg -eq '-h') { $Help = $true }
  elseif ($arg -match '^--repo-url=(.+)$') { $RepoUrl = $Matches[1] }
  elseif ($arg -eq '--repo-url') {
    if ($i + 1 -ge $Rest.Count) { Fail 'Falta el valor para --repo-url.' }
    $i++; $RepoUrl = $Rest[$i]
  } elseif ($arg -match '^--target=(.+)$') { $Target = $Matches[1] }
  elseif ($arg -eq '--target') {
    if ($i + 1 -ge $Rest.Count) { Fail 'Falta el valor para --target.' }
    $i++; $Target = $Rest[$i]
  } else {
    Fail "Opción desconocida: $arg (usa -Help para ver las opciones)."
  }
}

if ($Help) { Show-Help; exit 0 }

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 1 'Verificar que estamos en la raíz del proyecto (o clonar el repositorio)'
$hasRoot = (Test-Path -LiteralPath 'docker-compose.yml' -PathType Leaf) -and
           (Test-Path -LiteralPath 'package.json' -PathType Leaf) -and
           (Test-Path -LiteralPath 'scripts/start.sh' -PathType Leaf)
if ($hasRoot) {
  Write-Log "Raíz del proyecto detectada: $((Get-Location).Path)"
} else {
  if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
    if ($Yes -or $NonInteractive) {
      Fail 'Sin URL de repositorio no se puede clonar en modo no interactivo. Usa -RepoUrl <URL> o REPO_URL (no se inventa ninguna URL).'
    }
    $RepoUrl = Read-Host 'URL del repositorio Git a clonar'
  }
  if ([string]::IsNullOrWhiteSpace($RepoUrl)) { Fail 'La URL del repositorio está vacía.' }

  if ([string]::IsNullOrWhiteSpace($Target)) {
    if ($Yes -or $NonInteractive) {
      $Target = [IO.Path]::GetFileNameWithoutExtension($RepoUrl.TrimEnd('/'))
      Write-Log "Destino derivado de la URL: $Target"
    } else {
      $Target = Read-Host 'Directorio destino del clon (Enter = nombre del repo)'
      if ([string]::IsNullOrWhiteSpace($Target)) {
        $Target = [IO.Path]::GetFileNameWithoutExtension($RepoUrl.TrimEnd('/'))
      }
    }
  }
  if (Test-Path -LiteralPath $Target) {
    if (@(Get-ChildItem -LiteralPath $Target -Force).Count -gt 0) {
      Fail "El destino '$Target' ya existe y no está vacío; no se sobrescribe."
    }
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Print-DepsInstructions (Get-OsName)
    Fail 'git no está instalado; se necesita para clonar.'
  }
  Write-Log "Clonando el repositorio proporcionado en '$Target'..."
  & git clone -- $RepoUrl $Target
  if ($LASTEXITCODE -ne 0) { Fail "git clone falló (código $LASTEXITCODE)." }
  Set-Location -LiteralPath $Target

  $hasRoot = (Test-Path -LiteralPath 'docker-compose.yml' -PathType Leaf) -and
             (Test-Path -LiteralPath 'package.json' -PathType Leaf) -and
             (Test-Path -LiteralPath 'scripts/start.sh' -PathType Leaf)
  if (-not $hasRoot) { Fail 'Tras clonar no aparecen los archivos esperados en la raíz.' }
  Write-Log "Repositorio listo en: $((Get-Location).Path)"
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 2 'Comprobar requisitos (git, Docker, Compose; curl es recomendable)'
$os = Get-OsName
$missing = New-Object 'System.Collections.Generic.List[string]'
if (Get-Command git -ErrorAction SilentlyContinue) { Write-Log "git: OK ($(& git --version))" } else { $missing.Add('git') }
if (Get-Command docker -ErrorAction SilentlyContinue) {
  if (Invoke-QuietNative @('docker', 'compose', 'version')) {
    Write-Log 'Docker y Compose: OK (docker compose version).'
  } else {
    Write-Warn "docker existe pero 'docker compose version' falla (falta el plugin Compose)."
    $missing.Add('Docker Compose plugin')
  }
} else {
  $missing.Add('Docker')
}
if (Get-Command curl -ErrorAction SilentlyContinue) {
  Write-Log 'curl: OK (lo usa scripts/start.sh para esperar /health/ready).'
} else {
  Write-Warn 'No se encontró curl en el PATH; scripts/start.sh lo necesita para /health/ready (Git for Windows lo incluye).'
  $missing.Add('curl')
}

if ($missing.Count -gt 0) {
  if ($InstallDeps) {
    if ($Yes -or $NonInteractive) {
      Print-DepsInstructions $os
      Fail '--install-deps necesita confirmación explícita; --yes/-NonInteractive NO la otorgan.'
    }
    if ($os -eq 'Windows') {
      if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Print-DepsInstructions $os
        Fail 'winget no está disponible: no se puede instalar de forma segura. Sigue las instrucciones.'
      }
      if ($missing -contains 'Docker' -or $missing -contains 'Docker Compose plugin') {
        if (Confirm-Explicit "¿Instalar Docker Desktop con 'winget install --id Docker.DockerDesktop'?" ) {
          & winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements
          if ($LASTEXITCODE -ne 0) { Fail 'winget no pudo instalar Docker Desktop.' }
          Write-Log 'Docker Desktop instalado: abre la app y espera a que el motor arranque.'
        }
      }
      if ($missing -contains 'git') {
        if (Confirm-Explicit "¿Instalar Git for Windows (incluye Git Bash) con 'winget install --id Git.Git'?" ) {
          & winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
          if ($LASTEXITCODE -ne 0) { Fail 'winget no pudo instalar Git.' }
          Write-Log 'Git instalado: se reinicia el PATH en una terminal nueva.'
        }
      }
      Write-Log 'Vuelve a abrir una terminal y ejecuta de nuevo .\install.ps1.'
      exit 0
    }
    if ($os -eq 'macOS' -and (Get-Command brew -ErrorAction SilentlyContinue)) {
      $installedAny = $false
      if ($missing -contains 'Docker' -or $missing -contains 'Docker Compose plugin') {
        if (Confirm-Explicit "¿Instalar Docker Desktop con 'brew install --cask docker'?" ) {
          & brew install --cask docker
          if ($LASTEXITCODE -ne 0) { Fail 'brew no pudo instalar Docker Desktop.' }
          $installedAny = $true
        }
      }
      if ($missing -contains 'git' -and (Confirm-Explicit "¿Instalar git con 'brew install git'?" )) {
        & brew install git
        if ($LASTEXITCODE -ne 0) { Fail 'brew no pudo instalar git.' }
        $installedAny = $true
      }
      if ($missing -contains 'curl' -and (Confirm-Explicit "¿Instalar curl con 'brew install curl'?" )) {
        & brew install curl
        if ($LASTEXITCODE -ne 0) { Fail 'brew no pudo instalar curl.' }
        $installedAny = $true
      }
      if ($installedAny) { Write-Log 'Dependencias instaladas: abre Docker Desktop y vuelve a ejecutar .\install.ps1.' }
      Write-Log 'Vuelve a ejecutar .\install.ps1.'
      exit 0
    }
    Print-DepsInstructions $os
    Fail "Instalación automática de dependencias no disponible de forma segura en '$os'."
  }
  Print-DepsInstructions $os
  Fail 'Faltan requisitos previos. No se instala nada automáticamente.'
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 3 'Configurar .env desde .env.example (sin tocar secretos existentes)'
if (-not (Test-Path -LiteralPath '.env' -PathType Leaf)) {
  if (-not (Test-Path -LiteralPath '.env.example' -PathType Leaf)) { Fail 'No existe .env.example; no se puede crear .env.' }
  Copy-Item -LiteralPath '.env.example' -Destination '.env'
  Write-Log 'Creado .env a partir de .env.example (valores solo de desarrollo).'
} elseif ($Yes -or $NonInteractive) {
  Write-Log 'Ya existe .env; se conserva sin sobrescribir (-Yes/-NonInteractive).'
} elseif (Ask-YesNo 'Ya existe .env. ¿Sobrescribirlo con .env.example? (se perderían tus valores)') {
  Copy-Item -LiteralPath '.env.example' -Destination '.env' -Force
  Write-Log '.env sobrescrito desde .env.example.'
} else {
  Write-Log 'Se conserva el .env existente.'
}

if (Invoke-QuietNative @('git', 'check-ignore', '-q', '.env')) {
  Write-Log '.env sigue ignorado por Git (git check-ignore OK).'
} else {
  Fail '.env NO está ignorado por Git; revisa .gitignore antes de continuar.'
}

$port = Get-EnvValue 'APP_HOST_PORT'
if ([string]::IsNullOrWhiteSpace($port) -or $port -notmatch '^\d+$' -or [int]$port -lt 1 -or [int]$port -gt 65535) {
  Write-Warn "APP_HOST_PORT='$port' no es válido; se usa 3100."
  $port = '3100'
}
$url = Get-EnvValue 'PUBLIC_BASE_URL'
if ([string]::IsNullOrWhiteSpace($url)) { $url = "http://localhost:$port" }

$urlPort = ''
if ($url -match '^(https?://[^/]+):(\d+)(/.*)?$') { $urlPort = $Matches[2] }
if ($urlPort -ne $port) {
  Write-Warn "Puertos incoherentes: APP_HOST_PORT=$port, PUBLIC_BASE_URL=$url."
  $url = Set-EnvPort $port
  Write-Log "Ajustado PUBLIC_BASE_URL=$url (APP_HOST_PORT intacto)."
} else {
  Write-Log "Puertos coherentes: APP_HOST_PORT=$port, PUBLIC_BASE_URL=$url."
}

if (-not ($Yes -or $NonInteractive)) {
  $chosen = Read-Host "Puerto host de la API [$port]"
  if ([string]::IsNullOrWhiteSpace($chosen)) { $chosen = $port }
  if ($chosen -match '^\d+$' -and [int]$chosen -ge 1 -and [int]$chosen -le 65535) {
    if ($chosen -ne $port) {
      $port = $chosen
      $url = Set-EnvPort $port
      Write-Log "Puerto actualizado en .env: APP_HOST_PORT=$port, PUBLIC_BASE_URL=$url."
    }
  } else {
    Write-Warn "Puerto '$chosen' no válido; se mantiene $port."
  }
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 4 "Verificar que el puerto $port esté libre (sin detener contenedores ajenos)"
if (Test-PortBusy ([int]$port)) {
  Write-Warn "El puerto $port ya está en uso."
  Write-Warn 'NO se detendrá ningún contenedor ni proceso ajeno. Sugerencia: usar otro puerto.'
  if (-not ($Yes -or $NonInteractive) -and (Ask-YesNo '¿Cambiar el puerto ahora en .env?')) {
    $suggested = [int]$port + 1
    $newPort = Read-Host "Nuevo puerto (p. ej. $suggested)"
    if ($newPort -match '^\d+$' -and [int]$newPort -ge 1 -and [int]$newPort -le 65535) {
      $port = $newPort
      $url = Set-EnvPort $port
      Write-Log "Nuevo puerto configurado: $port (PUBLIC_BASE_URL=$url)."
    } else {
      Write-Warn 'Puerto no válido; se mantiene el anterior.'
    }
  }
} else {
  Write-Log "Puerto $port libre (o no se pudo consultar con las herramientas disponibles)."
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 5 'Validar la configuración de Docker Compose'
if (Invoke-QuietNative @('docker', 'compose', 'config', '--quiet')) {
  Write-Log 'docker compose config --quiet: OK.'
} else {
  Fail 'docker compose config --quiet falló; revisa docker-compose.yml y .env.'
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 6 'Arrancar el proyecto reutilizando scripts/start.sh'
$bashExe = Get-BashPath
if (-not $bashExe) {
  Print-DepsInstructions (Get-OsName)
  Fail 'No se encontró bash: este instalador reutiliza scripts/start.sh. Instala Git for Windows (Git Bash) o usa WSL con ./install.sh.'
}
$startArgs = @('scripts/start.sh')
if ($NoSeed) {
  $startArgs += '--no-seed'
  Write-Log 'Reenviando --no-seed a scripts/start.sh.'
}
& $bashExe @startArgs
if ($LASTEXITCODE -ne 0) { Fail "scripts/start.sh terminó con código $LASTEXITCODE." }

# ─────────────────────────────────────────────────────────────────────────────
Write-Step 7 'Resumen final'
$finalPort = Get-EnvValue 'APP_HOST_PORT'
if ([string]::IsNullOrWhiteSpace($finalPort)) { $finalPort = '3100' }
Write-Host "`n[install] Instalación completada.`n"
Write-Host "  API:      http://localhost:$finalPort/api/v1"
Write-Host "  Swagger:  http://localhost:$finalPort/docs"
Write-Host "  Health:   http://localhost:$finalPort/health/live  y  /health/ready"
Write-Host '  Mailpit:  http://127.0.0.1:8025 (solo en el host)'
Write-Host ''
Write-Host '  Usuario de prueba (SOLO DESARROLLO / PRÁCTICA, no usar en producción):'
Write-Host '    email:    estudiante@practicas.local'
Write-Host '    password: Estudiante.123'
Write-Host ''
Write-Host '  Apagar:    .\stop.sh (Git Bash/WSL)  o  npm run project:stop'
Write-Host '  Reiniciar: .\restart.sh  o  npm run project:restart -- --no-seed'
Write-Host '  Instalar de nuevo: .\install.ps1'
Write-Host ''
Write-Host '  Guías:'
Write-Host '    - postman/README.md'
Write-Host '    - docs/coding-challenges.md'
Write-Host ''
Write-Host '  Seguridad: NO commitees .env (ya está gitignored). No subas tokens ni secretos.'
