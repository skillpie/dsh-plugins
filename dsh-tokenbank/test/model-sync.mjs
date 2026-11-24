// 点击模型选择器按需同步模型的冒烟:桩 React/document/fetch/remote,
// 验证 ① 捕获阶段监听的注册与释放 ② 点击触发 status→gateway-models→credentials.set→settings.mutate
// ③ 5 分钟节流 ④ 与已存 profile 一致时跳过 settings 写入 ⑤ 非模型触发器/未登录不动作 ⑥ revision 来自数组形 namespaces。
import fs from 'node:fs'
import assert from 'node:assert'

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const React = new Proxy({}, { get: (t, k) => {
  if (k === 'createElement') return (type, props, ...ch) => ({ type, props, children: ch })
  if (k === 'useState') return (v) => [typeof v === 'function' ? v() : v, () => {}]
  if (k === 'useRef') return (v) => ({ current: v })
  return typeof k === 'string' && /^use/.test(k) ? (f) => (typeof f === 'function' ? f() : f) : () => {}
} })

/* ── document 桩:记录 click 监听器 ── */
const listeners = [] // { type, fn, capture }
const document = {
  head: { appendChild() {}, removeChild() {} },
  createElement: () => ({ textContent: '', parentNode: null }),
  addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }) },
  removeEventListener(type, fn, capture) {
    const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture)
    if (i >= 0) listeners.splice(i, 1)
  },
}
globalThis.document = document

/* ── 时钟桩 ── */
let now = 1_000_000
Date.now = () => now

/* ── fetch 桩:记录 action 序列 ── */
const calls = []
const profile = { displayName: 'TokenBank', apiKeyEnv: 'TOKENBANK_API_KEY', api: 'openai-completions', baseURL: 'https://gw', models: [{ id: 'glm-4' }] }
let loggedIn = true
let storedProvider = undefined // describe 返回的 providers.tokenbank
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body)
  calls.push(body.action)
  const reply = (payload) => ({ json: async () => Object.assign({ ok: true }, payload) })
  if (body.action === 'status') return reply({ loggedIn, accessKey: loggedIn ? 'key-1' : undefined, baseURL: 'https://gw', portalUrl: 'https://p' })
  if (body.action === 'gateway-models') return reply({ models: [{ id: 'glm-4', input: ['text'] }], protocol: 'openai-completions' })
  throw new Error('unexpected action ' + body.action)
}

/* ── remote 桩:settings.describe 的 namespaces 是数组(与运行时 typert 契约一致) ── */
const remote = {
  credentials: { set: async (ref, value) => { calls.push('credentials.set:' + ref + '=' + value) } },
  settings: {
    describe: async () => ({ writable: true, namespaces: [{ ns: 'llm-deepseek', value: {}, revision: 3 }, { ns: 'llm-pi-ai', value: { providers: storedProvider ? { tokenbank: storedProvider } : {} }, revision: 7 }] }),
    mutate: async (ns, ops, expectedRevision) => { calls.push('settings.mutate:' + ns + ':' + ops[0].path.join('/') + '@' + expectedRevision) },
  },
}

const effects = []
const components = {} // 槽 id → 组件函数(桩 React 下直接调用即可跑 mount effect)
const ctx = {
  locale: { register: () => {}, bind: () => (k) => k },
  slots: { inject(n, fn) { fn() }, register(desc, Comp) { components[desc.id] = Comp } },
  remote, effect(f) { effects.push(f) },
}
let out
globalThis.window = { __ModuleLoader__: { load(m) { out = m.factory((n) => ({ react: React, 'react-dom': { createPortal: () => {} } })[n] || {}) } } }
// eslint-disable-next-line no-eval
eval(code)
out.apply(ctx)

const tick = () => new Promise((r) => setImmediate(r))
const drain = async () => { for (let i = 0; i < 12; i++) await tick() }
const clickListener = () => listeners.find((l) => l.type === 'click' && l.capture === true)
const fire = (ariaLabel) => clickListener().fn({ target: { closest: (sel) => (sel === 'button[aria-haspopup="menu"]' ? { getAttribute: () => ariaLabel } : null) } })

/* ① 注册捕获阶段监听 */
assert(clickListener(), 'apply 应在 document 上注册捕获阶段 click 监听')
assert(!listeners.some((l) => l.type === 'click' && !l.capture), '不应注册冒泡阶段监听')

/* 非模型触发器不动作 */
fire('打开账号菜单')
await drain()
assert.deepEqual(calls, [], '非模型选择器的 menu 按钮不应触发同步')

/* ⑤ 未登录(本地 tbStore.loggedIn 非 true):一个请求都不发 */
fire('选择模型，当前 GLM-4')
await drain()
assert.deepEqual(calls, [], '未登录态点击模型选择器不应发出任何请求')
// 模拟 ComposerEntry 挂载:status → tbStore.loggedIn = true
components['dsh-tokenbank-entry']()
await drain()
assert.deepEqual(calls, ['status'], '挂载只应查一次 status')
calls.length = 0

/* ② 点击 → 完整链路;⑥ revision 取自数组里 ns=llm-pi-ai 的视图 */
fire('选择模型，当前 GLM-4')
await drain()
assert.deepEqual(calls, [
  'status', 'gateway-models', 'credentials.set:TOKENBANK_API_KEY=key-1', 'settings.mutate:llm-pi-ai:providers/tokenbank@7',
], '点击应触发 status→gateway-models→credentials.set→settings.mutate,且 expectedRevision=7')

/* ③ 5 分钟节流:窗口内再点不动作 */
calls.length = 0
now += 4 * 60 * 1000
fire('Select model, current GLM-4')
await drain()
assert.deepEqual(calls, [], '距上次同步不足 5 分钟不应再请求')

/* ④ 窗口过后再点,但已存 profile 与将写入的一致 → 不写 settings(credentials 仍写,读路径不回传明文无法 diff) */
now += 2 * 60 * 1000
storedProvider = { displayName: 'TokenBank', apiKeyEnv: 'TOKENBANK_API_KEY', api: 'openai-completions', baseURL: 'https://gw', models: [{ id: 'glm-4', input: ['text'] }] }
calls.length = 0
fire('Select model, current GLM-4')
await drain()
assert.deepEqual(calls, ['status', 'gateway-models', 'credentials.set:TOKENBANK_API_KEY=key-1'], 'profile 未变化时应跳过 settings.mutate')

/* profile 变化(模型多了)→ 重新写入 */
now += 10 * 60 * 1000
storedProvider = { ...profile, models: [{ id: 'glm-4' }] }
calls.length = 0
fire('正在加载模型…')
await drain()
assert(calls.includes('settings.mutate:llm-pi-ai:providers/tokenbank@7'), '模型列表变化后应重新写入 provider')

/* 服务端已登出但本地仍认为登录:status 无 accessKey → 不拉网关、不写 */
now += 10 * 60 * 1000
loggedIn = false
calls.length = 0
fire('Loading models…')
await drain()
assert.deepEqual(calls, ['status'], '服务端未登录时只查一次 status 即止')

/* ① dispose 释放监听 */
for (const d of effects.map((f) => f()).filter((x) => typeof x === 'function')) d()
assert(!clickListener(), 'dispose 后应移除 click 监听')
console.log('dsh-tokenbank model-sync: OK')
