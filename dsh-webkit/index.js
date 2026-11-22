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
  id: "dsh-webkit", // 推荐源标识,重复登记以此覆盖
  title: "dsh-webkit", // 「推荐来源」显示名
  entries: [
    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):
    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",
    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },
  ],
}
// <<< dsh-plugins-plugin featured source

/**
 * Host half of dsh-webkit.
 *
 * The Client half picks elements out of the right-Sidebar browser. The browser
 * iframe is sandboxed with `allow-same-origin`, but it loads the *target*
 * origin, so a cross-origin page never exposes `contentDocument` to the DSH
 * page and no picker can run inside it. This route closes that gap: it fetches
 * the page server-side (no CORS, no page sandbox), strips everything that could
 * execute on the DSH origin, re-bases relative URLs onto the final address and
 * serves the result from the DSH origin itself. The Client half then mounts that
 * snapshot in an overlay iframe whose document the page *can* reach.
 *
 * The snapshot is served with `script-src 'none'`, so even a stripping miss
 * cannot run code on the application origin. The picker needs no script inside
 * the frame: it is parent-context code operating on the child document.
 */
const ROUTE_PREFIX = '/webkit'
const MAX_BYTES = 4 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000

/** Escapes a value for a double-quoted HTML attribute. */
function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * A failure the Client half can read back: the overlay iframe shows this page,
 * and the parent inspects `body[data-webkit-error]`.
 */
function errorPage(message) {
  const safe = escapeAttribute(message)
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<title>Webkit Snapshot</title>',
    '<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;',
    'font:13px/1.6 system-ui,sans-serif;color:#9b9b9b;background:transparent}</style>',
    `</head><body data-webkit-error="${safe}"><p>${safe}</p></body></html>`,
  ].join('')
}

/**
 * Removes every construct that could execute on the application origin.
 *
 * `script-src 'none'` already blocks execution, but stripping keeps the snapshot
 * honest: a stripped page cannot phone home, cannot navigate the top frame
 * through `<meta http-equiv="refresh">`, and cannot smuggle markup through a
 * same-origin `srcdoc` child.
 */
function stripActiveContent(html) {
  let out = html
  // Scripts, with and without bodies, in any attribute order.
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
  out = out.replace(/<script\b[^>]*\/?>/gi, '')
  // A CSP meta would apply the *target's* policy to our snapshot; a refresh meta
  // could navigate this frame away (or to a javascript: URL).
  out = out.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?(?:content-security-policy(?:-report-only)?|refresh)["']?[^>]*>/gi,
    '',
  )
  // An existing <base> would fight the one this route injects.
  out = out.replace(/<base\b[^>]*>/gi, '')
  // Same-origin child documents: srcdoc content inherits our origin.
  out = out.replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Inline event handlers.
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Script-bearing URLs.
  out = out.replace(
    /\s(href|src|action|formaction|xlink:href)\s*=\s*(?:"\s*(?:javascript|data:text\/html)[^"]*"|'\s*(?:javascript|data:text\/html)[^']*')/gi,
    ' $1="#"',
  )
  return out
}

/** Re-bases relative URLs on the address the page actually resolved to. */
function withBase(html, baseUrl) {
  const head = `<base href="${escapeAttribute(baseUrl)}">`
    + '<meta name="referrer" content="no-referrer">'
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (tag) => tag + head)
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (tag) => tag + head)
  return head + html
}

/** Decodes bytes using the response charset, then the document's own meta. */
function decodeBody(buffer, contentType) {
  let charset = /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? '')?.[1]
  if (charset === undefined) {
    const head = new TextDecoder('latin1').decode(buffer.subarray(0, 4096))
    charset = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head)?.[1]
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

/**
 * Serves one snapshot per request.
 * @param req - the HTTP request; `url` carries `?url=<encoded target>`.
 * @param res - the HTTP response.
 */
async function serveSnapshot(req, res) {
  const fail = (message) => {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "script-src 'none'; object-src 'none'; base-uri *; frame-ancestors 'self'",
      'x-content-type-options': 'nosniff',
    })
    res.end(errorPage(message))
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fail('仅支持 GET')
    return
  }

  const requested = new URL(req.url ?? '/', 'http://dsh.internal').searchParams.get('url')
  if (requested === null || requested === '') {
    fail('缺少 url 参数')
    return
  }

  let target
  try {
    target = new URL(requested)
  } catch {
    fail('url 参数不是合法地址')
    return
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    fail(`不支持的协议 ${target.protocol}`)
    return
  }

  let response
  try {
    response = await fetch(target.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Webkit/1.0',
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`抓取失败：${reason}`)
    return
  }

  if (!response.ok) {
    fail(`目标返回 HTTP ${response.status}`)
    return
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    fail(`该地址不是 HTML 页面（${contentType || '未知类型'}）`)
    return
  }

  const declared = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    fail(`页面过大（${Math.round(declared / 1024)} KB，上限 ${MAX_BYTES / 1024 / 1024} MB）`)
    return
  }

  let buffer
  try {
    buffer = await response.arrayBuffer()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`读取失败：${reason}`)
    return
  }
  if (buffer.byteLength > MAX_BYTES) {
    fail(`页面过大（${Math.round(buffer.byteLength / 1024)} KB，上限 ${MAX_BYTES / 1024 / 1024} MB）`)
    return
  }

  const finalUrl = response.url === '' ? target.href : response.url
  const html = withBase(stripActiveContent(decodeBody(buffer, contentType)), finalUrl)

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    // Belt and braces: no script of any kind may run in this document, and only
    // the application origin may frame it.
    'content-security-policy': "script-src 'none'; object-src 'none'; base-uri *; frame-ancestors 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(html)
}

/** Services the Client half reads a snapshot through. */
export const inject = ['webServer']

/**
 * Mounts the snapshot route.
 * @param ctx - the Host plugin context.
 */
export function apply(ctx) {
  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: `${ROUTE_PREFIX}/snapshot`,
      handler: (req, res) => serveSnapshot(req, res),
    }),
    'dsh-webkit: snapshot route',
  )
}
