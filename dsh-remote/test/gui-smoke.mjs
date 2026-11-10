/**
 * GUI-mode smoke test: RelayCore(gui) ⇄ pipe ⇄ GuiBridge ⇄ fake origin.
 * Exercises the full splice path without DSH: redirect, proxied index with
 * rewritten cookie, cookie round-trip, POST body, spliced WebSocket, and the
 * offline interstitial.
 *
 * Run: node test/gui-smoke.mjs
 */
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket, { WebSocketServer } from 'ws'
import { RelayCore } from '../lib/relay-core.js'
import { GuiBridge } from '../lib/bridge.js'
import { consoleHtml } from '../lib/console.js'
import { createPipePair } from '../lib/pipe.js'
import { generateCode } from '../lib/protocol.js'

const logs = []
const log = (kind, text) => logs.push(`[${kind}] ${text}`)
const fail = (message) => {
  console.error('FAIL:', message)
  console.error(logs.join('\n'))
  process.exit(1)
}

/* ── fake origin (stands in for the host's real webserver) ───────────── */
const originMuxs = new Set()
const origin = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://origin')
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    if (url.pathname === '/' && url.searchParams.get('token') === 't0k') {
      res.writeHead(303, {
        'set-cookie': 'dshsession_v1=sig.abc.def; Max-Age=30; Path=/; HttpOnly; SameSite=Strict',
        location: './',
      })
      res.end()
      return
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>INDEX</html>')
      return
    }
    if (url.pathname === '/assets/app.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' })
      res.end('console.log("gui")')
      return
    }
    if (url.pathname === '/api/echo') {
      const body = Buffer.concat(chunks)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        cookie: req.headers.cookie ?? null,
        method: req.method,
        bodyText: body.toString('utf8'),
        originHeader: req.headers.origin ?? null,
      }))
      return
    }
    res.writeHead(404)
    res.end('nope')
  })
})
const originWss = new WebSocketServer({ noServer: true })
origin.on('upgrade', (req, socket, head) => {
  originWss.handleUpgrade(req, socket, head, (raw) => {
    originMuxs.add(raw)
    raw.on('message', (data) => {
      if (Buffer.isBuffer(data)) raw.send(data)
      else raw.send(String(data))
    })
    raw.on('error', () => {})
  })
})

/* ── relay face (gui mode) over a pipe to the bridge ─────────────────── */
const code = generateCode()
const routes = new Map()
const upgrades = new Map()
const relayServer = http.createServer((req, res) => {
  const handler = routes.get(req.url.split('?')[0]) ?? routes.get(`/${req.url.split('?')[0].split('/')[1]}`)
  if (!handler) { res.writeHead(404).end('no route'); return }
  void handler(req, res)
})
relayServer.on('upgrade', (req, socket, head) => {
  const handler = upgrades.get(req.url.split('?')[0])
  if (!handler) { socket.destroy(); return }
  void handler(req, socket, head)
})
const relayWebServer = {
  register(route) {
    const key = route.kind === 'prefix' ? `prefix:${route.path}` : route.path
    routes.set(key, route.handler)
    if (route.kind === 'prefix') routes.set(route.path, route.handler)
    return () => { routes.delete(key); if (route.kind === 'prefix') routes.delete(route.path) }
  },
  registerUpgrade(route) {
    upgrades.set(route.path, route.handler)
    return () => upgrades.delete(route.path)
  },
}
const core = new RelayCore({ webServer: relayWebServer, consoleHtml, log, maxVisitorsPerHost: 4, mode: 'gui' })

const originPort = await new Promise((resolve) => { origin.listen(0, '127.0.0.1', () => resolve(origin.address().port)) })
const bridge = new GuiBridge({
  services: {
    webServer: () => ({ getOrigin: () => `http://127.0.0.1:${originPort}` }),
    connection: () => ({ authenticatedUrl: (base) => base + '?token=t0k' }),
  },
  log,
})
const [hostEnd, relayEnd] = createPipePair()
const DEBUG = process.env.GUI_DEBUG === '1'
if (DEBUG) {
  const label = (d) => typeof d === 'string' ? d.slice(0, 90) : `BIN ${d.length}b ` + JSON.stringify(JSON.parse(d.slice(0, d.indexOf(0)).toString()).t ?? '?')
  hostEnd.onMessage((d) => console.error('  [host←pipe]', label(d)))
  relayEnd.onMessage((d) => console.error('  [relay←pipe]', label(d)))
}
core.acceptHostSocket(relayEnd)
hostEnd.send({ t: 'hello', v: 1, hostId: 'gui-host', code, token: '', name: 'gui-host', dsh: 'test' })
bridge.attach(hostEnd)

await delay(150)
if (!routes.get(`prefix:/${code}`)) fail('prefix route not registered')
if (!upgrades.get(`/${code}/api/remote.mux`)) fail('mux upgrade route not registered')
log('test', 'gui routes registered')

const port = await new Promise((resolve) => { relayServer.listen(0, '127.0.0.1', () => resolve(relayServer.address().port)) })
const base = `http://127.0.0.1:${port}/${code}`

// 1. bare code redirects to the mount
const redirect = await fetch(base, { redirect: 'manual' })
if (redirect.status !== 302 || !redirect.headers.get('location')?.endsWith(`/${code}/`)) {
  fail(`bare code should 302 to /${code}/, got ${redirect.status} ${redirect.headers.get('location')}`)
}
log('test', 'bare code redirect ok')

// 2. index proxied; the owner cookie stays host-side (never sent to visitors)
const index = await fetch(`${base}/`)
if (!index.ok || !(await index.text()).includes('INDEX')) fail('index not proxied')
const setCookie = index.headers.get('set-cookie') ?? ''
if (setCookie !== '') fail(`visitor must not receive the owner cookie: ${setCookie}`)
log('test', 'index proxied; owner cookie kept host-side')

// 3. bridge injects its minted cookie; visitor cookies/origin are stripped
const echo = await fetch(`${base}/api/echo`, {
  method: 'POST',
  headers: {
    'cookie': 'attacker=own-session',
    'origin': 'https://dsh.skillpie.cn',
    'content-type': 'application/json',
  },
  body: JSON.stringify({ hello: 'gui' }),
})
const echoData = await echo.json()
if (echoData.cookie !== 'dshsession_v1=sig.abc.def') fail(`bridge cookie not injected for origin: ${echoData.cookie}`)
if (echoData.originHeader !== null) fail(`origin header leaked to origin: ${echoData.originHeader}`)
if (echoData.bodyText !== '{"hello":"gui"}') fail(`body not proxied: ${echoData.bodyText}`)
log('test', 'bridge cookie injection + visitor cookie/origin stripping + POST body ok')

// 4. assets proxied
const asset = await fetch(`${base}/assets/app.js`)
if (!(await asset.text()).includes('console.log')) fail('asset not proxied')
log('test', 'asset proxied ok')

// 5. spliced websocket: binary echo through the tunnel
if (DEBUG) console.error('  opening splice ws')
const ws = new WebSocket(`ws://127.0.0.1:${port}/${code}/api/remote.mux`)
await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); setTimeout(() => reject(new Error('ws timeout')), 5000) })
const echoBack = await new Promise((resolve, reject) => {
  ws.on('message', (data) => resolve(Buffer.from(data)))
  ws.send(Buffer.from('splice-ping'))
  setTimeout(() => { console.error('--- logs ---'); console.error(logs.join('\n')); reject(new Error('echo timeout')) }, 5000)
})
if (echoBack.toString() !== 'splice-ping') fail(`splice echo wrong: ${echoBack}`)
log('test', 'websocket splice echo ok')
const echoBack2 = await new Promise((resolve, reject) => {
  ws.on('message', (data) => resolve(Buffer.from(data)))
  ws.send(Buffer.from('second-frame'))
  setTimeout(() => { console.error('--- logs ---'); console.error(logs.join('\n')); reject(new Error('echo timeout')) }, 5000)
})
if (echoBack2.toString() !== 'second-frame') fail('second splice frame wrong')
ws.close()
log('test', 'multi-frame splice ok')

// 6. host offline → interstitial
hostEnd.close()
await delay(150)
const offline = await fetch(`${base}/`)
const offlineText = await offline.text()
if (!offlineText.includes('宿主机暂时离线')) fail('offline interstitial missing')
const offlineApi = await fetch(`${base}/api/echo`)
if (offlineApi.status !== 504) fail(`offline api should 504, got ${offlineApi.status}`)
log('test', 'offline interstitial + 504 ok')

relayServer.close()
origin.close()
core.detachAll()
bridge.detach()
console.log('GUI SMOKE OK — all checks passed')
console.log(logs.map((l) => '  ' + l).join('\n'))
process.exit(0)
