// dsh-featured — 精选插件宿主半。
//
// 职责:
//   1. 数据源:从 skillpie 公开接口分页拉取「插件分类 + 插件列表 + 插件详情」,
//      不再读取 npm / GitHub。baseURL 可由 DSH 配置覆盖(内置默认 https://skillpie.cn)。
//      5 分钟内存缓存 —— 浏览器侧零外部请求、无缓存/跨域问题。
//   2. 已安装表:轮询 pluginManager.listBundles(),给卡片「已安装」徽标。
//   3. 聚合路由 GET /dsh-featured/featured:返回 { entries, categories, installed }。
//   4. 内联版让位通道:如果某个接入插件内联了极简欢迎页,
//      它的 client 会在 window 上挂 __DSH_FEATURED_ENTRY__ = { dispose }。
//      本插件 client 启动时先调它注销内联版,再用同一个 slot id 注册完整版,
//      因此页面上永远只有一个「精选插件」tab(多插件同时集成也只会有内联一份)。

export const ROUTE = '/dsh-featured/featured'
export const SERVICE = 'featured-plugins'

export const Config = {
  // skillpie 公开接口的根地址。生产默认 https://skillpie.cn;
  // 本地联调可在 DSH 的插件配置里覆盖为 http://localhost:3001。
  baseUrl: (x) => String(typeof x === 'string' ? x : ''),
}

/* ── HTTP helpers ───────────────────────────────────────────────────── */

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

// 同源校验:浏览器必带 Origin 与 Host;两侧 hostname 必须一致(忽略端口差异,
// 因为有反代/隧道场景),无 Origin(如 curl、SSR)放行。
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  const host = req.headers['x-forwarded-host'] || req.headers.host
  try {
    const o = new URL(origin)
    if (!host) return false
    const h = new URL('http://' + host)
    if (o.hostname !== h.hostname) return false
    if (o.port && h.port && o.port !== h.port) return false
    return true
  } catch { return false }
}

/* ── 数据源:skillpie 公开接口 ────────────────────────────────────────── */

// 把 skillpie Plugin 记录映射成 client 消费的 entry 形状。
function toEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const pkg = String(raw.name || raw.package || '').trim()
  const title = String(raw.title || '').trim()
  if (!pkg || !title) return null
  const entry = { package: pkg, title }
  if (typeof raw.id === 'string' && raw.id) entry.id = raw.id
  for (const key of ['detail', 'description', 'version', 'spec', 'homepage', 'author', 'icon', 'readme']) {
    const v = raw[key]
    if (v != null && String(v).trim() !== '') entry[key] = String(v).trim()
  }
  if (raw.category && typeof raw.category === 'object') {
    entry.category = raw.category.name || ''
    entry.categoryDisplayName = raw.category.displayName || raw.category.name || ''
    entry.categoryId = raw.category.id || ''
  } else if (typeof raw.categoryId === 'string' && raw.categoryId) {
    entry.categoryId = raw.categoryId
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

/* ── 插件主体 ───────────────────────────────────────────────────────── */

export const name = 'dsh-featured'

export function apply(ctx, config) {
  const baseUrl = (typeof config?.baseUrl === 'string' && config.baseUrl.trim())
    ? config.baseUrl.trim().replace(/\/+$/, '')
    : 'https://skillpie.cn'

  // ── 远程目录缓存(5 分钟) ──
  const TTL_MS = 5 * 60_000
  let cache = { at: 0, entries: [], categories: [] }

  // 分页拉取全部启用的插件(cursor + limit=100 循环),失败返回 null(保留上次)。
  async function fetchAllPlugins(fetchImpl) {
    const entries = []
    let cursor = null
    const seen = new Set()
    for (let guard = 0; guard < 50; guard++) {
      const url = baseUrl + '/api/plugins?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')
      const res = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      })
      if (!res.ok) return null
      const body = await res.json()
      const items = Array.isArray(body && body.plugins) ? body.plugins : []
      for (const raw of items) {
        const e = toEntry(raw)
        if (e && !seen.has(e.package)) { seen.add(e.package); entries.push(e) }
      }
      if (!body || !body.hasNextPage || !body.nextCursor) break
      cursor = body.nextCursor
    }
    return entries
  }

  async function fetchCategories(fetchImpl) {
    const res = await fetchImpl(baseUrl + '/api/plugin-categories', {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = await res.json()
    if (!body || !Array.isArray(body.categories)) return null
    return body.categories
      .filter((c) => c && (c.name || c.displayName))
      .map((c) => ({ id: c.id, name: c.name, displayName: c.displayName || c.name }))
  }

  async function refreshCatalog() {
    const now = Date.now()
    if (cache.entries.length && now - cache.at < TTL_MS) return cache
    try {
      const [entries, categories] = await Promise.all([
        fetchAllPlugins(fetch),
        fetchCategories(fetch),
      ])
      if (entries !== null && categories !== null) {
        cache = { at: now, entries, categories }
      } else if (entries !== null) {
        cache = { at: now, entries, categories: cache.categories }
      }
    } catch { /* 网络失败保留上次缓存 */ }
    return cache
  }

  // ── 已安装列表(host 侧轮询 pluginManager) ──
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
        if (timer && typeof timer.unref === 'function') timer.unref()
        return () => clearInterval(timer)
      }, 'dsh-featured: installed bundles watcher')
    })
  } catch { /* pluginManager 不可用 */ }

  // ── 聚合路由 ──
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
              const { entries, categories } = await refreshCatalog()
              json(res, 200, {
                ok: true,
                data: {
                  entries,
                  categories,
                  installed: installedMap,
                  baseUrl,
                },
              })
            } catch (err) {
              json(res, 200, { ok: false, error: String(err?.message || err) })
            }
          },
        })
      } catch { /* 路由已存在(另一接入方先注册) */ }
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    }, 'dsh-featured: featured route')
  })

  // ── 详情路由:透传 skillpie 详情(或由 aggregate 返回的 readme 直接内嵌) ──
  // 设计:详情(readme)已随列表一起返回(entry.readme),client 直接渲染,无需二次请求。
}
