// dsh-plugins-plugin 嵌入模块冒烟:桩 cordis ctx + 桩 webServer + 真实 http 服务器。
// 覆盖:宿主路径(provide/路由/聚合)、非宿主路径(只登记)、
// client 嵌入模块的占位符与全局判重守卫。
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const host = await import(new URL('../embed/featured.host.js', import.meta.url).href)

/* ── 桩 cordis ctx(共享一张服务表 + 一个路由表) ───────────────────── */
const services = new Map()
const routes = new Map()

function makeCtx(webServer) {
  const ctx = {
    provide(name, value) {
      if (services.has(name)) throw new Error('duplicate provide: ' + name)
      services.set(name, value)
    },
    get(name) { return services.get(name) },
    effects: [],
    effect(fn, label) {
      const dispose = fn()
      ctx.effects.push({ dispose, label: String(label || '') })
    },
    inject(names, cb, label) {
      const child = { ...ctx, ...Object.fromEntries(services) }
      if (webServer) child.webServer = webServer
      const dispose = cb(child)
      ctx.effects.push({ dispose, label: 'inject:' + String(label || '') })
      return dispose
    },
  }
  return ctx
}

const webServerStub = {
  register(spec) {
    if (routes.has(spec.path)) throw new Error('route already registered: ' + spec.path)
    routes.set(spec.path, spec)
    return () => routes.delete(spec.path)
  },
}

/* ── 1. 宿主路径:第一个接入方 provide 服务 + 注册路由 ──────────────── */
const ownerCtx = makeCtx(webServerStub)
const offSrc = host.integrateFeaturedPlugins(ownerCtx, {
  id: 'dsh-tokenbank', title: 'TokenBank',
  entries: [{ package: 'dsh-a', title: 'A', version: '1.0.0' }],
})
assert.equal(typeof offSrc, 'undefined', '嵌入入口无返回值')
const registry = services.get(host.SERVICE)
assert.ok(registry, '宿主路径应 provide featured-plugins 服务')
assert.ok(routes.has(host.ROUTE), '宿主路径应注册聚合路由')
assert.equal(registry.list().length, 1, '推荐源应登记')
const dispatch = (req, res) => {
  const spec = routes.get(new URL(req.url, 'http://x').pathname)
  if (spec) return spec.handler(req, res)
  res.writeHead(404).end()
}
const server = createServer((req, res) => dispatch(req, res))
console.log('✓ 宿主路径:服务 + 路由 + 推荐源')

/* ── 2. 非宿主路径:第二个接入方只登记,不重复 provide/路由 ──────────── */
const followerCtx = makeCtx(webServerStub) // 同一张服务表 → get 到已有 registry
host.integrateFeaturedPlugins(followerCtx, { id: 'dsh-webkit', entries: [{ package: 'dsh-b', title: 'B' }] })
assert.deepEqual([...routes.keys()], [host.ROUTE], '宿主只注册聚合数据路由(不再有 client 分发路由)')
assert.equal(registry.list().length, 2, '非宿主推荐源应登记进同一服务')
console.log('✓ 非宿主路径:只登记推荐源')

/* ── 3. 聚合路由(真实 http):去重/富字段回填/405/403 ───────────────── */

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

// 405/403 先测(用未打桩的真实 fetch,避免桩顺序污染结论)
const res405 = await fetch(`${base}${host.ROUTE}`, { method: 'POST' })
assert.equal(res405.status, 405)
const res403 = await fetch(`${base}${host.ROUTE}`, { headers: { origin: 'http://evil.example' } })
assert.equal(res403.status, 403)

// 桩远程目录:plugins.json 一律 reject(离线),验证退化为本地聚合不炸
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (String(url).includes('plugins.json')) throw new Error('offline')
  return realFetch(url, init)
}

const res = await fetch(`${base}${host.ROUTE}`)
const body = await res.json()
assert.equal(res.status, 200)
assert.ok(body.ok)
assert.deepEqual(body.data.entries.map((e) => e.package), ['dsh-a', 'dsh-b'], '按包名聚合去重')
assert.equal(body.data.entries[0].version, '1.0.0')
assert.deepEqual(body.data.sources.map((s) => s.id), ['dsh-tokenbank', 'dsh-webkit'])
assert.deepEqual(body.data.installed, {}, 'pluginManager 桩缺失时 installed 为空表')

// client 嵌入模块:作为包本地 chunk 由 owner 的 apply 经 require.async 加载,
// 不经宿主路由分发。旧 /client.js 分发路由已移除 → 命中 404 兜底。
const resJs = await fetch(`${base}${host.ROUTE}/client.js`)
assert.equal(resJs.status, 404, 'client 分发路由已移除(改为内联进接入插件)')
server.close()
globalThis.fetch = realFetch
console.log('✓ HTTP 聚合路由:去重/405/403;client 分发路由已移除')

/* ── 4. client 内联片段静态检查(注入 factory 而非运行时 chunk)───────── */
const clientEmbed = readFileSync(new URL('../embed/featured.client.js', import.meta.url), 'utf8')
const bodyStart = clientEmbed.indexOf('__FEATURED_INLINE_BODY_START__')
const bodyEnd = clientEmbed.indexOf('__FEATURED_INLINE_BODY_END__')
assert.ok(bodyStart > 0 && bodyEnd > bodyStart, '应带 __FEATURED_INLINE_BODY_START__/END__ 标记')
const fragment = clientEmbed
  .slice(clientEmbed.indexOf('\n', bodyStart), bodyEnd)
  .split('\n')
  .filter((l) => !l.includes('__FEATURED_INLINE_BODY_START__') && !l.includes('__FEATURED_INLINE_BODY_END__'))
  .join('\n')
assert.ok(!clientEmbed.includes("chunk: 'client.featured.js'"), '不应再依赖包本地 chunk(桌面端 bundle 404)')
assert.ok(!clientEmbed.includes('__ModuleLoader__.load'), '不应再运行时注册新模块 id(不建 fiber)')
assert.ok(fragment.includes('function initFeatured(ctx)'), '应导出 initFeatured(ctx) 注册函数')
assert.ok(fragment.includes('window.__DSH_FEATURED_APPLIED__'), '应用内判重守卫,多插件接入只渲染一块')
assert.ok(fragment.includes("'plugins.tab'"), '应注册 plugins.tab 槽')
assert.ok(fragment.includes("require('react')"), '片段必须在 factory 作用域内,直接 require react')
// 片段自身语法:包一层函数体即可检查(它就是要被注入 factory 的)
new Function('require', 'window', fragment)
console.log('✓ client 内联片段:标记/无 chunk 依赖/initFeatured/判重守卫/槽注册/语法')

console.log('\n全部嵌入冒烟通过 ✅')
