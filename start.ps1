#requires -Version 5.1
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\scripts\start.ps1" @args
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
