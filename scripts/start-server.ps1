param(
  [int]$Port = 8000,
  [string]$Bind = '0.0.0.0'
)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
Write-Host "Leibgame → http://${Bind}:${Port}/  (Ctrl+C to stop)"
python -m http.server $Port --bind $Bind
