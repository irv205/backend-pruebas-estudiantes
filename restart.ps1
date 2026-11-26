#requires -Version 5.1
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\scripts\restart.ps1" @args
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
