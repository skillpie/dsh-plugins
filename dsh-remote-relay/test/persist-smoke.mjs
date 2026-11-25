/**
 * Persistence smoke test: 身份与开关状态的持久化语义（无 DSH，真实 http+ws）。
 *
 * 覆盖：
 *   1. 首次运行（记录确认不存在）→ 生成随机码并落库；默认不开。
 *   2. 属主 set-enabled true → 记录持久化 enabled:true，链路真实拨上中转桩。
 *   3. 「重启」（重新 apply，同一凭据存储）→ 自动恢复开启 + 远程码不变。
 *   4. set-enabled false → 重启后保持关闭，码不变。
 *   5. regenerate 动作 → 码变更并清 token；enabled 保持。
 *   6. 凭据读取持续失败 → 本次会话临时身份，绝不覆盖已存记录，不自动开启。
 *   7. 凭据读取瞬时故障后恢复（5s 轮询窗内）→ 正常采用存储身份并自动恢复。
 *
 * Run: node test/persist-smoke.mjs
 */
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket, { WebSocketServer } from 'ws'
import { HOST_UPGRADE_PATH } from '../lib/protocol.js'
import plugin from '../lib/index.js'

const logs = []
const log = (kind, text) => logs.push(`[${kind}] ${text}`)
const fail = (message) => {
  console.error('FAIL:', message)
  console.error(logs.join('\n'))
  process.exit(1)
}

/* ── stub relay: 只收 hello 的中转面（记录每次注册的码） ───────────────── */
const registrations = [] // 每次 hello 的 { code, hostId, token }
const relayHttp = http.createServer(() => {})
const relayWss = new WebSocketServer({ noServer: true })
relayHttp.on('upgrade', (req, socket, head) => {
  if (req.url?.split('?')[0] !== HOST_UPGRADE_PATH) { socket.destroy(); return }
  relayWss.handleUpgrade(req, socket, head, (raw) => {
    raw.on('message', (data) => {
      let frame
      try { frame = JSON.parse(String(data)) } catch { return }
      if (frame?.t !== 'hello') return
      registrations.push({ code: frame.code, hostId: frame.hostId, token: frame.token })
      raw.send(JSON.stringify({ t: 'hello', ok: true, token: 'minted-' + registrations.length }))
    })
    raw.on('error', () => {})
  })
})
await new Promise((resolve) => { relayHttp.listen(0, '127.0.0.1', resolve) })
const relayPort = relayHttp.address().port
const relayUrl = `http://127.0.0.1:${relayPort}` // RelayLink 会把 http: 翻成 ws:

/* ── stub credentials（语义按 @deepseek-ai/dsh-credentials） ───────────── */
function makeCredentialsStore() {
  const records = new Map()
  let failReadsUntil = 0
  return {
    records,
    failReadsFor(ms) { failReadsUntil = Date.now() + ms },
    async readRecord(key) {
      if (Date.now() < failReadsUntil) throw new Error('simulated transient credentials failure')
      return records.get(key)
    },
    async modifyRecord(key, mutator) {
      const next = await mutator(records.get(key))
      records.set(key, next)
      return next
    },
  }
}

/* ── stub webServer + ctx ──────────────────────────────────────────────── */
function makeWebServer() {
  const routes = new Map()
  const upgrades = new Map()
  return {
    routes,
    upgrades,
    register(route) {
      const key = route.kind === 'prefix' ? `prefix:${route.path}` : route.path
      if (routes.has(key)) throw new Error('duplicate route: ' + key)
      routes.set(key, route.handler)
      return () => routes.delete(key)
    },
    registerUpgrade(route) {
      if (upgrades.has(route.path)) throw new Error('duplicate upgrade: ' + route.path)
      upgrades.set(route.path, route.handler)
      return () => upgrades.delete(route.path)
    },
    getOrigin: () => `http://127.0.0.1:${relayPort}`,
  }
}

function makeCtx({ services }) {
  const effects = []
  const ctx = {
    get(key) { return services[key] },
    provide(key, value) {
      services[key] = value
      if (!(key in ctx)) Object.defineProperty(ctx, key, { get: () => services[key], configurable: true })
    },
    inject(deps, cb) {
      const missing = (deps ?? []).filter((d) => services[d] === undefined)
      if (missing.length) return // cordis 会等待未就绪服务；桩直接跳过
      cb(ctx)
    },
    effect(setup) {
      let dispose
      try { dispose = setup() } catch { return }
      if (typeof dispose === 'function') effects.push(dispose)
    },
  }
  // cordis 里服务以属性形式暴露（child.webServer）；桩用 getter 映射。
  for (const key of Object.keys(services)) {
    Object.defineProperty(ctx, key, { get: () => services[key], configurable: true })
  }
  return {
    ctx,
    dispose: () => {
      for (const dispose of effects.splice(0).reverse()) { try { dispose() } catch { /* best-effort */ } }
    },
  }
}

/* ── 一次「运行」：apply + 真 http API 面 ──────────────────────────────── */
let apiServer = undefined
async function run({ credentials, config }) {
  const services = { credentials, webServer: makeWebServer() }
  const { ctx, dispose } = makeCtx({ services })
  plugin.apply(ctx, config)
  const api = services.webServer.routes.get('/dsh-remote-relay/api')
  if (!api) {
    // boot() 异步挂载；凭据读取失败场景要等满 5s 轮询窗才走到挂载。
    for (let i = 0; i < 160 && !services.webServer.routes.get('/dsh-remote-relay/api'); i++) await delay(50)
  }
  const api2 = services.webServer.routes.get('/dsh-remote-relay/api')
  if (!api2) fail('owner API 未挂载')
  apiServer = http.createServer((req, res) => { void api2(req, res) })
  await new Promise((resolve) => { apiServer.listen(0, '127.0.0.1', resolve) })
  const base = `http://127.0.0.1:${apiServer.address().port}`
  const call = async (action, extra = {}) => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    return res.json()
  }
  return {
    dispose,
    call,
    status: async () => (await call('status')).status,
    close: async () => {
      dispose()
      await new Promise((resolve) => apiServer.close(resolve))
    },
  }
}

const identityPayload = (store) => store.records.get('dsh-remote-relay/identity')?.payload

/* ══ 1. 首次运行：生成并落库，默认关闭 ══════════════════════════════════ */
const store = makeCredentialsStore()
let run1 = await run({ credentials: store, config: { relayUrl } })
await delay(150)
let status = await run1.status()
if (status.enabled !== false) fail('首次运行应默认关闭')
if (!/^[1-9]\d{7}$/.test(status.code)) fail(`首次运行应生成 8 位码，got ${status.code}`)
const code1 = status.code
const payload1 = identityPayload(store)
if (payload1?.code !== code1 || !payload1?.hostId) fail(`首次运行应落库身份，got ${JSON.stringify(payload1)}`)
if (payload1.enabled !== false) fail(`首次运行落库 enabled 应为 false，got ${payload1.enabled}`)
log('test', `1. 首次运行：生成远程码 ${code1} 并落库，默认关闭`)

/* ══ 2. set-enabled true：持久化 + 真实拨上中转桩 ═══════════════════════ */
const opened = await run1.call('set-enabled', { value: true })
if (opened.ok !== true || opened.enabled !== true) fail(`set-enabled true 失败: ${JSON.stringify(opened)}`)
if (identityPayload(store)?.enabled !== true) fail('set-enabled true 未持久化到凭据记录')
// 等链路拨上中转桩并收到 hello
const firstHello = await Promise.race([
  (async () => { while (registrations.length === 0) await delay(50); return registrations[0] })(),
  delay(5000).then(() => null),
])
if (!firstHello) fail('开启后 5s 内中转桩未收到 hello 注册')
if (firstHello.code !== code1) fail(`hello 应带当前远程码 ${code1}，got ${firstHello.code}`)
status = await run1.status()
if (status.enabled !== true || status.relay?.connected !== true) {
  fail(`开启后链路应已连接，got enabled=${status.enabled} connected=${status.relay?.connected}`)
}
log('test', `2. set-enabled true：已持久化且链路真实连上中转（码 ${firstHello.code}）`)

/* ══ 3. 重启：自动恢复开启 + 码不变 ═════════════════════════════════════ */
await run1.close()
await delay(100)
const countAfterFirstBoot = registrations.length
const run2 = await run({ credentials: store, config: { relayUrl } })
status = await run2.status()
if (status.enabled !== true) fail('重启后未自动恢复开启状态')
if (status.code !== code1) fail(`重启后远程码变了：${code1} → ${status.code}（未手动 regenerate）`)
// 自动恢复应重新拨号（第二条 hello）
const secondHello = await Promise.race([
  (async () => { while (registrations.length < countAfterFirstBoot + 1) await delay(50); return registrations[countAfterFirstBoot] })(),
  delay(5000).then(() => null),
])
if (!secondHello) fail('重启自动恢复后 5s 内未重新注册中转')
if (secondHello.code !== code1) fail(`恢复注册的码应为 ${code1}，got ${secondHello.code}`)
log('test', `3. 重启：自动恢复开启（重新注册码 ${secondHello.code}），远程码未变更`)

/* ══ 4. set-enabled false：重启后保持关闭 ═══════════════════════════════ */
const closed = await run2.call('set-enabled', { value: false })
if (closed.ok !== true) fail(`set-enabled false 失败: ${JSON.stringify(closed)}`)
if (identityPayload(store)?.enabled !== false) fail('set-enabled false 未持久化')
await run2.close()
await delay(100)
const registrationsBefore = registrations.length
const run3 = await run({ credentials: store, config: { relayUrl } })
status = await run3.status()
if (status.enabled !== false) fail('停止后重启应保持关闭')
if (status.code !== code1) fail(`重启后远程码变了：${code1} → ${status.code}`)
await delay(300)
if (registrations.length !== registrationsBefore) fail('关闭状态下不应向中转注册')
log('test', `4. 停止后重启：保持关闭，码仍为 ${code1}`)

/* ══ 5. regenerate：只有这个动作允许换码 ════════════════════════════════ */
const regen = await run3.call('regenerate')
if (regen.ok !== true || !/^[1-9]\d{7}$/.test(regen.code ?? '')) fail(`regenerate 失败: ${JSON.stringify(regen)}`)
const code2 = regen.code
if (code2 === code1) fail('regenerate 应生成不同的码（概率事件请重跑）')
if (identityPayload(store)?.code !== code2) fail('regenerate 未把新码落库')
if (identityPayload(store)?.enabled !== false) fail('regenerate 不应改动开关状态')
log('test', `5. regenerate：${code1} → ${code2}，token 清空且 enabled 不变`)

/* ══ 6. 读取持续失败：临时身份，绝不覆盖存储，不自动开启 ═══════════════ */
store.failReadsFor(10_000) // 覆盖 boot 的 5s 轮询窗
const run4 = await run({ credentials: store, config: { relayUrl } })
status = await run4.status()
if (status.enabled !== false) fail('凭据读取失败时不应自动开启')
if (status.code === code2) fail('凭据读取失败时应使用临时身份（概率撞码请重跑）')
if (identityPayload(store)?.code !== code2) fail(`凭据读取失败绝不覆盖存储记录，got ${JSON.stringify(identityPayload(store))}`)
await run4.close()
await delay(10_050) // 让 failReadsUntil 过期
log('test', '6. 凭据持续读取失败：会话用临时身份，存储记录原样保留')

/* ══ 7. 瞬时故障后恢复（5s 轮询窗内）：正常采用存储身份并自动开启 ══════ */
// 先把存储状态拨回开启
store.failReadsUntil = 0
const run5 = await run({ credentials: store, config: { relayUrl } })
await run5.call('set-enabled', { value: true })
if (identityPayload(store)?.code !== code2 || identityPayload(store)?.enabled !== true) {
  fail(`第 7 场景前置状态不对: ${JSON.stringify(identityPayload(store))}`)
}
await run5.close()
await delay(100)
store.failReadsFor(700) // 瞬时故障 < 5s 轮询窗
const run6 = await run({ credentials: store, config: { relayUrl } })
status = await run6.status()
if (status.enabled !== true) fail('瞬时故障恢复后应自动恢复开启')
if (status.code !== code2) fail(`瞬时故障恢复后远程码变了：${code2} → ${status.code}`)
if (identityPayload(store)?.code !== code2) fail('瞬时故障恢复不得覆盖存储记录')
await run6.close()

relayHttp.close()
relayWss.close()
console.log('PERSIST SMOKE OK — all checks passed')
console.log(logs.map((l) => '  ' + l).join('\n'))
process.exit(0)
