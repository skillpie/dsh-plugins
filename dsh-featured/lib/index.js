// dsh-featured — 精选插件宿主半。
//
// 职责:
//   1. 远程集中目录:node fetch 拉 GitHub 上的 plugins.json(jsdelivr + raw 双源并发,
//      按 updated 取最新),5 分钟内存缓存 —— 浏览器侧零外部请求、无缓存/跨域问题。
//   2. 已安装表:轮询 pluginManager.listBundles(),给卡片「已安装」徽标。
//   3. 聚合路由 GET /dsh-featured/featured:返回 { entries, installed, sources }。
//   4. 内联版让位通道:如果某个接入插件内联了极简欢迎页,
//      它的 client 会在 window 上挂 __DSH_FEATURED_ENTRY__ = { dispose }。
//      本插件 client 启动时先调它注销内联版,再用同一个 slot id 注册完整版,
//      因此页面上永远只有一个「精选插件」tab(多插件同时集成也只会有内联一份)。

export const ROUTE = '/dsh-featured/featured'
export const SERVICE = 'featured-plugins'

/* ── 条目规范化 ─────────────────────────────────────────────────────── */

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

// 同源校验:浏览器必带 Origin 与 Host;两侧 hostname 必须一致(忽略端口差异,
// 因为有反代/隧道场景),无 Origin(如 curl、SSR)放行。
// 注意:不能只比 host —— 测试/反代里 Host 可能是 127.0.0.1:port 而 Origin 的
// host 完全一致才是同源;这里用 hostname 比较 + 端口可选。
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  const host = req.headers['x-forwarded-host'] || req.headers.host
  try {
    const o = new URL(origin)
    if (!host) return false
    const h = new URL('http://' + host)
    if (o.hostname !== h.hostname) return false
    // 端口不同视为跨源;但反代下可能被改写,故仅当两侧都显式给了端口才比较
    if (o.port && h.port && o.port !== h.port) return false
    return true
  } catch { return false }
}

/* ── 插件主体 ───────────────────────────────────────────────────────── */

export const name = 'dsh-featured'

export function apply(ctx) {
  // ── 推荐源注册表:跨插件服务(接入插件内联版登记自己的推荐源) ──
  // 完整版自己也提供一个,保证即使没有任何接入插件,板块也能工作。
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
    ctx.effect(() => ctx.provide(SERVICE, registry), 'dsh-featured: registry service')
  }

  // ── 远程集中目录(5 分钟内存缓存,node fetch,无浏览器缓存/CORS) ──
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
  // 只比 updated 是不够的:enrich 脚本按天写 updated(如 "2026-11-22"),
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
      }, 'dsh-featured: installed bundles watcher')
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

  // ── 聚合路由(重复注册会抛错 → try/catch 静默,由先注册方持有) ──
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
    }, 'dsh-featured: featured route')
  })
}
