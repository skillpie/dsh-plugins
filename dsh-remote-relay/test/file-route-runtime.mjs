/**
 * Regression smoke: file-route must be available after a RUNTIME enable.
 *
 * 1.2.7 changed the default `enabled` to false; the mount condition
 * `if (enabled || direct)` read the boot-time config only, so the most common
 * path — install (off) → owner panel toggle on — never mounted
 * /dsh-remote-relay-file and every visitor download surfaced as
 * 「文件已不存在(可能已被清理)」. These checks pin the fixed behavior:
 * mount at boot unconditionally, and ensure it again on set-enabled.
 */
import assert from 'node:assert/strict'
import plugin from '../lib/index.js'

const log = []
const routes = new Map()
const stubServer = {
  register(route) {
    const key = `${route.kind}:${route.path}`
    if (routes.has(key)) throw new Error(`duplicate registration: ${key}`)
    routes.set(key, route.handler)
    return () => routes.delete(key)
  },
  registerUpgrade() { return () => {} },
  getOrigin() { return 'http://127.0.0.1:0' },
}

const ownerApiPath = '/dsh-remote-relay/api'
const fileRoutePath = 'prefix:/dsh-remote-relay-file'

// Boot with defaults (enabled=false, direct=false) — the reported scenario.
const fakeCtx = {
  get: () => undefined,
  effect(_setup, _label) { /* lifetime not needed here */ },
  inject(deps, cb) {
    // Mirror cordis: synchronous delivery of the optional services the stub
    // provides; boot() waits for webServer via whenWebServer().
    if (deps.includes('webServer')) cb({ webServer: stubServer })
  },
}
plugin.apply(fakeCtx, {})
await new Promise((r) => setTimeout(r, 50))

// The owner API must exist even when everything is off (panel is the only
// entry point), and so must the file route (unconditional mount).
assert.ok(routes.has(`exact:${ownerApiPath}`), 'owner api missing at boot')
assert.ok(routes.has(fileRoutePath), 'file route missing at boot (regression)')

// Drive set-enabled through the registered owner API handler.
const ownerHandler = routes.get(`exact:${ownerApiPath}`)
function callOwner(body) {
  return new Promise((resolve, reject) => {
    // A plain object stand-in is enough: readBody consumes req (data/end),
    // ownerApi only uses writeHead/end on res. Avoid http.IncomingMessage —
    // its writeHead/end demand a real server round-trip.
    const chunks = []
    const req = {
      method: 'POST',
      url: ownerApiPath,
      headers: {},
      // readBody attaches both listeners synchronously; emit data then end on
      // the next tick so both are already registered.
      on(ev, cb) {
        if (ev === 'data') queueMicrotask(() => cb(Buffer.from(JSON.stringify(body))))
        if (ev === 'end') queueMicrotask(() => queueMicrotask(cb))
      },
      destroy() {},
    }
    const res = {
      headersSent: false,
      writeHead(status, _h) { this.headersSent = true; this.status = status; return this },
      end(payload) { resolve(JSON.parse(payload)) },
      destroy() {},
    }
    ownerHandler(req, res)
    setTimeout(() => reject(new Error('owner api timeout')), 2000).unref()
  })
}

const on = await callOwner({ action: 'set-enabled', value: true })
assert.equal(on.ok, true, 'set-enabled failed')
assert.ok(routes.has(fileRoutePath), 'file route vanished after runtime enable')

// still exactly one registration (idempotent)
const off = await callOwner({ action: 'set-enabled', value: false })
assert.equal(off.ok, true, 'set-enabled off failed')
const again = await callOwner({ action: 'set-enabled', value: true })
assert.equal(again.ok, true, 're-enable failed')
assert.ok(routes.has(fileRoutePath), 'file route missing after re-enable (idempotency/regression)')

console.log('FILE-ROUTE RUNTIME-ENABLE SMOKE OK')
process.exit(0)
