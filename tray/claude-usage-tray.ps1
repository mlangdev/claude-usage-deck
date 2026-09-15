<#
  claude-usage-tray.ps1

  Puts two live icons in the Windows system tray (session % and week %),
  reading from the same poller used by the StreamDock plugin and the
  browser dashboard (http://127.0.0.1:4756/usage). No third-party
  dependencies - only .NET WinForms/GDI+, which ships with Windows.

  Run hidden (see README for the scheduled-task setup):
    powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File claude-usage-tray.ps1
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$PollerUrl = if ($env:CLAUDE_USAGE_POLLER_URL) { $env:CLAUDE_USAGE_POLLER_URL } else { 'http://127.0.0.1:4756' }
$RefreshMs = 15000

$Palette = @{
  Bg      = '#1f1e1c'
  Normal  = '#da7756'
  Warn    = '#d8a13c'
  Crit    = '#c2483a'
  Offline = '#7d786c'
}

function Get-TierColor([int]$Percent) {
  if ($Percent -ge 90) { return $Palette.Crit }
  if ($Percent -ge 70) { return $Palette.Warn }
  return $Palette.Normal
}

function New-NumberIcon([string]$Text, [string]$HexColor) {
  $size = 64
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($Palette.Bg))
  $g.FillEllipse($bgBrush, 1, 1, $size - 2, $size - 2)

  $fontSize = if ($Text.Length -ge 3) { 24 } else { 30 }
  $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
  $fgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($HexColor))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 1, $size, $size)
  $g.DrawString($Text, $font, $fgBrush, $rect, $sf)

  $g.Dispose()
  $bgBrush.Dispose()
  $fgBrush.Dispose()
  $font.Dispose()

  $hIcon = $bmp.GetHicon()
  $bmp.Dispose()
  return [System.Drawing.Icon]::FromHandle($hIcon)
}

function Format-Countdown([string]$Iso) {
  if (-not $Iso) { return $null }
  try {
    $target = [DateTime]::Parse($Iso).ToUniversalTime()
    $ms = ($target - [DateTime]::UtcNow).TotalMinutes
  } catch { return $null }
  if ($ms -le 0) { return 'renovou agora' }
  $totalMinutes = [Math]::Round($ms)
  $days = [Math]::Floor($totalMinutes / 1440)
  $hours = [Math]::Floor(($totalMinutes % 1440) / 60)
  $minutes = $totalMinutes % 60
  if ($days -gt 0) { return "${days}d ${hours}h" }
  if ($hours -gt 0) { return "${hours}h ${minutes}m" }
  return "${minutes}m"
}

$sessionIcon = New-Object System.Windows.Forms.NotifyIcon
$sessionIcon.Icon = New-NumberIcon '..' $Palette.Offline
$sessionIcon.Text = 'Claude - sessao (carregando)'
$sessionIcon.Visible = $true

$weekIcon = New-Object System.Windows.Forms.NotifyIcon
$weekIcon.Icon = New-NumberIcon '..' $Palette.Offline
$weekIcon.Text = 'Claude - semana (carregando)'
$weekIcon.Visible = $true

$openDashboard = { Start-Process "$PollerUrl/" }

$menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add('Abrir painel', $null, $openDashboard)
[void]$menu.Items.Add('-')
[void]$menu.Items.Add('Sair', $null, {
  $sessionIcon.Visible = $false
  $weekIcon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$sessionIcon.ContextMenuStrip = $menu
$weekIcon.ContextMenuStrip = $menu
$sessionIcon.add_DoubleClick($openDashboard)
$weekIcon.add_DoubleClick($openDashboard)

function Update-Icons {
  try {
    $data = Invoke-RestMethod -Uri "$PollerUrl/usage" -TimeoutSec 5

    $session = $data.metrics | Where-Object { $_.label -match '(?i)session' } | Select-Object -First 1
    $week = $data.metrics | Where-Object { $_.label -match '(?i)week' } | Select-Object -First 1

    if ($session) {
      $pct = [int]$session.percentUsed
      $sessionIcon.Icon = New-NumberIcon "$pct" (Get-TierColor $pct)
      $countdown = Format-Countdown $session.resetsAtIso
      $sessionIcon.Text = "Sessao atual: $pct%" + $(if ($countdown) { " - reseta em $countdown" } else { '' })
    }
    if ($week) {
      $pct = [int]$week.percentUsed
      $weekIcon.Icon = New-NumberIcon "$pct" (Get-TierColor $pct)
      $countdown = Format-Countdown $week.resetsAtIso
      $weekIcon.Text = "Semana: $pct%" + $(if ($countdown) { " - reseta em $countdown" } else { '' })
    }
  } catch {
    $sessionIcon.Icon = New-NumberIcon '?' $Palette.Offline
    $weekIcon.Icon = New-NumberIcon '?' $Palette.Offline
    $sessionIcon.Text = 'Claude: poller offline'
    $weekIcon.Text = 'Claude: poller offline'
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $RefreshMs
$timer.add_Tick({ Update-Icons })
$timer.Start()

Update-Icons
[System.Windows.Forms.Application]::Run()
