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

export const ROUTE = '/dsh-plugins-plugin/featured'
export const SERVICE = 'featured-plugins'

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
export function integrateFeaturedPlugins(ctx, source) {
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

  // 多源并发拉取,取 updated 最新的那份。单源「先到先用」会被 CDN 缓存坑:
  // jsdelivr 的 @main 有数分钟到数小时的延迟,raw.githubusercontent 通常更快,
  // 谁先返回就用谁会让旧数据长期遮住新数据。
  const catalogStamp = (doc) => {
    const raw = String(doc?.updated || '')
    const t = Date.parse(raw)
    return Number.isFinite(t) ? t : 0
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
    // 版本号相同的日期取不到先后时,按源顺序(jsdelivr 在前)兜底。
    const best = docs.reduce((a, b) => (catalogStamp(b) >= catalogStamp(a) ? b : a))
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
