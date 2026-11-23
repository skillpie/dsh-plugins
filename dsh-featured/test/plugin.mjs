// dsh-featured 宿主半冒烟:桩 ctx + 桩 webServer + 真实 http 服务器 + 桩 skillpie 公开接口。
// 不依赖 DSH 进程,`node test/plugin.mjs` 直接跑。
import assert from 'node:assert/strict'
import http from 'node:http'

const { apply, ROUTE } = await import('../lib/index.js')

/* ── 桩:ctx / effect 作用域 ── */
function makeCtx(services) {
  const effects = []
  const provided = new Map(Object.entries(services || {}))
  const ctx = {
    effect(fn, label) {
      const dispose = fn() || (() => {})
      effects.push({ label, dispose })
      return () => {}
    },
    inject(deps, cb) {
      const child = {
        effect: (fn, label) => ctx.effect(fn, label),
        get: (k) => provided.get(k),
      }
      for (const d of deps) child[d] = provided.get(d)
      const dispose = cb(child) || (() => {})
      effects.push({ label: 'inject:' + deps.join(','), dispose })
      return () => {}
    },
    get: (k) => provided.get(k),
    provide(k, v) {
      provided.set(k, v)
      return () => {}
    },
  }
  return { ctx, effects, provided }
}

/* ── 桩 webServer:把 register 的路由存表 ── */
const routes = []
const webServer = {
  register(options) {
    routes.push(options)
    return () => {
      const i = routes.indexOf(options)
      if (i >= 0) routes.splice(i, 1)
    }
  },
}

/* ── 桩 fetch:skillpie 公开接口 ── */
// 列表(第一页,hasNextPage=true)+ 分类。
const PLUGIN_PAGE_1 = {
  plugins: [
    { id: 'p1', name: 'dsh-a', title: '插件 A', version: '1.0.0', detail: 'A 的说明', tags: ['效率'], category: { id: 'c1', name: 'efficiency', displayName: '效率' } },
    { id: 'p2', name: 'dsh-b', title: '插件 B', version: '2.0.0', tags: ['数据'], readme: '## B 详情' },
  ],
  nextCursor: 'p2',
  hasNextPage: true,
}
const PLUGIN_PAGE_2 = {
  plugins: [
    { id: 'p2', name: 'dsh-b', title: '插件 B 重复' }, // 重复包名应去重
    { id: 'p3', name: 'dsh-c', title: '插件 C' },
  ],
  nextCursor: null,
  hasNextPage: false,
}
const CATEGORIES = {
  categories: [
    { id: 'c1', name: 'efficiency', displayName: '效率' },
    { id: 'c2', name: 'data', displayName: '数据' },
  ],
}
const realFetch = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  const u = String(url)
  if (u.includes('/api/plugin-categories')) {
    return new Response(JSON.stringify(CATEGORIES), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (u.match(/\/api\/plugins\/dsh-a$/)) {
    return __resp({ plugin: { id: 'p1', name: 'dsh-a', title: '插件 A', version: '1.0.0', readme: '# A 的完整 README', description: 'A 的说明' } })
  }
  if (u.match(/\/api\/plugins\/dsh-404$/)) {
    return new Response(JSON.stringify({ message: '插件不存在' }), { status: 404 })
  }
  if (u.includes('/api/plugins')) {
    return u.includes('cursor=') ? __resp(PLUGIN_PAGE_2) : __resp(PLUGIN_PAGE_1)
  }
  return realFetch(url, opts)
}
function __resp(obj) {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
}

/* ── 1. apply 能跑通 ── */
const { ctx } = makeCtx({ webServer })
apply(ctx)

assert.equal(routes.length, 2, '应注册聚合+详情两条路由')
assert.equal(routes[0].path, ROUTE)
assert.equal(routes[0].kind, 'exact')

/* ── 2. 真实 http 服务器:GET 聚合结果(分页拉全 + 去重) ── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const route = routes.find((r) => r.path === url.pathname)
  if (!route) { res.writeHead(404); res.end(); return }
  await route.handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

const res = await fetch(base + ROUTE)
assert.equal(res.status, 200)
const body = await res.json()
assert.equal(body.ok, true)
assert.equal(body.data.entries.length, 3, '跨页拉全 + 按包名去重后应有 3 条')
assert.deepEqual(body.data.entries.map((e) => e.package), ['dsh-a', 'dsh-b', 'dsh-c'])
assert.equal(body.data.entries[0].title, '插件 A', '去重保留第一条')
assert.equal(body.data.entries[0].categoryDisplayName, '效率', '分类展示名透传')
assert.equal(body.data.entries[1].readme, '## B 详情', 'readme 内嵌返回')
assert.equal(body.data.categories.length, 2, '分类返回')
assert.equal(body.data.baseUrl, 'https://skillpie.cn', '默认 baseUrl')

/* ── 3. 同源校验与方法限制 ── */
const cross = await new Promise((resolve, reject) => {
  const req = http.request(base + ROUTE, { headers: { origin: 'http://evil.example' } }, (r) => {
    r.resume()
    resolve({ status: r.statusCode })
  })
  req.on('error', reject)
  req.end()
})
assert.equal(cross.status, 403, '跨源应 403')

const bad = await new Promise((resolve, reject) => {
  const req = http.request(base + ROUTE, { method: 'POST', headers: { origin: base } }, (r) => {
    r.resume()
    resolve({ status: r.statusCode })
  })
  req.on('error', reject)
  req.end('{}')
})
assert.equal(bad.status, 405, '非 GET/HEAD 应 405')

/* ── 4. 详情路由:按需代理 + 缓存 ── */
assert.equal(routes.length, 2, '应注册聚合+详情两条路由')
const detailRoute = routes.find((r) => r.path === '/dsh-featured/detail')
assert.ok(detailRoute, '详情路由已注册')

const dServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const route = routes.find((r) => r.path === url.pathname)
  if (!route) { res.writeHead(404); res.end(); return }
  await route.handler(req, res)
})
await new Promise((resolve) => dServer.listen(0, '127.0.0.1', resolve))
const dBase = `http://127.0.0.1:${dServer.address().port}`

const d1 = await fetch(dBase + '/dsh-featured/detail?package=dsh-a')
assert.equal(d1.status, 200)
const d1Body = await d1.json()
assert.equal(d1Body.ok, true)
assert.equal(d1Body.data.entry.readme, '# A 的完整 README', '详情含 readme')

const dMiss = await fetch(dBase + '/dsh-featured/detail?package=dsh-404')
assert.equal(dMiss.status, 404, '上游 404 透传')

const dNoPkg = await fetch(dBase + '/dsh-featured/detail')
assert.equal(dNoPkg.status, 400, '缺 package 应 400')

dServer.close()

server.close()
globalThis.fetch = realFetch
console.log('test/plugin.mjs PASSED')
