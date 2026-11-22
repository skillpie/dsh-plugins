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
  id: "dsh-remote-relay", // 推荐源标识,重复登记以此覆盖
  title: "dsh-remote-relay", // 「推荐来源」显示名
  entries: [
    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):
    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",
    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },
  ],
}
// <<< dsh-plugins-plugin featured source

/**
 * dsh-remote-relay — Cordis entry (both roles in one activation).
 *
 * Host role (default off): dials the configured relay origin (e.g.
 * wss://dsh.skillpie.cn) over one outbound WebSocket and registers this
 * machine's 8-digit code. Visitors opening `https://<relay>/<code>/` use
 * this machine's real DSH Web GUI through the tunnel.
 * With `direct: true` the same surface also mounts locally at `/<code>`
 * (LAN / loopback use and end-to-end testing without a relay).
 *
 * Relay role (`relay.enabled`, for a server-side profile such as
 * dsh.skillpie.cn): mounts `/dsh-remote-relay/host` for host registrations and
 * serves `/<code>/` for registered hosts. The registry keeps token hashes
 * only; GUI traffic rides spliced frames the relay never interprets.
 *
 * Identity (code / hostId / token) persists as a credential record
 * `dsh-remote-relay/identity` (GrantRecord payload); an explicit `code` in the
 * row config pins it instead.
 *
 * Owner panel: same-origin JSON API at /dsh-remote-relay/api behind the web GUI's
 * own session auth (status / regenerate / toggles), consumed by the client
 * half's sidebar panel. Host roles only — a relay-only server row mounts no
 * owner API.
 */
import os from 'node:os'
import { HOST_UPGRADE_PATH, OWNER_API_PATH, PROTOCOL_VERSION, generateCode, generateId, isValidCode } from './protocol.js'
import { GuiBridge } from './bridge.js'
import { RelayLink } from './remote.js'
import { RelayCore, serveServiceWorker } from './relay-core.js'
import { registerFileRoute, fileRouteKey } from './file-route.js'
import { createPipePair } from './pipe.js'

const DEFAULT_RELAY_URL = 'wss://dsh.skillpie.cn'
const CREDENTIAL_KEY = 'dsh-remote-relay/identity'
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
    vendor: 'dsh-remote-relay',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const issues = []
      const value = {}
      const bools = [
        ['enabled', false],
        ['direct', false],
      ]
      for (const [key, fallback] of bools) {
        const parsed = bool(input[key], fallback)
        if (parsed === null) issues.push(issue('expected a boolean', key))
        else value[key] = parsed
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
  name: 'dsh-remote-relay',
  Config,
  inject: [],
  apply(ctx, rawConfig = null) {
  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主

    const cfg = rawConfig ?? {}
    // 默认关闭：远程控制涉及向第三方中转站建立出站长连接并开放完整 GUI
    // 权限，必须由属主在设置页主动开启（开启时客户端会弹确认提示）。
    const enabled = cfg.enabled ?? false
    const direct = cfg.direct ?? false
    const relayUrl = cfg.relayUrl ?? DEFAULT_RELAY_URL
    const relayFaceEnabled = cfg.relay?.enabled === true
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
      state.peer?.detach?.()
      for (const dispose of disposers.splice(0)) {
        try { dispose() } catch { /* best-effort teardown */ }
      }
      logLine('boot', 'dsh-remote-relay 已卸载')
    }, 'dsh-remote-relay: lifetime')

    // Services arrive through optional injection; boot() starts the parts
    // that need them as they appear.
    const services = { sessionController: undefined, webServer: undefined, webServerOrigin: undefined }
    let webServerWaiter = undefined
    const whenWebServer = () => services.webServer
      ? Promise.resolve()
      : new Promise((resolve) => { webServerWaiter = resolve })

    // Idempotent file-route mount: webServer.register throws on duplicate
    // (kind, path), and both boot() and the runtime set-enabled action may
    // call this — the flag keeps exactly one registration per server.
    let fileRouteMounted = false
    function ensureFileRoute(webServer) {
      if (fileRouteMounted) return
      fileRouteMounted = true
      disposers.push(registerFileRoute({ webServer, key: fileRouteKey(identity.hostId), log: logLine }))
      logLine('file-route', '访客文件下载路由已挂载（/dsh-remote-relay-file）')
    }

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

      // 3. Build the visitor-facing peer: the GUI bridge (transparent splice).
      const peer = new GuiBridge({
        services: {
          webServer: () => services.webServer,
          connection: () => (typeof ctx.get === 'function' ? ctx.get('connection') : undefined),
        },
        log: logLine,
      })
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
        logLine('boot', `dsh-remote-relay 已加载（远程码 ${identity.code}）`)
      } else {
        logLine('boot', `dsh-remote-relay 已加载（远程码 ${identity.code}，远程访问已关闭）`)
      }

      // 5. Owner panel API (same-origin, behind the GUI session auth).
      //    默认关闭后属主面板是唯一的开启入口，所以宿主面即使全关也要挂，
      //    否则面板永远停在「正在读取状态」、开关无从打开；只有 relay-only
      //    服务器行（只当中转面用）不挂，避免暴露 regenerate 等操作。
      const relayOnly = relayFaceEnabled && !enabled && !direct
      if (!relayOnly) {
        disposers.push(webServer.register({
          kind: 'exact',
          path: OWNER_API_PATH,
          handler: (req, res) => { void ownerApi(req, res) },
        }))
        logLine('owner-api', `属主 API 已挂载（${OWNER_API_PATH}）`)
      }

      // 5.5 Visitor file downloads: stream files from this host to the
      //     remote browser with a save dialog (see lib/file-route.js).
      //     Host roles only; the key derives from the host id, which the
      //     relay also derives from the hello to stamp the visitor shim.
      //     无条件挂载（1.2.7 起默认 enabled=false，属主面板运行时开启不会
      //     重走 boot，按 enabled||direct 挂载会让「面板开启后访客下载」
      //     永远 404）；路由自身有 key 门控，无密钥一律 403。
      ensureFileRoute(webServer)

      // 6. Direct mode: the same surface on the local web server.
      if (direct) {
        const [hostEnd, relayEnd] = createPipePair()
        const directCore = new RelayCore({
          webServer,
          log: logLine,
          maxVisitorsPerHost,
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
        logLine('direct', `本机直连路由已挂载（/${identity.code}/）`)
      }

      // 7. Visitor restore worker: conceals the code from the address bar and
      //    keeps the bare origin reopening the tunnel (see concealScript). The
      //    worker also probes 8-digit code paths and swaps a 404 (unknown or
      //    offline-revoked code) for the code-entry dialog.
      if (direct || relayFaceEnabled) {
        disposers.push(webServer.register({
          kind: 'exact',
          path: '/dsh-remote-relay-sw.js',
          handler: (req, res) => { try { serveServiceWorker(req, res) } catch { try { res.destroy() } catch { /* gone */ } } },
        }))
        logLine('sw', '访客恢复 Worker 已挂载（/dsh-remote-relay-sw.js）')
      }

      // 8. Relay face (server deployments only).
      if (relayFaceEnabled) {
        const relayCore = new RelayCore({
          webServer,
          log: logLine,
          maxVisitorsPerHost,
        })
        state.relayCore = relayCore
        disposers.push(webServer.registerUpgrade({
          path: HOST_UPGRADE_PATH,
          handler: (req, socket, head) => relayCore.acceptHostUpgrade(req, socket, head),
        }))
        disposers.push(() => relayCore.detachAll())
        logLine('relay-face', `中转面已挂载（${HOST_UPGRADE_PATH}）`)
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
        return send(200, { ok: true, service: 'dsh-remote-relay', protocol: PROTOCOL_VERSION })
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
          // 运行时开启也要兜底挂文件下载路由（boot 时默认关、可能没挂）。
          if (next && services.webServer) ensureFileRoute(services.webServer)
          logLine('owner', `属主${next ? '开启' : '关闭'}远程控制`)
          return { ok: true, enabled: next }
        }
        case 'set-control': {
          // 遗留动作：控制开关随 console 模式移除；GUI 模式下持码即完整控制。
          return { ok: true, allowControl: body.value === true }
        }
        default:
          throw new Error(`unknown action: ${action}`)
      }
    }

    function statusSnapshot() {
      const link = state.link
      return {
        protocol: PROTOCOL_VERSION,
        enabled: Boolean(link),
        direct,
        relayUrl,
        name: identity.name,
        hostId: identity.hostId,
        code: identity.code,
        relay: link ? link.status() : { connected: false, relayUrl },
        directUrl: direct && services.webServerOrigin ? `${services.webServerOrigin}/${identity.code}/` : undefined,
        relayUrlPublic: relayUrl.replace(/^ws/, 'http') + '/' + identity.code + '/',
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
