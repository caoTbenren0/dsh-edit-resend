# CDP probe: load the dsh web app in headless Edge and inspect plugin state.
$ErrorActionPreference = "Stop"
$port = 9222
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$profile = "$env:TEMP\dsh-cdp-profile"

# Start headless Edge with remote debugging
$proc = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=$port",
  "--user-data-dir=$profile", "about:blank"
) -PassThru
try {
  # Wait for the debugging endpoint
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
  if (-not $page) { throw "no page target" }

  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $cts = [System.Threading.CancellationTokenSource]::new()
  $cts.CancelAfter(30000)
  $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $cts.Token).GetAwaiter().GetResult()

  $nextId = 1
  $pending = @{}
  $events = [System.Collections.ArrayList]::new()

  $buffer = New-Object byte[] 65536
  $receive = [System.Net.WebSockets.WebSocketReceiveResult]$null
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

  # Enable console + runtime, navigate, wait for load
  $null = Invoke-Cdp "Runtime.enable"
  $null = Invoke-Cdp "Log.enable"
  $null = Invoke-Cdp "Page.enable"

  # Inject trace hooks BEFORE any page script runs
  $traceScript = @'
window.__erTrace = [];
let _ml = undefined;
Object.defineProperty(window, '__ModuleLoader__', {
  configurable: true,
  get() { return _ml; },
  set(v) {
    _ml = v;
    const orig = v.load.bind(v);
    v.load = (opts) => {
      if (opts && opts.id === 'dsh-edit-resend') {
        window.__erTrace.push('load:dsh-edit-resend');
        const origFactory = opts.factory;
        opts.factory = (require) => {
          window.__erTrace.push('factory:dsh-edit-resend');
          const mod = origFactory(require);
          const origApply = mod.apply;
          mod.apply = async (ctx) => {
            window.__erTrace.push('apply:start');
            try {
              const realGet = ctx.get.bind(ctx);
              const fake = Object.create(ctx);
              fake.get = (name) => {
                window.__erTrace.push('get:' + name);
                const svc = realGet(name);
                if (name === 'slots' && svc) {
                  try { window.__slotsSvc = svc; window.__erTrace.push('slots:captured'); } catch (e) {}
                }
                return svc;
              };
              const r = await origApply(fake);
              window.__erTrace.push('apply:done');
              // After apply: inspect the slot ledger directly (SlotRegistry._core)
              try {
                const svc = window.__slotsSvc;
                const core = svc && svc._core;
                if (core && typeof core.specDynamic === 'function') {
                  const spec = core.specDynamic('conversation.chat.turnTail');
                  window.__erTrace.push('ledger:spec=' + JSON.stringify(spec));
                }
                if (core && typeof core.entries === 'function') {
                  const entries = core.entries('conversation.chat.turnTail') || [];
                  window.__erTrace.push('ledger:entries=' + JSON.stringify(entries.map(e => ({ name: e.options && e.options.name, select: typeof (e.select), priority: e.options && e.options.priority, key: e.options && e.options.key }))));
                } else {
                  window.__erTrace.push('ledger:no-entries');
                }
                // Also capture the get() call stacks to find who called get("remote.editResend")
              } catch (e) {
                window.__erTrace.push('ledger:error:' + String(e && e.message || e));
              }
              // Re-check the ledger after 2.5s: is the registration still alive?
              setTimeout(() => {
                try {
                  const svc = window.__slotsSvc;
                  const core = svc && svc._core;
                  const entries = core && core.entries ? core.entries('conversation.chat.turnTail') : null;
                  window.__erTrace.push('ledger:late=' + (entries ? JSON.stringify(entries.map(e => ({ select: typeof (e.select) }))) : 'core-gone'));
                  // Simulate the chain election with a no-produced-files owner (like turn-tail4)
                  if (entries && entries.length >= 2) {
                    const fakeTurn = { data: new Map() };
                    const owner = { turn: fakeTurn, seq: 5, openFile: undefined };
                    const results = [];
                    for (const e of entries) {
                      try {
                        const m = e.select(owner);
                        results.push({ matched: m === null ? 'null' : (Array.isArray(m) ? 'array:' + m.length : String(m)), src: String(e.select).slice(0, 80) });
                      } catch (err) {
                        results.push({ matched: 'THREW:' + String(err && err.message || err), src: String(e.select).slice(0, 80) });
                      }
                    }
                    window.__erTrace.push('election:no-files=' + JSON.stringify(results));
                  }
                } catch (e) {
                  window.__erTrace.push('ledger:late-error:' + String(e && e.message || e));
                }
              }, 2500);
              return r;
            } catch (e) {
              window.__erTrace.push('apply:error:' + String(e && e.stack || e));
              throw e;
            }
          };
          return mod;
        };
      }
      return orig(opts);
    };
  }
});
'@
  $null = Invoke-Cdp "Page.addScriptToEvaluateOnNewDocument" @{ source = $traceScript }
  $null = Invoke-Cdp "Page.navigate" @{ url = "http://127.0.0.1:3080/" }
  Start-Sleep -Seconds 12

  # Collect console errors
  $consoleErrors = @($events | Where-Object { $_.method -eq "Runtime.consoleAPICalled" -and $_.params.type -eq "error" } | ForEach-Object {
    ($_.params.args | ForEach-Object { $_.value }) -join " "
  })
  $exceptions = @($events | Where-Object { $_.method -eq "Runtime.exceptionThrown" } | ForEach-Object {
    $_.params.exceptionDetails.text + " | " + ($_.params.exceptionDetails.exception.value -join " ")
  })

  # Evaluate DOM state
  $expr = @'
JSON.stringify({
  title: document.title,
  hasErButton: !!document.querySelector('.er-tailButton'),
  erButtons: document.querySelectorAll('.er-tailButton').length,
  hasErCss: !!document.querySelector('style[data-plugin-css="dsh-edit-resend"]'),
  turnTails: document.querySelectorAll('[data-slot="conversation.chat.turnTail"]').length,
  tailInner: [...document.querySelectorAll('[data-slot="conversation.chat.turnTail"]')].map(d => d.innerHTML.slice(0, 200)),
  bootPlugins: (window.__DSH_BOOT__?.entries ?? []).map(e => e.id),
  pluginLoadErrors: (window.__DSH_BOOT__?.errors ?? []),
  trace: (window.__erTrace ?? [])
})
'@
  $dom = Invoke-Cdp "Runtime.evaluate" @{
    expression = $expr
    returnByValue = $true
  }
  $state = $dom.result.value | ConvertFrom-Json

  # Try to open a session by clicking the first sidebar session item
  $click = Invoke-Cdp "Runtime.evaluate" @{
    expression = @'
(() => {
  const items = [...document.querySelectorAll('[role="button"], button, [class*="session"]')];
  const cands = items.filter(el => el.textContent && el.textContent.trim().length > 1 && el.textContent.length < 80);
  const pick = cands.slice(0, 10);
  const labels = pick.map(el => ({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), text: el.textContent.trim().slice(0, 40) }));
  return JSON.stringify(labels);
})()
'@
    returnByValue = $true
  }
  $cands = $click.result.value | ConvertFrom-Json
  "===== CLICKABLE CANDIDATES ====="
  $cands | Format-Table -AutoSize | Out-String

  # Try to peek at slot registry internals
  $slots = Invoke-Cdp "Runtime.evaluate" @{
    expression = "(() => { const w = window; const keys = Object.keys(w).filter(k => /slot|cordis|runtime/i.test(k)); return JSON.stringify(keys); })()"
    returnByValue = $true
  }

  "===== DOM STATE ====="
  "hasErButton: $($state.hasErButton) / hasErCss: $($state.hasErCss) / turnTails: $($state.turnTails)"
  "tailInner: $($state.tailInner -join ' | ')"
  "pluginLoadErrors: $($state.pluginLoadErrors -join ' | ')"
  "===== PLUGIN TRACE ====="
  $state.trace | ForEach-Object { "  $_" }
  "===== CONSOLE ERRORS ($($consoleErrors.Count)) ====="
  $consoleErrors | ForEach-Object { "ERR: $_" }
  "===== EXCEPTIONS ($($exceptions.Count)) ====="
  $exceptions | ForEach-Object { "EXC: $_" }
  "===== GLOBAL KEYS ====="
  $slots.result.value

  $ws.Dispose()
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
