/**
 * dsh-remote — visitor console page (served by the relay face and by local
 * direct mode). Single self-contained HTML document: no external assets, no
 * build step. The 8-digit code comes from the URL path; all traffic rides
 * `/<code>/ws`.
 */

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9; --bg2: #ffffff; --fg: #1a1c1f; --fg2: #6b7280;
  --line: #e2e5ea; --accent: #4d6bfe; --accentfg: #ffffff;
  --user-bg: #4d6bfe; --user-fg: #ffffff; --ok: #16a34a; --warn: #d97706; --bad: #dc2626;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101114; --bg2: #17191d; --fg: #e8eaed; --fg2: #9aa0a6;
    --line: #2a2d33; --accent: #6b84ff; --accentfg: #0e1116;
    --user-bg: #4d6bfe; --user-fg: #ffffff; --ok: #4ade80; --warn: #fbbf24; --bad: #f87171;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  display: flex; flex-direction: column;
}
header {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px;
  border-bottom: 1px solid var(--line); background: var(--bg2); flex: none;
}
header .brand { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; }
header .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bad); flex: none; }
header .dot.on { background: var(--ok); }
header .host { color: var(--fg2); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
header .code { font-family: var(--mono); font-size: 12px; color: var(--fg2); margin-left: auto; flex: none; }
main { flex: 1; display: flex; min-height: 0; }
aside {
  width: 232px; flex: none; border-right: 1px solid var(--line); background: var(--bg2);
  display: flex; flex-direction: column; min-height: 0;
}
@media (max-width: 720px) { aside { display: none; } }
aside .head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 6px; color: var(--fg2); font-size: 12px; flex: none;
}
aside .new {
  border: 1px solid var(--line); background: transparent; color: var(--fg);
  border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer;
}
aside .new:hover { border-color: var(--accent); color: var(--accent); }
aside .list { overflow-y: auto; flex: 1; padding: 4px 6px 10px; }
.session {
  padding: 7px 9px; border-radius: 8px; cursor: pointer; margin-bottom: 2px;
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.session:hover { background: var(--bg); }
.session.active { background: var(--bg); outline: 1px solid var(--line); }
.session .rdot { width: 7px; height: 7px; border-radius: 50%; background: var(--line); flex: none; }
.session .rdot.run { background: var(--ok); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.35; } }
.session .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.session .time { color: var(--fg2); font-size: 11px; flex: none; }
section.chat { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
#log { flex: 1; overflow-y: auto; padding: 18px 18px 8px; display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; }
.row.user { justify-content: flex-end; }
.bubble {
  max-width: min(76%, 720px); padding: 8px 12px; border-radius: 12px;
  white-space: pre-wrap; word-break: break-word; font-size: 14px;
}
.row.user .bubble { background: var(--user-bg); color: var(--user-fg); border-bottom-right-radius: 4px; }
.row.assistant .bubble { background: var(--bg2); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.row.assistant .bubble.thinking { color: var(--fg2); font-style: italic; }
.row.tool { justify-content: flex-start; }
.toolchip {
  font-family: var(--mono); font-size: 11.5px; color: var(--fg2);
  background: var(--bg2); border: 1px solid var(--line); border-radius: 7px; padding: 2px 9px;
  max-width: min(76%, 720px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.meta { font-size: 11px; color: var(--fg2); margin: 0 6px; }
.system {
  text-align: center; color: var(--fg2); font-size: 12px; padding: 6px 0;
}
.statusbar {
  display: flex; align-items: center; gap: 10px; padding: 4px 18px 0; font-size: 12px; color: var(--fg2); flex: none; min-height: 22px;
}
.statusbar .pending { color: var(--warn); }
.statusbar .spacer { flex: 1; }
footer { padding: 10px 18px 14px; flex: none; }
.composer {
  display: flex; gap: 8px; align-items: flex-end;
  background: var(--bg2); border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px;
}
.composer:focus-within { border-color: var(--accent); }
textarea {
  flex: 1; border: none; outline: none; resize: none; background: transparent; color: var(--fg);
  font: inherit; max-height: 160px; min-height: 22px; line-height: 1.5;
}
button.go {
  border: none; background: var(--accent); color: var(--accentfg); border-radius: 9px;
  padding: 6px 16px; font-size: 13px; cursor: pointer; flex: none;
}
button.go:disabled { opacity: 0.45; cursor: not-allowed; }
button.stop {
  border: 1px solid var(--bad); background: transparent; color: var(--bad); border-radius: 9px;
  padding: 5px 14px; font-size: 13px; cursor: pointer; flex: none;
}
.notice { color: var(--fg2); font-size: 12px; margin-top: 6px; text-align: center; }
.offline-wrap { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; color: var(--fg2); }
.offline-wrap .big { font-size: 16px; color: var(--fg); }
.offline-wrap .hint { font-size: 12.5px; }
`

function pageBody(code, offline) {
  if (offline) {
    return `<div class="offline-wrap">
      <div class="big">宿主机暂时离线</div>
      <div class="hint">远程码 <b style="font-family:var(--mono)">${code}</b> 有效，但宿主机尚未连上中转站。页面会自动重试。</div>
    </div>
    <script>setTimeout(function(){ location.reload() }, 10000)</script>`
  }
  return `
  <header>
    <span class="brand"><span class="dot" id="conn-dot"></span>远程控制</span>
    <span class="host" id="host-name">连接中…</span>
    <span class="code">远程码 ${code}</span>
  </header>
  <main>
    <aside>
      <div class="head"><span>会话</span><button class="new" id="btn-new" title="新建会话">＋ 新会话</button></div>
      <div class="list" id="sessions"></div>
    </aside>
    <section class="chat">
      <div id="log"></div>
      <div class="statusbar">
        <span id="run-state"></span>
        <span class="pending" id="pending"></span>
        <span class="spacer"></span>
        <span id="observing"></span>
      </div>
      <footer>
        <div class="composer">
          <textarea id="input" rows="1" placeholder="输入指令，Enter 发送，Shift+Enter 换行"></textarea>
          <button class="stop" id="btn-stop" style="display:none">中断</button>
          <button class="go" id="btn-send">发送</button>
        </div>
        <div class="notice" id="notice"></div>
      </footer>
    </section>
  </main>`
}

const SCRIPT = `
'use strict'
var CODE = location.pathname.replace(/^\\/+/, '').split('/')[0]
if (!/^\\d{8}$/.test(CODE)) CODE = null
var ws = null
var nextId = 1
var pendingReqs = new Map()
var sessions = []
var currentSession = null
var allowControl = false
var hostName = ''
var running = false
var queued = 0
var pendingInput = []

function $(id) { return document.getElementById(id) }
function send(cmd, p) {
  return new Promise(function (resolve, reject) {
    if (!ws || ws.readyState !== 1) return reject(new Error('未连接'))
    var id = 'r' + nextId++
    pendingReqs.set(id, { resolve: resolve, reject: reject })
    ws.send(JSON.stringify({ t: 'cmd', id: id, cmd: cmd, p: p || {} }))
    setTimeout(function () {
      if (pendingReqs.has(id)) { pendingReqs.delete(id); reject(new Error('响应超时')) }
    }, 25000)
  })
}
function connect() {
  var proto = location.protocol === 'https:' ? 'wss://' : 'ws://'
  ws = new WebSocket(proto + location.host + '/' + CODE + '/ws')
  ws.onopen = function () { setConn(true) }
  ws.onclose = function () {
    setConn(false)
    setTimeout(connect, 3000)
  }
  ws.onmessage = function (ev) {
    var frame
    try { frame = JSON.parse(ev.data) } catch (e) { return }
    if (frame.t === 'welcome') onWelcome(frame)
    else if (frame.t === 'res') {
      var entry = pendingReqs.get(frame.id)
      if (!entry) return
      pendingReqs.delete(frame.id)
      if (frame.ok) entry.resolve(frame.data)
      else entry.reject(new Error(frame.error || '命令失败'))
    } else if (frame.t === 'push') onPush(frame.f)
  }
}
function setConn(on) {
  $('conn-dot').className = 'dot' + (on ? ' on' : '')
  if (!on) $('host-name').textContent = '连接断开，重试中…'
}
function onWelcome(frame) {
  if (frame.error) { $('notice').textContent = frame.error; return }
  allowControl = !!(frame.host && frame.host.allowControl)
  hostName = (frame.host && frame.host.name) || ''
  $('host-name').textContent = hostName + '（可控）'
  if (!allowControl) $('host-name').textContent = hostName + '（只读）'
  $('btn-new').style.display = allowControl ? '' : 'none'
  applySessions(frame.sessions || [])
  if (!currentSession && sessions.length) observeSession(sessions[0].id)
  if (!sessions.length) $('log').innerHTML = '<div class="system">宿主机还没有会话，点「＋ 新会话」开始</div>'
}
function applySessions(list) {
  sessions = list || []
  renderSessions()
}
function renderSessions() {
  var wrap = $('sessions')
  wrap.innerHTML = ''
  sessions.forEach(function (s) {
    var div = document.createElement('div')
    div.className = 'session' + (s.id === currentSession ? ' active' : '')
    var dot = document.createElement('span')
    dot.className = 'rdot' + (s.running ? ' run' : '')
    var title = document.createElement('span')
    title.className = 'title'
    title.textContent = s.title || '(未命名会话)'
    var time = document.createElement('span')
    time.className = 'time'
    time.textContent = fmtTime(s.updatedAt)
    div.appendChild(dot); div.appendChild(title); div.appendChild(time)
    div.onclick = function () { observeSession(s.id) }
    wrap.appendChild(div)
  })
}
function fmtTime(ms) {
  if (!ms) return ''
  var d = new Date(ms)
  var today = new Date(); today.setHours(0, 0, 0, 0)
  var hm = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
  return d.getTime() < today.getTime() ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm : hm
}
function observeSession(id) {
  currentSession = id
  $('log').innerHTML = '<div class="system">加载会话…</div>'
  send('sessions.observe', { sessionId: id }).then(function () { renderSessions() })
    .catch(function (err) { $('log').innerHTML = '<div class="system">' + esc(err.message) + '</div>' })
  renderSessions()
}
function onPush(f) {
  if (!f) return
  if (f.t === 'sessions-updated') { applySessions(f.sessions); return }
  if (currentSession && f.sessionId !== currentSession) return
  if (f.t === 'session-history') {
    $('log').innerHTML = ''
    foldRecords(f.records || [])
    applyState(f.state || {})
    autoscroll(true)
  } else if (f.t === 'session-event') {
    foldRecords([f.event])
    autoscroll(false)
  } else if (f.t === 'session-state') {
    applyState(f.state || {})
  }
}
function applyState(state) {
  running = !!state.running
  queued = state.queued || 0
  pendingInput = state.pendingInput || []
  $('btn-stop').style.display = running && allowControl ? '' : 'none'
  $('btn-send').disabled = !allowControl
  $('input').disabled = !allowControl
  var bits = []
  if (running) bits.push('运行中' + (queued ? '（排队 ' + queued + '）' : ''))
  $('run-state').textContent = bits.join(' ')
  var pend = pendingInput.length ? '待处理：' + pendingInput.map(function (p) { return p === 'approval' ? '权限确认' : p === 'question' ? '提问' : '输入' }).join('、') + '（请在本机 GUI 处理）' : ''
  $('pending').textContent = pend
  $('observing').textContent = currentSession ? '正在查看 ' + short(currentSession) : ''
}
function short(id) { return id ? id.slice(0, 8) : '' }
function foldRecords(records) {
  var log = $('log')
  if (log.querySelector('.system') && records.length) log.innerHTML = ''
  records.forEach(function (entry) {
    var ev = entry && entry.event ? entry.event : entry
    if (!ev || typeof ev.type !== 'string') return
    var data = ev.data || {}
    if (ev.type === 'user/message') {
      var src = data.source || {}
      if (src.kind && src.kind !== 'user') return
      var text = partsText(data.content)
      if (!text) return
      addRow('user', text, ev.time)
    } else if (ev.type === 'assistant/message') {
      var atext = streamText(data.stream)
      if (!atext) atext = partsText(data.content)
      if (!atext) return
      addRow('assistant', atext, ev.time)
    } else if (ev.type === 'tool/call') {
      addTool(data.name || 'tool', data.arguments)
    }
  })
}
function partsText(content) {
  if (!Array.isArray(content)) return ''
  return content.filter(function (p) { return p && p.type === 'text' && p.text })
    .map(function (p) { return p.text }).join('\\n').trim()
}
function streamText(stream) {
  if (!Array.isArray(stream)) return ''
  var out = ''
  stream.forEach(function (chunk) {
    if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') out += chunk.text
  })
  return out.trim()
}
function addRow(kind, text, time) {
  var log = $('log')
  var row = document.createElement('div')
  row.className = 'row ' + kind
  var bubble = document.createElement('div')
  bubble.className = 'bubble' + (kind === 'assistant' && !text ? ' thinking' : '')
  bubble.textContent = text || '…'
  row.appendChild(bubble)
  if (time) {
    var meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = fmtTime(time)
    row.appendChild(meta)
  }
  log.appendChild(row)
  autoscroll(false)
}
function addTool(name, args) {
  var log = $('log')
  var row = document.createElement('div')
  row.className = 'row tool'
  var chip = document.createElement('div')
  chip.className = 'toolchip'
  var detail = ''
  try {
    if (args && typeof args === 'object') {
      var keys = Object.keys(args)
      if (keys.length) detail = ' ' + JSON.stringify(args[keys[0]]).slice(0, 60)
    } else if (typeof args === 'string') detail = ' ' + args.slice(0, 60)
  } catch (e) { /* display only */ }
  chip.textContent = '⚙ ' + name + detail
  row.appendChild(chip)
  log.appendChild(row)
  autoscroll(false)
}
var stick = true
$('log').addEventListener('scroll', function () {
  var el = $('log')
  stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
})
function autoscroll(force) {
  if (!force && !stick) return
  var el = $('log')
  el.scrollTop = el.scrollHeight
}
function doSend() {
  var input = $('input')
  var text = input.value.trim()
  if (!text || !currentSession || !allowControl) return
  input.value = ''
  autoGrow()
  send('sessions.send', { sessionId: currentSession, text: text })
    .then(function () { addRow('user', text, Date.now()); autoscroll(true) })
    .catch(function (err) { $('notice').textContent = '发送失败：' + err.message })
}
function doStop() {
  if (!currentSession) return
  send('sessions.cancel', { sessionId: currentSession })
    .catch(function (err) { $('notice').textContent = '中断失败：' + err.message })
}
function doNew() {
  if (!allowControl) return
  send('sessions.create', {}).then(function (data) {
    applySessionsRefresh(function () { observeSession(data.sessionId) })
  }).catch(function (err) { $('notice').textContent = '新建失败：' + err.message })
}
function applySessionsRefresh(next) {
  send('sessions.list', {}).then(function (data) {
    applySessions(data.sessions)
    next()
  }).catch(next)
}
function autoGrow() {
  var el = $('input')
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>\"]/, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]
  })
}
if (!CODE) {
  document.body.innerHTML = '<div class="offline-wrap"><div class="big">无效的远程码</div></div>'
} else {
  $('btn-send').onclick = doSend
  $('btn-stop').onclick = doStop
  $('btn-new').onclick = doNew
  $('input').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); doSend() }
  })
  $('input').addEventListener('input', autoGrow)
  connect()
}
`

export function consoleHtml({ code, offline }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>远程控制 ${code}</title>
<style>${CSS}</style>
</head>
<body>
${pageBody(code, offline === true)}
<script>${SCRIPT}</script>
</body>
</html>`
}
