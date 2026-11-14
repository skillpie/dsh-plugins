/**
 * GUI-mode smoke test: RelayCore(gui) ⇄ pipe ⇄ GuiBridge ⇄ fake origin.
 * Exercises the full splice path without DSH: redirect, proxied index with
 * rewritten cookie, cookie round-trip, POST body, spliced WebSocket, and the
 * offline interstitial.
 *
 * Run: node test/gui-smoke.mjs
 */
import http from 'node:http'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket, { WebSocketServer } from 'ws'
import { RelayCore, serveServiceWorker } from '../lib/relay-core.js'
import { GuiBridge } from '../lib/bridge.js'
import { createPipePair } from '../lib/pipe.js'
import { generateCode } from '../lib/protocol.js'
import { registerFileRoute, fileRouteKey } from '../lib/file-route.js'

const logs = []
const log = (kind, text) => logs.push(`[${kind}] ${text}`)
const fail = (message) => {
  console.error('FAIL:', message)
  console.error(logs.join('\n'))
  process.exit(1)
}

/* ── fake origin (stands in for the host's real webserver) ───────────── */
const originMuxs = new Set()
// Host-side file route, registered like index.js production wiring does
// (prefix route on the host's own web server).
const tmpFile = `${os.tmpdir()}/dsh-remote-relay-smoke-${randomUUID().slice(0, 8)}.md`
const fileBytes = '# 报表 hello 下载冒烟 0123456789'
const { writeFileSync, rmSync } = await import('node:fs')
writeFileSync(tmpFile, fileBytes)
const hostFileKey = fileRouteKey('gui-host') // relay derives the same from hello.hostId
const originFileRoutes = new Map()
const origin = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://origin')
  const fileHandler = originFileRoutes.get(`prefix:/dsh-remote-relay-file`)
  if (fileHandler && url.pathname.startsWith('/dsh-remote-relay-file')) { void fileHandler(req, res); return }
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
      res.end('<html><head><base href="./"></head><body>INDEX</body></html>')
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
const core = new RelayCore({ webServer: relayWebServer, log, maxVisitorsPerHost: 4 })
// Mirror index.js production wiring: origin-level restore worker.
const offSw = relayWebServer.register({
  kind: 'exact',
  path: '/dsh-remote-relay-sw.js',
  handler: (req, res) => { try { serveServiceWorker(req, res) } catch { try { res.destroy() } catch { /* gone */ } } },
})
const offFileRoute = registerFileRoute({
  webServer: {
    register(route) {
      originFileRoutes.set(`${route.kind}:${route.path}`, route.handler)
      return () => originFileRoutes.delete(`${route.kind}:${route.path}`)
    },
  },
  key: hostFileKey,
  log,
})

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

// 2. index proxied; conceal script injected right after <base>; owner cookie stays host-side
const index = await fetch(`${base}/`)
const indexHtml = await index.text()
if (!index.ok || !indexHtml.includes('INDEX')) fail('index not proxied')
const setCookie = index.headers.get('set-cookie') ?? ''
if (setCookie !== '') fail(`visitor must not receive the owner cookie: ${setCookie}`)
if (!indexHtml.includes('__DSH_REMOTE_CONCEAL__')) fail('conceal script missing')
if (!indexHtml.includes(`localStorage.setItem('dsh-remote-relay-last-code',`)) fail('code storage missing')
if (!indexHtml.includes("history.replaceState(null,'','/')") && !indexHtml.includes("history.replaceState(null, '', '/')")) fail('URL strip missing')
if (!indexHtml.includes('/dsh-remote-relay-sw.js?code=')) fail('SW registration missing')
const afterBase = indexHtml.slice(indexHtml.indexOf('<base href="./">') + 16)
if (!afterBase.startsWith('<script>(function(){\nwindow.__DSH_REMOTE_CONCEAL__')) fail('conceal not injected right after <base>')
log('test', 'index proxied; conceal script after <base>; owner cookie kept host-side')

// 2b. service worker script served at origin level
const sw = await fetch(`http://127.0.0.1:${port}/dsh-remote-relay-sw.js?code=${code}`)
if (!sw.ok) fail('SW script not served')
const swText = await sw.text()
if (!swText.includes("addEventListener('fetch'")) fail('SW fetch handler missing')
if (!swText.includes('dsh-auth-')) fail('SW owner-cookie guard missing')
if (sw.headers.get('service-worker-allowed') !== '/') fail('SW-Allowed header missing')
log('test', 'service worker script served with owner guard')

// 2c. download menu shim injected after the visitor shim, carrying the key
if (!indexHtml.includes('__DSH_REMOTE_DOWNLOAD__')) fail('download menu script missing')
if (!indexHtml.includes('__DSH_REMOTE_VISITOR__')) fail('visitor shim missing')
if (indexHtml.indexOf('__DSH_REMOTE_DOWNLOAD__') < indexHtml.indexOf('__DSH_REMOTE_VISITOR__')) fail('download script must come after the visitor shim')
if (!indexHtml.includes('data-path-label')) fail('path label resolver missing')
if (!indexHtml.includes('data-presented-file')) fail('deliverable card title resolver missing')
if (!indexHtml.includes('cloneNode(true)')) fail('native row clone strategy missing')
if (!indexHtml.includes('data-dsh-remote-relay-dl-item-label')) fail('row label marker missing')
if (!indexHtml.includes(`var K="${hostFileKey}"`)) fail('download key not stamped into shim')
if (!indexHtml.includes('x-dsh-remote-relay-key') || !indexHtml.includes('/dsh-remote-relay-file?path=')) fail('download fetch wiring missing')
log('test', 'download menu shim injected after visitor shim with key')

// 2d. host file route through the tunnel: key gate + disposition + bytes
const dl = await fetch(`${base}/dsh-remote-relay-file?path=${encodeURIComponent(tmpFile)}&k=${hostFileKey}`)
if (dl.status !== 200) fail(`download should stream the file, got ${dl.status}`)
if ((await dl.text()) !== fileBytes) fail('downloaded bytes mismatch')
const disposition = dl.headers.get('content-disposition') ?? ''
if (!disposition.startsWith('attachment;')) fail(`attachment disposition missing: ${disposition}`)
if (!disposition.includes("filename*=UTF-8''")) fail('UTF-8 disposition form missing')
if (dl.headers.get('cache-control') !== 'no-store') fail('download must be no-store')
const dlBadKey = await fetch(`${base}/dsh-remote-relay-file?path=${encodeURIComponent(tmpFile)}&k=wrong-key-wrong-key-wrong`)
if (dlBadKey.status !== 403) fail(`wrong key must 403, got ${dlBadKey.status}`)
const dlNoPath = await fetch(`${base}/dsh-remote-relay-file?path=&k=${hostFileKey}`)
if (dlNoPath.status !== 400) fail(`missing path must 400, got ${dlNoPath.status}`)
const dlMissing = await fetch(`${base}/dsh-remote-relay-file?path=${encodeURIComponent('/nonexistent/nope.md')}&k=${hostFileKey}`)
if (dlMissing.status !== 404) fail(`missing file must 404, got ${dlMissing.status}`)
log('test', 'host file route streams through the tunnel; key/path gates ok')

// 2e. unknown-code guard: standalone enter page + SW probe/restore redirects
const enterBad = await fetch(`http://127.0.0.1:${port}/dsh-remote-relay-enter?code=99999999`)
const enterBadText = await enterBad.text()
if (enterBad.status !== 200 || !enterBadText.includes('99999999')) fail(`enter page with bad code broken: ${enterBad.status}`)
if (!enterBadText.includes('无效或宿主机未在线')) fail('bad-code hint missing')
const enterBlank = await fetch(`http://127.0.0.1:${port}/dsh-remote-relay-enter`)
const enterBlankText = await enterBlank.text()
if (enterBlank.status !== 200 || !enterBlankText.includes('inputmode="numeric"')) fail('blank enter page broken')
if (!swText.includes("method:'HEAD'")) fail('SW unknown-code HEAD probe missing')
if (!swText.includes('/dsh-remote-relay-enter?code=')) fail('SW enter-page redirect missing')
const strayCode = await fetch(`http://127.0.0.1:${port}/99999999/`, { redirect: 'manual' })
if (strayCode.status !== 404) fail(`unknown code must fall through to the SPA fallback (404 in stub), got ${strayCode.status}`)
log('test', 'unknown-code enter page + SW probe/restore guard ok')

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
offSw()
offFileRoute()
try { rmSync(tmpFile, { force: true }) } catch { /* already gone */ }
core.detachAll()
bridge.detach()
console.log('GUI SMOKE OK — all checks passed')
console.log(logs.map((l) => '  ' + l).join('\n'))
process.exit(0)
