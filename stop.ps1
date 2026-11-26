#requires -Version 5.1
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\scripts\stop.ps1" @args
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
