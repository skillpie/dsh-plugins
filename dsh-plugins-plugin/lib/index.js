// dsh-plugins-plugin — host half.
//
// 职责:
//   1. 提供 cordis 服务 `featured-plugins`(推荐源注册表):接入插件通过
//      adapter(dsh-plugins-featured.js)调用 register(source) 登记自己的
//      精选插件推荐列表;服务由 ctx.provide 提供,插件停用时自动注销。
//   2. 挂载只读 HTTP 路由 GET /dsh-plugins-plugin/featured,把所有接入方
//      的推荐聚合去重(按 npm 包名,先登记者优先)后返回给客户端半。
//
// 接入方无须依赖本包:adapter 用 ctx.inject(['featured-plugins']) 在服务
// 出现时自动登记;dsh-plugins-plugin 未安装时注入永远 pending,静默无害。
export const ROUTE = '/dsh-plugins-plugin/featured'
export const SERVICE = 'featured-plugins'

/* ── 推荐源/条目规范化 ──────────────────────────────────────────────── */

// 单条推荐:package 必填(npm 包名),title 必填;其余可选。
// 富字段(author/stars/downloads/screenshots 等)由 scripts/enrich.mjs 在构建期
// 从 awesome-dsh-plugin 官方目录 join 进 plugins.json,这里原样放行。
function normalizeEntry(raw, sourceId) {
  if (!raw || typeof raw !== 'object') return null
  const pkg = String(raw.package || raw.name || '').trim()
  const title = String(raw.title || '').trim()
  if (!pkg || !title) return null
  const entry = {
    package: pkg,
    title,
    source: sourceId,
  }
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

/* ── apply ──────────────────────────────────────────────────────────── */

export default {
  name: 'dsh-plugins-plugin',
  inject: [],
  apply(ctx) {
    // ── 推荐源注册表(跨插件服务) ──
    // sources: id → normalized source;同一接入方重复登记以最后一次为准。
    const sources = new Map()
    const registry = {
      // 登记推荐源,返回注销函数(接入方放进自己的 effect 清理)。
      register(rawSource) {
        const source = normalizeSource(rawSource)
        sources.set(source.id, source)
        return () => {
          if (sources.get(source.id) === source) sources.delete(source.id)
        }
      },
      // 当前全部推荐源(规范化副本)。
      list() {
        return [...sources.values()]
      },
    }
    // provide 挂在当前 fiber 上:插件停用即注销,注入方自动感知。
    ctx.effect(() => ctx.provide(SERVICE, registry), 'dsh-plugins-plugin: registry service')

    // ── 集中目录(宿主侧拉取) ──
    // plugins.json 由仓库维护(enrich.mjs 富化后提交)。在宿主侧用 node fetch
    // 拉取并做 5 分钟内存缓存:绕开浏览器 HTTP 缓存与 CORS,数据始终新鲜。
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

    // ── 聚合路由(只读) ──
    // 多个插件接入时客户端只读这一个端点 → 页面上永远只有一块「精选插件」。
    // 数据 = 远程集中目录(主)+ 接入插件登记源(补充),按包名去重,先到者优先。
    // ── 已安装列表(host 侧轮询 pluginManager) ──
    // 客户端据此把已安装条目标成「✓ 已安装」。pluginManager 是 boot 服务,
    // 独立 inject 作用域:即使这里异常也不影响上面路由的注册。
    let installedMap = {}
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

    // 数据 = 远程集中目录(主)+ 接入插件登记源(补充),按包名去重,先到者优先;
    // 本地条目缺失的富字段(author/stars/downloads/screenshots/icon 等)用远程目录回填。
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
        // 本地登记源只有基础字段 → 富字段从远程目录回填(版本/标题/简介仍以本地优先)
        const rich = remoteIndex.get(normalized.package)
        if (rich && normalized.source !== 'plugins.json') {
          for (const key of RICH_KEYS) {
            if (normalized[key] === undefined && rich[key] !== undefined) normalized[key] = rich[key]
          }
        }
        entries.push(normalized)
      }
      for (const raw of remoteRaw) push(normalizeEntry(raw, 'plugins.json'))
      for (const source of sources.values()) {
        for (const entry of source.entries) push(entry)
      }
      return {
        entries,
        sources: [...sources.values()].map((s) => ({ id: s.id, title: s.title, count: s.entries.length })),
        installed: installedMap,
        remote: remoteCache.doc ? { fetchedAt: new Date(remoteCache.at).toISOString(), count: entries.length } : null,
      }
    }

    ctx.inject(['webServer'], (child) => {
      child.effect(() => child.webServer.register({
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
      }), 'dsh-plugins-plugin: featured route')
    })
  },
}
