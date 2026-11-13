/**
 * dsh-remote-relay — relay core: code registry, per-code routes, bridging.
 *
 * The same core serves the server-side relay face (on dsh.skillpie.cn) and
 * the local direct mode. A host socket registers with an 8-digit code; the
 * core mounts the public surface for `/<code>` on the given webServer:
 *
 * - `gui` mode (default): transparently mounts the host's real DSH Web GUI
 *   under `/<code>/`. HTTP requests are stripped of the prefix, framed over
 *   the control channel, and served from the host's own web server over
 *   loopback; the GUI's single mux WebSocket (`/api/remote.mux`) is spliced
 *   byte-by-byte. Set-cookie lines are rewritten per code (name prefix
 *   `r<code>-`, `Path=/` → `Path=/<code>/`) so several hosts can share one
 *   relay origin without cookie collisions.
 * - `console` mode: the lightweight visitor console page and its JSON
 *   command channel.
 *
 * Registry: hosts keyed by hostId, codes kept unique; tokens stored hashed.
 * A host reconnecting with the correct token supersedes its stale socket;
 * an unknown hostId claims its id fresh (fail-closed, matching the built-in
 * relay's design) and receives a newly minted token.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import {
  PROTOCOL_VERSION,
  isValidCode,
  hashToken,
  parseFrame,
  VISITOR_COMMANDS,
  encodeBin,
  decodeBin,
} from './protocol.js'
import { adaptSocket } from './ws-adapter.js'
import { fileRouteKey } from './file-route.js'

const HELLO_TIMEOUT_MS = 5_000
const OFFLINE_GRACE_MS = 10 * 60_000
const VISITOR_IDLE_MS = 90_000
const HTTP_OP_TIMEOUT_MS = 150_000
const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024
/**
 * Inbound caps. Host frames carry whole GUI responses as binary chunks
 * (capped at 8 MiB each by the sender); visitor frames carry POST bodies in
 * the same chunking, so the visitor cap stays generous too. Commands in
 * console mode are tiny and checked separately.
 */
const MAX_HOST_FRAME_BYTES = 8 * 1024 * 1024
const MAX_HTML_INJECT_BYTES = 4 * 1024 * 1024
const MAX_VISITOR_FRAME_BYTES = 8 * 1024 * 1024

export class RelayCore {
  constructor({ webServer, consoleHtml, log = () => {}, maxVisitorsPerHost = 8, mode = 'console' }) {
    this.webServer = webServer
    this.consoleHtml = consoleHtml
    this.log = log
    this.maxVisitorsPerHost = maxVisitorsPerHost
    this.mode = mode === 'gui' ? 'gui' : 'console'
    /** hostId → host record */
    this.hosts = new Map()
    /** code → hostId */
    this.codeIndex = new Map()
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_VISITOR_FRAME_BYTES })
    this.hostWss = new WebSocketServer({ noServer: true, maxPayload: MAX_HOST_FRAME_BYTES })
    this.cmdSeq = 0
    this.timers = new Set()
    this.closed = false
    this.enterDisposers = []
    // 未知远程码兜底:webServer 的前缀匹配是「p 或 p/」语义,任何短于 8 字符
    // 的前缀都命中不了 /<code>/ 路径,所以无法用通配路由接管数字码;改为
    // ①独立输码页路由(供手动访问/边缘转发目标),②由 index.js 用
    // webServer.tapIndex 把守卫脚本注进服务器 SPA 文档——未知码路径命中的
    // 正是 SPA fallback 渲染的 index,守卫脚本据 pathname 弹输码框。
    if (this.mode === 'gui') {
      try {
        this.enterDisposers.push(this.webServer.register({
          kind: 'prefix',
          path: '/dsh-remote-relay-enter',
          handler: (req, res) => {
            try { this.serveEnter(req, res) } catch (error) {
              this.log('relay', `输码页请求失败（已隔离）: ${error?.message ?? error}`)
              try { res.writeHead(500).end() } catch { /* gone */ }
            }
          },
        }))
      } catch (error) {
        this.log('relay', `输码路由注册失败（已隔离）: ${error?.message ?? error}`)
      }
    }
  }

  /**
   * Standalone code-entry page: `/dsh-remote-relay-enter?code=NNNNNNNN` renders the
   * dialog pre-flagged with that code as invalid; without a code it opens the
   * blank dialog. Also the redirect target for edge-level unknown-code rules.
   */
  serveEnter(req, res) {
    let code = ''
    try { code = new URL(req.url ?? '/', 'http://localhost').searchParams.get('code') ?? '' } catch { code = '' }
    const send = (status, body, headers = {}) => {
      if (res.headersSent) { try { res.destroy() } catch { res.end() } ; return }
      res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
      res.end(body)
    }
    const bad = /^[1-9]\d{7}$/.test(code) ? code : ''
    if (code !== '' && bad === '') {
      send(400, 'bad code\n', { 'Content-Type': 'text/plain; charset=utf-8' })
      return
    }
    send(200, this.enterHtml(bad), { 'Content-Type': 'text/html; charset=utf-8' })
  }

  /**
   * Code-entry page: shown for a well-formed but unknown remote code instead
   * of the SPA's 404. Asks the visitor for a valid code and forwards to
   * /<code>/, where the normal conceal+tunnel flow takes over — the entered
   * code never lingers in a form, and a live code behaves exactly like
   * opening its link for the first time.
   */
  enterHtml(badCode) {
    const hint = badCode
      ? `<div class="err">远程码 <code>${badCode}</code> 无效或宿主机未在线，请核对后重试。</div>`
      : ''
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>DeepSeek 远程访问</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#101114;color:#e8eaed;font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.card{width:min(360px,90vw);background:#1a1c21;border:1px solid #2a2d34;border-radius:14px;padding:28px 26px;box-sizing:border-box}
h1{margin:0 0 6px;font-size:16px;font-weight:600}.sub{margin:0 0 18px;font-size:12.5px;color:#9aa0a6}
.row{display:flex;gap:8px}
input{flex:1;min-width:0;background:#101114;border:1px solid #2a2d34;border-radius:8px;color:#e8eaed;padding:9px 12px;font:15px ui-monospace,Menlo,monospace;letter-spacing:.12em;outline:none}
input:focus{border-color:#6b84ff}
button{background:#4a5cff;border:0;border-radius:8px;color:#fff;padding:9px 16px;font:14px inherit;cursor:pointer}
button:hover{background:#5b6bff}
.err{margin-top:14px;font-size:12.5px;color:#ff8a80;word-break:break-all}code{font-family:ui-monospace,Menlo,monospace;color:#ffb4a9}
.tip{margin-top:16px;font-size:11.5px;color:#6b7078}</style></head>
<body><div class="card"><h1>DeepSeek 远程访问</h1><p class="sub">请输入 8 位远程码以连接对应的宿主机。</p>
${hint}
<form class="row"><input name="code" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="12345678" autofocus><button type="submit">进入</button></form>
<div class="tip">远程码由宿主机属主面板提供，仅在宿主机在线时可用。</div></div>
<script>(function(){
var f=document.querySelector('form');var i=document.querySelector('input');
i.addEventListener('input',function(){i.value=i.value.replace(/\\D/g,'').slice(0,8)});
f.addEventListener('submit',function(ev){
  ev.preventDefault();
  var c=i.value;
  if(!/^[1-9]\\d{7}$/.test(c)){i.focus();return}
  location.assign('/'+c+'/');
});
i.focus();
})();</script></body></html>`
  }

  later(fn, ms) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (!this.closed) fn()
    }, ms)
    this.timers.add(timer)
    return timer
  }

  disposeTimer(timer) {
    clearTimeout(timer)
    this.timers.delete(timer)
  }

  /** webServer upgrade handler for the host control channel. */
  acceptHostUpgrade(req, rawSocket, head) {
    if (this.closed) { rawSocket.destroy(); return }
    try {
      this.hostWss.handleUpgrade(req, rawSocket, head, (raw) => {
        const forwarded = typeof req.headers['x-forwarded-for'] === 'string'
          ? req.headers['x-forwarded-for'].split(',')[0].trim()
          : ''
        this.acceptHostSocket(adaptSocket(raw), forwarded)
      })
    } catch (error) {
      this.log('relay', `宿主升级失败（已隔离）: ${error?.message ?? error}`)
      try { rawSocket.destroy() } catch { /* gone */ }
    }
  }

  /** One host control frame, isolated from socket-listener exceptions. */
  onHostFrame(state, socket, data, fail, ip) {
      if (typeof data !== 'string') {
        // Binary: GUI splice payload (response chunk / ws bytes).
        if (!state.hostId) return
        const host = this.hosts.get(state.hostId)
        if (!host) return
        host.lastSeen = Date.now()
        const decoded = decodeBin(data)
        if (!decoded) return
        this.routeBin(host, decoded.meta, decoded.payload)
        return
      }
      const frame = parseFrame(data, MAX_HOST_FRAME_BYTES)
      if (!frame) {
        if (data.length > MAX_HOST_FRAME_BYTES) {
          this.log('relay', `dropped oversized host frame (${Math.round(data.length / 1024)} KiB)`)
        }
        return
      }
      if (frame.t === 'hello') {
        this.disposeTimer(state.helloTimer)
        const registeredId = this.registerHost(socket, frame, state.ip ?? '', fail)
        if (registeredId) state.hostId = registeredId
        return
      }
      if (!state.hostId) return
      const host = this.hosts.get(state.hostId)
      if (!host) return
      host.lastSeen = Date.now()
      if (frame.t === 'hb') {
        socket.send({ t: 'hb' })
        return
      }
      if (frame.t === 'res') this.routeResult(host, frame)
      else if (frame.t === 'push') this.routePush(host, frame)
      else if (frame.t === 'hres' || frame.t === 'hfail') this.routeHttp(host, frame)
      else if (frame.t === 'hend') this.finishHttp(host, frame.id)
      else if (frame.t === 'wok' || frame.t === 'wfail') this.routeSpliceControl(host, frame)
      else if (frame.t === 'wclose') this.finishSplice(host, frame)
      else if (frame.t === 'wdata-text') this.routeText(host, frame)
  }

  /** Accept one host end (already adapted: pipe end or ws adapter). */
  acceptHostSocket(socket, ip = '') {
    const state = { hostId: undefined, helloTimer: undefined, ip }
    const fail = (error) => {
      socket.send({ t: 'hello', v: PROTOCOL_VERSION, ok: false, error })
      this.later(() => socket.close(), 150)
    }
    state.helloTimer = this.later(() => {
      if (!state.hostId) fail('hello timeout')
    }, HELLO_TIMEOUT_MS)
    const offMessage = socket.onMessage((data) => {
      try {
        this.onHostFrame(state, socket, data, fail, state.ip)
      } catch (error) {
        this.log('relay', `宿主机帧处理异常（已隔离）: ${error?.message ?? error}`)
      }
    })
    const offClose = socket.onClose(() => {
      this.disposeTimer(state.helloTimer)
      offMessage()
      offClose()
      if (!state.hostId) return
      const host = this.hosts.get(state.hostId)
      if (!host || host.socket !== socket) return
      this.log('relay', `host offline: ${host.name} (${host.code})`)
      host.socket = undefined
      for (const visitor of host.visitors.values()) visitor.socket.close()
      host.visitors.clear()
      host.pending.clear()
      for (const op of host.httpOps.values()) {
        this.disposeTimer(op.timer)
        try { op.res.destroy() } catch { op.res.end() }
      }
      host.httpOps.clear()
      for (const splice of host.splices.values()) {
        try { splice.socket.close() } catch { try { splice.raw.terminate() } catch { /* gone */ } }
      }
      host.splices.clear()
      // Keep the routes briefly so a reconnecting host reclaims them; a host
      // that stays away loses the registration after the grace window.
      host.offlineTimer = this.later(() => this.removeHost(host.hostId, 'offline grace elapsed'), OFFLINE_GRACE_MS)
    })
  }

  registerHost(socket, hello, ip, fail) {
    const hostId = typeof hello.hostId === 'string' ? hello.hostId.slice(0, 128) : ''
    const code = isValidCode(hello.code) ? hello.code : null
    if (!hostId || !code) return fail('invalid hello')
    const existing = this.hosts.get(hostId)
    const token = typeof hello.token === 'string' ? hello.token : ''
    if (existing) {
      if (token !== '' && hashToken(token) !== existing.tokenHash) {
        this.log('relay', `rejected host ${hostId}: token mismatch`)
        return fail('hostId already registered with a different token')
      }
      if (token === '' && existing.tokenHash !== '') {
        this.log('relay', `rejected host ${hostId}: empty token for known identity`)
        return fail('hostId already registered; token required')
      }
    }
    // Code anti-hijack: a live code bound to another host id never rebinds.
    const codeOwner = this.codeIndex.get(code)
    if (codeOwner !== undefined && codeOwner !== hostId && this.hosts.get(codeOwner)) {
      return fail('code already in use')
    }
    const minted = token === '' || existing?.tokenHash !== hashToken(token)
    const newToken = minted ? randomBytes(24).toString('hex') : token
    if (existing?.offlineTimer) this.disposeTimer(existing.offlineTimer)
    if (existing?.socket && existing.socket !== socket) existing.socket.close()
    if (codeOwner !== undefined && codeOwner !== hostId) {
      // Old owner is gone (removeHost clears the index only for its own code;
      // reaching here means a stale index entry) — reclaim defensively.
      this.codeIndex.delete(code)
    }
    const host = existing ?? {
      hostId,
      visitors: new Map(),
      pending: new Map(),
      httpOps: new Map(),
      splices: new Map(),
      routes: [],
      fileKey: undefined,
      createdAt: Date.now(),
    }
    if (existing) {
      for (const route of host.routes) route()
      host.routes = []
    }
    const previousCode = host.code
    host.code = code
    host.name = typeof hello.name === 'string' ? hello.name.slice(0, 80) : host.name
    host.dsh = typeof hello.dsh === 'string' ? hello.dsh.slice(0, 40) : host.dsh
    host.ip = ip
    host.fileKey = fileRouteKey(hostId)
    host.tokenHash = hashToken(newToken)
    host.socket = socket
    host.lastSeen = Date.now()
    this.hosts.set(hostId, host)
    this.codeIndex.set(code, hostId)
    if (previousCode && previousCode !== code && this.codeIndex.get(previousCode) === hostId) {
      this.codeIndex.delete(previousCode)
    }
    // Mount the public surface for this code.
    try {
      if (this.mode === 'gui') {
        host.routes.push(this.webServer.register({
          kind: 'prefix',
          path: `/${code}`,
          handler: (req, res) => {
            try { this.proxyHttp(req, res, code, host) } catch (error) {
              this.log('relay', `代理请求失败（已隔离）: ${error?.message ?? error}`)
              try { res.writeHead(500).end() } catch { /* gone */ }
            }
          },
        }))
        host.routes.push(this.webServer.registerUpgrade({
          path: `/${code}/api/remote.mux`,
          handler: (req, upgradeSocket, head) => {
            try { this.acceptWsSplice(req, upgradeSocket, head, host) } catch (error) {
              this.log('relay', `访客升级失败（已隔离）: ${error?.message ?? error}`)
              try { upgradeSocket.destroy() } catch { /* gone */ }
            }
          },
        }))
      } else {
        host.routes.push(this.webServer.register({
          kind: 'prefix',
          path: `/${code}`,
          handler: (req, res) => {
            try { this.serveConsole(req, res, code, host) } catch (error) {
              this.log('relay', `控制台请求失败（已隔离）: ${error?.message ?? error}`)
              try { res.writeHead(500).end() } catch { /* gone */ }
            }
          },
        }))
        host.routes.push(this.webServer.registerUpgrade({
          path: `/${code}/ws`,
          handler: (req, upgradeSocket, head) => {
            try { this.acceptVisitor(req, upgradeSocket, head, host) } catch (error) {
              this.log('relay', `访客升级失败（已隔离）: ${error?.message ?? error}`)
              try { upgradeSocket.destroy() } catch { /* gone */ }
            }
          },
        }))
      }
    } catch (error) {
      this.log('relay', `route registration failed for ${code}: ${error?.message ?? error}`)
      this.codeIndex.delete(code)
      this.hosts.delete(hostId)
      return fail('route registration failed')
    }
    this.log('relay', `host registered: ${host.name} code=${code} mode=${this.mode}${minted ? ' (token minted)' : ''}`)
    socket.send({ t: 'hello', v: PROTOCOL_VERSION, ok: true, token: newToken })
    return hostId
  }

  removeHost(hostId, reason) {
    const host = this.hosts.get(hostId)
    if (!host) return
    this.hosts.delete(hostId)
    if (this.codeIndex.get(host.code) === hostId) this.codeIndex.delete(host.code)
    if (host.offlineTimer) this.disposeTimer(host.offlineTimer)
    for (const route of host.routes) route()
    host.routes = []
    host.socket?.close()
    for (const visitor of host.visitors.values()) visitor.socket.close()
    host.visitors.clear()
    host.pending.clear()
    for (const op of host.httpOps.values()) {
      this.disposeTimer(op.timer)
      try { op.res.destroy() } catch { op.res.end() }
    }
    host.httpOps.clear()
    for (const splice of host.splices.values()) {
      try { splice.socket.close() } catch { try { splice.raw.terminate() } catch { /* gone */ } }
    }
    host.splices.clear()
    this.log('relay', `host removed: ${host.name} (${host.code}) — ${reason}`)
  }

  /* ── gui mode: transparent HTTP + WS splice ─────────────────────────── */

  stripPrefix(pathname, code) {
    if (pathname === `/${code}`) return '/'
    return pathname.slice(`/${code}`.length) || '/'
  }

  /** Strip the per-code prefix from visitor cookie names. */
  stripCodeCookies(header, code) {
    if (typeof header !== 'string' || header === '') return undefined
    const prefix = `r${code}-`
    const kept = []
    for (const segment of header.split(';')) {
      const pair = segment.trim()
      if (!pair) continue
      const at = pair.indexOf('=')
      if (at === -1) continue
      const name = pair.slice(0, at)
      if (!name.startsWith(prefix)) continue
      kept.push(`${name.slice(prefix.length)}=${pair.slice(at + 1)}`)
    }
    return kept.length > 0 ? kept.join('; ') : undefined
  }

  /** Prefix visitor cookie names and scope Path to the code mount. */
  rewriteSetCookie(line, code) {
    const prefix = `r${code}-`
    const at = line.indexOf('=')
    if (at === -1) return line
    let out = `${prefix}${line.slice(0, at)}=${line.slice(at + 1)}`
    out = out.replace(/Path=\/(?![^\s;])/i, `Path=/${code}/`)
    return out
  }

  offlineHtml(code) {
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><script>(function(){try{localStorage.setItem('dsh-remote-relay-last-code','${code}');sessionStorage.setItem('dsh-remote-relay-last-code','${code}');if((location.search||'').indexOf('gui')===-1)history.replaceState(null,'','/')}catch(e){}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>远程控制 ${code}</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#101114;color:#e8eaed;font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}.big{font-size:17px}.hint{font-size:12.5px;color:#9aa0a6}code{font-family:ui-monospace,Menlo,monospace;color:#6b84ff}</style></head>
<body><div class="big">宿主机暂时离线</div><div class="hint">远程码 <code>${code}</code> 有效，但宿主机尚未连上中转站。页面会自动重试。</div></body></html>`
  }

  /**
   * Visitor-side URL shim. The proxied GUI and every plugin panel call
   * absolute same-origin paths (`/api/...`, `/dsh-<name>/...`), which only
   * resolve on the host's own origin. Under `/<code>/` every same-origin
   * http(s)/ws(s) request is rebased onto the prefix so it lands on the
   * relay's proxy route and splice mux instead of the SPA fallback. The
   * rule is path-agnostic — any plugin route rides it, so new plugins
   * never require changes to this file. Requests already riding the
   * prefix and non-same-origin URLs pass through untouched.
   * Injected into proxied HTML right after `<head>`; runs before app scripts.
   */
  visitorShimScript(code) {
    const prefix = JSON.stringify(`/${code}`)
    return `<script>(function(){
window.__DSH_REMOTE_VISITOR__=true;
try{localStorage.setItem('dsh-remote-relay-last-code',${JSON.stringify(code)})}catch(e){}
var P=${prefix};
function owned(p){return p===P||p.slice(0,P.length+1)===P+'/'}
function rebase(u){try{var x=new URL(u,location.href);if((x.protocol==='http:'||x.protocol==='https:'||x.protocol==='ws:'||x.protocol==='wss:')&&x.host===location.host&&!owned(x.pathname)){return P+x.pathname+x.search+x.hash}}catch(e){}return u}
function wrap(input){
  if(typeof input==='string')return rebase(input);
  if(input&&typeof input.href==='string')return rebase(input.href);
  if(input&&typeof input.url==='string'){var nu=rebase(input.url);return nu===input.url?input:new Request(nu,input)}
  return input;
}
var of=window.fetch;
window.fetch=function(input,init){try{return of(wrap(input),init)}catch(e){return of(input,init)}};
var OW=window.WebSocket;
window.WebSocket=class extends OW{constructor(u,p){u=wrap(typeof u==='string'?u:String(u));super(u,p)}};
})(/* dsh-remote-relay visitor shim */);</script>`
  }

  /**
   * Code concealment: remember the code, pin relative resolution to the
   * tunnel prefix (history.replaceState would change how `<base href="./">`
   * resolves), strip the code from the visible URL, and register the
   * origin-level service worker so later visits to the bare origin restore
   * the tunnel without the code ever reappearing in the address bar.
   * Injected right after `<base>`; runs before app scripts.
   */
  concealScript(code) {
    const codeJson = JSON.stringify(code)
    const prefixJson = JSON.stringify(`/${code}/`)
    return `<script>(function(){
window.__DSH_REMOTE_CONCEAL__=true;
try{
  var C=${codeJson};
  if((location.search||'').indexOf('gui')!==-1){try{sessionStorage.setItem('dsh-remote-relay-bypass','1')}catch(e){}return}
  var b=document.querySelector('base');
  if(b)b.setAttribute('href',${prefixJson});
  try{localStorage.setItem('dsh-remote-relay-last-code',C)}catch(e){}
  try{sessionStorage.setItem('dsh-remote-relay-last-code',C)}catch(e){}
  try{history.replaceState(null,'','/')}catch(e){}
  if(navigator.serviceWorker&&window.isSecureContext){
    navigator.serviceWorker.register('/dsh-remote-relay-sw.js?code='+C,{scope:'/'}).catch(function(){})
  }
}catch(e){}
})(/* dsh-remote-relay conceal */);</script>`
  }

  /**
   * Visitor-side "download file" menu patch. The host GUI's file menu
   * (OpenTargetButton) only hands paths to the host desktop; a remote
   * visitor has no way to save the file locally. This script watches for
   * that menu opening, prepends a "下载文件" item (styled after the native
   * menu rows) and serves the file through the host's `/dsh-remote-relay-file`
   * route via the tunnel.
   *
   * The absolute path comes from the preview header's PathLabel
   * (`[data-path-label]` holds it in `title`); as a fallback we tap mux
   * frames for the last path the app requested (openWorkspacePath /
   * workspacePathApplications payloads carry `"path":"…"`).
   * Injected last, after the visitor shim (its WebSocket wrapper stays).
   */
  /**
   * Visitor-side "download file" menu patch. The host GUI's file menu
   * (OpenTargetButton) only hands paths to the host desktop; a remote
   * visitor has no way to save the file locally. This script watches for
   * that menu opening, prepends a "下载文件" row and serves the file
   * through the host's `/dsh-remote-relay-file` route via the tunnel.
   *
   * Row construction: a deep clone of the first native row wrapper.
   * MenuRow wraps every `button[role=menuitem]` in a `div` and styles it
   * with hashed CSS-module classes — cloning the wrapper keeps font size,
   * icon column and alignment identical to the native rows; only the icon
   * glyph and the label text are swapped in afterwards.
   *
   * Path resolution, in order:
   * - document preview header: `[data-path-label]` carries the path in `title`;
   * - chat deliverable card (PresentedFileCard): its preview button's
   *   `title` holds the resolved absolute path — found via
   *   `[data-presented-file]`; the card's menu is fed over HTTP, so mux
   *   never sees this path;
   * - last resort: the last path an outgoing mux frame carried
   *   (openWorkspacePath / workspacePathApplications payloads).
   * Injected last, after the visitor shim (its WebSocket wrapper stays).
   */
  downloadMenuScript(code, key) {
    const codeJson = JSON.stringify(code)
    const keyJson = JSON.stringify(String(key ?? ''))
    return `<script>(function(){
window.__DSH_REMOTE_DOWNLOAD__=true;
try{
var C=${codeJson};var K=${keyJson};
var M=/显示文件位置|Show file location|ファイルの場所| ファイル位置| 파일 위치|Открыть расположение/;
var PATH_RE=/^([\\/~]|[A-Za-z]:[\\\\\\/])/;
function isPath(s){return typeof s==='string'&&s.length>1&&s.length<1024&&PATH_RE.test(s)&&s.indexOf('/')>-1}
var lastMux=null;
function notePath(p){if(isPath(p))lastMux={path:p,at:Date.now()}}
var OW=window.WebSocket;
window.WebSocket=class extends OW{constructor(u,p){super(u,p);var self=this;var s=super.send;
// tap outgoing mux frames for file paths (last resort when the DOM has none)
this.send=function(data){
  try{
    if(typeof data==='string'&&data.indexOf('"path"')>-1){
      var m=data.match(/"path"\\s*:\\s*"((?:[^"\\\\]|\\\\(?:u[0-9a-fA-F]{4}|.))*)"/);
      if(m){try{notePath(JSON.parse('"'+m[1]+'"'))}catch(e){}}
    }
  }catch(e){}
  return s.call(self,data)}
}};
function base(){return location.pathname.replace(new RegExp('^/'+C+'(/|$)'),'/')==='/'
  ? '/'+C : location.pathname.split('/').slice(0,2).join('/')}
var DL_ICON='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2.2v7.6m0 0 2.8-2.8M8 9.8 5.2 7M3 12.6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function download(path){
  var url=base()+'/dsh-remote-relay-file?path='+encodeURIComponent(path);
  return fetch(url,{credentials:'omit',headers:{'x-dsh-remote-relay-key':K}}).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);
    var cd=r.headers.get('content-disposition')||'';
    var m=cd.match(/filename\\*=UTF-8''([^;]+)/i);
    var name=m?decodeURIComponent(m[1]):(path.split('/').pop()||'download');
    return r.blob().then(function(b){
      var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(function(){URL.revokeObjectURL(a.href)},30000);
    });
  });
}
// The search always starts from the menu trigger, never from the inserted
// row: the row sits in a portal, and walking up from it would end at
// document level where an unrelated preview's path label could win.
function findPath(el){
  for(var n=el,i=0;n&&i<8;i++,n=n.parentElement){
    if(!n.querySelector)continue;
    var lbl=n.querySelector('[data-path-label]');
    if(lbl){var t=lbl.getAttribute('title')||lbl.textContent;if(isPath(t))return t}
    var card=n.querySelector('[data-presented-file]');
    if(card){var c=card.querySelector('[title]');
      if(c){var t2=c.getAttribute('title');if(isPath(t2))return t2}}
  }
  return null;
}
// Split a native row button (MenuRow renders [span icon][span label],
// optional shortcut/check siblings) into its icon and label spans.
function rowSpans(btn){
  var icon=null,label=null,drop=[];
  var c=btn.children;
  for(var i=0;i<c.length;i++){var el=c[i];
    if(el.tagName==='SPAN'){
      if(el.querySelector&&(el.querySelector('svg')||el.querySelector('img'))){if(!icon)icon=el;else drop.push(el)}
      else if(!label)label=el;else drop.push(el);
    }else if(el.tagName!=='DIV'){drop.push(el)}
  }
  return {icon:icon,label:label,drop:drop};
}
function decorate(btn,zh){
  btn.removeAttribute('disabled');btn.removeAttribute('aria-disabled');
  btn.removeAttribute('aria-describedby');btn.removeAttribute('id');
  btn.setAttribute('data-dsh-remote-relay-dl-item','1');
  var sp=rowSpans(btn);
  for(var i=0;i<sp.drop.length;i++){if(sp.drop[i].parentNode)sp.drop[i].parentNode.removeChild(sp.drop[i])}
  if(sp.icon)sp.icon.innerHTML=DL_ICON;
  var label=sp.label;
  if(!label){label=document.createElement('span');btn.appendChild(label)}
  label.setAttribute('data-dsh-remote-relay-dl-item-label','1');
  label.textContent=zh?'下载文件':'Download file';
}
function bind(btn,zh,trigger){
  var busy=false;
  btn.addEventListener('click',function(ev){
    ev.preventDefault();ev.stopPropagation();
    if(busy)return;
    var path=trigger?findPath(trigger):null;
    if(!path&&lastMux&&Date.now()-(lastMux.at||0)<120000)path=lastMux.path;
    var t=btn.querySelector('[data-dsh-remote-relay-dl-item-label]')||btn;
    // Always give visible feedback: locate failure, progress, and network
    // failures each flash on the row label — a silent click reads as broken.
    var flash=function(msg,ms){
      var old=t.textContent;t.textContent=msg;
      setTimeout(function(){t.textContent=old},ms||1500);
    };
    if(!path){flash(zh?'无法定位文件':'Cannot locate file',1200);return}
    busy=true;
    var old=t.textContent;
    t.textContent=zh?'下载中…':'Downloading…';
    download(path).then(function(){
      busy=false;t.textContent=old;
      setTimeout(function(){t.textContent=zh?'下载文件':'Download file'},50);
    }).catch(function(err){
      busy=false;
      // 404 means the deliverable card outlived its file (chat history keeps
      // cards after the workspace copy is cleaned up) — say that, not a
      // generic failure.
      var notFound=String(err&&err.message||'').indexOf('404')>-1;
      t.textContent=notFound?(zh?'文件已不存在(可能已被清理)':'File no longer exists'):(zh?'下载失败,请重试':'Download failed');
      setTimeout(function(){t.textContent=zh?'下载文件':'Download file'},1800);
    });
  });
}
function patch(menu){
  var items=menu.querySelectorAll('[role=menuitem]');
  if(!items.length)return;
  // React may re-render the open menu (applications arrive async) and drop
  // the inserted row: only skip when the row is still in place, otherwise
  // fall through and re-clone it.
  var already=menu.querySelector('[data-dsh-remote-relay-dl-item]');
  if(already&&menu.contains(already))return;
  menu.setAttribute('data-dsh-remote-relay-dl','1');
  var first=items[0];
  // Trigger resolution, most-reliable first (rc.1 ground truth: the chevron
  // carries aria-haspopup + aria-expanded but NO aria-controls, and the menu
  // root id may be empty — so tiers 2/3 do the real work):
  //   1. aria-controls containing the menu id (forward-compatible contract);
  //   2. the open trigger: [data-open-target] [aria-haspopup][aria-expanded=true];
  //   3. proximity — closest [data-open-target] [aria-haspopup] to the popup.
  var trigger=null;
  var mid=menu.id||'';
  if(mid){var cands=document.querySelectorAll('[aria-controls]');
    for(var i=0;i<cands.length;i++){var v=(cands[i].getAttribute('aria-controls')||'').split(/\\s+/);
      if(v.indexOf(mid)>-1){trigger=cands[i];break}}}
  if(!trigger){
    var opens=document.querySelectorAll('[data-open-target] [aria-haspopup][aria-expanded="true"]');
    if(opens.length===1)trigger=opens[0];
    else if(opens.length>1){
      var mr=menu.getBoundingClientRect();var bg=1e18;
      for(var i=0;i<opens.length;i++){var x=opens[i].getBoundingClientRect();
        var dd=(x.left-mr.left)*(x.left-mr.left)+(x.top-mr.bottom)*(x.top-mr.bottom);
        if(dd<bg){bg=dd;trigger=opens[i]}}}}
  var hasReveal=false;
  for(var i=0;i<items.length;i++){if(M.test(items[i].textContent||'')){hasReveal=true;break}}
  // File-menu gate: reveal row, or a STRICTLY resolved open trigger inside a
  // file card. Proximity alone must never admit a menu — any random popup
  // (avatar menu…) sitting near a leftover file-card chevron would other‐
  // wise grow a bogus 下载文件 row.
  var isFile=hasReveal||(trigger&&trigger.closest&&trigger.closest('[data-open-target="file"]'));
  if(!isFile)return;
  if(!trigger){
    var any=document.querySelectorAll('[data-open-target] [aria-haspopup]');
    var mr2=menu.getBoundingClientRect();var bg2=1e18;
    for(var i=0;i<any.length;i++){var x2=any[i].getBoundingClientRect();
      var d2=(x2.left-mr2.left)*(x2.left-mr2.left)+(x2.top-mr2.bottom)*(x2.top-mr2.bottom);
      if(d2<bg2){bg2=d2;trigger=any[i]}}}
  var zh=(document.documentElement.lang||'').toLowerCase().indexOf('zh')===0;
  var parent=first.parentNode;
  if(parent&&parent!==menu&&parent.nodeType===1&&parent.getAttribute('role')!=='menu'){
    // Native rows live in a wrapper div (MenuRow itemWrap): clone the whole
    // wrapper so every hashed class — and thus size, padding, alignment — matches.
    var wrap=parent.cloneNode(true);
    var btn=wrap.querySelector?wrap.querySelector('button[role=menuitem]'):null;
    if(!btn&&wrap.tagName==='BUTTON')btn=wrap;
    if(!btn)return;
    decorate(btn,zh);
    parent.parentNode.insertBefore(wrap,parent);
    bind(btn,zh,trigger);
    return;
  }
  // Fallback: row rendered without a wrapper — clone the button itself.
  var btn2=first.cloneNode(true);
  decorate(btn2,zh);
  parent.insertBefore(btn2,first);
  bind(btn2,zh,trigger);
}
var mo=new MutationObserver(function(muts){
  for(var i=0;i<muts.length;i++){var add=muts[i].addedNodes;
    for(var j=0;j<add.length;j++){var n=add[j];
      if(!n||n.nodeType!==1)continue;
      var menus=n.matches&&n.matches('[role=menu]')?[n]:(n.querySelectorAll?n.querySelectorAll('[role=menu]'):[]);
      for(var k=0;k<menus.length;k++){try{patch(menus[k])}catch(e){}}
    }}
});
function start(){try{mo.observe(document.body,{childList:true,subtree:true})}catch(e){}}
if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
// Menus already open before the observer started.
try{document.querySelectorAll('[role=menu]').forEach(patch)}catch(e){}
}catch(e){}
})(/* dsh-remote-relay download menu */);</script>`
  }

  injectVisitorShim(html, code, fileKey) {
    if (typeof html !== 'string' || html.length === 0) return html
    let scripts = this.concealScript(code) + this.visitorShimScript(code)
    if (typeof fileKey === 'string' && fileKey.length > 0) {
      scripts += this.downloadMenuScript(code, fileKey)
    }
    if (/<base[^>]*>/i.test(html)) return html.replace(/<base[^>]*>/i, (m) => m + scripts)
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + scripts)
    return scripts + html
  }

  proxyHttp(req, res, code, host) {
    let pathname = '/'
    let search = ''
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      pathname = url.pathname
      search = url.search
    } catch { pathname = '/' }
    const subpath = this.stripPrefix(pathname, code)
    const targetPath = subpath + search
    const send = (status, body, headers = {}) => {
      if (res.headersSent) { try { res.destroy() } catch { res.end() } ; return }
      res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
      res.end(body)
    }
    if (pathname === `/${code}` && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(302, { location: `/${code}/`, 'cache-control': 'no-store' })
      res.end()
      return
    }
    if (!host.socket) {
      if (subpath === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
        send(200, this.offlineHtml(code), { 'Content-Type': 'text/html; charset=utf-8' })
      } else {
        send(504, '宿主机离线\n', { 'Content-Type': 'text/plain; charset=utf-8' })
      }
      return
    }
    if (host.httpOps.size >= 64) {
      send(429, 'too many in-flight requests\n', { 'Content-Type': 'text/plain; charset=utf-8' })
      return
    }
    const id = `h${++this.cmdSeq}`
    // Buffer the request body (GUI uploads included), then frame it over.
    const chunks = []
    let size = 0
    let done = false
    let failed = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_REQUEST_BODY_BYTES) {
        if (!failed) { failed = true; send(413, 'payload too large\n', { 'Content-Type': 'text/plain; charset=utf-8' }) }
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', () => { failed = true })
    req.on('end', () => { done = true })
    const op = { res, timer: undefined, done: false, method: req.method }
    host.httpOps.set(id, op)
    op.timer = this.later(() => {
      if (!op.done) {
        host.httpOps.delete(id)
        send(504, '宿主机响应超时\n', { 'Content-Type': 'text/plain; charset=utf-8' })
      }
    }, HTTP_OP_TIMEOUT_MS)
    res.on('close', () => {
      if (!op.done && host.socket) host.socket.send({ t: 'habort', id })
    })
    const dispatch = () => {
      if (failed || this.closed) { host.httpOps.delete(id); return }
      const body = Buffer.concat(chunks)
      host.socket.send({
        t: 'hreq',
        id,
        m: req.method,
        p: targetPath,
        h: {
          ...sanitize(req.headers, code),
          ...(body.length > 0 ? { 'content-length': String(body.length) } : {}),
        },
      })
      if (body.length > 0) host.socket.sendRaw(encodeBin({ t: 'hchunk', id }, body))
      host.socket.send({ t: 'hend', id })
    }
    if (done) dispatch()
    else req.on('end', () => dispatch())

    function sanitize(headers, cd) {
      const out = {}
      const drop = new Set(['host', 'origin', 'referer', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'accept-encoding', 'content-length'])
      for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase()
        if (drop.has(lower) || lower.startsWith('sec-')) continue
        if (lower === 'cookie') {
          const stripped = stripCookiesHeader(value, cd)
          if (stripped) out.cookie = stripped
          continue
        }
        out[lower] = Array.isArray(value) ? value.join(', ') : String(value)
      }
      return out
    }
    function stripCookiesHeader(header, cd) {
      if (typeof header !== 'string' || header === '') return undefined
      const prefix = `r${cd}-`
      const kept = []
      for (const segment of header.split(';')) {
        const pair = segment.trim()
        const at = pair.indexOf('=')
        if (at === -1) continue
        const name = pair.slice(0, at)
        if (!name.startsWith(prefix)) continue
        kept.push(`${name.slice(prefix.length)}=${pair.slice(at + 1)}`)
      }
      return kept.length > 0 ? kept.join('; ') : undefined
    }
  }

  routeHttp(host, frame) {
    const op = host.httpOps.get(frame.id)
    if (!op) return
    if (frame.t === 'hfail') {
      host.httpOps.delete(frame.id)
      this.disposeTimer(op.timer)
      op.done = true
      if (!op.res.headersSent) {
        op.res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        op.res.end(`宿主机桥接失败: ${frame.error ?? 'unknown'}\n`)
      } else {
        try { op.res.destroy() } catch { op.res.end() }
      }
      return
    }
    const headers = { ...(frame.h ?? {}) }
    const setCookies = Array.isArray(frame.sc) ? frame.sc.map((line) => this.rewriteSetCookie(line, host.code)) : []
    if (setCookies.length > 0) headers['set-cookie'] = setCookies
    // HTML 响应缓冲注入访客 shim（GET/HEAD 才有 body；上限见 MAX_HTML_INJECT_BYTES）。
    if (
      (op.method === 'GET' || op.method === 'HEAD') &&
      /text\/html/i.test(String(headers['content-type'] ?? ''))
    ) {
      op.htmlInject = true
      op.parts = []
      op.htmlBytes = 0
    }
    try {
      op.res.writeHead(frame.s ?? 502, headers)
    } catch (error) {
      this.log('relay', `bad upstream response for ${host.code}: ${error?.message ?? error}`)
      host.httpOps.delete(frame.id)
      this.disposeTimer(op.timer)
      op.done = true
      try { op.res.destroy() } catch { op.res.end() }
    }
  }

  finishHttp(host, id) {
    const op = host.httpOps.get(id)
    if (!op) return
    host.httpOps.delete(id)
    this.disposeTimer(op.timer)
    op.done = true
    try {
      if (op.htmlInject) {
        const html = this.injectVisitorShim(Buffer.concat(op.parts).toString('utf8'), host.code, host.fileKey)
        op.res.end(html)
      } else {
        op.res.end()
      }
    } catch { op.res.destroy() }
  }

  routeText(host, frame) {
    if (frame.t !== 'wdata-text' || typeof frame.text !== 'string') return
    const splice = host.splices.get(frame.id)
    // The visitor socket is a WebSocket: send a ws text frame, never raw bytes.
    if (splice && !splice.closed) splice.socket.sendText(frame.text)
  }

  routeBin(host, meta, payload) {
    if (meta.t === 'hchunk') {
      const op = host.httpOps.get(meta.id)
      if (!op || op.res.writableEnded) return
      if (op.htmlInject) {
        op.htmlBytes += payload.length
        if (op.htmlBytes <= MAX_HTML_INJECT_BYTES) {
          op.parts.push(payload)
          return
        }
        // 超限放弃注入：先冲掉已缓冲内容再直写当前块，保持字节顺序。
        op.htmlInject = false
        for (const part of op.parts) op.res.write(part)
        op.parts = []
      }
      op.res.write(payload)
      return
    }
    if (meta.t === 'wdata') {
      const splice = host.splices.get(meta.id)
      // The visitor socket is a WebSocket: send a ws binary frame, never raw bytes.
      if (splice && !splice.closed) splice.socket.sendRaw(payload)
    }
  }

  acceptWsSplice(req, rawSocket, head, host) {
    if (this.closed || !host) { rawSocket.destroy(); return }
    const origin = req.headers.origin
    if (typeof origin === 'string' && origin !== '') {
      let sameOrigin = false
      try { sameOrigin = new URL(origin).host === req.headers.host } catch { sameOrigin = false }
      if (!sameOrigin) { rawSocket.destroy(); return }
    }
    if (host.splices.size >= this.maxVisitorsPerHost) {
      this.log('relay', `splice rejected on ${host.code}: visitor cap`)
      rawSocket.destroy()
      return
    }
    let target = '/api/remote.mux'
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      target = this.stripPrefix(url.pathname, host.code) + url.search
    } catch { target = '/api/remote.mux' }
    const subpath = target
    const id = `s${++this.cmdSeq}`
    const splicedHeaders = sanitizeUpgradeHeaders(req.headers, host.code)
    function sanitizeUpgradeHeaders(headers, cd) {
      const out = {}
      const drop = new Set(['host', 'origin', 'referer', 'connection', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol'])
      for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase()
        if (drop.has(lower) || lower.startsWith('sec-')) continue
        if (lower === 'cookie') {
          const prefix = `r${cd}-`
          const kept = []
          for (const segment of String(value).split(';')) {
            const pair = segment.trim()
            const at = pair.indexOf('=')
            if (at === -1) continue
            const cname = pair.slice(0, at)
            if (!cname.startsWith(prefix)) continue
            kept.push(`${cname.slice(prefix.length)}=${pair.slice(at + 1)}`)
          }
          if (kept.length > 0) out.cookie = kept.join('; ')
          continue
        }
        out[lower] = Array.isArray(value) ? value.join(', ') : String(value)
      }
      return out
    }
    this.wss.handleUpgrade(req, rawSocket, head, (raw) => {
      const socket = adaptSocket(raw)
      const splice = { raw, socket, closed: false }
      host.splices.set(id, splice)
      if (!host.socket) {
        socket.close()
        host.splices.delete(id)
        return
      }
      host.socket.send({ t: 'wopen', id, p: subpath, h: splicedHeaders })
      this.log('relay', `splice ${id} opened on ${host.code}: ${subpath}`)
      const offMessage = socket.onMessage((data) => {
        try {
          if (!host.socket) return
          // The adapter hands through Buffers for binary and strings for text.
          if (Buffer.isBuffer(data)) host.socket.sendRaw(encodeBin({ t: 'wdata', id }, data))
          else host.socket.send({ t: 'wdata-text', id, text: data })
        } catch (error) {
          this.log('relay', `访客帧处理异常（已隔离）: ${error?.message ?? error}`)
        }
      })
      const offClose = socket.onClose(() => {
        offMessage()
        offClose()
        if (splice.closed) return
        splice.closed = true
        host.splices.delete(id)
        if (host.socket) host.socket.send({ t: 'wclose', id, code: 1001, reason: '' })
        this.log('relay', `splice ${id} closed on ${host.code}`)
      })
    })
  }

  routeSpliceControl(host, frame) {
    const splice = host.splices.get(frame.id)
    if (!splice) return
    if (frame.t === 'wfail') {
      splice.closed = true
      host.splices.delete(frame.id)
      try { splice.socket.close(1014, 'upstream failed') } catch { splice.raw.destroy() }
      this.log('relay', `splice ${frame.id} failed: ${frame.error ?? 'unknown'}`)
    }
    // wok needs no relay-side action; splice is already bidirectional.
  }

  finishSplice(host, frame) {
    const splice = host.splices.get(frame.id)
    if (!splice) return
    splice.closed = true
    host.splices.delete(frame.id)
    try { splice.socket.close(frame.code ?? 1000, frame.reason ?? '') } catch { try { splice.raw.destroy() } catch { /* gone */ } }
  }

  /* ── console mode ───────────────────────────────────────────────────── */

  serveConsole(req, res, code, host) {
    let pathname = ''
    try { pathname = new URL(req.url ?? '/', 'http://localhost').pathname } catch { pathname = '/' }
    const send = (status, body, type) => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(body)
    }
    if (pathname !== `/${code}`) {
      send(404, JSON.stringify({ ok: false, error: 'not found' }) + '\n', 'application/json; charset=utf-8')
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(405, JSON.stringify({ ok: false, error: 'method not allowed' }) + '\n', 'application/json; charset=utf-8')
      return
    }
    send(200, this.consoleHtml({ code, offline: !host.socket }), 'text/html; charset=utf-8')
  }

  acceptVisitor(req, rawSocket, head, host) {
    if (this.closed || !host) { rawSocket.destroy(); return }
    // Same-origin browsers only; scripts without Origin pass (curl, CLI).
    const origin = req.headers.origin
    if (typeof origin === 'string' && origin !== '') {
      let sameOrigin = false
      try { sameOrigin = new URL(origin).host === req.headers.host } catch { sameOrigin = false }
      if (!sameOrigin) { rawSocket.destroy(); return }
    }
    if (host.visitors.size >= this.maxVisitorsPerHost) {
      this.log('relay', `visitor rejected on ${host.code}: visitor cap`)
      rawSocket.destroy()
      return
    }
    this.wss.handleUpgrade(req, rawSocket, head, (raw) => {
      const socket = adaptSocket(raw)
      const visitorId = 'v-' + randomUUID().slice(0, 8)
      host.visitors.set(visitorId, { socket, connectedAt: Date.now() })
      this.log('relay', `visitor ${visitorId} connected to ${host.code}`)
      // Engine composes the welcome payload; relay forwards it as-is.
      this.toHost(host, 'visitor.hello', visitorId, undefined, (frame) => {
        if (frame.ok) {
          socket.send({ t: 'welcome', v: PROTOCOL_VERSION, visitor: visitorId, host: frame.data.host, sessions: frame.data.sessions })
        } else {
          socket.send({ t: 'welcome', v: PROTOCOL_VERSION, visitor: visitorId, error: frame.error })
        }
      })
      let visitorIdleTimer = this.later(() => socket.close(), VISITOR_IDLE_MS)
      const refreshIdle = () => {
        this.disposeTimer(visitorIdleTimer)
        visitorIdleTimer = this.later(() => socket.close(), VISITOR_IDLE_MS)
      }
      const offMessage = socket.onMessage((data) => {
        if (typeof data !== 'string') return
        refreshIdle()
        const frame = parseFrame(data, 64 * 1024)
        if (!frame || frame.t !== 'cmd' || typeof frame.id !== 'string') return
        if (VISITOR_COMMANDS.has(frame.cmd)) {
          this.toHost(host, frame.cmd, visitorId, frame.p, (result) => {
            socket.send({ t: 'res', id: frame.id, ok: result.ok, ...(result.ok ? { data: result.data } : { error: result.error }) })
          })
        } else {
          socket.send({ t: 'res', id: frame.id, ok: false, error: 'unsupported command' })
        }
      })
      const offClose = socket.onClose(() => {
        this.disposeTimer(visitorIdleTimer)
        offMessage()
        offClose()
        host.visitors.delete(visitorId)
        if (host.socket) this.toHost(host, 'visitor.gone', visitorId, undefined, () => {})
        this.log('relay', `visitor ${visitorId} disconnected from ${host.code}`)
      })
    })
  }

  toHost(host, cmd, visitorId, p, onResult) {
    const socket = host.socket
    if (!socket) return onResult({ ok: false, error: '宿主机离线' })
    const id = `c${++this.cmdSeq}`
    host.pending.set(id, { onResult, timer: this.later(() => {
      host.pending.delete(id)
      onResult({ ok: false, error: '宿主机响应超时' })
    }, 20_000) })
    socket.send({ t: 'cmd', id, from: visitorId, cmd, ...(p === undefined ? {} : { p }) })
  }

  routeResult(host, frame) {
    const entry = host.pending.get(frame.id)
    if (!entry) return
    host.pending.delete(frame.id)
    this.disposeTimer(entry.timer)
    entry.onResult({ ok: frame.ok === true, data: frame.data, error: frame.error })
  }

  routePush(host, frame) {
    if (typeof frame.to !== 'string') return
    const visitor = host.visitors.get(frame.to)
    if (visitor) visitor.socket.send({ t: 'push', f: frame.f })
  }

  detachAll() {
    this.closed = true
    for (const dispose of this.enterDisposers) { try { dispose() } catch { /* gone */ } }
    this.enterDisposers = []
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const hostId of [...this.hosts.keys()]) this.removeHost(hostId, 'relay shutting down')
    this.wss.close()
    this.hostWss.close()
  }

  status() {
    return {
      mode: this.mode,
      hosts: [...this.hosts.values()].map((host) => ({
        hostId: host.hostId,
        code: host.code,
        name: host.name,
        dsh: host.dsh,
        online: host.socket !== undefined,
        visitors: this.mode === 'gui' ? host.splices.size : host.visitors.size,
        createdAt: host.createdAt,
      })),
    }
  }
}

export { PROTOCOL_VERSION }

/**
 * Origin-level service worker served at /dsh-remote-relay-sw.js. It reads its own
 * scriptURL query for the code and, from then on, intercepts navigations to
 * the bare origin (which belong to the relay's authenticated GUI and 401 for
 * visitors) and serves the tunnel under /<code>/ instead — the address bar
 * keeps showing the bare origin. Carriers of the relay server's own session
 * cookie (`dsh-auth-…`) pass through untouched, so the relay owner's GUI is
 * never hijacked, and `?gui` is a manual escape.
 */
export function serviceWorkerScript() {
  return `/* dsh-remote-relay visitor restore worker */
var CODE='';
try{CODE=new URL(self.location.href).searchParams.get('code')||''}catch(e){}
var CODE_RE=/^\\/([1-9]\\d{7})(\\/|$)/;
self.addEventListener('install',function(e){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',function(event){
  try{
    var req=event.request;
    if(req.method!=='GET')return;
    if(req.mode!=='navigate')return;
    var url=new URL(req.url);
    if(url.origin!==self.location.origin)return;
    if((url.search||'').indexOf('gui')!==-1)return;
    if((req.headers.get('cookie')||'').indexOf('dsh-auth-')!==-1)return;
    /* Unknown-code guard: an 8-digit path that answers 404 (no live host)
       gets the code-entry dialog instead of the bare 404 page. */
    var cm=url.pathname.match(CODE_RE);
    if(cm){
      event.respondWith((async function(){
        var probe;
        try{probe=await fetch(new Request(req.url,{method:'HEAD',cache:'no-store'}))}catch(e){return fetch(req)}
        if(probe&&probe.status===404){
          try{return await fetch('/dsh-remote-relay-enter?code='+cm[1],{cache:'no-store'})}catch(e){return fetch(req)}
        }
        return fetch(req);
      })());
      return;
    }
    if(url.pathname!=='/'&&url.pathname!=='')return;
    if(!/^[1-9]\\d{7}$/.test(CODE))return;
    event.respondWith((async function(){
      var up;
      try{up=await fetch('/'+CODE+'/',{cache:'no-store'})}catch(e){return}
      if(up.status===404){
        try{return await fetch('/dsh-remote-relay-enter?code='+CODE,{cache:'no-store'})}catch(e){return fetch(req)}
      }
      var ct=up.headers.get('content-type')||'';
      if(ct.indexOf('text/html')===-1)return up;
      var text=await up.text();
      if(text.indexOf('__DSH_REMOTE_VISITOR__')===-1)return fetch(req);
      return new Response(text,{status:up.status,statusText:up.statusText,headers:up.headers});
    })());
  }catch(e){}
});
`
}

export function serveServiceWorker(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
    'Service-Worker-Allowed': '/',
  })
  res.end(serviceWorkerScript())
}

