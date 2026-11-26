#requires -Version 5.1
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\scripts\install.ps1" @args
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
