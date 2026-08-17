# CDP: screenshot the hero and try clicking non-selected workspace items.
$ErrorActionPreference = "Stop"
$port = 9225
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$profile = "$env:TEMP\dsh-cdp-profile4"
$outDir = "E:\caoTfile\code\dsh\back\scripts\shots"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$proc = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=$port",
  "--user-data-dir=$profile", "--window-size=1400,900", "about:blank"
) -PassThru
try {
  $deadline = (Get-Date).AddSeconds(20)
  $targets = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json" -TimeoutSec 2
      if ($targets) { break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $targets) { throw "CDP endpoint not reachable" }
  $page = $targets | Where-Object { $_.type -eq "page" } | Select-Object -First 1

  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $cts = [System.Threading.CancellationTokenSource]::new()
  $cts.CancelAfter(30000)
  $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $cts.Token).GetAwaiter().GetResult()

  $nextId = 1
  $events = [System.Collections.ArrayList]::new()
  $buffer = New-Object byte[] 65536
  $sb = [System.Text.StringBuilder]::new()

  function Read-Response {
    param([int]$wantId, [int]$timeoutMs = 60000)
    $deadline = (Get-Date).AddMilliseconds($timeoutMs)
    while ((Get-Date) -lt $deadline) {
      $null = $sb.Clear()
      do {
        $seg = [ArraySegment[byte]]::new($buffer)
        $receive = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $null = $sb.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $receive.Count))
      } while (-not $receive.EndOfMessage)
      $msg = $sb.ToString() | ConvertFrom-Json
      if ($msg.id -eq $wantId) { return $msg }
      if ($msg.method) { $null = $events.Add($msg) }
    }
    throw "timeout waiting for id $wantId"
  }

  function Invoke-Cdp {
    param([string]$method, $params = $null, [int]$timeoutMs = 60000)
    $id = $nextId; $nextId++
    $body = @{ id = $id; method = $method } | ConvertTo-Json -Depth 20 -Compress
    if ($params) { $body = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 20 -Compress }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $resp = Read-Response -wantId $id -timeoutMs $timeoutMs
    if ($resp.error) { throw "CDP $method error: $($resp.error.message)" }
    return $resp.result
  }

  function Eval {
    param([string]$expr)
    $r = Invoke-Cdp "Runtime.evaluate" @{ expression = $expr; returnByValue = $true; awaitPromise = $true }
    return $r.result.value
  }

  function Shot {
    param([string]$name)
    $r = Invoke-Cdp "Page.captureScreenshot" @{ format = "png" }
    [System.IO.File]::WriteAllBytes("$outDir\$name.png", [Convert]::FromBase64String($r.data))
    "saved $name.png"
  }

  $null = Invoke-Cdp "Runtime.enable"
  $null = Invoke-Cdp "Page.enable"
  $null = Invoke-Cdp "Page.navigate" @{ url = "http://127.0.0.1:3080/" }
  Start-Sleep -Seconds 10
  Shot "01-hero"

  # Open workspace list
  $r1 = Eval "(function(){var el=[...document.querySelectorAll('button')].find(function(e){return e.className.toString().indexOf('workspace')>=0});if(!el)return 'NO WS BTN';var r=el.getBoundingClientRect();window.__r={x:r.x+r.width/2,y:r.y+r.height/2};return 'OK'})()"
  "open list: $r1"
  if ($r1 -eq "OK") {
    $p = Eval "JSON.stringify(window.__r)" | ConvertFrom-Json
    $null = Invoke-Cdp "Input.dispatchMouseEvent" @{ type = "mousePressed"; x = $p.x; y = $p.y; button = "left"; clickCount = 1 }
    $null = Invoke-Cdp "Input.dispatchMouseEvent" @{ type = "mouseReleased"; x = $p.x; y = $p.y; button = "left"; clickCount = 1 }
  }
  Start-Sleep -Seconds 2
  Shot "02-workspace-list"

  # Dump list item rects
  $items = Eval "JSON.stringify([...document.querySelectorAll('button')].filter(function(e){return e.className.toString().indexOf('_item_')>=0}).map(function(e,i){var r=e.getBoundingClientRect();return {i:i,txt:e.textContent.trim().slice(0,20),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),sel:e.className.toString().indexOf('selected')>=0}}))"
  "list items: $items"
  $itemsObj = $items | ConvertFrom-Json

  # Click a NON-selected workspace (e.g. "code" or "dsh")
  $target = $itemsObj | Where-Object { -not $_.sel -and $_.txt -match 'code|dsh' } | Select-Object -First 1
  if ($target) {
    "clicking: $($target.txt) at ($($target.x),$($target.y))"
    $null = Invoke-Cdp "Input.dispatchMouseEvent" @{ type = "mousePressed"; x = $target.x; y = $target.y; button = "left"; clickCount = 1 }
    $null = Invoke-Cdp "Input.dispatchMouseEvent" @{ type = "mouseReleased"; x = $target.x; y = $target.y; button = "left"; clickCount = 1 }
    Start-Sleep -Seconds 4
    Shot "03-after-ws-click"
    $body = Eval "document.body.innerText.slice(0, 500)"
    "body after: $body"
  } else {
    "no non-selected workspace item found"
  }

  $ws.Dispose()
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match 'dsh-cdp-profile4' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
