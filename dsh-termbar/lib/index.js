/**
 * dsh-termbar — Cordis 入口（宿主半）。
 *
 * Web GUI 右上角工具区的终端开关按钮 + 底部终端面板。宿主半负责：
 *   - 终端引擎（lib/engine.js）：subprocess.spawnTerminal 分配 PTY；
 *   - 同源控制 API `/dsh-termbar/api`（GET 状态；POST create/close/rename）；
 *   - I/O 通道 `/dsh-termbar/ws`（文本 JSON 控制帧 + 二进制输出帧）；
 *   - 静态资源 `/dsh-termbar/vendor/*`（xterm.js / fit addon，本地 vendored）。
 *
 * 客户端半（lib/client.js）经 `window.__ModuleLoader__` 加载：注册
 * conversation.session.header.utilities 的切换按钮与 shell.overlay 的
 * 底部面板。
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { TermbarEngine } from './engine.js'

const API_PATH = '/dsh-termbar/api'
const WS_PATH = '/dsh-termbar/ws'
const STREAM_PATH = '/dsh-termbar/stream'

const VENDOR_FILES = {
  '/dsh-termbar/vendor/xterm.js': { file: './vendor/xterm.js', type: 'text/javascript; charset=utf-8' },
  '/dsh-termbar/vendor/addon-fit.js': { file: './vendor/addon-fit.js', type: 'text/javascript; charset=utf-8' },
  '/dsh-termbar/vendor/xterm.css': { file: './vendor/xterm.css', type: 'text/css; charset=utf-8' },
}

/* ── config ──────────────────────────────────────────────────────────── */

/** Standard Schema 校验词汇里的单条 issue。 */
const issue = (message, ...path) => ({ message, path: path.length ? path : undefined })

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-termbar',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const issues = []
      const value = {}
      if (input.shell !== undefined) {
        if (typeof input.shell !== 'string' || !input.shell.trim()) issues.push(issue('expected a non-empty string', 'shell'))
        else value.shell = input.shell.trim()
      }
      if (input.cwd !== undefined) {
        if (typeof input.cwd !== 'string' || !input.cwd.trim()) issues.push(issue('expected a non-empty string', 'cwd'))
        else value.cwd = input.cwd.trim()
      }
      if (input.scrollbackKB !== undefined) {
        const n = input.scrollbackKB
        if (!Number.isInteger(n) || n < 64 || n > 16384) {
          issues.push(issue('expected an integer between 64 and 16384', 'scrollbackKB'))
        } else value.scrollbackKB = n
      }
      return issues.length ? { issues } : { value }
    },
  },
}

/* ── apply ───────────────────────────────────────────────────────────── */

export default {
  name: 'dsh-termbar',
  Config,
  inject: [],
  apply(ctx, rawConfig = null) {
    const cfg = rawConfig ?? {}

    ctx.inject(['webServer', 'subprocess'], (child) => {
      const webServer = child.get('webServer')
      const subprocess = child.get('subprocess')
      if (!webServer || typeof webServer.register !== 'function') return
      if (!subprocess || typeof subprocess.spawnTerminal !== 'function') return

      const logRing = []
      const logLine = (kind, text) => {
        logRing.push({ time: Date.now(), kind, text })
        if (logRing.length > 200) logRing.shift()
      }
      const engine = new TermbarEngine({ subprocess, config: cfg, log: logLine })

      const disposers = []
      ctx.effect(() => () => {
        for (const dispose of disposers.splice(0)) {
          try { dispose() } catch { /* best-effort teardown */ }
        }
        void engine.dispose()
        logLine('boot', 'dsh-termbar 已卸载，全部终端已终结')
      })

      /* 静态资源：启动时一次性读入内存，请求零 IO。文件缺失时路由兜底 404，
       * 客户端半会显示降级提示。 */
      const vendorCache = new Map()
      for (const [routePath, entry] of Object.entries(VENDOR_FILES)) {
        try {
          const filePath = fileURLToPath(new URL(`./${entry.file}`, import.meta.url))
          vendorCache.set(routePath, { body: fs.readFileSync(filePath), type: entry.type })
        } catch (error) {
          logLine('vendor', `静态资源缺失 ${entry.file}：${error?.message ?? error}`)
        }
      }

      /* 同源校验：Origin 存在时必须与 Host 一致（GUI 自身发起的同源请求
       * 不带跨源 Origin）。localhost 与 127.0.0.1 视为等价（桌面端两种地址
       * 都可能出现在地址栏，端口相同即同实例）。 */
      const normHost = (host) => typeof host === 'string'
        ? host.replace(/^localhost(?=:)/i, '127.0.0.1').toLowerCase()
        : ''
      const sameOrigin = (req) => {
        const origin = req.headers?.origin
        if (typeof origin !== 'string' || origin === '') return true
        try {
          const originHost = normHost(new URL(origin).host)
          return originHost !== '' && originHost === normHost(req.headers.host)
        } catch { return false }
      }

      const sendJson = (res, status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(payload))
      }

      const readBody = async (req) => {
        const chunks = []
        let total = 0
        for await (const chunk of req) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          total += buf.length
          if (total > 64 * 1024) throw new Error('body too large')
          chunks.push(buf)
        }
        if (chunks.length === 0) return {}
        return JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }

      // 控制面动作：create / close / rename。
      async function handleAction(body) {
        const action = typeof body?.action === 'string' ? body.action : ''
        switch (action) {
          case 'create': {
            const session = await engine.create({ cols: body.cols, rows: body.rows, cwd: body.cwd, project: body.project })
            return { ok: true, session }
          }
          case 'close': {
            const done = await engine.close(String(body.id ?? ''))
            return done ? { ok: true } : { ok: false, error: 'unknown terminal id' }
          }
          case 'frame': {
            const client = typeof body?.token === 'string' ? streamClients.get(body.token) : undefined
            if (!client) return { ok: false, error: 'unknown stream token' }
            const frames = Array.isArray(body?.frames) ? body.frames : [body?.frame]
            for (const f of frames) if (f && typeof f === 'object') dispatchFrame(client, f)
            return { ok: true }
          }
          case 'rename': {
            const session = engine.sessions.get(String(body.id ?? ''))
            if (!session) return { ok: false, error: 'unknown terminal id' }
            if (typeof body.title === 'string' && body.title.trim()) {
              session.title = body.title.trim().slice(0, 64)
              engine.broadcast({ t: 'renamed', id: session.id, title: session.title })
            }
            return { ok: true, session: engine.snapshot(session) }
          }
          default:
            return { ok: false, error: 'unknown action' }
        }
      }

      // 控制面 API 路由（prefix：/dsh-termbar/api 及其子路径）。
      disposers.push(webServer.register({
        kind: 'prefix',
        path: API_PATH,
        handler: (req, res) => {
          try {
            if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
            if (req.method === 'GET') {
              const url = new URL(req.url ?? '/', 'http://local')
              if (url.searchParams.get('debug') !== null) {
                // 排障用：最近 60 条环形日志（upgrade 拒因、PTY 生命周期等）。
                sendJson(res, 200, { ok: true, origin: req.headers.host ?? '', sessions: engine.listSessions(), log: logRing.slice(-60) })
              } else {
                sendJson(res, 200, { ok: true, origin: req.headers.host ?? '', sessions: engine.listSessions() })
              }
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            void readBody(req)
              .then((body) => handleAction(body))
              .then(
                (payload) => sendJson(res, 200, payload),
                (error) => sendJson(res, 200, { ok: false, error: error?.message ?? String(error) }),
              )
          } catch (error) {
            sendJson(res, 200, { ok: false, error: error?.message ?? String(error) })
          }
        },
      }))

      // 流式兜底路由：GET 长连接 NDJSON 输出（访客页 WS 不可用时）。
      disposers.push(webServer.register({
        kind: 'prefix',
        path: STREAM_PATH,
        handler: (req, res) => {
          try {
            if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
            const url = new URL(req.url ?? '/', 'http://local')
            const token = url.searchParams.get('token') ?? ''
            if (!token) return sendJson(res, 400, { ok: false, error: 'token required' })
            const prev = streamClients.get(token)
            if (prev) {
              try { engine.removeClient(prev) } catch { /* gone */ }
              try { prev.end() } catch { /* gone */ }
            }
            let open = true
            const client = {
              readyState: 1,
              attachedId: null,
              extraSubs: new Set(),
              send(payload) {
                if (!open) return
                const text = typeof payload === 'string' ? payload : payload.toString('utf8')
                res.write(text + '\n')
              },
              end() {
                open = false
                try { res.end() } catch { /* gone */ }
              },
            }
            streamClients.set(token, client)
            logLine('stream', `流式通道开启 token=${token.slice(0, 8)}…`)
            res.writeHead(200, {
              'Content-Type': 'application/x-ndjson; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Accel-Buffering': 'no',
              'Connection': 'keep-alive',
            })
            engine.addClient(client)
            const keepalive = setInterval(() => {
              try { if (open) res.write('\n') } catch { /* gone */ }
            }, 15000)
            req.on('close', () => {
              clearInterval(keepalive)
              if (streamClients.get(token) === client) streamClients.delete(token)
              try { engine.removeClient(client) } catch { /* gone */ }
              open = false
            })
          } catch (error) {
            sendJson(res, 200, { ok: false, error: error?.message ?? String(error) })
          }
        },
      }))

      // 静态资源路由（vendored xterm 资产）。
      for (const [routePath] of Object.entries(VENDOR_FILES)) {
        disposers.push(webServer.register({
          kind: 'exact',
          path: routePath,
          handler: (req, res) => {
            try {
              const cached = vendorCache.get(routePath)
              if (!cached) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
                res.end('termbar vendor asset missing')
                return
              }
              res.writeHead(200, {
                'Content-Type': cached.type,
                'Cache-Control': 'no-cache',
                'Content-Length': cached.body.length,
              })
              res.end(req.method === 'HEAD' ? undefined : cached.body)
            } catch {
              try { res.destroy() } catch { /* client gone */ }
            }
          },
        }))
      }

      // I/O 升级通道。
      const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })


      disposers.push(webServer.registerUpgrade({
        path: WS_PATH,
        handler: (req, socket, head) => {
          try {
            if (!sameOrigin(req)) {
              logLine('upgrade', `拒绝跨源升级 origin=${req.headers.origin ?? '(none)'} host=${req.headers.host ?? '(none)'}`)
              socket.destroy()
              return
            }
            logLine('upgrade', `接受升级 host=${req.headers.host ?? '(none)'} origin=${req.headers.origin ?? '(none)'}`)
            wss.handleUpgrade(req, socket, head, (ws) => {
              try { setupSocket(ws) } catch (error) {
                logLine('ws', `socket 初始化失败：${error?.message ?? error}`)
                try { ws.close(1011, 'init failed') } catch { /* gone */ }
              }
            })
          } catch {
            try { socket.destroy() } catch { /* gone */ }
          }
        },
      }))

      // 帧分发：WS 消息与 HTTP 流兜底（action:frame）共用。
      function dispatchFrame(client, frame) {
        if (!frame || typeof frame !== 'object') return
        switch (frame.t) {
          case 'attach':
            engine.attach(client, String(frame.id ?? ''), frame.have, frame.extra)
            break
          case 'detach':
            engine.detach(client)
            break
          case 'input':
            if (typeof frame.data === 'string') void engine.write(client.attachedId, frame.data).catch(() => {})
            break
          case 'resize':
            void engine.resize(client.attachedId, frame.cols, frame.rows).catch(() => {})
            break
          case 'ping':
            sendFrame(client, { t: 'pong' })
            break
          default:
            break
        }
      }

      // 访客流式兜底：token → 伪 ws 客户端（NDJSON 行帧，复用整套引擎协议）。
      const streamClients = new Map()
      function sendFrame(ws, event) {
        try {
          if (ws.readyState === 1) ws.send(JSON.stringify(event))
        } catch { /* socket tearing down */ }
      }

      function setupSocket(ws) {
        engine.addClient(ws)
        ws.on('message', (data) => {
          try {
            const bytes = Buffer.isBuffer(data)
              ? data
              : Buffer.concat(Array.isArray(data) ? data.map((c) => Buffer.from(c)) : [Buffer.from(data)])
            let frame
            try { frame = JSON.parse(bytes.toString('utf8')) } catch { return }
            dispatchFrame(ws, frame)
          } catch { /* malformed frame — ignore */ }
        })
        ws.on('close', () => {
          try { engine.removeClient(ws) } catch { /* engine shutting down */ }
        })
        ws.on('error', () => {
          try { engine.removeClient(ws) } catch { /* engine shutting down */ }
        })
      }

      logLine('boot', `dsh-termbar 已加载（API ${API_PATH}，WS ${WS_PATH}，vendor ${vendorCache.size}/${Object.keys(VENDOR_FILES).length}）`)
    })
  },
}
