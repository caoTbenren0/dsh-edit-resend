# CDP: open workspace/session through UI clicks and verify turnTail buttons.
$ErrorActionPreference = "Stop"
$port = 9224
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$profile = "$env:TEMP\dsh-cdp-profile3"

$proc = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=$port",
  "--user-data-dir=$profile", "about:blank"
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

  function Dump-Clickable {
    $v = Eval @'
JSON.stringify([...document.querySelectorAll('button, [role="button"], [role="option"], [role="row"], [role="listitem"], a')]
  .filter(el => el.textContent.trim().length > 0)
  .slice(0, 50)
  .map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,40), txt: el.textContent.trim().slice(0,40) })))
'@
    return ($v | ConvertFrom-Json)
  }

  function Click-Text {
    param([string]$txt, [int]$waitMs = 3000)
    $r = Eval "(function(){var els=[...document.querySelectorAll('button,[role=button],[role=option],[role=row],[role=listitem]')];var el=els.find(function(e){return e.textContent.trim().indexOf('$txt')>=0});if(!el)return 'NOT FOUND: $txt';el.click();return 'CLICKED: '+el.textContent.trim().slice(0,40)})()"
    Start-Sleep -Milliseconds $waitMs
    return $r
  }

  $null = Invoke-Cdp "Runtime.enable"
  $null = Invoke-Cdp "Page.enable"
  $null = Invoke-Cdp "Network.enable"
  $null = Invoke-Cdp "Log.enable"
  $null = Invoke-Cdp "Page.navigate" @{ url = "http://127.0.0.1:3080/" }
  Start-Sleep -Seconds 10

  "===== HERO: back button click ====="
  $r1 = Click-Text -txt "back" -waitMs 3000
  "back: $r1"
  (Dump-Clickable) | Format-Table -AutoSize | Out-String

  "===== Click workspace item 'back' (real mouse) ====="
  $r2 = Eval "(function(){var els=[...document.querySelectorAll('button')].filter(function(e){return e.className.toString().indexOf('_item_')>=0});var el=els.find(function(e){return e.textContent.trim()==='back'});if(!el)return 'WS NOT FOUND';var r=el.getBoundingClientRect();window.__wsRect={x:r.x+r.width/2,y:r.y+r.height/2};return 'WS RECT: '+JSON.stringify(window.__wsRect)})()"
  "ws: $r2"
  $rect = Eval "JSON.stringify(window.__wsRect)"
  $r2p = $rect | ConvertFrom-Json
  if ($r2p) {
    $null = Invoke-Cdp "Input.dispatchMouseEvent" @{ type = "mousePressed"; x = $r2p.x; y = $r2p.y; button = "left"; clickCount = 1 }
    $null = Invoke-Cdp "Input.dispatchMouseEvent" @{ type = "mouseReleased"; x = $r2p.x; y = $r2p.y; button = "left"; clickCount = 1 }
  }
  Start-Sleep -Seconds 5
  "===== AFTER WORKSPACE CLICK ====="
  $bodyAfter = Eval "document.body.innerText.slice(0, 600)"
  "body: $bodyAfter"
  (Dump-Clickable) | Format-Table -AutoSize | Out-String

  "===== NETWORK / CONSOLE EVENTS ====="
  $net = @($events | Where-Object { $_.method -eq "Network.requestWillBeSent" } | ForEach-Object { $_.params.request.url } | Where-Object { $_ -match '/api/' } | Select-Object -Last 10)
  "api requests: $($net -join ' | ')"
  $resp = @($events | Where-Object { $_.method -eq "Network.responseReceived" -and $_.params.response.url -match '/api/' } | ForEach-Object { "$($_.params.response.url) -> $($_.params.response.status)" } | Select-Object -Last 10)
  "api responses: $($resp -join ' | ')"
  $cons = @($events | Where-Object { $_.method -eq "Runtime.consoleAPICalled" } | ForEach-Object { "$($_.params.type): $(($_.params.args | ForEach-Object { $_.value }) -join ' ')" } | Select-Object -Last 15)
  "console: $($cons -join ' || ')"
  $excs = @($events | Where-Object { $_.method -eq "Runtime.exceptionThrown" } | ForEach-Object { $_.params.exceptionDetails.text } | Select-Object -Last 5)
  "exceptions: $($excs -join ' || ')"

  "===== Click first session in sidebar ====="
  $r3 = Eval "(function(){var els=[...document.querySelectorAll('button,[role=button],[role=row],[role=listitem]')].filter(function(e){return e.textContent.trim().length>0&&e.textContent.trim().length<60&&e.className.toString().indexOf('_item_')<0});var pick=els.find(function(e){return /查看dsh|编辑|resend/i.test(e.textContent)})||els[0];if(!pick)return 'NO SESSION';window.__picked=pick.textContent.trim();pick.click();return 'SESSION CLICKED: '+window.__picked})()"
  "session: $r3"
  Start-Sleep -Seconds 6

  "===== FINAL STATE ====="
  $final = Eval @'
JSON.stringify({
  hasErButton: !!document.querySelector('.er-tailButton'),
  erButtons: document.querySelectorAll('.er-tailButton').length,
  hasErCss: !!document.querySelector('style[data-plugin-css="dsh-edit-resend"]'),
  turnTails: document.querySelectorAll('[data-slot="conversation.chat.turnTail"]').length,
  tails: [...document.querySelectorAll('[data-slot="conversation.chat.turnTail"]')].map(d => d.innerHTML.slice(0, 120)),
  bodyText: document.body.innerText.slice(0, 300)
})
'@
  $final | ConvertFrom-Json | Format-List | Out-String

  $ws.Dispose()
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match 'dsh-cdp-profile3' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
