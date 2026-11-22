// dsh-featured 宿主半冒烟:桩 ctx + 桩 webServer + 真实 http 服务器。
// 不依赖 DSH 进程,`node test/plugin.mjs` 直接跑。
import assert from 'node:assert/strict'
import http from 'node:http'

const { apply, ROUTE, SERVICE } = await import('../lib/index.js')

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

/* ── 桩 fetch:远程目录 ── */
const REMOTE_FIXTURE = {
  updated: '2026-11-23T00:00:00Z',
  entries: [
    { package: 'dsh-a', title: '插件 A', version: '1.0.0', description: 'A 的说明', tags: ['效率'] },
    { package: 'dsh-b', title: '插件 B', version: '2.0.0', tags: ['数据'] },
    { package: 'dsh-a', title: '重复条目应被去重' },
  ],
}
const realFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('plugins.json')) {
    return new Response(JSON.stringify(REMOTE_FIXTURE), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return realFetch(url)
}

/* ── 1. apply 能跑通,提供 registry + 路由 ── */
const { ctx, provided } = makeCtx({ webServer })
apply(ctx)

assert.ok(provided.has(SERVICE), '应提供 featured-plugins 服务')
assert.equal(routes.length, 1, '应注册一条聚合路由')
assert.equal(routes[0].path, ROUTE)
assert.equal(routes[0].kind, 'exact')

/* ── 2. 真实 http 服务器:GET 聚合结果 ── */
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
assert.equal(body.data.entries.length, 2, '按包名去重后应有 2 条')
assert.deepEqual(body.data.entries.map((e) => e.package), ['dsh-a', 'dsh-b'])
assert.equal(body.data.entries[0].title, '插件 A', '去重保留第一条')
assert.ok(Array.isArray(body.data.sources))

/* ── 3. 同源校验与方法限制 ── */
// node fetch 的 Origin 是禁止头,会被静默丢弃 → 用 http.request 显式发。
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

/* ── 4. 登记源参与聚合(接入插件内联版登记自己的推荐) ── */
const registry = provided.get(SERVICE)
const unregister = registry.register({
  id: 'dsh-some-plugin',
  title: '某个接入插件',
  entries: [{ package: 'dsh-local', title: '本地推荐' }],
})
const res2 = await fetch(base + ROUTE)
const body2 = await res2.json()
assert.equal(body2.data.entries.length, 3, '登记源应补充一条')
assert.ok(body2.data.entries.some((e) => e.package === 'dsh-local'))
assert.ok(body2.data.sources.some((s) => s.id === 'dsh-some-plugin'))
unregister()

const res3 = await fetch(base + ROUTE)
const body3 = await res3.json()
assert.equal(body3.data.entries.length, 2, '注销后回到远程目录的 2 条')

/* ── 5. 第二个 apply 不重复提供 registry,但也能用 ── */
const second = makeCtx({ webServer, [SERVICE]: registry })
const before = provided.get(SERVICE)
apply(second.ctx)
assert.equal(provided.get(SERVICE), before, '服务已存在时应复用')

server.close()
globalThis.fetch = realFetch
console.log('test/plugin.mjs PASSED')
