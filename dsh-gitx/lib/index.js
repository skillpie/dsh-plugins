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
  id: "dsh-gitx", // 推荐源标识,重复登记以此覆盖
  title: "dsh-gitx", // 「推荐来源」显示名
  entries: [
    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):
    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",
    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },
  ],
}
// <<< dsh-plugins-plugin featured source

/**
 * dsh-gitx — Host half.
 *
 * Wires the git core, durable settings, and the RPC endpoint used by the UI.
 * Every optional service is taken through a dynamic injection, so this bundle
 * still activates on a headless profile that has no `connection`, no `llm`, and
 * no workspace registry — it simply contributes less.
 *
 * ## Why the git executable is resolved once, eagerly
 *
 * The resolved path is the identity of the whole plugin. A machine carrying four
 * gits must not silently answer from a different one between two
 * RPC calls, and the settings page has to be able to show which one ran. So it
 * is resolved at activation, cached, and re-resolved only when the setting
 * changes.
 *
 * Repository operations are available through the browser UI. Destructive
 * operations require confirmation; no tools or prompt sections are registered
 * with the conversation agent.
 */
import { redact } from './git/commandLog.js'
import { ConfigStore } from './config.js'
import { RepoRegistry } from './git/repo.js'
import { createRpc } from './rpc.js'
import { createLlm } from './ai.js'

export const name = 'dsh-gitx'

/**
 * Hard requirements only.
 *
 * `connection`, `llm`, `agentDefaultModel`, `agents`
 * and `workspaceRegistry` are all taken through dynamic injections inside
 * `apply`. Declaring any of them as a static inject would leave this plugin
 * permanently pending on a profile that lacks it, which fails the whole profile
 * with "plugin tree failed to load".
 */
export const inject = []

/** RPC endpoint name and route, shared with the Client half. */
export const RPC_ENDPOINT = 'dsh-gitx'
export const RPC_PATH = '/api/dsh-gitx'

/**
 * Activate the plugin.
 * @param ctx - the Cordis plugin context.
 */
export function apply(ctx) {
  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主


  const logger = ctx.logger ?? console
  const config = new ConfigStore({ logger })

  /** Can the string be used as a workspace directory? */
  const usableCwd = (value) => (typeof value === 'string' && value !== '' ? value : undefined)

  /**
   * The directory a session is working in, by explicit session id.
   *
   * The panel names the session it is rendering, because an HTTP request carries
   * no Agent initiator boundary (`currentInitiator()` is only inside a turn) and
   * the workspace registry alone cannot say which conversation is on screen. The
   * session's own validated `header.cwd` is the authoritative answer, and the
   * workspace that accounts for that session is the fallback for an older or
   * differently-shaped session service.
   *
   * @param sessionId - the session to look up.
   * @returns its directory, or undefined when nothing is known.
   */
  const cwdOfSession = (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    try {
      const session = ctx.get('sessions')?.get?.(sessionId)
      const direct = usableCwd(session?.header?.cwd)
      if (direct !== undefined) return direct
    } catch {
      // A session service that is present but unusable must not break `repos`.
    }
    try {
      const workspace = (ctx.get('workspaceRegistry')?.list?.() ?? [])
        .find((entry) => (entry?.sessionIds ?? []).includes(sessionId))
      return usableCwd(workspace?.path)
    } catch {
      // Same tolerance: a broken registry degrades the answer, not the plugin.
    }
    return undefined
  }

  /**
   * The active session directory, falling back to its workspace.
   *
   * @param sessionId - optional session to resolve; omitted asks the Host to
   *   infer the active one from the Agent initiator, then the workspace registry.
   */
  const sessionCwd = (sessionId) => {
    const named = cwdOfSession(sessionId)
    if (named !== undefined) return named
    // The session directory the Agent is working in is the best default: it is
    // what the user means by "my project" far more often than a stored path.
    // This path only works inside a turn (that is where the initiator boundary
    // exists), which is why an explicit `sessionId` is tried first.
    const agents = ctx.get('agents')
    try {
      const initiator = agents?.currentInitiator?.()
      const cwd = initiator?.session?.header?.cwd ?? initiator?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return cwd
    } catch {
      // An agent service that is present but not usable must not break `repos`.
    }
    const registry = ctx.get('workspaceRegistry')
    try {
      const workspace = (registry?.list?.() ?? []).find((entry) => typeof entry?.path === 'string' && entry.path !== '')
      if (workspace) return workspace.path
    } catch {
      // Same tolerance: a broken registry degrades the list, not the plugin.
    }
    return undefined
  }

  /** Repository discovery examines only the active directory. */
  const candidateDirectories = () => {
    const cwd = sessionCwd()
    return cwd ? [cwd] : []
  }

  let gitPathCache = null
  const registry = new RepoRegistry({
    logger,
    // The configured path is read on every resolution so a settings change is
    // picked up without reloading the plugin.
    resolveGitPath: async (options = {}) => {
      const { resolveGitPath } = await import('./git/exec.js')
      await config.load()
      const configured = config.get().gitPath
      if (!gitPathCache || options.force === true || gitPathCache.configured !== configured || (gitPathCache.failedAt && Date.now() - gitPathCache.failedAt >= 10000)) {
        const entry = { configured, failedAt: null, promise: null }
        entry.promise = resolveGitPath({ configured }).then(value => {
          if (value === null) entry.failedAt = Date.now()
          return value
        }).catch(error => { if (gitPathCache === entry) gitPathCache = null; throw error })
        gitPathCache = entry
      }
      return gitPathCache.promise
    },
  })

  /** Lazily resolved services, so a missing one degrades instead of failing. */
  const llm = createLlm({
    logger,
    getConfig: () => config.get(),
    getLlm: () => ctx.get('llm'),
    getSessionSelection: (sessionId) => {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined
      const session = ctx.get('sessions')?.get?.(sessionId)
      if (!session) return undefined
      // Read the same selection as the session controller, without resuming an
      // Agent or creating a conversation turn. A pending choice wins over the
      // model used by the last request.
      try {
        const pending = ctx.get('sessionProjections')?.stateOf?.(session, 'modelSelection')?.pending
        if (pending?.provider && pending?.model) return pending
      } catch {
        // Older profiles may not register this projection; the last request
        // header still carries the session's model choice.
      }
      const header = session.requestHeader?.()
      const selection = header?.config
      if (!selection?.provider || !selection?.model) return undefined
      return { provider: selection.provider, model: selection.model,
        ...(selection.reasoningEffort === undefined || header.adapterDefaults?.reasoningEffort === true
          ? {} : { reasoningEffort: selection.reasoningEffort }) }
    },
    getDefaultSelection: () => {
      try {
        return ctx.get('agentDefaultModel')?.currentSelection?.()
      } catch {
        return undefined
      }
    },
  })

  const rpc = createRpc({
    registry,
    config,
    logger,
    llm,
    candidateDirectories,
    sessionCwd,
  })

  // Settings must be loaded before the first call that reads them; doing it here
  // rather than per-request keeps the RPC path synchronous-ish and makes a
  // corrupt file a startup log line instead of a per-call failure.
  config.load().then(
    (loaded) => logger.info?.('[git] settings loaded'),
    (error) => logger.warn?.(`[git] settings load failed: ${String(error)}`),
  )

  // ---- HTTP endpoint for the browser panel -------------------------------
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.connection ?? connectionCtx.get('connection')
    if (connection === undefined || typeof connection.fetch?.register !== 'function') {
      logger.warn?.('[git] connection.fetch unavailable; the panel RPC endpoint is not registered')
      return
    }
    connection.fetch.register({
      path: RPC_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        if (request.method !== 'POST') {
          return new Response('method not allowed', { status: 405 })
        }
        const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
        if (contentType !== 'application/json') {
          return new Response('content type must be application/json', { status: 415 })
        }
        let message
        try {
          message = await request.json()
        } catch {
          return new Response('body is not JSON', { status: 400 })
        }
        const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
        const call = message?.payload
        if (
          message?.type !== 'client-request' ||
          typeof message.rpcId !== 'string' ||
          message.method !== RPC_ENDPOINT ||
          call === null ||
          typeof call !== 'object' ||
          typeof call.method !== 'string'
        ) {
          return reply(rpcId, {
            ok: false,
            error: { code: 'git/bad-request', message: 'Invalid git plugin request.' },
          })
        }
        try {
          // Cancellation is wired to the request: closing the panel must not
          // leave a 60-second `git blame` running against the machine.
          const result = await rpc.call(call.method, call.payload ?? {}, request.signal)
          return reply(rpcId, result)
        } catch (error) {
          const text = redact(error instanceof Error ? error.message : String(error))
          logger.warn?.(`[git] ${String(call.method)} failed: ${text}`)
          return reply(rpcId, { ok: false, error: { code: 'git/handler-failed', message: text } })
        }
      },
    })
    logger.info?.(`[git] RPC endpoint registered at ${RPC_PATH}`)
  })

  logger.info?.('[git] host ready')
}

/**
 * Build the JSON-RPC reply envelope the browser client understands.
 *
 * A `{ ok: false }` result must carry a `details` object even when empty: the
 * client's error path reads it, and omitting it surfaces as "clicking does
 * nothing" rather than as the message we actually produced.
 *
 * @param rpcId - the correlation id echoed from the request.
 * @param result - the `{ ok, value }` or `{ ok: false, error }` payload.
 * @returns an HTTP response carrying the envelope.
 */
function reply(rpcId, result) {
  const value =
    typeof result === 'object' && result !== null && result.ok === false
      ? { ...result, error: { ...result.error, details: result.error?.details ?? {} } }
      : result
  return Response.json({ type: 'server-response', rpcId, result: value })
}
