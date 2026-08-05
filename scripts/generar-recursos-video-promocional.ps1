Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Speech

$workspace = Split-Path -Parent $PSScriptRoot
$captureDir = Join-Path $workspace 'public\capturas-presentacion'
$outputDir = Join-Path $workspace 'public\video-promocional'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$W = 1080; $H = 1920
$navy = [System.Drawing.Color]::FromArgb(10,24,48)
$blue = [System.Drawing.Color]::FromArgb(38,103,245)
$aqua = [System.Drawing.Color]::FromArgb(24,194,176)
$ink = [System.Drawing.Color]::FromArgb(25,37,57)
$muted = [System.Drawing.Color]::FromArgb(92,107,130)
$paper = [System.Drawing.Color]::FromArgb(247,249,252)
$white = [System.Drawing.Color]::White

function Font([float]$size,[System.Drawing.FontStyle]$style=[System.Drawing.FontStyle]::Regular) {
  New-Object System.Drawing.Font('Segoe UI',$size,$style,[System.Drawing.GraphicsUnit]::Pixel)
}
function Draw-CenteredText($g,[string]$value,$font,$brush,[float]$y) {
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString($value,$font,$brush,[System.Drawing.RectangleF]::new(70,$y,940,240),$format)
  $format.Dispose()
}
function Draw-RoundedRect($g,$brush,[float]$x,[float]$y,[float]$w,[float]$h,[float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d=$r*2; $path.AddArc($x,$y,$d,$d,180,90); $path.AddArc($x+$w-$d,$y,$d,$d,270,90); $path.AddArc($x+$w-$d,$y+$h-$d,$d,$d,0,90); $path.AddArc($x,$y+$h-$d,$d,$d,90,90); $path.CloseFigure(); $g.FillPath($brush,$path); $path.Dispose()
}
function Add-Logo($g,[bool]$dark=$false) {
  $logo=[System.Drawing.Image]::FromFile((Join-Path $workspace 'public\logo.png'))
  if($dark){$g.FillRectangle((New-Object System.Drawing.SolidBrush($white)),325,75,430,190)}
  $g.DrawImage($logo,345,90,390,146); $logo.Dispose()
}
function Add-Screenshot($g,[string]$file) {
  $shadow=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28,10,24,48)); Draw-RoundedRect $g $shadow 62 492 956 650 35; $shadow.Dispose()
  $frame=New-Object System.Drawing.SolidBrush($white); Draw-RoundedRect $g $frame 45 475 956 650 35; $frame.Dispose()
  $img=[System.Drawing.Image]::FromFile((Join-Path $captureDir $file)); $g.DrawImage($img,65,505,916,509); $img.Dispose()
  $bar=New-Object System.Drawing.SolidBrush($navy); $g.FillRectangle($bar,65,505,916,34); $bar.Dispose()
  foreach($item in @(@(88,[System.Drawing.Color]::FromArgb(255,95,87)),@(116,[System.Drawing.Color]::FromArgb(255,189,46)),@(144,[System.Drawing.Color]::FromArgb(39,201,63)))) { $b=New-Object System.Drawing.SolidBrush($item[1]); $g.FillEllipse($b,$item[0],516,14,14); $b.Dispose() }
}
function Add-MiniScreenshot($g,[string]$file,[float]$x,[float]$y,[float]$w,[float]$h) {
  $shadow=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(55,0,0,0)); Draw-RoundedRect $g $shadow ($x+14) ($y+18) $w $h 28; $shadow.Dispose()
  $frame=New-Object System.Drawing.SolidBrush($white); Draw-RoundedRect $g $frame $x $y $w $h 28; $frame.Dispose()
  $img=[System.Drawing.Image]::FromFile((Join-Path $captureDir $file)); $g.DrawImage($img,$x+18,$y+42,$w-36,$h-60); $img.Dispose()
  $bar=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24,35,55)); $g.FillRectangle($bar,$x+18,$y+18,$w-36,30); $bar.Dispose()
}
function Add-Benefits($g,[string[]]$items) {
  $y=1190; foreach($item in $items){$box=New-Object System.Drawing.SolidBrush($white); Draw-RoundedRect $g $box 75 $y 930 135 25; $box.Dispose(); $accent=New-Object System.Drawing.SolidBrush($aqua); Draw-RoundedRect $g $accent 105 ($y+30) 74 74 18; $accent.Dispose(); $check=Font 38 ([System.Drawing.FontStyle]::Bold); $g.DrawString('✓',$check,(New-Object System.Drawing.SolidBrush($white)),124,$y+38); $check.Dispose(); $f=Font 34 ([System.Drawing.FontStyle]::Bold); $g.DrawString($item,$f,(New-Object System.Drawing.SolidBrush($ink)),210,$y+43); $f.Dispose(); $y+=155 }
}
function New-Slide([int]$index,[string]$title,[string]$subtitle,[string]$shot,[string[]]$benefits,[bool]$dark=$false) {
  $bmp=New-Object System.Drawing.Bitmap($W,$H); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode='AntiAlias'; $g.TextRenderingHint='AntiAliasGridFit'
  $bg=New-Object System.Drawing.SolidBrush($(if($dark){$navy}else{$paper})); $g.FillRectangle($bg,0,0,$W,$H); $bg.Dispose()
  if($dark){$orb=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(38,103,245)); $g.FillEllipse($orb,760,-160,500,500); $orb.Dispose()}
  Add-Logo $g $dark
  $titleFont=Font 66 ([System.Drawing.FontStyle]::Bold); $subFont=Font 32; Draw-CenteredText $g $title $titleFont (New-Object System.Drawing.SolidBrush($(if($dark){$white}else{$ink}))) 275; Draw-CenteredText $g $subtitle $subFont (New-Object System.Drawing.SolidBrush($(if($dark){[System.Drawing.Color]::FromArgb(210,220,235)}else{$muted}))) 395; $titleFont.Dispose(); $subFont.Dispose()
  if($shot){Add-Screenshot $g $shot; Add-Benefits $g $benefits}
  $footer=Font 25 ([System.Drawing.FontStyle]::Bold); Draw-CenteredText $g 'VORTEX · TU NEGOCIO EN MOVIMIENTO' $footer (New-Object System.Drawing.SolidBrush($(if($dark){$aqua}else{$blue}))) 1830; $footer.Dispose()
  $bmp.Save((Join-Path $outputDir ('slide-{0:d2}.png' -f $index)),[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

function New-Cover {
  $bmp=New-Object System.Drawing.Bitmap($W,$H); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode='AntiAlias'; $g.TextRenderingHint='AntiAliasGridFit'
  $bg=New-Object System.Drawing.SolidBrush($navy); $g.FillRectangle($bg,0,0,$W,$H); $bg.Dispose()
  $orb=New-Object System.Drawing.SolidBrush($blue); $g.FillEllipse($orb,790,-130,430,430); $orb.Dispose(); Add-Logo $g $true
  $title=Font 70 ([System.Drawing.FontStyle]::Bold); Draw-CenteredText $g 'GESTIONÁ TU COMERCIO' $title (New-Object System.Drawing.SolidBrush($white)) 330; $title.Dispose()
  $sub=Font 34; Draw-CenteredText $g 'Todo lo que necesitás, en un solo lugar.' $sub (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210,220,235))) 445; $sub.Dispose()
  Add-MiniScreenshot $g '02-ventas.jpg' 70 600 760 470
  Add-MiniScreenshot $g '03-productos.jpg' 300 950 700 425
  Add-MiniScreenshot $g '05-reporte-ventas.jpg' 85 1260 760 460
  $pill=New-Object System.Drawing.SolidBrush($aqua); Draw-RoundedRect $g $pill 235 1740 610 72 36; $pill.Dispose(); $f=Font 30 ([System.Drawing.FontStyle]::Bold); Draw-CenteredText $g 'VENTAS · STOCK · CAJA · REPORTES' $f (New-Object System.Drawing.SolidBrush($navy)) 1757; $f.Dispose()
  $bmp.Save((Join-Path $outputDir 'slide-01.png'),[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

New-Cover
New-Slide 2 'VENTAS MÁS ÁGILES' 'Registrá, cobrá y consultá cada operación.' '02-ventas.jpg' @('Múltiples medios de pago','Comprobantes claros','Historial completo')
New-Slide 3 'PRODUCTOS Y STOCK' 'Información actualizada para vender con confianza.' '03-productos.jpg' @('Costos y precios','Control de existencias','Rubros, marcas y proveedores')
New-Slide 4 'CONTROL DE CAJA' 'Conocé cada ingreso, egreso y diferencia.' '01-caja.jpg' @('Aperturas y cierres','Movimientos detallados','Control diario')
New-Slide 5 'CUENTAS CORRIENTES' 'Saldos y movimientos de cada cliente.' '04-cuenta-corriente.jpg' @('Débitos y créditos','Registro de pagos','Estados de cuenta')
New-Slide 6 'REPORTES PARA DECIDIR' 'Convertí los datos del comercio en información útil.' '05-reporte-ventas.jpg' @('Ventas y ticket promedio','Rankings e indicadores','Reportes para compartir')

$bmp=New-Object System.Drawing.Bitmap($W,$H); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode='AntiAlias'; $g.TextRenderingHint='AntiAliasGridFit'; $bg=New-Object System.Drawing.SolidBrush($navy); $g.FillRectangle($bg,0,0,$W,$H); $bg.Dispose(); Add-Logo $g $true
$f1=Font 70 ([System.Drawing.FontStyle]::Bold); Draw-CenteredText $g 'LLEVÁ TU NEGOCIO' $f1 (New-Object System.Drawing.SolidBrush($white)) 430; Draw-CenteredText $g 'AL PRÓXIMO NIVEL' $f1 (New-Object System.Drawing.SolidBrush($aqua)) 520; $f1.Dispose()
$card=New-Object System.Drawing.SolidBrush($white); Draw-RoundedRect $g $card 90 760 900 480 38; $card.Dispose(); $f2=Font 43 ([System.Drawing.FontStyle]::Bold); Draw-CenteredText $g 'CONTACTO' $f2 (New-Object System.Drawing.SolidBrush($blue)) 820; $f2.Dispose();
$f3=Font 47 ([System.Drawing.FontStyle]::Bold); Draw-CenteredText $g 'Marcos Abella' $f3 (New-Object System.Drawing.SolidBrush($ink)) 920; $f3.Dispose(); $f4=Font 31; Draw-CenteredText $g 'Analista de Sistemas' $f4 (New-Object System.Drawing.SolidBrush($muted)) 990; Draw-CenteredText $g 'Cel. 3583 - 430176' $f4 (New-Object System.Drawing.SolidBrush($blue)) 1080; Draw-CenteredText $g 'Jovita · Córdoba' $f4 (New-Object System.Drawing.SolidBrush($ink)) 1140; $f4.Dispose();
$cta=Font 34 ([System.Drawing.FontStyle]::Bold); Draw-CenteredText $g 'Solicitá una demostración' $cta (New-Object System.Drawing.SolidBrush($white)) 1410; $cta.Dispose(); $bmp.Save((Join-Path $outputDir 'slide-07.png'),[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()

$narration = @'
¿Buscás una forma más simple de administrar tu comercio? VORTEX reúne ventas, productos, stock, caja, cuentas corrientes y reportes en una sola plataforma web. Registrá cada venta con distintos medios de pago, consultá comprobantes y mantené un historial completo de tus operaciones. Administrá productos, costos, precios y existencias para vender siempre con información actualizada. Controlá aperturas, ingresos, egresos y cierres de caja, con el detalle necesario para detectar diferencias. Con las cuentas corrientes podés conocer el saldo de cada cliente, registrar pagos y generar estados de cuenta claros. Además, los reportes transforman la actividad diaria en indicadores útiles: ventas totales, ticket promedio, rankings, stock y saldos. Menos controles dispersos, más trazabilidad y mejores decisiones. VORTEX, tu negocio en movimiento. Contactame y solicitá una demostración del sistema.
'@
$voice=New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoice('Microsoft Helena Desktop'); $voice.Rate=0; $voice.Volume=100
$voice.SetOutputToWaveFile((Join-Path $outputDir 'voz-en-off.wav')); $voice.Speak($narration); $voice.Dispose()
Write-Output "Recursos generados en $outputDir"

