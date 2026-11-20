/**
 * dsh-tokenbank — Cordis entry (host half).
 *
 * POST /dsh-tokenbank/api carries a JSON action envelope:
 *   { action: 'status' }                       → { ok, loggedIn, user?, account?, portalUrl }
 *   { action: 'send-code', email }             → { ok, sent }
 *   { action: 'register', email, code, password, displayName, savePassword }
 *                                              → { ok, user, accessKey?, hasModelWork? }
 *   { action: 'login', email, password, captchaId, captchaCode, savePassword }
 *                                              → { ok, user }
 *   { action: 'captcha' }                      → { ok, captchaId, image }
 *   { action: 'logout' }                       → { ok }
 *   { action: 'me' }                           → { ok, ...portal /me data }
 *   { action: 'groups' }                       → { ok, groups }
 *   { action: 'deposits-list' }                → { ok, deposits }
 *   { action: 'deposits-add', groupId, keys }  → { ok, result }
 *   { action: 'deposits-remove', id }          → { ok }
 *   { action: 'deposits-status', id, enabled } → { ok }
 *   { action: 'recharge-config' }              → { ok, config }
 *   { action: 'recharge-create', body }        → { ok, order }
 *   { action: 'recharge-pay', orderNo }        → { ok, html }
 *   { action: 'recharge-order', orderNo }      → { ok, order }
 *   { action: 'gateway-models', accessKey? }   → { ok, models }  (uses stored signup key when omitted)
 *   { action: 'low-balance' }                  → { ok, event }   (last matched session error)
 *
 * Login state lives in the `dsh-tokenbank/identity` credential record
 * ({ email, sessionToken, expiresAtMS, password? }). The route is same-origin
 * only and rides the web GUI session, so every action is an authenticated
 * owner action. The session-error watcher watches all sessions for
 * 402/insufficient-balance turns to power the client's recharge guidance.
 */
import { PortalError } from './tb.js'
import * as tb from './tb.js'

export const ROUTE = '/dsh-tokenbank/api'
export const IDENTITY_RECORD = 'dsh-tokenbank/identity'
const MAX_BODY = 256 * 1024
/** Matches gateway/portal failures that mean "top up or deposit a key". */
const LOW_BALANCE_PATTERN = /(402|insufficient|余额不足|欠费|quota exceeded|out of credit|balance)/i
const ERROR_HINT = /error|fail|refus|denied|abort/i

/** One issue in the Standard Schema config vocabulary. */
const issue = (message, ...path) => ({ message, path: path.length ? path : undefined })

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-tokenbank',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const issues = []
      const value = {}
      const raw = input.baseUrl
      if (raw !== undefined) {
        if (typeof raw !== 'string' || !raw.trim()) {
          issues.push(issue('expected a non-empty string', 'baseUrl'))
        } else {
          try {
            const url = new URL(raw.trim())
            if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
            value.baseUrl = raw.trim().replace(/\/+$/, '')
          } catch {
            issues.push(issue('expected an absolute http(s) URL', 'baseUrl'))
          }
        }
      }
      return issues.length ? { issues } : { value }
    },
  },
}

/* ── identity credential record ──────────────────────────────────────── */

async function readIdentity(ctx) {
  try {
    const credentials = await ctx.get('credentials')
    const record = await credentials.readRecord(IDENTITY_RECORD)
    const payload = record?.payload
    if (payload && typeof payload === 'object' && typeof payload.sessionToken === 'string') return payload
    return null
  } catch {
    return null
  }
}

async function writeIdentity(ctx, payload) {
  const credentials = await ctx.get('credentials')
  await credentials.modifyRecord(IDENTITY_RECORD, () => ({ kind: 'grant', payload }))
}

async function clearIdentity(ctx) {
  await writeIdentity(ctx, { sessionToken: '', email: '', expiresAtMS: 0 })
}

/** Session token still valid? (Local clock only; server 401s are handled per call.) */
function identityLive(identity) {
  return Boolean(identity?.sessionToken) &&
    (!identity.expiresAtMS || identity.expiresAtMS > Date.now())
}

/* ── dispatch ────────────────────────────────────────────────────────── */

async function dispatch(ctx, state, cfg, body) {
  const baseUrl = cfg.baseUrl
  const action = typeof body?.action === 'string' ? body.action : ''
  const requireLive = async () => {
    const identity = await readIdentity(ctx)
    if (!identityLive(identity)) throw new PortalError('not logged in')
    return identity
  }
  switch (action) {
    case 'status': {
      const identity = await readIdentity(ctx)
      if (!identityLive(identity)) return { ok: true, loggedIn: false, portalUrl: baseUrl, baseURL: baseUrl }
      try {
        const data = await tb.me(baseUrl, identity.sessionToken)
        let accessKey = identity.accessKey ?? ''
        // 存量账号(旧版登录不返回明文 Key):取第一把访问密钥回读并缓存
        if (!accessKey) {
          try {
            const keys = (await tb.listAccessKeys(baseUrl, identity.sessionToken))?.keys ?? []
            const first = keys.find((k) => k && k.id != null && (k.status ?? 'active') === 'active') ?? keys[0]
            if (first && first.id != null) {
              const revealed = await tb.revealAccessKey(baseUrl, identity.sessionToken, first.id)
              if (revealed?.key) {
                accessKey = String(revealed.key)
                await writeIdentity(ctx, { ...identity, accessKey })
              }
            }
          } catch { /* 回读失败不阻塞 status */ }
        }
        return {
          ok: true, loggedIn: true, portalUrl: baseUrl, baseURL: baseUrl,
          email: identity.email, user: data.user, account: data.account,
          accessKey,
          depositCount: data.deposit_count, activeKeyCount: data.active_key_count,
          depositRateMicros: data.deposit_rate_micros,
        }
      } catch (error) {
        if (error instanceof PortalError && (error.status === 401 || error.status === 403)) {
          return { ok: true, loggedIn: false, portalUrl: baseUrl, baseURL: baseUrl, expired: true }
        }
        throw error
      }
    }
    case 'send-code':
      await tb.sendCode(baseUrl, String(body.email ?? ''))
      return { ok: true, sent: true }
    case 'register': {
      const data = await tb.registerWithSession(baseUrl, {
        email: body.email, code: body.code, password: body.password,
        displayName: body.displayName,
      })
      if (!data.sessionToken) throw new PortalError('register succeeded but no session cookie returned')
      await writeIdentity(ctx, {
        email: String(body.email ?? ''),
        sessionToken: data.sessionToken,
        expiresAtMS: Date.now() + data.sessionExpiresMS,
        accessKey: data.accessKey ?? '',
        ...(body.savePassword ? { password: String(body.password ?? '') } : {}),
      })
      return {
        ok: true, user: data.user, accessKey: data.accessKey,
        sessionCaptured: true,
      }
    }
    case 'captcha': {
      const data = await tb.newCaptcha(baseUrl)
      return { ok: true, captchaId: data.captcha_id, image: data.image }
    }
    case 'login': {
      const data = await tb.loginWithSession(baseUrl, {
        email: body.email, password: body.password,
        captchaId: body.captchaId, captchaCode: body.captchaCode,
      })
      if (!data.sessionToken) throw new PortalError('login succeeded but no session cookie returned')
      const previous = await readIdentity(ctx)
      await writeIdentity(ctx, {
        email: String(body.email ?? ''),
        sessionToken: data.sessionToken,
        expiresAtMS: Date.now() + data.sessionExpiresMS,
        accessKey: previous?.accessKey ?? '',
        ...(body.savePassword ? { password: String(body.password ?? '') } : {}),
      })
      return { ok: true, user: data.user }
    }
    case 'logout': {
      const identity = await readIdentity(ctx)
      if (identityLive(identity)) {
        try { await tb.logout(baseUrl, identity.sessionToken) } catch { /* best effort */ }
      }
      await clearIdentity(ctx)
      return { ok: true }
    }
    case 'me': {
      const identity = await requireLive()
      return { ok: true, data: await tb.me(baseUrl, identity.sessionToken) }
    }
    case 'groups': {
      const identity = await requireLive()
      return { ok: true, groups: (await tb.groups(baseUrl, identity.sessionToken))?.groups ?? [] }
    }
    case 'deposits-list': {
      const identity = await requireLive()
      return { ok: true, deposits: (await tb.listDeposits(baseUrl, identity.sessionToken))?.deposits ?? [] }
    }
    case 'deposits-add': {
      const identity = await requireLive()
      let probeFallback = ''
      const keys = Array.isArray(body.keys) ? body.keys.map((k) => String(k).trim()).filter(Boolean) : []
      // 托管前探活:failed 的 Key 直接剔除,不写入;服务端未部署 validate 时降级为直接托管
      let results = []
      let probeModel = ''
      try {
        const probe = await tb.validateDepositKeys(baseUrl, identity.sessionToken, {
          groupId: body.groupId, keys,
        })
        results = Array.isArray(probe?.results) ? probe.results : []
        probeModel = probe?.model ?? ''
      } catch (err) {
        probeFallback = String(err.message || err)
      }
      const alive = keys.filter((_, i) => results[i]?.outcome !== 'failed')
      return {
        ok: true,
        probe: { model: probeModel, rejected: keys.length - alive.length, fallback: probeFallback || undefined },
        result: alive.length
          ? await tb.addDeposit(baseUrl, identity.sessionToken, { groupId: body.groupId, keys: alive })
          : { added: 0, duplicated: 0, rejected: 0 },
      }
    }
    case 'deposit-configured': {
      // 读取宿主凭据存储里已配置的 API Key 明文（仅此 Host 侧可读），托管到选中分组
      const ref = String(body.ref ?? '')
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new PortalError('bad credential ref')
      const credentials = await ctx.get('credentials')
      if (!credentials) throw new PortalError('credentials service absent')
      const resolved = await credentials.resolve(ref)
      const key = resolved && typeof resolved.value === 'string' ? resolved.value : ''
      if (!key) throw new PortalError(`credential ${ref} is not configured`)
      const identity = await requireLive()
      // 托管前探活:真实打一次上游,failed 拒绝托管,inconclusive(超时/上游异常)放行;服务端未部署 validate 时降级放行。
      // 未指定分组时逐个分组探活,取第一个能通过(或放行)的分组托管。
      const probeOne = async (groupId) => {
        const detail = { outcome: 'skipped', model: '', groupId }
        try {
          const probe = await tb.validateDepositKeys(baseUrl, identity.sessionToken, {
            groupId, keys: [key],
          })
          const outcome = Array.isArray(probe?.results) ? probe.results[0]?.outcome : undefined
          detail.outcome = outcome ?? 'skipped'
          detail.model = probe?.model ?? ''
          detail.reason = probe?.results?.[0]?.reason ?? ''
          detail.detail = probe?.results?.[0]?.error_detail ?? ''
        } catch (err) {
          detail.fallback = String(err.message || err)
        }
        return detail
      }
      let probeDetail
      let chosenGroup
      if (body.groupId != null) {
        chosenGroup = Number(body.groupId)
        probeDetail = await probeOne(chosenGroup)
      } else {
        const groups = (await tb.groups(baseUrl, identity.sessionToken))?.groups ?? []
        probeDetail = { outcome: 'skipped', model: '' }
        for (const group of groups) {
          if (group == null || group.id == null) continue
          probeDetail = await probeOne(Number(group.id))
          if (probeDetail.outcome !== 'failed') {
            chosenGroup = Number(group.id)
            break
          }
        }
        if (chosenGroup == null) probeDetail.reason = probeDetail.reason || 'all_groups_failed'
      }
      if (probeDetail.outcome === 'failed') {
        // 探活拒绝:传输层仍算 ok:true,deposited:false 由 UI 转「探活失败」提示
        return { ok: true, deposited: false, probe: probeDetail }
      }
      return {
        ok: true,
        deposited: true,
        probe: probeDetail,
        result: await tb.addDeposit(baseUrl, identity.sessionToken, {
          groupId: chosenGroup, keys: [key],
        }),
      }
    }
    case 'deposit-state': {
      // 该凭据是否已托管:按 token-bank 的掩码规则(前4 + … + 后4)比对
      const ref = String(body.ref ?? '')
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new PortalError('bad credential ref')
      const credentials = await ctx.get('credentials')
      if (!credentials) throw new PortalError('credentials service absent')
      const resolved = await credentials.resolve(ref)
      const key = resolved && typeof resolved.value === 'string' ? resolved.value : ''
      if (!key) throw new PortalError(`credential ${ref} is not configured`)
      const identity = await requireLive()
      const deposits = (await tb.listDeposits(baseUrl, identity.sessionToken))?.deposits ?? []
      let match = null
      if (key.length > 8) {
        const masked = key.slice(0, 4) + '…' + key.slice(-4)
        match = deposits.find((d) => d && d.masked_key === masked) ?? null
      }
      return { ok: true, deposited: Boolean(match), depositId: match ? match.id : null, status: match ? match.status : null }
    }
    case 'deposits-remove': {
      const identity = await requireLive()
      await tb.removeDeposit(baseUrl, identity.sessionToken, String(body.id ?? ''))
      return { ok: true }
    }
    case 'deposits-status': {
      const identity = await requireLive()
      await tb.setDepositStatus(baseUrl, identity.sessionToken, String(body.id ?? ''), Boolean(body.enabled))
      return { ok: true }
    }
    case 'recharge-config': {
      const identity = await requireLive()
      return { ok: true, config: await tb.rechargeConfig(baseUrl, identity.sessionToken) }
    }
    case 'checkin-status': {
      const identity = await requireLive()
      return { ok: true, checkin: await tb.checkinStatus(baseUrl, identity.sessionToken) }
    }
    case 'checkin-do': {
      const identity = await requireLive()
      return { ok: true, checkin: await tb.doCheckin(baseUrl, identity.sessionToken) }
    }
    case 'wordcoin-market': {
      const identity = await requireLive()
      return { ok: true, market: await tb.wordcoinMarket(baseUrl, identity.sessionToken) }
    }
    case 'recharge-create': {
      const identity = await requireLive()
      return { ok: true, order: await tb.createRechargeOrder(baseUrl, identity.sessionToken, body.body ?? {}) }
    }
    case 'recharge-open-pay': {
      // WebView 拦新窗口且拦 blob 跳转:落地 HTML 到临时文件,用系统默认浏览器打开
      const identity = await requireLive()
      const orderNo2 = String(body.orderNo ?? '')
      const html2 = await tb.payRechargeOrderHtml(baseUrl, identity.sessionToken, orderNo2)
      const { writeFile: writeFile2 } = await import('node:fs/promises')
      const os2 = await import('node:os')
      const path2 = await import('node:path')
      const file = path2.join(os2.tmpdir(), `dsh-tokenbank-pay-${orderNo2.replace(/[^A-Za-z0-9_-]/g, '')}.html`)
      await writeFile2(file, html2, 'utf8')
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : 'cmd'
      const args2 = process.platform === 'win32' ? ['/c', 'start', '', file] : [file]
      const { execFile: execFile2 } = await import('node:child_process')
      await new Promise(function (resolve3, reject3) {
        execFile2(opener, args2, function (err3) { return err3 ? reject3(err3) : resolve3() })
      })
      return { ok: true, file }
    }
    case 'open-external': {
      // 用系统默认浏览器打开外部链接(仅 http/https;发码后跳邮箱用)
      const url2 = String((body.body ?? body).url ?? '')
      if (!/^https?:\/\//i.test(url2)) throw new Error('only http(s) urls allowed')
      const opener2 = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : 'cmd'
      const args3 = process.platform === 'win32' ? ['/c', 'start', '', url2] : [url2]
      const { execFile: execFile3 } = await import('node:child_process')
      await new Promise(function (resolve3, reject3) {
        execFile3(opener2, args3, function (err3) { return err3 ? reject3(err3) : resolve3() })
      })
      return { ok: true }
    }
    case 'recharge-pay': {
      const identity = await requireLive()
      return {
        ok: true,
        html: await tb.payRechargeOrderHtml(baseUrl, identity.sessionToken, String(body.orderNo ?? '')),
      }
    }
    case 'recharge-order': {
      const identity = await requireLive()
      return { ok: true, order: await tb.getRechargeOrder(baseUrl, identity.sessionToken, String(body.orderNo ?? '')) }
    }
    case 'gateway-models': {
      let key = typeof body.accessKey === 'string' && body.accessKey ? body.accessKey : ''
      if (!key) {
        const identity = await readIdentity(ctx)
        key = identity?.accessKey ?? ''
      }
      if (!key) throw new PortalError('no access key available')
      // 能力元数据(input/reasoning_efforts/窗口)来自门户 /models;/v1/models
      // 是标准 OpenAI 兼容面,只有 id。门户失败时回落纯 id 列表。
      let list
      let groupProtocol = ''
      if (body.noPortal === true) {
        return { ok: true, models: await tb.listGatewayModels(baseUrl, key), accessKey: key }
      }
      try {
        const identity2 = await readIdentity(ctx)
        const groups = await tb.portalModels(baseUrl, identity2?.sessionToken ?? '') || []
        const flat = []
        for (const group of groups) {
          // 分组的上游协议(claude→anthropic-messages);取第一个有值的
          if (!groupProtocol && group.protocol) groupProtocol = group.protocol
          for (const model of group.models || []) {
            if (flat.some((m) => m.id === model.id)) continue
            flat.push({
              id: model.id,
              name: model.display_name || model.name || model.id,
              input: model.input,
              reasoningEfforts: model.reasoning_efforts || null,
              contextWindow: model.context_window || undefined,
              maxTokens: model.max_tokens || undefined,
            })
          }
        }
        list = flat.length > 0 ? flat : await tb.listGatewayModels(baseUrl, key)
      } catch {
        list = await tb.listGatewayModels(baseUrl, key)
      }
      // 只保留网关实际可调的模型:/v1/models 由有可用上游凭证的分组聚合而来,
      // 门户目录会把无凭证分组的模型也列出来,直接加进模型列表只会调用报错。
      let callable = new Set()
      try {
        for (const m of await tb.listGatewayModels(baseUrl, key)) callable.add(m.id)
      } catch { /* 网关失败时不过滤,退回门户目录 */ }
      if (callable.size > 0) list = list.filter((m) => callable.has(m.id))
      return { ok: true, models: list, protocol: groupProtocol || undefined, accessKey: key }
    }
    case 'low-balance':
      return { ok: true, event: state.lowBalanceEvent }
    default:
      throw new PortalError(`unknown action: ${action || '(empty)'}`)
  }
}

/* ── session-error watcher ───────────────────────────────────────────── */

/**
 * Watch every visible session for low-balance errors. Reconciles the
 * subscription set every 30s (new sessions get an observeEvent stream; gone
 * ones are aborted). Every matcher hit updates `state.lowBalanceEvent`.
 */
function startWatcher(ctx, state) {
  const controllers = new Map() // sessionId → AbortController
  const known = new Map() // sessionId → updatedAt from last list

  const matchesLowBalance = (event) => {
    if (!event || typeof event !== 'object') return false
    const type = String(event.type ?? '')
    const text = (() => {
      try { return JSON.stringify(event.data ?? '') } catch { return '' }
    })()
    if (!LOW_BALANCE_PATTERN.test(text)) return false
    // Require an error-shaped envelope so ordinary chatter mentioning
    // "balance" (e.g. our own panel) does not match.
    return ERROR_HINT.test(type) || ERROR_HINT.test(text.slice(0, 400))
  }

  const watchSession = (sessionId) => {
    const controller = new AbortController()
    controllers.set(sessionId, controller)
    const address = { kind: 'session', sessionId }
    const consume = async () => {
      try {
        const stream = ctx.sessionController.observeEvent(address, controller.signal)
        for await (const frame of stream) {
          const event = frame?.type === 'event' ? frame.event : null
          if (event && matchesLowBalance(event)) {
            state.lowBalanceEvent = {
              at: Date.now(),
              sessionId,
              kind: String(event.type ?? 'unknown'),
              message: (() => {
                try {
                  const data = event.data
                  return typeof data === 'string' ? data : JSON.stringify(data)?.slice(0, 400) ?? ''
                } catch { return '' }
              })(),
            }
          }
        }
      } catch {
        // stream cancelled or session closed — reconcile will clean up
      } finally {
        if (controllers.get(sessionId) === controller) controllers.delete(sessionId)
      }
    }
    consume()
  }

  const reconcile = async () => {
    try {
      const value = await ctx.sessionController.list({}, AbortSignal.timeout(20_000))
      for (const item of value?.items ?? []) {
        known.set(item.sessionId, item.updatedAt)
        if (!controllers.has(item.sessionId) && !item.blank) watchSession(item.sessionId)
      }
      for (const [sessionId, controller] of controllers) {
        if (!known.has(sessionId)) {
          controller.abort()
          controllers.delete(sessionId)
        }
      }
    } catch { /* transient list failure — next tick retries */ }
  }

  // unref so a headless assembly without webServer does not keep the process alive.
  const timer = setInterval(() => { void reconcile() }, 30_000)
  if (typeof timer.unref === 'function') timer.unref()
  void reconcile()
  return () => {
    clearInterval(timer)
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
  }
}

/* ── Cordis plugin entry ─────────────────────────────────────────────── */

export default {
  name: 'dsh-tokenbank',
  Config,
  inject: [],
  apply(ctx, config = null) {
    const cfg = { baseUrl: config?.baseUrl || 'https://bank.skillpie.cn' }
    const state = { lowBalanceEvent: null }

    ctx.effect(() => () => {}, 'dsh-tokenbank: lifetime')

    // Session watcher. sessionController is a host-required service; if the
    // assembly lacks it the fiber stays functional without the watcher.
    ctx.inject(['sessionController'], (child) => {
      child.effect(() => startWatcher(child, state), 'dsh-tokenbank: session watcher')
    })

    // HTTP carrier for the panel (optional on headless assemblies).
    ctx.inject(['webServer'], (child) => {
      child.effect(() => child.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          const send = (status, payload) => {
            res.writeHead(status, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(JSON.stringify(payload))
          }
          // Same-origin only: identity-bearing writes must never be cross-origin.
          const origin = req.headers?.origin
          if (typeof origin === 'string' && origin !== '') {
            let sameOrigin = false
            try { sameOrigin = new URL(origin).host === req.headers.host } catch { sameOrigin = false }
            if (!sameOrigin) {
              send(403, { ok: false, error: 'cross-origin request refused' })
              return
            }
          }
          if (req.method !== 'POST') {
            send(200, { ok: true, service: 'dsh-tokenbank', route: ROUTE })
            return
          }
          let body
          try {
            body = await readBody(req)
          } catch (error) {
            send(200, { ok: false, error: error?.message ?? String(error) })
            return
          }
          try {
            send(200, await dispatch(ctx, state, cfg, body))
          } catch (error) {
            send(200, { ok: false, error: error?.message ?? String(error) })
          }
        },
      }), 'dsh-tokenbank: http api')
    })
  },
}

/** Read a small JSON request body. */
function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        req.destroy()
        rejectPromise(new Error('request body too large'))
      }
    })
    req.on('end', () => {
      if (!data.trim()) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(data))
      } catch {
        rejectPromise(new Error('invalid JSON body'))
      }
    })
    req.on('error', rejectPromise)
  })
}

export { readIdentity, writeIdentity, identityLive, dispatch as __dispatchForTests }
