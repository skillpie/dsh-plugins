/**
 * dsh-tokenbank smoke test — no DSH process required.
 *
 * 1. lib/tb.js against a stub token-bank portal: register returns
 *    Set-Cookie + access_key, session endpoints require the cookie,
 *    recharge pay returns HTML, /v1/models lists gateway models.
 * 2. lib/index.js dispatch with stub ctx: register captures the session
 *    token into the identity credential record, me/deposits ride it,
 *    low-balance action, config validation.
 * 3. HTTP route handler: same-origin guard + action envelope over a real
 *    http server.
 */
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { __dispatchForTests, Config } from '../lib/index.js'
import * as tb from '../lib/tb.js'

const PORT = 18317
const BASE = `http://127.0.0.1:${PORT}`

/* ── stub token-bank portal ──────────────────────────────────────────── */

const validSession = 'sess-token-abc123'
const seenCookies = []
const portal = createServer((req, res) => {
  const url = new URL(req.url, BASE)
  const respond = (code, data) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ code, message: code === 0 ? 'ok' : 'bad', data }))
  }
  const cookie = (req.headers.cookie ?? '').match(/tb_portal_session=([^;]+)/)?.[1] ?? ''

  if (req.method === 'POST' && url.pathname === '/api/portal/register') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const parsed = JSON.parse(body)
      assert.equal(parsed.email, 'a@b.c')
      seenCookies.push('register')
      res.setHeader('Set-Cookie', `tb_portal_session=${validSession}; Path=/; HttpOnly`)
      respond(0, {
        user: { id: 1, email: parsed.email },
        access_key: 'sk-signup-key',
        session_expires_ms: 7 * 24 * 3600 * 1000,
      })
    })
    return
  }
  if (url.pathname === '/api/portal/me') {
    if (cookie !== validSession) { respond(401100, null); return }
    respond(0, {
      user: { id: 1, email: 'a@b.c' },
      account: { balance_nano_usd: 5_000_000_000, total_earned_nano_usd: 1_000_000_000, total_spent_nano_usd: 0 },
      deposit_count: 1, active_key_count: 2, deposit_rate_micros: 500_000,
    })
    return
  }
  if (url.pathname === '/api/portal/deposits' && req.method === 'GET') {
    if (cookie !== validSession) { respond(401100, null); return }
    // sk-configured-bigmodel 的掩码 = 'sk-c' + '…' + 'odel'
    respond(0, { deposits: [{ id: 10, masked_key: 'sk-c…odel', status: 'active' }] })
    return
  }
  if (url.pathname === '/api/portal/groups' && req.method === 'GET') {
    if (cookie !== validSession) { respond(401100, null); return }
    respond(0, { groups: [{ id: 'g1', name: 'BigModel' }, { id: 'g2', name: 'Other' }] })
    return
  }
  if (url.pathname === '/api/portal/deposits' && req.method === 'POST') {
    if (cookie !== validSession) { respond(401100, null); return }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => respond(0, { accepted: JSON.parse(body).keys.length }))
    return
  }
  if (url.pathname === '/api/portal/deposits/validate' && req.method === 'POST') {
    if (cookie !== validSession) { respond(401100, null); return }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const parsed = JSON.parse(body)
      // 第一个 Key 探活失败,其余 passed
      respond(0, {
        group_id: parsed.group_id,
        model: 'probe-model',
        results: parsed.keys.map((k, i) => ({
          key_index: i + 1, masked_key: '***', outcome: k === 'k1' ? 'failed' : 'passed',
          model: 'probe-model', protocol: 'openai', latency_ms: 12,
          reason: k === 'k1' ? 'invalid_credential' : null,
        })),
      })
    })
    return
  }
  if (url.pathname === '/api/portal/recharge/orders' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (cookie !== validSession) { respond(401100, null); return }
      const parsed = JSON.parse(body)
      if (!parsed || parsed.cny_fen !== 10000) { respond(400100, null); return } // 服务端只收 {cny_fen}
      respond(0, { order_no: 'ORD-1', status: 'pending' })
    })
    return
  }
  if (url.pathname === '/api/portal/recharge/orders/ORD-1/pay') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<form id="alipay"><input name="foo"></form>')
    return
  }
  if (url.pathname === '/api/portal/recharge/orders/ORD-1') {
    respond(0, { order_no: 'ORD-1', status: 'paid' })
    return
  }
  if (url.pathname === '/api/portal/models') {
    respond(0, [
      { group_id: 1, group_name: 'BigModel', protocol: 'anthropic-messages', models: [
        { id: 'glm-5.3-flash', display_name: 'GLM-5.3-Flash', input: ['text','image'],
          reasoning_efforts: { off: null, low: 'low', high: 'high' }, context_window: 1000000, max_tokens: 131072 },
        { id: 'glm-5.3', display_name: 'GLM-5.3', input: ['text'],
          reasoning_efforts: { off: null, low: 'low', high: 'high' }, context_window: 204800, max_tokens: 131072 },
      ] },
    ])
    return
  }
  if (url.pathname === '/v1/models') {
    if (req.headers.authorization !== 'Bearer sk-signup-key') {
      res.writeHead(401).end('{}'); return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'free-model-a' }, { id: 'free-model-b' }] }))
    return
  }
  respond(404000, null)
})

/* ── stub DSH ctx ────────────────────────────────────────────────────── */

const identityStore = { payload: null }
const credentialValues = { BIGMODEL_API_KEY: 'sk-configured-bigmodel', DEAD_API_KEY: 'k1' }
const stubCtx = {
  async get(name) {
    assert.equal(name, 'credentials')
    return {
      async resolve(ref) {
        const value = credentialValues[ref]
        return value === undefined ? undefined : { value, source: 'file' }
      },
      async readRecord() { return identityStore.payload ? { payload: identityStore.payload } : null },
      async modifyRecord(_key, update) {
        identityStore.payload = update().payload
        return { kind: 'grant', payload: identityStore.payload }
      },
    }
  },
}

async function dispatch(body) {
  return __dispatchForTests(stubCtx, { lowBalanceEvent: { at: 1, message: '余额不足' } }, { baseUrl: BASE }, body)
}

/* ── run ─────────────────────────────────────────────────────────────── */

await new Promise((resolve) => portal.listen(PORT, '127.0.0.1', resolve))
try {
  // config validation
  assert.deepEqual(Config['~standard'].validate(undefined).value, {})
  assert.ok(Config['~standard'].validate({ baseUrl: 'not a url' }).issues.length > 0)
  assert.equal(Config['~standard'].validate({ baseUrl: `${BASE}/` }).value.baseUrl, BASE)

  // tb.js: register captures the Set-Cookie session token
  const reg = await tb.registerWithSession(BASE, { email: 'a@b.c', code: '42', password: 'pw' })
  assert.equal(reg.accessKey, 'sk-signup-key')
  assert.equal(reg.sessionToken, validSession)
  assert.equal(reg.sessionExpiresMS > 0, true)

  // dispatch: register stores identity incl. session + accessKey
  const registered = await dispatch({
    action: 'register', email: 'a@b.c', code: '42', password: 'pw', savePassword: true,
  })
  assert.equal(registered.ok, true)
  assert.equal(identityStore.payload.sessionToken, validSession)
  assert.equal(identityStore.payload.accessKey, 'sk-signup-key')
  assert.equal(identityStore.payload.password, 'pw')

  // status rides the stored session
  const status = await dispatch({ action: 'status' })
  assert.equal(status.loggedIn, true)
  assert.equal(status.account.balance_nano_usd, 5_000_000_000)
  assert.equal(status.accessKey, 'sk-signup-key')

  // deposits + recharge pay html + gateway models
  const deposited = await dispatch({ action: 'deposits-add', groupId: 'g1', keys: ['k1', 'k2'] })
  // k1 探活 failed 被剔除,只有 k2 入库
  assert.equal(deposited.result.accepted, 1)
  assert.equal(deposited.probe.rejected, 1)
  // deposit-configured reads a configured credential and deposits its literal
  const depCfg = await dispatch({ action: 'deposit-configured', ref: 'BIGMODEL_API_KEY', groupId: 'g1' })
  assert.equal(depCfg.ok, true)
  assert.equal(depCfg.deposited, true)
  assert.equal(depCfg.probe.outcome, 'passed')
  assert.equal(depCfg.result.accepted, 1)
  // 探活 failed → ok:false,不落库
  // 无 groupId:服务端应逐分组探活并自动选第一个通过分组(桩里仅 g1 可探活通过)
  const depCfgAuto = await dispatch({ action: 'deposit-configured', ref: 'BIGMODEL_API_KEY' })
  assert.equal(depCfgAuto.ok, true)
  assert.equal(depCfgAuto.deposited, true)
  assert.ok(depCfgAuto.probe.groupId != null, 'auto mode should record chosen groupId')
  const depCfgDead = await dispatch({ action: 'deposit-configured', ref: 'DEAD_API_KEY', groupId: 'g1' })
  assert.equal(depCfgDead.ok, true)
  assert.equal(depCfgDead.deposited, false)
  assert.equal(depCfgDead.probe.reason, 'invalid_credential')
  await assert.rejects(
    dispatch({ action: 'deposit-configured', ref: 'MISSING_API_KEY', groupId: 'g1' }),
    /not configured/,
  )
  await assert.rejects(
    dispatch({ action: 'deposit-configured', ref: 'bad ref!', groupId: 'g1' }),
    /bad credential ref/,
  )
  // deposit-state:掩码(前4+…+后4)命中已托管条目 → deposited=true + depositId=10
  const depState = await dispatch({ action: 'deposit-state', ref: 'BIGMODEL_API_KEY' })
  assert.equal(depState.ok, true)
  assert.equal(depState.deposited, true)
  assert.equal(depState.depositId, 10)
  assert.equal(depState.status, 'active')
  const order = await dispatch({ action: 'recharge-create', body: { cny_fen: 10000 } })
  assert.equal(order.order.order_no, 'ORD-1', 'recharge-create passes body through')
  const pay = await dispatch({ action: 'recharge-pay', orderNo: 'ORD-1' })
  assert.match(pay.html, /alipay/)
  const models = await dispatch({ action: 'gateway-models' })
  // portal /models 目录优先:带能力元数据;身份记录里的 signup key 仍在
  assert.deepEqual(models.models.map((m) => m.id), ['glm-5.3-flash', 'glm-5.3'])
  assert.equal(models.models[0].input.join(','), 'text,image')
  assert.equal(models.models[0].contextWindow, 1000000)
  assert.equal(models.protocol, 'anthropic-messages')
  assert.equal(models.accessKey, 'sk-signup-key')
  const fallback = await dispatch({ action: 'gateway-models', noPortal: true })
  assert.deepEqual(fallback.models.map((m) => m.id), ['free-model-a', 'free-model-b'])
  const low = await dispatch({ action: 'low-balance' })
  assert.equal(low.event.message, '余额不足')

  // HTTP carrier: same-origin guard + envelope, against a real server
  const seen = []
  const fakeWebServer = {
    register(entry) { seen.push(entry) },
  }
  const routeCtx = {
    get: stubCtx.get,
    effect(_fn, _name) { return () => {} },
    inject(services, fn) {
      const child = { effect(fn2) { fn2() } }
      fn(Object.assign(Object.create(null), Object.fromEntries(services.map((s) => [s, s === 'webServer' ? fakeWebServer : {}])), { effect: child.effect }))
    },
  }
  const mod = await import('../lib/index.js')
  mod.default.apply(routeCtx, { baseUrl: BASE })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].path, '/dsh-tokenbank/api')

  const handler = seen[0].handler
  const makeReq = (headers) => ({ method: 'POST', headers })
  const makeRes = () => {
    const chunks = []
    return {
      res: {
        writeHead(status, _headers) { chunks.push({ status }) },
        end(text) { chunks.push({ text }) },
      },
      payload() {
        const textChunk = chunks.find((c) => c.text)
        return JSON.parse(textChunk ? textChunk.text : '{}')
      },
    }
  }
  // cross-origin refused
  {
    const { res, payload } = makeRes()
    await handler(makeReq({ origin: 'https://evil.example', host: '127.0.0.1' }), res)
    assert.equal(payload().ok, false)
  }
  // same-origin ok
  {
    const { res, payload } = makeRes()
    await handler({
      method: 'POST',
      headers: { origin: `${BASE}`, host: `127.0.0.1:${PORT}` },
      on(ev, cb) {
        if (ev === 'data') setImmediate(() => cb(Buffer.from(JSON.stringify({ action: 'status' }))))
        if (ev === 'end') setImmediate(cb)
      },
    }, res)
    const body = payload()
    assert.equal(body.ok, true)
    assert.equal(body.loggedIn, true)
  }
  console.log('dsh-tokenbank smoke: all assertions passed')
} finally {
  portal.close()
  if (typeof portal.closeAllConnections === 'function') portal.closeAllConnections()
}
