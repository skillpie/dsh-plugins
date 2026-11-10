/**
 * dsh-remote — outbound control link (host role).
 *
 * Dials `relayUrl + HOST_UPGRADE_PATH` over one WebSocket, registers the
 * 8-digit code and identity, and feeds every control frame to the shared
 * HostEngine. Reconnects with jittered backoff; mints/re-persists the token
 * whenever the relay hands one back (first registration, or after the relay
 * lost its registry).
 */
import WebSocket from 'ws'
import { HOST_UPGRADE_PATH, PROTOCOL_VERSION } from './protocol.js'
import { adaptSocket } from './ws-adapter.js'

const BACKOFF_INITIAL_MS = 1_000
const BACKOFF_MAX_MS = 30_000
const HEARTBEAT_MS = 15_000
const IDLE_TIMEOUT_MS = 45_000

export class RelayLink {
  /**
   * @param identity { hostId, code, token, name, dsh } — read live via getters
   * @param onToken (token) — persist a relay-minted token
   * @param peer { attach(channel), detach(channel) } — the GUI bridge or
   *        command engine; attached on a healthy link
   */
  constructor({ relayUrl, identity, onToken, peer, log = () => {} }) {
    this.relayUrl = relayUrl
    this.identity = identity
    this.onToken = onToken
    this.peer = peer
    this.log = log
    this.raw = undefined
    this.backoffMs = BACKOFF_INITIAL_MS
    this.retryTimer = undefined
    this.hbTimer = undefined
    this.idleTimer = undefined
    this.stopped = true
    this.connectedSince = undefined
    this.lastError = undefined
  }

  get connected() {
    return this.raw !== undefined && this.connectedSince !== undefined
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    this.clearTimers()
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = undefined }
    this.detachPeer()
    if (this.raw) {
      try { this.raw.close(1000) } catch { /* already gone */ }
      this.raw = undefined
    }
    this.connectedSince = undefined
  }

  clearTimers() {
    if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = undefined }
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = undefined }
  }

  detachPeer() {
    if (this.peer && this.adapter) this.peer.detach(this.adapter)
    this.adapter = undefined
  }

  connect() {
    if (this.stopped) return
    const url = new URL(this.relayUrl)
    url.protocol = url.protocol === 'http:' ? 'ws:' : url.protocol === 'https:' ? 'wss:' : url.protocol
    url.pathname = HOST_UPGRADE_PATH
    let raw
    try {
      raw = new WebSocket(url, { handshakeTimeout: 10_000 })
    } catch (error) {
      this.lastError = error?.message ?? String(error)
      this.scheduleRetry()
      return
    }
    this.raw = raw
    raw.on('open', () => {
      raw.send(JSON.stringify({
        t: 'hello',
        v: PROTOCOL_VERSION,
        hostId: this.identity.hostId,
        code: this.identity.code,
        token: this.identity.token ?? '',
        name: this.identity.name,
        dsh: this.identity.dsh,
      }))
    })
    raw.on('message', (data) => this.onFrame(String(data)))
    raw.on('close', () => {
      const wasConnected = this.connected
      this.clearTimers()
      this.detachPeer()
      this.raw = undefined
      this.connectedSince = undefined
      if (this.stopped) return
      if (wasConnected) this.log('relay', '中转连接断开，准备重连')
      this.scheduleRetry()
    })
    raw.on('error', (error) => {
      this.lastError = error?.message ?? String(error)
    })
  }

  scheduleRetry() {
    if (this.stopped || this.retryTimer) return
    const jitter = Math.floor(Math.random() * this.backoffMs * 0.5)
    const delay = this.backoffMs + jitter
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      this.connect()
    }, delay)
    this.log('relay', `将在 ${Math.round(delay / 100) / 10}s 后重连中转`)
  }

  onFrame(text) {
    let frame
    try { frame = JSON.parse(text) } catch { return }
    if (!frame || typeof frame !== 'object') return
    if (frame.t === 'hello') {
      if (frame.ok !== true) {
        this.lastError = frame.error ?? 'relay rejected registration'
        this.log('relay', `中转拒绝注册: ${this.lastError}`)
        // Registration refused (e.g. code taken): back off like a network failure.
        try { this.raw?.close() } catch { /* noop */ }
        return
      }
      this.backoffMs = BACKOFF_INITIAL_MS
      this.connectedSince = Date.now()
      this.lastError = undefined
      if (typeof frame.token === 'string' && frame.token !== this.identity.token) {
        this.identity.token = frame.token
        try { this.onToken?.(frame.token) } catch (error) {
          this.log('relay', `token 持久化失败: ${error?.message ?? error}`)
        }
      }
      this.armIdle()
      this.adapter = adaptSocket(this.raw)
      this.peer.attach(this.adapter)
      this.hbTimer = setInterval(() => {
        if (this.raw?.readyState === 1) this.raw.send(JSON.stringify({ t: 'hb' }))
      }, HEARTBEAT_MS)
      this.log('relay', `已连接中转，远程码 ${this.identity.code} 生效`)
      return
    }
    if (frame.t === 'hb') {
      this.armIdle()
      return
    }
    // res/push frames belong to the engine's channel adapter; its own
    // onMessage handler consumed them already (adapter shares this socket).
  }

  armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.log('relay', '中转心跳超时，主动断开')
      try { this.raw?.close() } catch { /* noop */ }
    }, IDLE_TIMEOUT_MS)
  }

  status() {
    return {
      relayUrl: this.relayUrl,
      connected: this.connected,
      connectedSince: this.connectedSince,
      lastError: this.lastError,
    }
  }
}
