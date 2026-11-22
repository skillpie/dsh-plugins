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
  const description = String(raw.description || '').trim()
  if (description) entry.description = description
  const version = String(raw.version || '').trim()
  if (version) entry.version = version
  const icon = String(raw.icon || '').trim()
  if (icon) entry.icon = icon
  const homepage = String(raw.homepage || '').trim()
  if (homepage) entry.homepage = homepage
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

    // ── 聚合路由(只读) ──
    // 多个插件接入时客户端只读这一个端点 → 页面上永远只有一块「精选插件」。
    const aggregate = () => {
      const seen = new Set()
      const entries = []
      for (const source of sources.values()) {
        for (const entry of source.entries) {
          if (seen.has(entry.package)) continue
          seen.add(entry.package)
          entries.push(entry)
        }
      }
      return { entries, sources: [...sources.values()].map((s) => ({ id: s.id, title: s.title, count: s.entries.length })) }
    }

    ctx.inject(['webServer'], (child) => {
      child.effect(() => child.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          try {
            if (!sameOrigin(req)) { json(res, 403, { ok: false, error: 'cross-origin request rejected' }); return }
            if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
            json(res, 200, { ok: true, data: aggregate() })
          } catch (err) {
            json(res, 200, { ok: false, error: String(err?.message || err) })
          }
        },
      }), 'dsh-plugins-plugin: featured route')
    })
  },
}
