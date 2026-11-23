// >>> dsh-plugins-plugin featured source (auto-inserted, do not remove markers)
// >>> dsh-plugins-plugin featured host (auto-inserted, do not remove markers)
function dshFeaturedHostModule() {
  // dsh-plugins-plugin — 嵌入式宿主模块(embed/featured.host.js)。
  //
  // 接入插件以 npm 依赖引用本包,在接入插件 apply 里调用:
  //   import { integrateFeaturedPlugins } from 'dsh-plugins-plugin/host'
  //   integrateFeaturedPlugins(ctx, FEATURED_SOURCE)
  //
  // 职责:
  //   1. 登记推荐源 FEATURED_SOURCE 到跨插件服务 `featured-plugins`
  //      (服务已由先激活的接入方提供时,只登记,不重复建)。
  //   2. 第一个激活的接入方作为「宿主」:拉远程集中目录、轮询已安装表、
  //      挂聚合路由 GET /dsh-plugins-plugin/featured(重复注册静默忽略)。
  //
  // client 半不走本文件分发:接入插件的 apply 经 DSH 原生 chunk 机制
  // require.async('./client.featured.js') 加载 client 模块(由 integrate.sh 拷入)。
  //
  // 多插件同时接入:板块与路由由最先激活的一方持有,其余只贡献数据;
  // 客户端用 chunk 导出 initFeatured(ctx) + window.__DSH_FEATURED_APPLIED__ 判重
  // (owner 的 apply 调用),保证「精选推荐」只渲染一块。
  
  const ROUTE = '/dsh-plugins-plugin/featured'
  const SERVICE = 'featured-plugins'
  
  /* ── 推荐源/条目规范化 ──────────────────────────────────────────────── */
  
  // 单条推荐:package 必填(npm 包名),title 必填;其余可选。
  // 富字段(author/stars/downloads/screenshots 等)由仓库 plugins.json 集中维护。
  function normalizeEntry(raw, sourceId) {
    if (!raw || typeof raw !== 'object') return null
    const pkg = String(raw.package || raw.name || '').trim()
    const title = String(raw.title || '').trim()
    if (!pkg || !title) return null
    const entry = { package: pkg, title, source: sourceId }
    for (const key of ['description', 'version', 'icon', 'homepage', 'author', 'category']) {
      const v = String(raw[key] || '').trim()
      if (v) entry[key] = v
    }
    if (Array.isArray(raw.screenshots)) {
      const shots = raw.screenshots.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
      if (shots.length) entry.screenshots = shots
    }
    if (typeof raw.stars === 'number' && raw.stars >= 0) entry.stars = raw.stars
    if (typeof raw.downloads === 'number' && raw.downloads >= 0) entry.downloads = raw.downloads
    if (Array.isArray(raw.tags)) {
      const tags = raw.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
      if (tags.length) entry.tags = tags
    }
    return entry
  }
  
  // 一个推荐源:接入插件登记的单位。
  function normalizeSource(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('featured source must be an object')
    const id = String(raw.id || '').trim()
    if (!id) throw new Error('featured source needs an id (the integrating package name)')
    const title = String(raw.title || id).trim()
    const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
    const entries = []
    for (const item of rawEntries) {
      const entry = normalizeEntry(item, id)
      if (entry) entries.push(entry)
    }
    return { id, title, entries }
  }
  
  /* ── HTTP helpers ───────────────────────────────────────────────────── */
  
  function json(res, code, obj) {
    const body = JSON.stringify(obj)
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }
  
  // 同源校验:浏览器必带 Origin;curl 无 Origin 放行(宿主属主角色已限定)
  function sameOrigin(req) {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
  }
  
  /* ── 嵌入入口 ───────────────────────────────────────────────────────── */
  
  // ctx:接入插件自己的 cordis 上下文(apply 的第一参)。
  // source:推荐源 { id, title?, entries: [{ package, title, ... }] }。
  function integrateFeaturedPlugins(ctx, source) {
    // ── 推荐源注册表(跨插件服务,先激活者提供) ──
    let owner = false
    let registry = null
    try {
      registry = ctx.get(SERVICE)
    } catch { /* get 不可用时按未提供处理 */ }
    if (!registry) {
      const sources = new Map()
      registry = {
        register(rawSource) {
          const normalized = normalizeSource(rawSource)
          sources.set(normalized.id, normalized)
          return () => {
            if (sources.get(normalized.id) === normalized) sources.delete(normalized.id)
          }
        },
        list() {
          return [...sources.values()]
        },
      }
      try {
        ctx.effect(() => ctx.provide(SERVICE, registry), 'dsh-plugins-plugin: registry service')
        owner = true
      } catch { /* 已被并行提供 → 退化为纯登记方 */ }
    }
  
    // 登记本插件推荐源(effect 挂子上下文,插件停用即注销)
    ctx.inject([], (child) => {
      child.effect(() => registry.register(source), 'featured-plugins source: ' + String(source && source.id))
    })
  
    if (!owner) return // 非宿主:只贡献数据
  
    // ── 宿主职责:远程集中目录(5 分钟内存缓存,node fetch,无浏览器缓存/CORS) ──
    const REMOTE_CATALOG_URLS = [
      'https://cdn.jsdelivr.net/gh/skillpie/dsh-plugins@main/dsh-plugins-plugin/plugins.json',
      'https://raw.githubusercontent.com/skillpie/dsh-plugins/main/dsh-plugins-plugin/plugins.json',
    ]
    const REMOTE_TTL_MS = 5 * 60_000
    let remoteCache = { at: 0, doc: null }
  
    // 多源并发拉取,取「最新」的那份。单源「先到先用」会被 CDN 缓存坑:
    // jsdelivr 的 @main 有数分钟到数小时的延迟,raw.githubusercontent 通常更快,
    // 谁先返回就用谁会让旧数据长期遮住新数据。
    //
    // 判新三要素(优先级从高到低):
    //   1. updated 日期(仓库写入时的时间戳)
    //   2. 条目数 —— plugins.json 只会增不会减,多的一定更新
    //   3. 版本号总和 —— 同一条目升级时条目数不变,靠这个比出来
    // 只比 updated 不够:enrich 脚本按天写 updated(如 "2026-11-22"),
    // 同一天内的多次提交无法区分,会退化成「谁先返回用谁」。
    const catalogScore = (doc) => {
      const t = Date.parse(String(doc?.updated || ''))
      const entries = Array.isArray(doc?.entries) ? doc.entries : []
      let versions = 0
      for (const e of entries) {
        const parts = String(e?.version || '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0)
        versions += (parts[0] || 0) * 1_000_000 + (parts[1] || 0) * 1_000 + (parts[2] || 0)
      }
      return { at: Number.isFinite(t) ? t : 0, count: entries.length, versions }
    }
  
    const newerCatalog = (a, b) => {
      // a 是否比 b 新
      if (a.at !== b.at) return a.at > b.at
      if (a.count !== b.count) return a.count > b.count
      return a.versions > b.versions
    }
  
    async function fetchRemoteCatalog() {
      const now = Date.now()
      if (remoteCache.doc && now - remoteCache.at < REMOTE_TTL_MS) return remoteCache.doc
      const results = await Promise.all(
        REMOTE_CATALOG_URLS.map(async (url) => {
          try {
            const res = await fetch(url, {
              headers: { accept: 'application/json' },
              signal: AbortSignal.timeout(8000),
              cache: 'no-store',
            })
            if (!res.ok) return null
            const doc = await res.json()
            return Array.isArray(doc?.entries) ? doc : null
          } catch { return null }
        }),
      )
      const docs = results.filter(Boolean)
      if (docs.length === 0) return null
      // 三要素比较;完全相同时保留并发顺序靠前者(jsdelivr 在前)。
      const best = docs.reduce((a, b) => (newerCatalog(catalogScore(b), catalogScore(a)) ? b : a))
      remoteCache = { at: now, doc: best }
      return best
    }
  
    // ── 已安装列表(host 侧轮询 pluginManager,独立 inject 作用域防回滚) ──
    let installedMap = {}
    try {
      ctx.inject(['pluginManager'], (child) => {
        child.effect(() => {
          let timer = null
          const refresh = async () => {
            try {
              const bundles = await child.pluginManager.listBundles()
              const map = {}
              for (const b of bundles) {
                if (b && b.name && b.installed) map[b.name] = b.version || ''
              }
              installedMap = map
            } catch { /* 保留上一次结果 */ }
          }
          refresh()
          timer = setInterval(refresh, 30_000)
          if (timer && typeof timer.unref === 'function') timer.unref() // 不阻塞宿主退出
          return () => clearInterval(timer)
        }, 'dsh-plugins-plugin: installed bundles watcher')
      })
    } catch { /* pluginManager 不可用 → 无已安装徽标,不影响板块 */ }
  
    // ── 聚合:远程目录(主)+ 登记源(补充),按包名去重,先到者优先;富字段回填 ──
    const RICH_KEYS = ['author', 'homepage', 'category', 'icon', 'screenshots', 'stars', 'downloads']
    const aggregate = async () => {
      const remoteRaw = Array.isArray(remoteCache.doc?.entries) ? remoteCache.doc.entries : []
      const remoteIndex = new Map()
      for (const raw of remoteRaw) {
        const pkg = String(raw?.package || raw?.name || '').trim()
        if (pkg && !remoteIndex.has(pkg)) remoteIndex.set(pkg, raw)
      }
      const seen = new Set()
      const entries = []
      const push = (normalized) => {
        if (!normalized || seen.has(normalized.package)) return
        seen.add(normalized.package)
        const rich = remoteIndex.get(normalized.package)
        if (rich && normalized.source !== 'plugins.json') {
          for (const key of RICH_KEYS) {
            if (normalized[key] === undefined && rich[key] !== undefined) normalized[key] = rich[key]
          }
        }
        entries.push(normalized)
      }
      for (const raw of remoteRaw) push(normalizeEntry(raw, 'plugins.json'))
      for (const src of registry.list()) {
        for (const entry of src.entries) push(entry)
      }
      return {
        entries,
        sources: registry.list().map((s) => ({ id: s.id, title: s.title, count: s.entries.length })),
        installed: installedMap,
        remote: remoteCache.doc ? { fetchedAt: new Date(remoteCache.at).toISOString(), count: entries.length } : null,
      }
    }
  
    // ── 聚合路由(重复注册会抛错 → try/catch 静默,已有宿主持有) ──
    ctx.inject(['webServer'], (child) => {
      child.effect(() => {
        let dispose = null
        try {
          dispose = child.webServer.register({
            kind: 'exact',
            path: ROUTE,
            handler: async (req, res) => {
              try {
                if (!sameOrigin(req)) { json(res, 403, { ok: false, error: 'cross-origin request rejected' }); return }
                if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
                await fetchRemoteCatalog().catch(() => null)
                json(res, 200, { ok: true, data: await aggregate() })
              } catch (err) {
                json(res, 200, { ok: false, error: String(err?.message || err) })
              }
            },
          })
        } catch { /* 路由已存在(另一接入方先注册)→ 本方只作数据方 */ }
        return () => {
          if (typeof dispose === 'function') dispose()
        }
      }, 'dsh-plugins-plugin: featured route')
    })
  }
  return { integrateFeaturedPlugins }
}
const { integrateFeaturedPlugins } = dshFeaturedHostModule()
// <<< dsh-plugins-plugin featured host

// 精选插件推荐源(dsh-plugins-plugin):
const FEATURED_SOURCE = {
  id: "dsh-termbar", // 推荐源标识,重复登记以此覆盖
  title: "dsh-termbar", // 「推荐来源」显示名
  entries: [
    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):
    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",
    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },
  ],
}
// <<< dsh-plugins-plugin featured source

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
  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主


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
