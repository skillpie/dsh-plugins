/**
 * dsh-remote — host-side GUI bridge (`gui` mode).
 *
 * Serves the relay's splice frames from this process's own web server over
 * loopback, so a visitor at `https://<relay>/<code>/…` uses the real DSH Web
 * GUI — sessions, tools, deliverables, the mux WebSocket — exactly as the
 * owner does locally.
 *
 * Authentication: the bridge mints one owner session cookie from the process
 * launch token (`connection.authenticatedUrl`) and attaches it to every
 * loopback request; a 401 forces one re-mint. Request headers that would
 * otherwise break the loopback trust fence (`origin`, `referer`, `sec-*`,
 * `host`, hop-by-hop) are stripped, leaving a plain owner request.
 */
import WebSocket from 'ws'
import { encodeBin, decodeBin } from './protocol.js'

const MAX_REQUEST_BODY = 64 * 1024 * 1024
const READ_TIMEOUT_MS = 30_000
const STRIP_HEADERS = new Set([
  'host', 'origin', 'referer', 'referrer', 'connection', 'keep-alive',
  'transfer-encoding', 'upgrade', 'accept-encoding', 'content-length',
  'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions',
  'sec-websocket-accept', 'sec-websocket-protocol',
])

/** ws message data (string | Buffer | Buffer[] | ArrayBuffer) → Buffer. */
function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  return Buffer.from(String(data), 'utf8')
}

/** Case-insensitive header bag → plain object without stripped names. */
function sanitizeHeaders(headers = {}) {
  const out = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (STRIP_HEADERS.has(lower) || lower.startsWith('sec-')) continue
    out[lower] = Array.isArray(value) ? value.join(', ') : String(value)
  }
  return out
}

export class GuiBridge {
  /**
   * @param services { webServer(): object|undefined, connection(): object|undefined }
   * @param log fn(kind, text)
   */
  constructor({ services, log = () => {} }) {
    this.services = services
    this.log = log
    /** channel → { channel, offMessage, offClose } */
    this.channels = new Map()
    this.cookieHeader = undefined
    this.httpHandlers = new Map()
    this.wsPipes = new Map()
    this.seq = 0
    this.closed = false
  }

  attach(channel) {
    this.detach(channel)
    const record = { channel, offMessage: undefined, offClose: undefined }
    this.channels.set(channel, record)
    record.offMessage = channel.onMessage((text) => {
      try {
        this.onFrame(text, channel)
      } catch (error) {
        this.log('bridge', `帧处理异常（已隔离）: ${error?.message ?? error}`)
      }
    })
    record.offClose = channel.onClose(() => this.detach(channel))
    this.log('bridge', 'GUI 桥已挂载')
  }

  /** Remove one transport; undefined removes all (plugin unload). */
  detach(channel) {
    const targets = channel === undefined ? [...this.channels.keys()] : [channel]
    for (const target of targets) {
      const record = this.channels.get(target)
      if (!record) continue
      this.channels.delete(target)
      record.offMessage?.()
      record.offClose?.()
    }
    if (channel === undefined) {
      for (const handler of this.httpHandlers.values()) handler.abort?.()
      this.httpHandlers.clear()
      for (const pipe of this.wsPipes.values()) {
        try { pipe.inner.close() } catch { pipe.inner.terminate() }
      }
      this.wsPipes.clear()
    }
  }

  send(frame) {
    for (const record of this.channels.values()) record.channel.send(frame)
  }

  origin() {
    const webServer = this.services.webServer?.()
    if (!webServer) return undefined
    try { return webServer.getOrigin() } catch { return undefined }
  }

  onFrame(data, channel) {
    if (this.closed) return
    if (typeof data !== 'string') {
      const decoded = decodeBin(Buffer.isBuffer(data) ? data : Buffer.from(data))
      if (!decoded) return
      const { meta, payload } = decoded
      if (meta.t === 'hchunk') this.onRequestChunk(meta.id, payload, channel)
      else if (meta.t === 'wdata') this.onWsData(meta.id, payload, channel)
      return
    }
    let frame
    try { frame = JSON.parse(data) } catch { return }
    if (!frame || typeof frame !== 'object') return
    switch (frame.t) {
      case 'hreq': this.onHttpRequest(frame, channel); return
      case 'hend': this.onRequestEnd(frame.id); return
      case 'habort': this.onRequestAbort(frame.id); return
      case 'wopen': this.onWsOpen(frame, channel); return
      case 'wclose': this.onWsClose(frame); return
      case 'wdata-text': this.onWsText(frame, channel); return
      case 'hb': return
      default: return
    }
  }

  /** Mux wire frames are JSON text: forward them as socket text frames. */
  onWsText(frame, channel) {
    if (typeof frame.id !== 'string' || typeof frame.text !== 'string') return
    const pipe = this.wsPipes.get(frame.id)
    if (!pipe) return
    if (pipe.inner.readyState === 1) {
      pipe.inner.send(frame.text)
      return
    }
    if (pipe.inner.readyState === 0) {
      pipe.backlogBytes += frame.text.length
      if (pipe.backlogBytes <= 8 * 1024 * 1024) {
        pipe.backlog.push(frame.text)
        return
      }
    }
    channel.send({ t: 'wclose', id: frame.id, code: 1011, reason: 'inner not open' })
    pipe.closed = true
    this.wsPipes.delete(frame.id)
    try { pipe.inner.terminate() } catch { /* gone */ }
  }

  onRequestAbort(id) {
    const entry = this.httpHandlers.get(id)
    if (!entry) return
    entry.markEnded()
    entry.abort?.()
    this.httpHandlers.delete(id)
  }

  async ensureSession(force = false) {
    if (!force && this.cookieHeader) return this.cookieHeader
    const connection = this.services.connection?.()
    const origin = this.origin()
    if (!connection || !origin) throw new Error('connection 服务不可用')
    const url = connection.authenticatedUrl(origin + '/')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS * 1000)
    try {
      const res = await fetch(url, { redirect: 'manual', signal: controller.signal })
      const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
      const pairs = cookies.map((line) => line.split(';')[0]).filter((pair) => pair.includes('='))
      if (pairs.length === 0) throw new Error('宿主机未签发会话 cookie')
      this.cookieHeader = pairs.join('; ')
      this.log('bridge', '已铸造访客会话 cookie')
      return this.cookieHeader
    } finally {
      clearTimeout(timer)
    }
  }

  async onHttpRequest(frame, channel) {
    const { id, m, p } = frame
    if (typeof id !== 'string' || typeof m !== 'string' || typeof p !== 'string') return
    const entry = { chunks: [], size: 0, ended: false, abort: undefined }
    // wss 路径上 hchunk/hend 是 hreq 之后的独立帧；fetch 必须等 body 到齐
    // （pipe 同步送达时侥幸掩盖过这个时序问题）。
    entry.markEnded = () => {
      entry.ended = true
      try { entry.readyResolve?.() } catch { /* noop */ }
    }
    entry.ready = new Promise((resolve) => { entry.readyResolve = resolve })
    entry.channel = channel
    this.httpHandlers.set(id, entry)
    try {
      const origin = this.origin()
      if (!origin) throw new Error('webServer 服务不可用')
      let cookie = await this.ensureSession()
      // body 就绪后再发 fetch：hend 之前 entry.chunks 可能还是空的。
      await Promise.race([
        entry.ready,
        new Promise((resolve) => setTimeout(resolve, 30_000)),
      ])
      let status
      let res
      for (let attempt = 0; attempt < 2; attempt++) {
        const headers = { ...sanitizeHeaders(frame.h), cookie }
        if (entry.size > 0) headers['content-length'] = String(entry.size)
        const controller = new AbortController()
        entry.abort = () => controller.abort()
        const timer = setTimeout(() => controller.abort(), 120_000)
        try {
          res = await fetch(origin + p, {
            method: m,
            headers,
            body: m === 'GET' || m === 'HEAD' ? undefined : Buffer.concat(entry.chunks),
            signal: controller.signal,
            duplex: 'half',
          })
        } finally {
          clearTimeout(timer)
        }
        status = res.status
        if (status !== 401) break
        // Session expired or invalid: mint a fresh one and retry once.
        cookie = await this.ensureSession(true)
      }
      const outHeaders = {}
      res.headers.forEach((value, name) => {
        const lower = name.toLowerCase()
        if (lower === 'set-cookie' || lower === 'transfer-encoding' || lower === 'connection' || lower === 'content-encoding') return
        outHeaders[lower] = value
      })
      const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
      channel.send({ t: 'hres', id, s: res.status, h: outHeaders, sc: setCookies })
      if (res.body) {
        for await (const chunk of res.body) {
          if (this.closed || !this.httpHandlers.has(id)) return
          channel.sendRaw(encodeBin({ t: 'hchunk', id }, Buffer.from(chunk)))
        }
      }
      channel.send({ t: 'hend', id })
    } catch (error) {
      channel.send({ t: 'hfail', id, error: error?.message ?? String(error) })
    } finally {
      this.httpHandlers.delete(id)
    }
  }

  onRequestChunk(id, payload) {
    const entry = this.httpHandlers.get(id)
    if (!entry || entry.ended) return
    entry.size += payload.length
    if (entry.size > MAX_REQUEST_BODY) {
      entry.markEnded()
      entry.channel?.send({ t: 'hfail', id, error: 'request body too large' })
      return
    }
    entry.chunks.push(payload)
  }

  onRequestEnd(id) {
    const entry = this.httpHandlers.get(id)
    if (entry) entry.markEnded()
  }

  async onWsOpen(frame, channel) {
    const { id, p } = frame
    if (typeof id !== 'string' || typeof p !== 'string') return
    const origin = this.origin()
    if (!origin) {
      channel.send({ t: 'wfail', id, error: 'webServer 服务不可用' })
      return
    }
    // The mux WS often races the first HTTP request (cached document), so
    // mint the owner session here too; a stale cookie re-mints once on 401.
    let cookie
    try {
      cookie = await this.ensureSession()
    } catch (error) {
      channel.send({ t: 'wfail', id, error: `会话铸造失败: ${error?.message ?? error}` })
      return
    }
    let inner
    try {
      inner = new WebSocket(origin + p, {
        headers: {
          ...sanitizeHeaders(frame.h),
          cookie,
        },
        handshakeTimeout: 10_000,
        maxPayload: 64 * 1024 * 1024,
      })
    } catch (error) {
      channel.send({ t: 'wfail', id, error: error?.message ?? String(error) })
      return
    }
    const pipe = { inner, closed: false, channel, backlog: [], backlogBytes: 0 }
    this.wsPipes.set(id, pipe)
    inner.on('open', () => {
      if (pipe.closed) return
      // The visitor may have raced ahead of the inner handshake; replay now.
      const backlog = pipe.backlog.splice(0)
      pipe.backlogBytes = 0
      for (const item of backlog) {
        if (inner.readyState !== 1) break
        try { inner.send(typeof item === 'string' ? item : Buffer.from(item)) } catch { /* peer state raced */ }
      }
      channel.send({ t: 'wok', id })
      this.log('bridge', `实时通道已拼接 ${p}`)
    })
    inner.on('message', (data, isBinary) => {
      try {
        if (pipe.closed || this.closed) return
        if (isBinary) {
          channel.sendRaw(encodeBin({ t: 'wdata', id }, toBuffer(data)))
          return
        }
        const text = typeof data === 'string' ? data : toBuffer(data).toString('utf8')
        channel.send({ t: 'wdata-text', id, text })
      } catch (error) {
        this.log('bridge', `origin 帧处理异常（已隔离）: ${error?.message ?? error}`)
      }
    })
    inner.on('close', (code, reason) => {
      if (pipe.closed) return
      pipe.closed = true
      this.wsPipes.delete(id)
      channel.send({ t: 'wclose', id, code: code ?? 1005, reason: reason?.toString?.() ?? '' })
    })
    inner.on('unexpected-response', (_req, res) => {
      if (pipe.closed) return
      if (res.statusCode === 401 && this.cookieHeader === cookie) {
        // Stale owner session: drop it so the next attempt re-mints.
        this.cookieHeader = undefined
      }
    })
    inner.on('error', (error) => {
      if (pipe.closed) return
      pipe.closed = true
      this.wsPipes.delete(id)
      channel.send({ t: 'wfail', id, error: error?.message ?? String(error) })
    })
  }

  onWsData(id, payload, channel) {
    const pipe = this.wsPipes.get(id)
    if (!pipe) return
    if (pipe.inner.readyState === 1) {
      pipe.inner.send(payload)
      return
    }
    if (pipe.inner.readyState === 0) {
      // Still handshaking with the loopback origin: hold frames in order.
      pipe.backlogBytes += payload.length
      if (pipe.backlogBytes <= 8 * 1024 * 1024) {
        pipe.backlog.push(payload)
        return
      }
    }
    channel.send({ t: 'wclose', id, code: 1011, reason: 'inner not open' })
    pipe.closed = true
    this.wsPipes.delete(id)
    try { pipe.inner.terminate() } catch { /* gone */ }
  }

  onWsClose(frame) {
    const pipe = this.wsPipes.get(frame.id)
    if (!pipe) return
    pipe.closed = true
    this.wsPipes.delete(frame.id)
    try { pipe.inner.close(frame.code ?? 1000, frame.reason ?? '') } catch { pipe.inner.terminate() }
  }

}
