/**
 * Standalone smoke test for dsh-remote core plumbing (no DSH required).
 *
 * Chain under test:
 *   fake visitor (real ws client)
 *     → real http server + stub webServer routes
 *       → RelayCore (per-code routes, bridge)
 *         → pipe
 *           → HostEngine (fake sessionController)
 *
 * Run: node test/smoke.mjs
 */
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'
import { RelayCore } from '../lib/relay-core.js'
import { HostEngine } from '../lib/engine.js'
import { consoleHtml } from '../lib/console.js'
import { createPipePair } from '../lib/pipe.js'
import { generateCode } from '../lib/protocol.js'

const logs = []
const log = (kind, text) => logs.push(`[${kind}] ${text}`)

// ── stub webServer over a real http server ─────────────────────────────
const routes = new Map()
const upgrades = new Map()
const server = http.createServer((req, res) => {
  const handler = routes.get(req.url.split('?')[0]) ?? routes.get(`/${req.url.split('?')[0].split('/')[1]}`)
  if (!handler) {
    res.writeHead(404).end('no route')
    return
  }
  void handler(req, res)
})
server.on('upgrade', (req, socket, head) => {
  const pathname = req.url.split('?')[0]
  const handler = upgrades.get(pathname)
  if (!handler) { socket.destroy(); return }
  void handler(req, socket, head)
})
const webServer = {
  register(route) {
    const key = route.kind === 'prefix' ? `prefix:${route.path}` : route.path
    routes.set(key, route.handler)
    if (route.kind === 'prefix') {
      // Emulate prefix matching: raw path also hits this handler.
      routes.set(route.path, route.handler)
    }
    return () => { routes.delete(key); if (route.kind === 'prefix') routes.delete(route.path) }
  },
  registerUpgrade(route) {
    upgrades.set(route.path, route.handler)
    return () => upgrades.delete(route.path)
  },
  getOrigin() { return `http://127.0.0.1:${port}` },
}
const stubController = {
  async list() {
    return {
      items: [
        { sessionId: 's-1', updatedAt: Date.now(), running: false, blank: false, agentAvailable: true, projections: { values: { title: '测试会话' } } },
        { sessionId: 's-2', updatedAt: Date.now() - 5000, running: true, blank: false, agentAvailable: true, projections: { values: { title: '运行中的会话' } } },
        { sessionId: 's-blank', updatedAt: Date.now(), running: false, blank: true, agentAvailable: true, projections: {} },
      ],
    }
  },
  async state() { return { cursor: 42, active: false, running: true, queue: [{ id: 'q1' }], pendingInput: ['approval'] } },
  async prompt(input) {
    stubController.prompts.push(input)
    return { accepted: true }
  },
  async cancel() { return { accepted: true } },
  async create() { return { sessionId: 's-new' } },
  events() {
    // Real sessionController.events returns a SessionEventsPage.
    return Promise.resolve({
      records: [
        { type: 'event', event: { type: 'user/message', seq: 1, time: Date.now(), data: { content: [{ type: 'text', text: '帮我跑一下测试' }], source: { kind: 'user' } } } },
        { type: 'event', event: { type: 'assistant/message', seq: 2, time: Date.now(), data: { stream: [{ type: 'text-delta', index: 0, text: '好的，' }, { type: 'text-delta', index: 1, text: '开始执行。' }] } } },
        { type: 'event', event: { type: 'tool/call', seq: 3, time: Date.now(), data: { name: 'bash', arguments: { command: 'npm test' } } } },
      ],
      hasMore: false,
      cursor: 3,
    })
  },
  observeEvent() {
    // Real sessionController.observeEvent returns an AsyncIterable of frames.
    return (async function* () {
      yield { type: 'ready' }
      yield { type: 'event', event: { type: 'tool/result', seq: 4, time: Date.now(), data: { ok: true } } }
    })()
  },
  observeState() {
    return (async function* () {
      yield { cursor: 42, active: false, running: true, queue: [{ id: 'q1' }], pendingInput: ['approval'] }
    })()
  },
}
stubController.prompts = []

// ── assemble host side over a pipe ─────────────────────────────────────
const code = generateCode()
const engine = new HostEngine({
  services: { sessionController: () => stubController },
  host: { name: 'smoke-host', dsh: 'node test', code },
  log,
})
const [hostEnd, relayEnd] = createPipePair()
const core = new RelayCore({ webServer, consoleHtml, log, maxVisitorsPerHost: 4 })
core.acceptHostSocket(relayEnd)
hostEnd.send({
  t: 'hello', v: 1, hostId: 'host-smoke', code, token: '', name: 'smoke-host', dsh: 'node test',
})
engine.attach(hostEnd)

await delay(100)
if (!routes.get(`prefix:/${code}`)) {
  console.error('FAIL: console route not registered for code', code)
  console.error(logs.join('\n'))
  process.exit(1)
}
if (!upgrades.get(`/${code}/ws`)) {
  console.error('FAIL: visitor upgrade route not registered')
  process.exit(1)
}
log('test', `routes registered for /${code}`)

// ── serve console HTML over real HTTP ──────────────────────────────────
const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const htmlRes = await fetch(`http://127.0.0.1:${port}/${code}`)
const html = await htmlRes.text()
if (!htmlRes.ok || !html.includes('远程控制') || !html.includes(code)) {
  console.error('FAIL: console HTML not served correctly', htmlRes.status)
  process.exit(1)
}
const notFound = await fetch(`http://127.0.0.1:${port}/${code}/other`)
if (notFound.status !== 404) {
  console.error('FAIL: subpath should 404, got', notFound.status)
  process.exit(1)
}
log('test', 'console HTML served; subpath 404 ok')

// ── fake visitor over real WebSocket ───────────────────────────────────
const ws = new WebSocket(`ws://127.0.0.1:${port}/${code}/ws`)
const frames = []
const waiters = []
ws.on('message', (data) => {
  const frame = JSON.parse(String(data))
  frames.push(frame)
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i].predicate(frame)) {
      waiters.splice(i, 1)[0].resolve(frame)
    }
  }
})
const waitFor = (predicate, label) => new Promise((resolve, reject) => {
  const existing = frames.find(predicate)
  if (existing) return resolve(existing)
  const timer = setTimeout(() => {
    console.error('--- logs at failure ---')
    console.error(logs.join('\n'))
    reject(new Error('timeout waiting: ' + label))
  }, 5000)
  waiters.push({
    predicate,
    resolve: (frame) => { clearTimeout(timer); resolve(frame) },
  })
})
const opened = new Promise((resolve) => ws.on('open', resolve))
await opened

const welcome = await waitFor((f) => f.t === 'welcome', 'welcome')
if (!welcome.host || welcome.host.name !== 'smoke-host' || !Array.isArray(welcome.sessions)) {
  console.error('FAIL: welcome payload wrong', JSON.stringify(welcome))
  process.exit(1)
}
if (welcome.sessions.length !== 2 || welcome.sessions[0].title !== '测试会话') {
  console.error('FAIL: session list wrong (blank should be filtered)', JSON.stringify(welcome.sessions))
  process.exit(1)
}
log('test', 'welcome ok (host info + filtered session list)')

// observe → res + history push
ws.send(JSON.stringify({ t: 'cmd', id: 'r1', cmd: 'sessions.observe', p: { sessionId: 's-1' } }))
const historyPush = await waitFor((f) => f.t === 'push' && f.f.t === 'session-history', 'session-history push')
const records = historyPush.f.records
const userMsg = records.find((r) => r.event.type === 'user/message')
const assistantMsg = records.find((r) => r.event.type === 'assistant/message')
const toolCall = records.find((r) => r.event.type === 'tool/call')
if (!userMsg || !assistantMsg || !toolCall) {
  console.error('FAIL: history records missing expected events')
  process.exit(1)
}
const streamText = assistantMsg.event.data.stream.map((c) => c.text).join('')
if (streamText !== '好的，开始执行。') {
  console.error('FAIL: assistant stream text wrong:', JSON.stringify(streamText))
  process.exit(1)
}
const statePush = await waitFor((f) => f.t === 'push' && f.f.t === 'session-state', 'session-state push')
if (!statePush.f.state.running || statePush.f.state.pendingInput[0] !== 'approval') {
  console.error('FAIL: state projection wrong', JSON.stringify(statePush.f.state))
  process.exit(1)
}
log('test', 'observe ok (history + state push, stream text intact)')

// send → engine prompt
ws.send(JSON.stringify({ t: 'cmd', id: 'r2', cmd: 'sessions.send', p: { sessionId: 's-1', text: '远程你好' } }))
const sendRes = await waitFor((f) => f.t === 'res' && f.id === 'r2', 'send res')
if (!sendRes.ok || !sendRes.data.accepted) {
  console.error('FAIL: send rejected', JSON.stringify(sendRes))
  process.exit(1)
}
if (stubController.prompts.length !== 1 || stubController.prompts[0].content[0].text !== '远程你好') {
  console.error('FAIL: prompt not delivered to controller')
  process.exit(1)
}
if (stubController.prompts[0].mode !== 'queue' || typeof stubController.prompts[0].requestId !== 'string') {
  console.error('FAIL: prompt shape wrong', JSON.stringify(stubController.prompts[0]))
  process.exit(1)
}
log('test', 'send ok (queued prompt reached controller)')

// cancel
ws.send(JSON.stringify({ t: 'cmd', id: 'r3', cmd: 'sessions.cancel', p: { sessionId: 's-1' } }))
await waitFor((f) => f.t === 'res' && f.id === 'r3' && f.ok, 'cancel res')
log('test', 'cancel ok')

// create
ws.send(JSON.stringify({ t: 'cmd', id: 'r4', cmd: 'sessions.create', p: {} }))
const createRes = await waitFor((f) => f.t === 'res' && f.id === 'r4', 'create res')
if (!createRes.ok || createRes.data.sessionId !== 's-new') {
  console.error('FAIL: create wrong', JSON.stringify(createRes))
  process.exit(1)
}
log('test', 'create ok')

// unknown command rejected
ws.send(JSON.stringify({ t: 'cmd', id: 'r5', cmd: 'fs.read', p: { path: '/etc/passwd' } }))
const denied = await waitFor((f) => f.t === 'res' && f.id === 'r5', 'denied res')
if (denied.ok) {
  console.error('FAIL: unknown command should be denied')
  process.exit(1)
}
log('test', 'unknown command denied ok')

// engine event push reaches the observing visitor
hostEnd.send({ t: 'push', to: welcome.visitor, f: { t: 'session-event', sessionId: 's-1', event: { type: 'assistant/message', seq: 9, time: Date.now(), data: { stream: [{ type: 'text-delta', index: 0, text: '实时推送' }] } } } })
const livePush = await waitFor((f) => f.t === 'push' && f.f.t === 'session-event' && f.f.event && f.f.event.seq === 9, 'live event push')
if (livePush.f.event.seq !== 9) {
  console.error('FAIL: live push wrong', JSON.stringify(livePush))
  process.exit(1)
}
log('test', 'addressed push routing ok')

// second transport: a local direct-style pipe + relay core sharing ONE engine
const code2 = generateCode()
const [hostEnd2, relayEnd2] = createPipePair()
const TAP = process.env.TAP === '1'
if (TAP) {
  const label = (d) => typeof d === 'string' ? d.slice(0, 80) : 'BIN ' + d.length
  hostEnd2.onMessage((d) => console.error('  [host2←]', label(d)))
  relayEnd2.onMessage((d) => console.error('  [relay2←]', label(d)))
}
const core2 = new RelayCore({ webServer, consoleHtml, log, maxVisitorsPerHost: 4 })
core2.acceptHostSocket(relayEnd2)
hostEnd2.send({
  t: 'hello', v: 1, hostId: 'host-smoke-2', code: code2, token: '', name: 'smoke-host', dsh: 'node test',
})
engine.attach(hostEnd2)
await delay(100)
if (!upgrades.get(`/${code2}/ws`)) {
  console.error('FAIL: second transport routes not registered')
  process.exit(1)
}
log('test', 'second transport (direct-style pipe) registered')

const ws2 = new WebSocket(`ws://127.0.0.1:${port}/${code2}/ws`)
const frames2 = []
const waiters2 = []
// Attach the message listener before the socket opens: the welcome frame can
// arrive in the same tick as 'open' and would otherwise be dropped.
ws2.on('message', (data) => {
  const frame = JSON.parse(String(data))
  frames2.push(frame)
  for (let i = waiters2.length - 1; i >= 0; i--) {
    if (waiters2[i].predicate(frame)) waiters2.splice(i, 1)[0].resolve(frame)
  }
})
await new Promise((resolve) => ws2.on('open', resolve))
const waitFor2 = (predicate, label) => new Promise((resolve, reject) => {
  const existing = frames2.find(predicate)
  if (existing) return resolve(existing)
  const timer = setTimeout(() => {
    console.error('--- logs at failure2 ---')
    console.error(logs.join('\n'))
    reject(new Error('timeout waiting: ' + label))
  }, 5000)
  waiters2.push({ predicate, resolve: (frame) => { clearTimeout(timer); resolve(frame) } })
})
const welcome2 = await waitFor2((f) => f.t === 'welcome', 'welcome2')
if (welcome2.host?.name !== 'smoke-host') {
  console.error('FAIL: welcome2 wrong', JSON.stringify(welcome2))
  process.exit(1)
}
log('test', 'second visitor welcomed over second transport')

// observe the same session from transport 2; fan-out must reach BOTH visitors
ws2.send(JSON.stringify({ t: 'cmd', id: 'w2r1', cmd: 'sessions.observe', p: { sessionId: 's-1' } }))
await waitFor2((f) => f.t === 'res' && f.id === 'w2r1' && f.ok, 'observe2 res')
engine.pushSession('s-1', { t: 'session-event', sessionId: 's-1', event: { type: 'fan-out', seq: 77, time: Date.now(), data: {} } })
await waitFor((f) => f.t === 'push' && f.f.t === 'session-event' && f.f.event?.seq === 77, 'fan-out on transport 1')
await waitFor2((f) => f.t === 'push' && f.f.t === 'session-event' && f.f.event?.seq === 77, 'fan-out on transport 2')
log('test', 'session fan-out reaches both transports')

// a reply must ride its own transport: send via transport 2, res arrives there
ws2.send(JSON.stringify({ t: 'cmd', id: 'w2r2', cmd: 'sessions.state', p: { sessionId: 's-1' } }))
await waitFor2((f) => f.t === 'res' && f.id === 'w2r2' && f.ok, 'state res on transport 2')
log('test', 'reply channel separation ok')

// third visitor on transport 1; visitor accounting across both transports
const ws3 = new WebSocket(`ws://127.0.0.1:${port}/${code}/ws`)
await new Promise((resolve) => ws3.on('open', resolve))
await delay(100)
if (core.status().hosts[0].visitors !== 2) {
  console.error('FAIL: transport-1 visitor count wrong', JSON.stringify(core.status()))
  process.exit(1)
}
if (core2.status().hosts[0].visitors !== 1) {
  console.error('FAIL: transport-2 visitor count wrong', JSON.stringify(core2.status()))
  process.exit(1)
}
log('test', 'per-transport visitor accounting ok')

ws3.close()
await delay(150)
if (core.status().hosts[0].visitors !== 1) {
  console.error('FAIL: visitor cleanup wrong')
  process.exit(1)
}

// host link drop → offline state, console served with offline banner
hostEnd.close()
await delay(100)
const offlineRes = await fetch(`http://127.0.0.1:${port}/${code}`)
const offlineHtml = await offlineRes.text()
if (!offlineHtml.includes('宿主机暂时离线')) {
  console.error('FAIL: offline banner missing')
  process.exit(1)
}
log('test', 'offline banner ok')

ws.close()
ws2.close()
server.close()
core.detachAll()
core2.detachAll()
engine.close()

console.log('SMOKE OK — all checks passed')
console.log(logs.map((l) => '  ' + l).join('\n'))
process.exit(0)
