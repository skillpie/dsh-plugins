/**
 * dsh-termbar 冒烟测试（不依赖 DSH 进程）。
 *
 * 桩：webServer（register/registerUpgrade 存表）+ subprocess（假 PTY：echo 回显），
 * 真实：http 服务器 + ws WebSocket 客户端。覆盖：
 *   - API GET/POST（create/close/rename/unknown）、vendor 静态资源；
 *   - WS：hello → created 广播 → attach → attached(buffer) → input 二进制回显
 *         → resize → ping/pong → renamed → exit → 跨源 upgrade 拒绝 → dispose 清理。
 *
 * 帧判别：ws 库对 text/binary 帧都回调 Buffer，这里以「文本是否以 '{' 开头且可
 * JSON.parse 出带 t 字段的对象」区分控制帧与 PTY 输出（桩的回显以 '[echo]' 开头）。
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { Readable } from 'node:stream'
import { WebSocket } from 'ws'
import plugin from '../lib/index.js'

const API_PATH = '/dsh-termbar/api'
const WS_PATH = '/dsh-termbar/ws'

/* ── 桩：webServer ─────────────────────────────────────────────────── */

const routes = new Map() // `${kind}:${path}` → handler
const upgradeHandlers = new Map() // path → handler
const webServerStub = {
  register({ kind, path, handler }) {
    const key = `${kind}:${path}`
    if (routes.has(key)) throw new Error(`duplicate route ${key}`)
    routes.set(key, handler)
    return () => routes.delete(key)
  },
  registerUpgrade({ path, handler }) {
    if (upgradeHandlers.has(path)) throw new Error(`duplicate upgrade ${path}`)
    upgradeHandlers.set(path, handler)
    return () => upgradeHandlers.delete(path)
  },
}

/* ── 桩：subprocess（假 PTY） ──────────────────────────────────────── */

const fakePties = []
let nextPid = 42000

function makeFakeSubprocess() {
  return {
    async terminalEnvironment() {
      return { platform: 'posix', defaultShell: '/bin/zsh' }
    },
    async spawnTerminal(spec) {
      const output = new Readable({ read() {} })
      let terminated = false
      let settleDone
      const done = new Promise((resolve) => { settleDone = resolve })
      const handle = {
        pid: ++nextPid,
        output,
        done,
        get terminated() { return terminated },
        async write(data) {
          if (terminated) return
          output.push(Buffer.from(`[echo] ${data}`, 'utf8'))
        },
        async resize() { /* 桩：尺寸断言走引擎侧会话表 */ },
        async signalForeground(signal) {
          // 桩：SIGHUP 视为 shell 干净退出（对齐真实交互 shell 行为），其余信号无效返回 0。
          if (signal !== 'SIGHUP' || terminated) return 0
          terminated = true
          output.push(null)
          settleDone({ exitCode: 0, signal: null })
          return 1
        },
        async terminate() {
          if (terminated) return
          terminated = true
          output.push(null)
          settleDone({ exitCode: 0, signal: null })
        },
      }
      output.push(Buffer.from('welcome-to-termbar\n', 'utf8'))
      fakePties.push({ handle, spec })
      return handle
    },
  }
}

/* ── 桩：cordis ctx ────────────────────────────────────────────────── */

const teardowns = []
const subprocessStub = makeFakeSubprocess()
const ctxStub = {
  inject(_deps, callback) {
    callback({
      get(name) {
        if (name === 'webServer') return webServerStub
        if (name === 'subprocess') return subprocessStub
        throw new Error(`unexpected service ${name}`)
      },
    })
  },
  effect(factory) {
    const dispose = factory()
    if (typeof dispose === 'function') teardowns.push(dispose)
  },
}

/* ── 真实 http + upgrade 分发 ──────────────────────────────────────── */

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  const exact = routes.get(`exact:${pathname}`)
  if (exact) return exact(req, res)
  for (const [key, handler] of routes) {
    if (!key.startsWith('prefix:')) continue
    const prefix = key.slice('prefix:'.length)
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return handler(req, res)
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('no route')
})
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  const handler = upgradeHandlers.get(pathname)
  if (handler) handler(req, socket, head)
  else socket.destroy()
})

const baseUrl = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
})

const api = async (method, body) => {
  const res = await fetch(`${baseUrl}${API_PATH}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/* 控制帧等待器：文本以 '{' 开头、可解析、带 t 字段且满足谓词。 */
function waitFrame(socket, label, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting frame ${label}`)), timeoutMs)
    const onData = (data) => {
      let frame = null
      try {
        const text = Buffer.from(data).toString('utf8')
        if (!text.startsWith('{')) return
        frame = JSON.parse(text)
      } catch { return }
      if (frame && typeof frame.t === 'string' && predicate(frame)) {
        clearTimeout(timer)
        socket.off('message', onData)
        resolve(frame)
      }
    }
    socket.on('message', onData)
  })
}

/* PTY 输出帧等待器：outb 文本帧（base64 chunk）或原始二进制（直连兼容）。 */
function waitOutput(socket, sid, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting output frame')), timeoutMs)
    const onData = (data) => {
      const text = Buffer.from(data).toString('utf8')
      let decoded = null
      if (text.startsWith('{')) {
        try {
          const frame = JSON.parse(text)
          if (frame.t === 'outb' && frame.id === sid && typeof frame.chunk === 'string') decoded = Buffer.from(frame.chunk, 'base64')
        } catch { return }
      } else {
        decoded = Buffer.from(data)
      }
      if (decoded !== null) {
        clearTimeout(timer)
        socket.off('message', onData)
        resolve(decoded)
      }
    }
    socket.on('message', onData)
  })
}

/* ── 激活插件 ──────────────────────────────────────────────────────── */

plugin.apply(ctxStub, { scrollbackKB: 256 })

let failures = 0
const check = (label, fn) =>
  Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ok  ${label}`) })
    .catch((error) => { failures += 1; console.error(`FAIL  ${label}: ${error?.stack ?? error}`) })

/* 1. GET 状态（空会话表）。 */
await check('GET /api → {ok:true, sessions:[]}', async () => {
  const result = await api('GET')
  assert.equal(result.status, 200)
  assert.equal(result.json.ok, true)
  assert.deepEqual(result.json.sessions, [])
})

/* 2. vendor 静态资源（与 index.js VENDOR_FILES 三路由一致）。 */
for (const [route, mime] of [
  ['/dsh-termbar/vendor/xterm.js', 'text/javascript'],
  ['/dsh-termbar/vendor/addon-fit.js', 'text/javascript'],
  ['/dsh-termbar/vendor/xterm.css', 'text/css'],
]) {
  await check(`GET ${route} → 200 ${mime}`, async () => {
    const res = await fetch(`${baseUrl}${route}`)
    assert.equal(res.status, 200)
    assert.ok((res.headers.get('content-type') ?? '').startsWith(mime), `content-type=${res.headers.get('content-type')}`)
    const declared = Number(res.headers.get('content-length'))
    const body = Buffer.from(await res.arrayBuffer())
    assert.ok(body.length > 0 && body.length === declared, `bytes ${body.length} vs declared ${declared}`)
  })
}

/* 3. POST create。 */
let sessionId
await check('POST create → session{id,title,pid,cols,rows}', async () => {
  const result = await api('POST', { action: 'create', cols: 100, rows: 24 })
  assert.equal(result.status, 200)
  assert.equal(result.json.ok, true)
  assert.match(result.json.session.id, /^term-/)
  assert.ok(Number.isInteger(result.json.session.pid) && result.json.session.pid > 42000)
  assert.equal(result.json.session.cols, 100)
  assert.equal(result.json.session.rows, 24)
  assert.equal(fakePties.length, 1)
  assert.equal(fakePties[0].handle.terminated, false)
  sessionId = result.json.session.id
})

/* 4. WS 生命周期（监听器先于 open 挂上，避免握手后首帧竞态丢失）。 */
const ws = new WebSocket(`${baseUrl}${WS_PATH}`)
const helloPromise = waitFrame(ws, 'hello', (f) => f.t === 'hello' && Array.isArray(f.sessions) && f.sessions.length === 1)
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })

await check('WS open → hello 帧（含 1 条会话）', () => helloPromise)

/* 5. created 广播（ws 已在线时新建第二会话）。 */
let secondId
await check('POST create#2 → created 广播帧', async () => {
  const framePromise = waitFrame(ws, 'created', (f) => f.t === 'created' && typeof f.session?.id === 'string')
  const result = await api('POST', { action: 'create' })
  assert.equal(result.json.ok, true)
  secondId = result.json.session.id
  await framePromise
})

await check('attach → attached 带 buffer（banner 回放）', async () => {
  const framePromise = waitFrame(ws, 'attached', (f) => f.t === 'attached' && f.id === sessionId)
  ws.send(JSON.stringify({ t: 'attach', id: sessionId }))
  const frame = await framePromise
  const replay = Buffer.from(frame.buffer ?? '', 'base64').toString('utf8')
  assert.ok(replay.includes('welcome-to-termbar'), `scrollback got: ${JSON.stringify(replay.slice(0, 40))}`)
})

await check('attach 未知 id → miss 帧', () => {
  ws.send(JSON.stringify({ t: 'attach', id: 'term-none' }))
  return waitFrame(ws, 'miss', (f) => f.t === 'miss' && f.id === 'term-none')
})

await check('input → outb 回显帧', async () => {
  const binPromise = waitOutput(ws, sessionId)
  ws.send(JSON.stringify({ t: 'input', data: 'echo hi\n' }))
  const bin = await binPromise
  assert.ok(bin.toString('utf8').includes('[echo] echo hi'), `echo got: ${JSON.stringify(bin.toString('utf8').slice(0, 60))}`)
})

await check('resize → 会话表尺寸更新', async () => {
  ws.send(JSON.stringify({ t: 'resize', cols: 80, rows: 10 }))
  await new Promise((r) => setTimeout(r, 150))
  const result = await api('GET')
  const session = result.json.sessions.find((s) => s.id === sessionId)
  assert.equal(session.cols, 80)
  assert.equal(session.rows, 10)
})

await check('ping → pong', () => {
  const framePromise = waitFrame(ws, 'pong', (f) => f.t === 'pong')
  ws.send(JSON.stringify({ t: 'ping' }))
  return framePromise
})

/* 6. rename 广播。 */
await check('POST rename → renamed 帧', async () => {
  const framePromise = waitFrame(ws, 'renamed', (f) => f.t === 'renamed' && f.id === sessionId && f.title === '工作台')
  const result = await api('POST', { action: 'rename', id: sessionId, title: '  工作台  ' })
  assert.equal(result.json.ok, true)
  await framePromise
})

/* 7. close → exit 帧 → 会话表只剩第二路。 */
await check('POST close → exit 帧 → 剩余 1 会话', async () => {
  const framePromise = waitFrame(ws, 'exit', (f) => f.t === 'exit' && f.id === sessionId && f.exitCode === 0)
  const result = await api('POST', { action: 'close', id: sessionId })
  assert.equal(result.json.ok, true)
  await framePromise
  const after = await api('GET')
  assert.equal(after.json.sessions.length, 1)
  assert.equal(after.json.sessions[0].id, secondId)
  assert.equal(fakePties[0].handle.terminated, true, '第一路 PTY 应已被 terminate')
})

/* 8. 未知 action。 */
await check('POST unknown action → ok:false', async () => {
  const result = await api('POST', { action: 'nope' })
  assert.equal(result.json.ok, false)
})

/* 9. 跨源 upgrade 拒绝。 */
await check('跨源 Origin upgrade → 不得建立', () => {
  const evil = new WebSocket(`${baseUrl}${WS_PATH}`, { origin: 'http://evil.example' })
  return new Promise((resolve) => {
    let settled = false
    const done = (value) => { if (!settled) { settled = true; resolve(value) } }
    evil.once('open', () => done('opened'))
    evil.once('error', () => done('error'))
    evil.once('unexpected-response', () => done('rejected'))
    setTimeout(() => done('timeout'), 2500)
  }).then((outcome) => {
    try { evil.terminate() } catch { /* ignore */ }
    assert.notEqual(outcome, 'opened', '跨源 upgrade 不应成功打开')
  })
})

/* 10. dispose 清理：路由摘除 + PTY 全部终结。 */
await check('dispose → 路由/升级摘除 + PTY 终结', async () => {
  for (const dispose of teardowns.splice(0)) await dispose()
  assert.equal(routes.size, 0, `routes left: ${[...routes.keys()].join(', ')}`)
  assert.equal(upgradeHandlers.size, 0)
  await new Promise((r) => setTimeout(r, 150))
  assert.ok(fakePties.every((entry) => entry.handle.terminated), '全部假 PTY 应已终结')
})

ws.close()
server.close()
await new Promise((r) => server.close(r))

console.log(failures === 0 ? '\nSMOKE-OK（全部通过）' : `\nSMOKE-FAIL（${failures} 项失败）`)
process.exit(failures === 0 ? 0 : 1)
