/**
 * dsh-remote — Cordis entry (both roles in one activation).
 *
 * Host role (default on): dials the configured relay origin (e.g.
 * wss://dsh.skillpie.cn) over one outbound WebSocket and registers this
 * machine's 8-digit code. Visitors opening `https://<relay>/<code>/` use
 * this machine's real DSH Web GUI through the tunnel (`mode: 'gui'`,
 * default) or a lightweight read/control console (`mode: 'console'`).
 * With `direct: true` the same surface also mounts locally at `/<code>`
 * (LAN / loopback use and end-to-end testing without a relay).
 *
 * Relay role (`relay.enabled`, for a server-side profile such as
 * dsh.skillpie.cn): mounts `/dsh-remote/host` for host registrations and
 * serves `/<code>/` for registered hosts. The registry keeps token hashes
 * only; GUI traffic rides spliced frames the relay never interprets.
 *
 * Identity (code / hostId / token) persists as a credential record
 * `dsh-remote/identity` (GrantRecord payload); an explicit `code` in the
 * row config pins it instead.
 *
 * Owner panel: same-origin JSON API at /dsh-remote/api behind the web GUI's
 * own session auth (status / regenerate / toggles), consumed by the client
 * half's sidebar panel. Host roles only — a relay-only server row mounts no
 * owner API.
 */
import os from 'node:os'
import { HOST_UPGRADE_PATH, OWNER_API_PATH, PROTOCOL_VERSION, generateCode, generateId, isValidCode } from './protocol.js'
import { HostEngine } from './engine.js'
import { GuiBridge } from './bridge.js'
import { RelayLink } from './remote.js'
import { RelayCore } from './relay-core.js'
import { consoleHtml } from './console.js'
import { createPipePair } from './pipe.js'

const DEFAULT_RELAY_URL = 'wss://dsh.skillpie.cn'
const CREDENTIAL_KEY = 'dsh-remote/identity'
const MAX_BODY = 32 * 1024

/* ── config ──────────────────────────────────────────────────────────── */

/** One issue in the Standard Schema config vocabulary. */
const issue = (message, ...path) => ({ message, path: path.length ? path : undefined })

function bool(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  return null
}

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-remote',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const issues = []
      const value = {}
      const bools = [
        ['enabled', true],
        ['allowControl', true],
        ['direct', true],
      ]
      for (const [key, fallback] of bools) {
        const parsed = bool(input[key], fallback)
        if (parsed === null) issues.push(issue('expected a boolean', key))
        else value[key] = parsed
      }
      if (input.mode !== undefined) {
        if (input.mode !== 'gui' && input.mode !== 'console') {
          issues.push(issue("expected 'gui' or 'console'", 'mode'))
        } else value.mode = input.mode
      }
      if (input.relayUrl !== undefined) {
        if (typeof input.relayUrl !== 'string' || !input.relayUrl.trim()) {
          issues.push(issue('expected a ws(s):// or http(s):// origin', 'relayUrl'))
        } else {
          try {
            const url = new URL(input.relayUrl.trim())
            if (!['ws:', 'wss:', 'http:', 'https:'].includes(url.protocol) || (url.pathname && url.pathname !== '/')) {
              issues.push(issue('expected a ws(s):// or http(s):// origin', 'relayUrl'))
            } else {
              value.relayUrl = url.origin
            }
          } catch {
            issues.push(issue('expected a ws(s):// or http(s):// origin', 'relayUrl'))
          }
        }
      }
      for (const key of ['name', 'hostId', 'token']) {
        const raw = input[key]
        if (raw === undefined) continue
        if (typeof raw !== 'string' || !raw.trim()) {
          issues.push(issue('expected a non-empty string', key))
          continue
        }
        value[key] = raw.trim()
      }
      if (input.code !== undefined) {
        if (!isValidCode(input.code)) issues.push(issue('expected an 8-digit code (no leading zero)', 'code'))
        else value.code = input.code
      }
      if (input.relay !== undefined) {
        if (typeof input.relay !== 'object' || input.relay === null || Array.isArray(input.relay)) {
          issues.push(issue('expected an object', 'relay'))
        } else {
          const relay = {}
          const relayEnabled = bool(input.relay.enabled, false)
          if (relayEnabled === null) issues.push(issue('expected a boolean', 'relay', 'enabled'))
          else relay.enabled = relayEnabled
          if (input.relay.mode !== undefined) {
            if (input.relay.mode !== 'gui' && input.relay.mode !== 'console') {
              issues.push(issue("expected 'gui' or 'console'", 'relay', 'mode'))
            } else relay.mode = input.relay.mode
          }
          if (input.relay.maxVisitorsPerHost !== undefined) {
            const n = input.relay.maxVisitorsPerHost
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 64) {
              issues.push(issue('expected an integer between 1 and 64', 'relay', 'maxVisitorsPerHost'))
            } else relay.maxVisitorsPerHost = n
          }
          value.relay = relay
        }
      }
      return issues.length ? { issues } : { value }
    },
  },
}

/* ── apply ───────────────────────────────────────────────────────────── */

export default {
  name: 'dsh-remote',
  Config,
  inject: [],
  apply(ctx, rawConfig = null) {
    const cfg = rawConfig ?? {}
    const enabled = cfg.enabled ?? true
    const allowControl = cfg.allowControl ?? true
    const direct = cfg.direct ?? true
    const mode = cfg.mode === 'console' ? 'console' : 'gui'
    const relayUrl = cfg.relayUrl ?? DEFAULT_RELAY_URL
    const relayFaceEnabled = cfg.relay?.enabled === true
    const relayMode = cfg.relay?.mode === 'console' ? 'console' : 'gui'
    const maxVisitorsPerHost = cfg.relay?.maxVisitorsPerHost ?? 8

    const logRing = []
    const logLine = (kind, text) => {
      logRing.push({ time: Date.now(), kind, text })
      if (logRing.length > 200) logRing.shift()
    }

    // Provisional identity; boot() may replace it with the stored record
    // before any route or connection mounts.
    const identity = {
      code: isValidCode(cfg.code) ? cfg.code : generateCode(),
      hostId: typeof cfg.hostId === 'string' && cfg.hostId ? cfg.hostId : generateId(),
      token: typeof cfg.token === 'string' ? cfg.token : '',
      name: cfg.name ?? os.hostname(),
      dsh: `node ${process.version}`,
    }

    // Everything boot() builds registers its disposer here; the effect is
    // registered synchronously so teardown is guaranteed even when boot has
    // not finished.
    const state = { peer: undefined, link: undefined, directCore: undefined, relayCore: undefined }
    const disposers = []
    ctx.effect(() => () => {
      state.link?.stop()
      if (mode === 'gui') state.peer?.detach?.()
      else state.peer?.close?.()
      for (const dispose of disposers.splice(0)) {
        try { dispose() } catch { /* best-effort teardown */ }
      }
      logLine('boot', 'dsh-remote 已卸载')
    }, 'dsh-remote: lifetime')

    // Services arrive through optional injection; boot() starts the parts
    // that need them as they appear.
    const services = { sessionController: undefined, webServer: undefined, webServerOrigin: undefined }
    let webServerWaiter = undefined
    const whenWebServer = () => services.webServer
      ? Promise.resolve()
      : new Promise((resolve) => { webServerWaiter = resolve })

    ctx.inject(['sessionController'], (child) => {
      services.sessionController = child.sessionController
    })
    ctx.inject(['webServer'], (child) => {
      services.webServer = child.webServer
      try { services.webServerOrigin = child.webServer.getOrigin() } catch { services.webServerOrigin = undefined }
      if (webServerWaiter) { const resolve = webServerWaiter; webServerWaiter = undefined; resolve() }
    })

    void boot().catch((error) => {
      logLine('boot', `启动失败: ${error?.message ?? error}`)
    })

    async function boot() {
      // 1. Adopt the stored identity unless the row config pins one.
      const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
      let stored = undefined
      if (credentials) {
        try {
          const record = await credentials.readRecord(CREDENTIAL_KEY)
          if (record?.kind === 'grant' && record.payload && typeof record.payload === 'object') {
            stored = record.payload
          }
        } catch (error) {
          logLine('identity', `凭据读取失败: ${error?.message ?? error}`)
        }
        if (stored && !cfg.code) {
          if (isValidCode(stored.code)) identity.code = stored.code
          if (typeof stored.hostId === 'string' && stored.hostId) identity.hostId = stored.hostId
          if (typeof stored.token === 'string') identity.token = stored.token
        }
        if (!cfg.code || !cfg.hostId) {
          // Persist the (possibly fresh) identity; no restart involved.
          try {
            await saveIdentity(credentials, { code: identity.code, hostId: identity.hostId, token: identity.token })
          } catch (error) {
            logLine('identity', `身份持久化失败（重启后会再次生成）: ${error?.message ?? error}`)
          }
        }
      } else {
        logLine('identity', '凭据服务不可用，身份仅本次会话有效')
      }

      // 2. The web surface carries everything below.
      await whenWebServer()
      if (!services.webServer) return
      const webServer = services.webServer

      // 3. Build the visitor-facing peer: the GUI bridge (gui mode) or the
      //    lightweight command engine (console mode).
      let peer
      if (mode === 'gui') {
        peer = new GuiBridge({
          services: {
            webServer: () => services.webServer,
            connection: () => (typeof ctx.get === 'function' ? ctx.get('connection') : undefined),
          },
          log: logLine,
        })
      } else {
        const engine = new HostEngine({
          services: { sessionController: () => services.sessionController },
          host: { get name() { return identity.name }, get dsh() { return identity.dsh }, get code() { return identity.code } },
          log: logLine,
        })
        engine.allowControl = allowControl
        disposers.push(engine.observeSessionEvents((name, handler) => ctx.on(name, handler)))
        peer = engine
      }
      state.peer = peer

      // 4. Outbound relay link.
      if (enabled) {
        const link = new RelayLink({
          relayUrl,
          identity,
          peer,
          log: logLine,
          onToken: (token) => {
            identity.token = token
            const creds = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
            if (creds) saveIdentity(creds, { token }).catch(() => {})
          },
        })
        state.link = link
        link.start()
        logLine('boot', `dsh-remote 已加载（远程码 ${identity.code}，模式 ${mode}）`)
      } else {
        logLine('boot', `dsh-remote 已加载（远程码 ${identity.code}，远程访问已关闭）`)
      }

      // 5. Owner panel API (same-origin, behind the GUI session auth). Host
      //    roles only — a relay-only server row mounts no owner API.
      if (enabled || direct) {
        disposers.push(webServer.register({
          kind: 'exact',
          path: OWNER_API_PATH,
          handler: (req, res) => { void ownerApi(req, res) },
        }))
        logLine('owner-api', `属主 API 已挂载（${OWNER_API_PATH}）`)
      }

      // 6. Direct mode: the same surface on the local web server.
      if (direct) {
        const [hostEnd, relayEnd] = createPipePair()
        const directCore = new RelayCore({
          webServer,
          consoleHtml,
          log: logLine,
          maxVisitorsPerHost,
          mode,
        })
        directCore.acceptHostSocket(relayEnd)
        // The pipe replaces RelayLink's transport, so it speaks the same
        // registration handshake before the peer attaches.
        hostEnd.send({
          t: 'hello',
          v: PROTOCOL_VERSION,
          hostId: identity.hostId,
          code: identity.code,
          token: identity.token ?? '',
          name: identity.name,
          dsh: identity.dsh,
        })
        peer.attach(hostEnd)
        state.directCore = directCore
        disposers.push(() => {
          directCore.detachAll()
          hostEnd.close()
        })
        logLine('direct', `本机直连路由已挂载（/${identity.code}/，模式 ${mode}）`)
      }

      // 7. Relay face (server deployments only).
      if (relayFaceEnabled) {
        const relayCore = new RelayCore({
          webServer,
          consoleHtml,
          log: logLine,
          maxVisitorsPerHost,
          mode: relayMode,
        })
        state.relayCore = relayCore
        disposers.push(webServer.registerUpgrade({
          path: HOST_UPGRADE_PATH,
          handler: (req, socket, head) => relayCore.acceptHostUpgrade(req, socket, head),
        }))
        disposers.push(() => relayCore.detachAll())
        logLine('relay-face', `中转面已挂载（${HOST_UPGRADE_PATH}，模式 ${relayMode}）`)
      }
    }

    async function ownerApi(req, res) {
      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(payload))
      }
      const origin = req.headers?.origin
      if (typeof origin === 'string' && origin !== '') {
        let sameOrigin = false
        try { sameOrigin = new URL(origin).host === req.headers.host } catch { sameOrigin = false }
        if (!sameOrigin) return send(403, { ok: false, error: 'cross-origin request refused' })
      }
      let body = {}
      if (req.method === 'POST') {
        body = await readBody(req).catch(() => null)
        if (body === null) return send(200, { ok: false, error: 'invalid JSON body' })
      } else if (req.method !== 'GET') {
        return send(200, { ok: true, service: 'dsh-remote', protocol: PROTOCOL_VERSION })
      }
      try {
        send(200, await handleOwnerAction(body))
      } catch (error) {
        send(200, { ok: false, error: error?.message ?? String(error) })
      }
    }

    async function handleOwnerAction(body) {
      const action = typeof body?.action === 'string' ? body.action : 'status'
      switch (action) {
        case 'status':
          return { ok: true, status: statusSnapshot() }
        case 'regenerate': {
          const code = generateCode()
          identity.code = code
          identity.token = ''
          const creds = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
          if (creds) await saveIdentity(creds, { code, hostId: identity.hostId, token: '' }).catch(() => {})
          logLine('owner', `属主重新生成远程码 → ${code}`)
          return { ok: true, code }
        }
        case 'set-enabled': {
          const next = body.value === true
          if (next && !state.link) {
            const link = new RelayLink({
              relayUrl,
              identity,
              peer: state.peer,
              log: logLine,
              onToken: (token) => {
                identity.token = token
                const creds = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
                if (creds) saveIdentity(creds, { token }).catch(() => {})
              },
            })
            state.link = link
            link.start()
          } else if (!next && state.link) {
            state.link.stop()
            state.link = undefined
          }
          logLine('owner', `属主${next ? '开启' : '关闭'}远程控制`)
          return { ok: true, enabled: next }
        }
        case 'set-control': {
          const next = body.value === true
          if (state.peer?.allowControl !== undefined) {
            state.peer.allowControl = next
            broadcastHostUpdate()
          }
          logLine('owner', `属主${next ? '允许' : '禁止'}访客控制会话`)
          return { ok: true, allowControl: next }
        }
        default:
          throw new Error(`unknown action: ${action}`)
      }
    }

    function broadcastHostUpdate() {
      const peer = state.peer
      if (!peer?.visitors) return
      const frame = { t: 'host-updated', host: { name: identity.name, dsh: identity.dsh, allowControl: peer.allowControl } }
      for (const visitorId of peer.visitors.keys()) peer.pushTo(visitorId, frame)
    }

    function statusSnapshot() {
      const link = state.link
      return {
        protocol: PROTOCOL_VERSION,
        mode,
        enabled: Boolean(link),
        allowControl: state.peer?.allowControl ?? allowControl,
        direct,
        relayUrl,
        name: identity.name,
        hostId: identity.hostId,
        code: identity.code,
        relay: link ? link.status() : { connected: false, relayUrl },
        directUrl: direct && services.webServerOrigin ? `${services.webServerOrigin}/${identity.code}/` : undefined,
        relayUrlPublic: relayUrl.replace(/^ws/, 'http') + '/' + identity.code + '/',
        visitors: state.peer?.status ? state.peer.status().visitors : [],
        relayFace: relayFaceEnabled ? (state.relayCore?.status() ?? { hosts: [] }) : undefined,
        log: logRing.slice(-80),
      }
    }
  },
}

/* ── helpers ─────────────────────────────────────────────────────────── */

async function saveIdentity(credentials, patch) {
  await credentials.modifyRecord(CREDENTIAL_KEY, (current) => {
    const payload = current?.kind === 'grant' && current.payload && typeof current.payload === 'object'
      ? { ...current.payload }
      : {}
    return { kind: 'grant', payload: { ...payload, ...patch } }
  })
}

function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        req.destroy()
        rejectPromise(new Error('request body too large'))
      }
    })
    req.on('end', () => {
      if (!data.trim()) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(data))
      } catch {
        rejectPromise(new Error('invalid JSON body'))
      }
    })
    req.on('error', rejectPromise)
  })
}
