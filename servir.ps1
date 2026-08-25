# servir.ps1 - servidor estatico minimo para rodar e testar o app localmente.
#
# Por que precisa: modulos ES e Service Worker nao funcionam em file://.
# Nao usa Node, Python nem instalacao nenhuma - so' o .NET que ja' vem no Windows.
#
# Uso:   powershell -ExecutionPolicy Bypass -File servir.ps1
#        powershell -ExecutionPolicy Bypass -File servir.ps1 -Porta 8080 -Rede
#
# -Rede libera o acesso pelo celular na mesma wi-fi (precisa rodar como admin
#  uma vez, ou liberar a porta no firewall).

param(
  [int]$Porta = 8080,
  [switch]$Rede
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path

$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.md'   = 'text/markdown; charset=utf-8'
  '.woff2'= 'font/woff2'
}

$prefixos = @("http://localhost:$Porta/")
if ($Rede) { $prefixos += "http://+:$Porta/" }

$ouvinte = New-Object System.Net.HttpListener
foreach ($p in $prefixos) { $ouvinte.Prefixes.Add($p) }

try {
  $ouvinte.Start()
} catch {
  Write-Host "Nao consegui abrir a porta $Porta." -ForegroundColor Red
  Write-Host "Se usou -Rede, rode o PowerShell como administrador." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "  AME Store rodando" -ForegroundColor Magenta
Write-Host "  ----------------------------------------"
Write-Host "  Neste PC:   http://localhost:$Porta/"
if ($Rede) {
  $ips = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }
  foreach ($ip in $ips) { Write-Host "  No celular: http://$($ip.IPAddress):$Porta/" }
}
Write-Host "  ----------------------------------------"
Write-Host "  Ctrl+C para parar."
Write-Host ""

while ($ouvinte.IsListening) {
  try {
    $ctx = $ouvinte.GetContext()
  } catch {
    break
  }
  $req = $ctx.Request
  $res = $ctx.Response

  $caminho = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
  if ($caminho -eq '/' -or $caminho -eq '') { $caminho = '/index.html' }
  $arquivo = Join-Path $raiz ($caminho.TrimStart('/') -replace '/', '\')

  # Impede sair da pasta do projeto.
  $completo = [System.IO.Path]::GetFullPath($arquivo)
  if (-not $completo.StartsWith([System.IO.Path]::GetFullPath($raiz))) {
    $res.StatusCode = 403; $res.Close(); continue
  }

  if (Test-Path $completo -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($completo).ToLower()
    $tipo = $tipos[$ext]
    if (-not $tipo) { $tipo = 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($completo)
    $res.ContentType = $tipo
    $res.Headers.Add('Cache-Control', 'no-cache')
    $res.ContentLength64 = $bytes.Length
    try { $res.OutputStream.Write($bytes, 0, $bytes.Length) } catch { }
    Write-Host ("  200  " + $caminho) -ForegroundColor DarkGray
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes('404 - nao encontrado: ' + $caminho)
    $res.OutputStream.Write($msg, 0, $msg.Length)
    Write-Host ("  404  " + $caminho) -ForegroundColor Yellow
  }
  $res.Close()
}

$ouvinte.Stop()
