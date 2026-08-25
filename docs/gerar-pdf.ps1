# gerar-pdf.ps1 - converte um arquivo Markdown em PDF.
#
# Nao usa Node, Python, pandoc nem LibreOffice: nenhum deles existe nesta
# maquina. O caminho e' converter para HTML aqui mesmo e mandar o Chrome (ou o
# Edge) imprimir em PDF pela linha de comando, em modo headless.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File docs\gerar-pdf.ps1
#   powershell -ExecutionPolicy Bypass -File docs\gerar-pdf.ps1 -Entrada outro.md -Saida saida.pdf
#
# IMPORTANTE: este arquivo e' escrito so' com ASCII de proposito. O PowerShell
# 5.1 le o .ps1 como ANSI e corrompe acento no codigo-fonte. Os acentos do texto
# vem do .md, que e' lido explicitamente como UTF-8.

param(
  [string]$Entrada = "",
  [string]$Saida = "",
  [string]$Titulo = "AME Store - Manual",
  [switch]$ManterHTML
)

$ErrorActionPreference = 'Stop'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Entrada) { $Entrada = Join-Path $pasta "manual.md" }
if (-not $Saida)   { $Saida   = Join-Path $pasta "AME Store - manual.pdf" }

if (-not (Test-Path $Entrada)) { throw "Nao encontrei o arquivo de entrada: $Entrada" }

# ---------------------------------------------------------------- navegador

$navegadores = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$navegador = $navegadores | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $navegador) { throw "Nao encontrei Chrome nem Edge para gerar o PDF." }

# ---------------------------------------------------------------- inline

function ConvertTo-Inline([string]$t) {
  $t = $t.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
  # codigo entre crases (antes de tudo, para nao formatar o que esta' dentro)
  $t = [regex]::Replace($t, '`([^`]+)`', { param($m) '<code>' + $m.Groups[1].Value + '</code>' })
  # links [texto](url)
  $t = [regex]::Replace($t, '\[([^\]]+)\]\(([^)\s]+)\)', '<a href="$2">$1</a>')
  # negrito e italico
  $t = [regex]::Replace($t, '\*\*([^*]+)\*\*', '<strong>$1</strong>')
  $t = [regex]::Replace($t, '(?<![\*\w])\*([^*\r\n]+)\*(?!\*)', '<em>$1</em>')
  return $t
}

function ConvertTo-CelulaTabela([string]$linha) {
  $t = $linha.Trim()
  if ($t.StartsWith('|')) { $t = $t.Substring(1) }
  if ($t.EndsWith('|'))   { $t = $t.Substring(0, $t.Length - 1) }
  return ($t -split '\|') | ForEach-Object { ConvertTo-Inline $_.Trim() }
}

# ---------------------------------------------------------------- blocos

$linhas = [System.IO.File]::ReadAllLines($Entrada, [System.Text.Encoding]::UTF8)
$sb = New-Object System.Text.StringBuilder

$emCodigo = $false
$pilhaLista = @()      # guarda 'ul' ou 'ol' por nivel aberto
$recuos = @()          # recuo (em espacos) de cada nivel aberto
$paragrafo = @()

function Fecha-Paragrafo {
  if ($script:paragrafo.Count -gt 0) {
    [void]$script:sb.AppendLine('<p>' + ($script:paragrafo -join ' ') + '</p>')
    $script:paragrafo = @()
  }
}

# Um item de lista fica "aberto" ate' aparecer o proximo item ou o fim da lista.
# E' o que permite grudar as linhas de continuacao no item a que pertencem, em
# vez de solta-las como paragrafo orfao (que quebrava feio na virada de pagina).
$liAberto = $false

function Fecha-Li {
  if ($script:liAberto) { [void]$script:sb.AppendLine('</li>'); $script:liAberto = $false }
}

function Fecha-Listas([int]$ateRecuo = -1) {
  Fecha-Li
  while ($script:pilhaLista.Count -gt 0) {
    $ultimo = $script:recuos[$script:recuos.Count - 1]
    if ($ateRecuo -ge 0 -and $ultimo -le $ateRecuo) { break }
    [void]$script:sb.AppendLine('</' + $script:pilhaLista[$script:pilhaLista.Count - 1] + '>')
    $script:pilhaLista = @($script:pilhaLista[0..($script:pilhaLista.Count - 2)]) | Where-Object { $_ }
    if ($script:pilhaLista.Count -eq 0) { $script:pilhaLista = @() }
    $script:recuos = @($script:recuos[0..($script:recuos.Count - 2)]) | Where-Object { $_ -ne $null }
    if ($script:recuos.Count -eq 0) { $script:recuos = @() }
  }
}

for ($i = 0; $i -lt $linhas.Count; $i++) {
  $linha = $linhas[$i]
  $texto = $linha.TrimEnd()

  # bloco de codigo cercado por ```
  if ($texto.TrimStart().StartsWith('```')) {
    Fecha-Paragrafo
    if (-not $emCodigo) { Fecha-Listas; [void]$sb.AppendLine('<pre><code>'); $emCodigo = $true }
    else { [void]$sb.AppendLine('</code></pre>'); $emCodigo = $false }
    continue
  }
  if ($emCodigo) {
    [void]$sb.AppendLine($texto.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;'))
    continue
  }

  # linha em branco
  if ($texto.Trim().Length -eq 0) { Fecha-Paragrafo; continue }

  # separador
  if ($texto.Trim() -match '^(---+|\*\*\*+)$') {
    Fecha-Paragrafo; Fecha-Listas
    [void]$sb.AppendLine('<hr>')
    continue
  }

  # titulos
  if ($texto -match '^(#{1,6})\s+(.*)$') {
    Fecha-Paragrafo; Fecha-Listas
    $nivel = $Matches[1].Length
    $conteudo = ConvertTo-Inline $Matches[2]
    [void]$sb.AppendLine("<h$nivel>$conteudo</h$nivel>")
    continue
  }

  # tabela: linha atual comeca com | e a proxima e' o separador ---|---
  if ($texto.Trim().StartsWith('|') -and $i + 1 -lt $linhas.Count -and $linhas[$i + 1] -match '^\s*\|?[\s:-]*-[\s:|-]*$') {
    Fecha-Paragrafo; Fecha-Listas
    $cabecalho = ConvertTo-CelulaTabela $texto
    [void]$sb.AppendLine('<table><thead><tr>')
    foreach ($c in $cabecalho) { [void]$sb.AppendLine("<th>$c</th>") }
    [void]$sb.AppendLine('</tr></thead><tbody>')
    $i = $i + 2
    while ($i -lt $linhas.Count -and $linhas[$i].Trim().StartsWith('|')) {
      $celulas = ConvertTo-CelulaTabela $linhas[$i]
      [void]$sb.AppendLine('<tr>')
      foreach ($c in $celulas) { [void]$sb.AppendLine("<td>$c</td>") }
      [void]$sb.AppendLine('</tr>')
      $i++
    }
    $i--
    [void]$sb.AppendLine('</tbody></table>')
    continue
  }

  # citacao
  if ($texto -match '^>\s?(.*)$') {
    Fecha-Paragrafo; Fecha-Listas
    [void]$sb.AppendLine('<blockquote>' + (ConvertTo-Inline $Matches[1]) + '</blockquote>')
    continue
  }

  # itens de lista (com ou sem recuo)
  if ($texto -match '^(\s*)([-*+]|\d+\.)\s+(.*)$') {
    $recuo = $Matches[1].Length
    $marcador = $Matches[2]
    $conteudo = ConvertTo-Inline $Matches[3]
    $tipo = if ($marcador -match '^\d') { 'ol' } else { 'ul' }
    Fecha-Paragrafo
    # Se o item vai abrir um nivel mais fundo, o item pai continua aberto para
    # receber a sublista dentro dele; senao, fecha o item anterior.
    $maisFundo = ($pilhaLista.Count -gt 0 -and $recuos[$recuos.Count - 1] -lt $recuo)
    if (-not $maisFundo) { Fecha-Li }

    if ($pilhaLista.Count -gt 0) {
      # fecha os niveis mais recuados que o atual
      while ($pilhaLista.Count -gt 0 -and $recuos[$recuos.Count - 1] -gt $recuo) {
        [void]$sb.AppendLine('</' + $pilhaLista[$pilhaLista.Count - 1] + '>')
        if ($pilhaLista.Count -eq 1) { $pilhaLista = @(); $recuos = @() }
        else {
          $pilhaLista = $pilhaLista[0..($pilhaLista.Count - 2)]
          $recuos = $recuos[0..($recuos.Count - 2)]
        }
      }
    }

    $precisaAbrir = $false
    if ($pilhaLista.Count -eq 0) { $precisaAbrir = $true }
    elseif ($recuos[$recuos.Count - 1] -lt $recuo) { $precisaAbrir = $true }
    elseif ($pilhaLista[$pilhaLista.Count - 1] -ne $tipo) {
      [void]$sb.AppendLine('</' + $pilhaLista[$pilhaLista.Count - 1] + '>')
      if ($pilhaLista.Count -eq 1) { $pilhaLista = @(); $recuos = @() }
      else {
        $pilhaLista = $pilhaLista[0..($pilhaLista.Count - 2)]
        $recuos = $recuos[0..($recuos.Count - 2)]
      }
      $precisaAbrir = $true
    }

    if ($precisaAbrir) {
      [void]$sb.AppendLine("<$tipo>")
      $pilhaLista += $tipo
      $recuos += $recuo
    }

    # caixa de marcar do markdown
    $conteudo = $conteudo -replace '^\[ \]\s*', '<span class="caixa"></span> '
    $conteudo = $conteudo -replace '^\[x\]\s*', '<span class="caixa marcada"></span> '
    [void]$sb.Append("<li>" + $conteudo)
    $liAberto = $true
    continue
  }

  # linha recuada logo abaixo de um item: e' continuacao dele, nao paragrafo novo
  if ($liAberto -and $texto -match '^\s{2,}\S') {
    [void]$sb.Append(' ' + (ConvertTo-Inline $texto.Trim()))
    continue
  }
  Fecha-Listas
  $paragrafo += (ConvertTo-Inline $texto.Trim())
}

if ($emCodigo) { [void]$sb.AppendLine('</code></pre>') }
Fecha-Paragrafo
Fecha-Listas

$corpo = $sb.ToString()

# ---------------------------------------------------------------- pagina

$modelo = @'
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>__TITULO__</title>
<style>
@page { size: A4; margin: 18mm 15mm 18mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", system-ui, Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.55; color: #2E282B; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1, h2, h3, h4 { font-family: Georgia, "Times New Roman", serif; color: #3A3335; line-height: 1.25; }
h1 {
  font-size: 25pt; letter-spacing: .02em; margin: 0 0 4pt;
  padding-bottom: 8pt; border-bottom: 2.5pt solid #7442B8;
}
h2 {
  font-size: 15pt; margin: 22pt 0 7pt; padding-top: 8pt;
  border-top: .75pt solid #E5DEEE; page-break-after: avoid; break-after: avoid;
}
h3 { font-size: 11.5pt; margin: 14pt 0 4pt; color: #5B3192; page-break-after: avoid; break-after: avoid; }
p { margin: 0 0 7pt; text-align: justify; hyphens: auto; }
a { color: #5B3192; text-decoration: none; word-break: break-word; }
strong { color: #221D20; }
hr { border: 0; border-top: .75pt solid #E5DEEE; margin: 14pt 0; }
ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
li { margin-bottom: 3pt; }
li > ul, li > ol { margin-top: 3pt; }
code {
  font-family: Consolas, "Cascadia Mono", monospace; font-size: 9pt;
  background: #F4EDFB; color: #4A2C77; padding: .5pt 3pt; border-radius: 2pt;
}
pre {
  background: #F7F5FA; border: .75pt solid #E5DEEE; border-left: 2.5pt solid #7442B8;
  border-radius: 3pt; padding: 8pt 10pt; margin: 0 0 9pt; overflow: hidden;
  page-break-inside: avoid; break-inside: avoid;
}
pre code { background: none; color: #2E282B; padding: 0; font-size: 9pt; line-height: 1.45; }
blockquote {
  margin: 0 0 9pt; padding: 6pt 10pt; background: #F7F5FA;
  border-left: 2.5pt solid #C9A8E9; color: #5C5254; font-size: 9.8pt;
}
table {
  width: 100%; border-collapse: collapse; margin: 0 0 10pt; font-size: 9.5pt;
  page-break-inside: avoid; break-inside: avoid;
}
th {
  text-align: left; background: #F4EDFB; color: #4A2C77; font-weight: 650;
  padding: 5pt 7pt; border-bottom: 1pt solid #C9A8E9;
}
td { padding: 5pt 7pt; border-bottom: .5pt solid #E5DEEE; vertical-align: top; }
.caixa {
  display: inline-block; width: 8pt; height: 8pt; border: .75pt solid #9A929E;
  border-radius: 1.5pt; margin-right: 2pt;
}
.caixa.marcada { background: #7442B8; border-color: #7442B8; }
.capa-marca {
  font-family: Georgia, serif; font-size: 9pt; letter-spacing: .32em;
  color: #9A929E; text-transform: uppercase; margin-bottom: 10pt;
}
.rodape-doc {
  margin-top: 22pt; padding-top: 8pt; border-top: .75pt solid #E5DEEE;
  font-size: 8.5pt; color: #9A929E; text-align: center;
}
</style></head><body>
<div class="capa-marca">A.M.E Store</div>
__CORPO__
<div class="rodape-doc">
  AME Store &middot; documento gerado a partir de <code>docs/manual.md</code> em __DATA__<br>
  App: https://eziocoelho11.github.io/ame-store/
</div>
</body></html>
'@

$html = $modelo.Replace('__TITULO__', $Titulo).Replace('__CORPO__', $corpo).Replace('__DATA__', (Get-Date -Format 'dd/MM/yyyy'))

$arquivoHTML = [System.IO.Path]::ChangeExtension($Saida, '.html')
$utf8 = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($arquivoHTML, $html, $utf8)

# ---------------------------------------------------------------- imprimir

# Se o PDF estiver aberto num visualizador, o Windows trava o arquivo. Melhor
# avisar isso em portugues do que estourar um erro cru de acesso negado.
if (Test-Path $Saida) {
  try { Remove-Item $Saida -Force -ErrorAction Stop }
  catch {
    Write-Host ""
    Write-Host "  O arquivo abaixo esta aberto em algum programa e nao pode ser regravado:" -ForegroundColor Yellow
    Write-Host ("  " + $Saida) -ForegroundColor Yellow
    Write-Host "  Feche o PDF e rode este script de novo." -ForegroundColor Yellow
    Write-Host ""
    exit 1
  }
}

$uri = ([System.Uri]([System.IO.Path]::GetFullPath($arquivoHTML))).AbsoluteUri
# Perfil temporario proprio: sem isso o Chrome ja' aberto trava o perfil e o
# headless sai com codigo 13 sem produzir nada.
$perfil = Join-Path $env:TEMP ("chrome-pdf-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))
$argumentos = @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-sync', '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=10000', '--no-pdf-header-footer',
  ('--user-data-dir="' + $perfil + '"'),
  ('--print-to-pdf="' + $Saida + '"'),
  ('"' + $uri + '"')
)
Write-Host "Gerando PDF com $(Split-Path -Leaf $navegador)..."
$p = Start-Process -FilePath $navegador -ArgumentList $argumentos -Wait -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 700

if (-not (Test-Path $Saida)) {
  # algumas versoes so' imprimem no headless antigo
  $argumentos[0] = '--headless'
  Start-Process -FilePath $navegador -ArgumentList $argumentos -Wait -WindowStyle Hidden | Out-Null
  Start-Sleep -Milliseconds 700
}

if (-not $ManterHTML -and (Test-Path $arquivoHTML)) { Remove-Item $arquivoHTML -Force }

if (Test-Path $Saida) {
  $kb = [math]::Round((Get-Item $Saida).Length / 1KB, 1)
  Write-Host ("PDF gerado: " + $Saida + "  (" + $kb + " KB)") -ForegroundColor Green
} else {
  throw "O navegador nao produziu o PDF (codigo de saida $($p.ExitCode))."
}
