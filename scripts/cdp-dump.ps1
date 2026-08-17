# CDP probe: dump hero DOM + try to open a workspace/session.
$ErrorActionPreference = "Stop"
$port = 9223
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$profile = "$env:TEMP\dsh-cdp-profile2"

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

  $null = Invoke-Cdp "Runtime.enable"
  $null = Invoke-Cdp "Page.enable"
  $null = Invoke-Cdp "Page.navigate" @{ url = "http://127.0.0.1:3080/" }
  Start-Sleep -Seconds 10

  # Dump all interactive elements with text
  $dump = Invoke-Cdp "Runtime.evaluate" @{
    expression = @'
JSON.stringify([...document.querySelectorAll('button, [role="button"], [role="option"], [role="listbox"] *, a')]
  .filter(el => el.textContent.trim().length > 0)
  .slice(0, 60)
  .map(el => ({ tag: el.tagName, cls: (el.className||'').toString().slice(0,50), txt: el.textContent.trim().slice(0,50) })))
'@
    returnByValue = $true
  }
  "===== INTERACTIVE ELEMENTS ====="
  ($dump.result.value | ConvertFrom-Json) | Format-Table -AutoSize | Out-String

  # Also dump body text snippet
  $body = Invoke-Cdp "Runtime.evaluate" @{
    expression = "document.body ? document.body.innerText.slice(0, 800) : 'no body'"
    returnByValue = $true
  }
  "===== BODY TEXT ====="
  $body.result.value

  $ws.Dispose()
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -match 'dsh-cdp-profile2' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
