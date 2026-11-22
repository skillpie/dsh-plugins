// dsh-plugins-plugin 冒烟测试:桩 cordis ctx + 桩 webServer + 真实 http 服务器。
// 覆盖:registry 登记/覆盖/注销、聚合去重、路由 GET/405/sameOrigin、adapter 注入行为。
import { createServer } from 'node:http'
import assert from 'node:assert/strict'

const mod = await import(new URL('../lib/index.js', import.meta.url).href)
const adapter = await import(new URL('../adapter/dsh-plugins-featured.js', import.meta.url).href)

/* ── 桩 cordis ctx ─────────────────────────────────────────────────── */
function makeCtx() {
  const services = new Map()
  // pluginManager 服务桩:官方 boot 服务,apply 会 inject 它轮询已安装列表
  services.set('pluginManager', {
    async listBundles() {
      return [
        { name: 'dsh-a', installed: true, version: '1.0.0' },
        { name: 'dsh-x', installed: false },
        { name: 'dsh-remote', installed: true, version: '0.2.0' },
      ]
    },
  })
  const ctx = {
    provided: null,
    provide(name, value) {
      if (services.has(name)) throw new Error('duplicate provide: ' + name)
      services.set(name, value)
      ctx.provided = name
    },
    get(name) { return services.get(name) },
    effects: [],
    effect(fn, label) {
      const dispose = fn()
      ctx.effects.push({ fn, dispose, label: String(label || '') })
      return dispose
    },
    inject(names, cb, label) {
      // 立即解析(测试中所有依赖已就位);child 以属性形式携带服务
      const child = { ...ctx, ...Object.fromEntries(services) }
      ctx.effects.push({ dispose: cb(child), label: 'inject:' + String(label || '') })
    },
  }
  return ctx
}

/* ── 1. host apply:registry + 路由注册 ────────────────────────────── */
const ctx = makeCtx()
const routes = new Map()
ctx.inject = ((orig) => function (names, cb, label) {
  if (names.includes('webServer')) {
    const child = {
      ...ctx,
      webServer: { register(spec) { routes.set(spec.path, spec) } },
    }
    ctx.effects.push({ dispose: cb(child), label: 'inject:' + String(label || '') })
    return
  }
  return orig.call(ctx, names, cb, label)
})(ctx.inject)

mod.default.apply(ctx)
assert.equal(ctx.provided, 'featured-plugins', '应 provide featured-plugins 服务')
assert.ok(routes.has(mod.ROUTE), '应注册聚合路由')
const handler = routes.get(mod.ROUTE).handler
console.log('✓ registry 服务与路由已注册')

const svc = ctx.get('featured-plugins')
assert.equal(svc.list().length, 0, '初始无推荐源')

/* ── 2. 登记 / 覆盖 / 注销 ─────────────────────────────────────────── */
const off1 = svc.register({
  id: 'dsh-tokenbank', title: '令牌银行',
  entries: [
    { package: 'dsh-a', title: 'A', version: '1.0.0', tags: ['x', 2, ' ', 'y', 'z', 'w', 'v', 'u', 't', 's'] },
    { package: 'dsh-b', title: 'B', description: 'b' },
    { package: '', title: '无包名' }, // 应被丢弃
  ],
})
assert.equal(svc.list().length, 1)
assert.equal(svc.list()[0].entries.length, 2, '无效条目应被丢弃')
assert.equal(svc.list()[0].entries[0].tags.length, 8, 'tags 应截断到 8')

// adapter 集成行为:inject + effect 登记,dispose 注销
const ctx2 = makeCtx()
ctx2.provide('featured-plugins', svc) // 模拟宿主中服务已由 dsh-plugins-plugin 提供
adapter.integrateFeaturedPlugins(ctx2, { id: 'dsh-x', title: 'X', entries: [{ package: 'dsh-c', title: 'C' }] })
assert.equal(svc.list().length, 2, 'adapter 应登记成功')
const adapterEffect = ctx2.effects.find((e) => String(e.label).startsWith('featured-plugins source:'))
assert.ok(adapterEffect, 'adapter 应在子上下文挂登记 effect')
adapterEffect.dispose() // 注销 → 移除 dsh-x
assert.equal(svc.list().length, 1, 'adapter 注销后应移除 dsh-x')

// 同 id 覆盖
const offOld = svc.register({ id: 'dsh-tokenbank', title: 'v1', entries: [{ package: 'dsh-old', title: 'old' }] })
const offNew = svc.register({ id: 'dsh-tokenbank', title: 'v2', entries: [{ package: 'dsh-new', title: 'new' }] })
offOld()
assert.equal(svc.list()[0].title, 'v2', '旧注销不应移除新登记')
offNew()
assert.equal(svc.list().length, 0, '新注销应移除')
off1()
console.log('✓ 登记/覆盖/注销/adapter 行为正确')

/* ── 3. 真实 http 服务器跑路由 ─────────────────────────────────────── */
// 桩掉 globalThis.fetch:远程目录返回固定 fixture(测试离线、确定性);
// 其余 URL 一律拒绝。
const realFetch = globalThis.fetch
const REMOTE_FIXTURE = {
  entries: [
    { package: 'dsh-remote', title: 'Remote', author: 'octo', stars: 5, downloads: 9900, screenshots: ['https://example.com/s.png'] },
    { package: 'dsh-a', title: 'Remote A(重复包名以远程目录优先)', version: '0.0.1' },
  ],
}
globalThis.fetch = (url, ...rest) => {
  if (String(url).includes('plugins.json')) {
    return Promise.resolve(new Response(JSON.stringify(REMOTE_FIXTURE), { status: 200, headers: { 'content-type': 'application/json' } }))
  }
  return realFetch(url, ...rest) // 本地 http 服务器照常走真实 fetch
}

svc.register({
  id: 'src1', title: '来源一',
  entries: [{ package: 'dsh-a', title: 'A', version: '1.0.0' }, { package: 'dsh-b', title: 'B' }],
})
svc.register({
  id: 'src2', title: '来源二',
  entries: [{ package: 'dsh-a', title: 'A2', version: '9.9.9' }, { package: 'dsh-c', title: 'C' }],
})

const server = createServer((req, res) => handler(req, res))
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

// GET 聚合:远程目录优先(富化字段原样放行),本地登记源按包名去重补充
const res = await fetch(`${base}${mod.ROUTE}`)
const body = await res.json()
assert.equal(res.status, 200)
assert.ok(body.ok)
assert.deepEqual(body.data.entries.map((e) => e.package), ['dsh-remote', 'dsh-a', 'dsh-b', 'dsh-c'], '远程目录在前,本地登记源按包名去重且先登记优先')
const remoteEntry = body.data.entries[0]
assert.equal(remoteEntry.author, 'octo', '富化字段 author 应放行')
assert.equal(remoteEntry.stars, 5, '富化字段 stars 应放行')
assert.equal(remoteEntry.downloads, 9900, '富化字段 downloads 应放行')
assert.deepEqual(remoteEntry.screenshots, ['https://example.com/s.png'], 'screenshots 应放行')
assert.equal(body.data.entries[1].version, '0.0.1', '重复包名以远程目录优先(本地 1.0.0 不覆盖远程)')
assert.equal(body.data.entries[1].source, 'plugins.json')
assert.deepEqual(body.data.sources.map((s) => s.id), ['src1', 'src2'])
assert.ok(body.data.remote, '成功拉取远程时应带 remote 元信息')
assert.deepEqual(body.data.installed, { 'dsh-a': '1.0.0', 'dsh-remote': '0.2.0' }, 'installed 表只含 installed=true 的 bundle')

// 405
const res405 = await fetch(`${base}${mod.ROUTE}`, { method: 'POST' })
assert.equal(res405.status, 405)

// 跨域 403
const res403 = await fetch(`${base}${mod.ROUTE}`, { headers: { origin: 'http://evil.example' } })
assert.equal(res403.status, 403)

// 同域带 Origin 放行
const resOk = await fetch(`${base}${mod.ROUTE}`, { headers: { origin: base } })
assert.equal(resOk.status, 200)

server.close()
console.log('✓ HTTP 路由:聚合去重/405/403/同源放行 全部通过')

// 异常源登记应抛清晰错误
assert.throws(() => svc.register({ title: '无 id' }), /id/)
assert.throws(() => svc.register(null), /object/)
console.log('✓ 非法源参数报错正确')

console.log('\n全部冒烟通过 ✅')
