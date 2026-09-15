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
  Track   = '#3a372f'
  Cream   = '#f4f0e6'
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

# Mirrors the StreamDock plugin's circular gauge (buildGaugeSvg): a dark
# card, a muted track ring, a tier-colored arc proportional to Percent,
# and the number in cream at the center. Pass Percent -1 for the
# loading/offline states (ring stays empty, just the track shows).
function New-GaugeIcon([string]$Text, [int]$Percent, [string]$TierColor) {
  $size = 64
  $stroke = 7
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($Palette.Bg))
  $g.FillEllipse($bgBrush, 1, 1, $size - 2, $size - 2)

  $inset = ($stroke / 2.0) + 2
  $arcRect = New-Object System.Drawing.RectangleF $inset, $inset, ($size - 2 * $inset), ($size - 2 * $inset)

  $trackPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($Palette.Track), $stroke)
  $g.DrawEllipse($trackPen, $arcRect)

  if ($Percent -gt 0) {
    $sweep = 360.0 * ([Math]::Min(100, $Percent) / 100.0)
    $arcPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml($TierColor), $stroke)
    $arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($arcPen, $arcRect, -90, $sweep)
    $arcPen.Dispose()
  }

  $fontSize = if ($Text.Length -ge 3) { 19 } else { 23 }
  $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
  $textColor = if ($Percent -ge 0) { $Palette.Cream } else { $Palette.Offline }
  $fgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($textColor))
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF(0, 1, $size, $size)
  $g.DrawString($Text, $font, $fgBrush, $textRect, $sf)

  $g.Dispose()
  $bgBrush.Dispose()
  $trackPen.Dispose()
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
$sessionIcon.Icon = New-GaugeIcon '..' -1 $Palette.Offline
$sessionIcon.Text = 'Claude - sessao (carregando)'
$sessionIcon.Visible = $true

$weekIcon = New-Object System.Windows.Forms.NotifyIcon
$weekIcon.Icon = New-GaugeIcon '..' -1 $Palette.Offline
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
      $sessionIcon.Icon = New-GaugeIcon "$pct" $pct (Get-TierColor $pct)
      $countdown = Format-Countdown $session.resetsAtIso
      $sessionIcon.Text = "Sessao atual: $pct%" + $(if ($countdown) { " - reseta em $countdown" } else { '' })
    }
    if ($week) {
      $pct = [int]$week.percentUsed
      $weekIcon.Icon = New-GaugeIcon "$pct" $pct (Get-TierColor $pct)
      $countdown = Format-Countdown $week.resetsAtIso
      $weekIcon.Text = "Semana: $pct%" + $(if ($countdown) { " - reseta em $countdown" } else { '' })
    }
  } catch {
    $sessionIcon.Icon = New-GaugeIcon '?' -1 $Palette.Offline
    $weekIcon.Icon = New-GaugeIcon '?' -1 $Palette.Offline
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
