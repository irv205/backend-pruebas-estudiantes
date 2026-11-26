#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$installer = Join-Path -Path (Split-Path -Parent $MyInvocation.MyCommand.Path) -ChildPath 'scripts/install.ps1'
& $installer @args
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
