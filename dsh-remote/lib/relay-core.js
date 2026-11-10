/**
 * dsh-remote — relay core: code registry, per-code routes, bridging.
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
<html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><script>try{localStorage.setItem('dsh-remote-last-code','${code}')}catch(e){}</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>远程控制 ${code}</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#101114;color:#e8eaed;font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}.big{font-size:17px}.hint{font-size:12.5px;color:#9aa0a6}code{font-family:ui-monospace,Menlo,monospace;color:#6b84ff}</style></head>
<body><div class="big">宿主机暂时离线</div><div class="hint">远程码 <code>${code}</code> 有效，但宿主机尚未连上中转站。页面会自动重试。</div></body></html>`
  }

  /**
   * Visitor-side URL shim. The proxied GUI and plugin panels call absolute
   * same-origin paths (`/api/...`, `/dsh-dba/...`), which only resolve on the
   * host's own origin. Under `/<code>/` they must ride the prefix so they land
   * on the relay's proxy route and splice mux instead of the SPA fallback.
   * Injected into proxied HTML right after `<head>`; runs before app scripts.
   */
  visitorShimScript(code) {
    const prefix = JSON.stringify(`/${code}`)
    const map = JSON.stringify(['/api/', '/dsh-dba/', '/dsh-market/'])
    return `<script>(function(){
window.__DSH_REMOTE_VISITOR__=true;
try{localStorage.setItem('dsh-remote-last-code',${JSON.stringify(code)})}catch(e){}
var P=${prefix};var M=${map};
function pick(p){for(var i=0;i<M.length;i++){var m=M[i];if(p===m||p.slice(0,m.length)===m)return true}return false}
function rebase(u){try{var x=new URL(u,location.href);if((x.protocol==='http:'||x.protocol==='https:'||x.protocol==='ws:'||x.protocol==='wss:')&&x.host===location.host&&pick(x.pathname)){return P+x.pathname+x.search+x.hash}}catch(e){}return u}
var of=window.fetch;
window.fetch=function(input,init){
  try{
    if(typeof input==='string')return of(rebase(input),init);
    if(input&&typeof input.url==='string'){var nu=rebase(input.url);if(nu!==input.url)return of(new Request(nu,input),init)}
  }catch(e){}
  return of(input,init);
};
var OW=window.WebSocket;
window.WebSocket=class extends OW{constructor(u,p){u=rebase(typeof u==='string'?u:String(u));super(u,p)}};
})(/* dsh-remote visitor shim */);</script>`
  }

  injectVisitorShim(html, code) {
    if (typeof html !== 'string' || html.length === 0) return html
    const shim = this.visitorShimScript(code)
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + shim)
    return shim + html
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
        const html = this.injectVisitorShim(Buffer.concat(op.parts).toString('utf8'), host.code)
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
