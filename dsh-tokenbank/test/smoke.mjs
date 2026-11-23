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

const PORT = 18317 + (Number(process.env.SMOKE_PORT_OFFSET)||0)
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
    res.end(JSON.stringify({ data: [{ id: 'glm-5.3-flash' }, { id: 'glm-5.3' }, { id: 'no-cred-model' }] }))
    return
  }
  if (url.pathname === '/api/portal/wordcoin/market') {
    if (cookie !== validSession) { respond(401100, null); return }
    respond(0, {
      quote_micros: 907842, price_nano_usd_per_wc: 1101681,
      bucket_start_ms: Date.now(), capped: false, reused_prev: false,
      next_bucket_start_ms: Date.now() + 60000, snapshot_interval_ms: 60000,
      price_today_open_quote_micros: 880500, price_today_high_quote_micros: 880000, price_today_low_quote_micros: 907000,
      price_formula_base_nano_usd: 0, price_formula_avg_nano_usd: 0,
      stats: { total_tokens: 0, total_cost_nano_usd: 0, priced_requests: 0 },
      trading: { enabled: true, calibrated: true, sample_ok: true, sample_gate_pass: true, par_mode: false, min_calib_tokens: 0, priced_required: 0, min_sell_quote_micros: 0, max_sell_quote_micros: 0 },
      history: [{ bucket_start_ms: Date.now() - 60000, quote_micros: 910000, price_nano_usd_per_wc: 1098901, reused_prev: false, capped: false }],
    })
    return
  }
  if (url.pathname === '/api/portal/wordcoin/account') {
    if (cookie !== validSession) { respond(401100, null); return }
    respond(0, {
      balance_nano_wc: 20_998_300_000_000, total_bought_nano_wc: 133_994_960_000_000,
      total_sold_nano_wc: 112_996_660_000_000, realized_pnl_nano_usd: 1_870_000_000,
      quote_micros: 907842, price_nano_usd_per_wc: 1101681,
      avg_buy_price_nano_usd_per_wc: 1_101_700, pnl_nano_wc: 24_060_000_000, pnl_percent_micros: 1100,
      pnl_nano_usd: 24_060_000, limits: { max_buy_nano_usd: 5_000_000_000, par_mode: false, trading_open: true },
    })
    return
  }
  if (url.pathname === '/api/portal/wordcoin/ledger') {
    if (cookie !== validSession) { respond(401100, null); return }
    respond(0, {
      entries: [{ id: 1, kind: 'wc_buy', amount_nano_wc: 1e12, balance_after_nano_wc: 21e12, quote_micros: 907842, price_nano_usd_per_wc: 1101681, usd_leg_nano_usd: 1_101_681_000, fee_micros: 0, note: '', created_at_ms: Date.now() }],
      total: 1, page: Number(url.searchParams.get('page')) || 1, page_size: Number(url.searchParams.get('page_size')) || 20,
    })
    return
  }
  if (url.pathname === '/api/portal/wordcoin/buy' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (cookie !== validSession) { respond(401100, null); return }
      const parsed = JSON.parse(body)
      respond(0, { debited_nano_usd: parsed.amount_nano_usd, credited_nano_wc: 1e12, quote_micros: 907842, price_nano_usd_per_wc: 1101681, usd_balance_after_nano_usd: 3_898_319_000, wc_balance_after_nano_wc: 21e12, request_id: 'r1' })
    })
    return
  }
  if (url.pathname === '/api/portal/wordcoin/sell' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (cookie !== validSession) { respond(401100, null); return }
      respond(0, { sold_nano_wc: 1e12, gross_nano_usd: 1_101_681_000, fee_nano_usd: 1_832_000, net_nano_usd: 1_101_681_000 - 1_832_000, fee_micros: 20000, quote_micros: 907842, price_nano_usd_per_wc: 1101681, par_mode_applied: false, usd_balance_after_nano_usd: 5e9, wc_balance_after_nano_wc: 20e12, request_id: 'r2' })
    })
    return
  }
  respond(404000, null)
})

/* ── stub DSH ctx ────────────────────────────────────────────────────── */

const identityStore = { payload: null }
const credentialValues = { BIGMODEL_API_KEY: 'sk-configured-bigmodel', DEAD_API_KEY: 'k1' }
const stubCtx = {
  // cordis 的 get 是同步的:credentials 返回桩服务,其余服务(如 featured-plugins
  // 注册表)按未提供返回 undefined;调用侧统一 await,同步返回兼容。
  get(name) {
    if (name !== 'credentials') return undefined
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
  assert.deepEqual(fallback.models.map((m) => m.id), ['glm-5.3-flash', 'glm-5.3', 'no-cred-model'])
  const low = await dispatch({ action: 'low-balance' })
  assert.equal(low.event.message, '余额不足')

  // wordcoin trading actions (行情/账户/流水/买卖)
  const mkt = await dispatch({ action: 'wordcoin-market', buckets: 720 })
  assert.equal(mkt.ok, true)
  assert.equal(mkt.market.trading.sample_gate_pass, true)
  assert.equal(mkt.market.history.length, 1)
  const acct = await dispatch({ action: 'wordcoin-account' })
  assert.equal(acct.account.balance_nano_wc, 20_998_300_000_000)
  assert.equal(acct.account.limits.trading_open, true)
  const ledger = await dispatch({ action: 'wordcoin-ledger', page: 1, pageSize: 20 })
  assert.equal(ledger.ledger.entries.length, 1)
  assert.equal(ledger.ledger.entries[0].kind, 'wc_buy')
  // 买入按手数（1 手 = $1 面值），卖出按任意词元数量
  const bought = await dispatch({ action: 'wordcoin-buy', lots: 1 })
  assert.equal(bought.result.credited_nano_wc, 1e12)
  const sold = await dispatch({ action: 'wordcoin-sell', amountNanoWC: 1e12 })
  assert.equal(sold.result.sold_nano_wc, 1e12)
  assert.ok(sold.result.net_nano_usd > 0)
  await assert.rejects(dispatch({ action: 'wordcoin-buy', lots: 0 }), /lots must be positive/)
  await assert.rejects(dispatch({ action: 'wordcoin-sell', amountNanoWC: -5 }), /amount must be positive/)

  // HTTP carrier: same-origin guard + envelope, against a real server
  const seen = []
  const fakeWebServer = {
    register(entry) { seen.push(entry) },
  }
  const routeCtx = {
    get: stubCtx.get,
    // cordis 的 effect 会同步执行回调:让 provide 真正运行(此处无 provide
    // 方法而抛错),integrateFeaturedPlugins 才能正确落入「非宿主」分支,
    // 只登记插件自身的路由。
    effect(fn, _name) { return fn ? fn() : () => {} },
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
