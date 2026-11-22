/**
 * token-bank portal client — pure fetch wrapper used by the host half.
 *
 * All portal routes live under `/api/portal` (internal/portal/http.go:88).
 * Responses are wrapped as `{ code, message, data }` (http.go:97); code 0 is
 * success. Session-authenticated calls carry the portal cookie
 * `tb_portal_session` (service.go:33) — we hold the session token in the
 * plugin's credential record and set the header here.
 */

export const PORTAL_PREFIX = '/api/portal'
export const SESSION_COOKIE = 'tb_portal_session'

/** Thin error carrying the portal's own code/message when available. */
export class PortalError extends Error {
  constructor(message, code, status) {
    super(message)
    this.name = 'PortalError'
    this.code = code
    this.status = status
  }
}

/** Normalize a configured base URL: trim, drop trailing slashes. */
export function normalizeBaseUrl(raw) {
  const value = String(raw ?? '').trim().replace(/\/+$/, '')
  if (!value) throw new PortalError('portal baseUrl is not configured')
  return value
}

async function call(baseUrl, path, { method = 'GET', body, sessionToken, timeoutMs = 20_000 } = {}) {
  const { data } = await callRaw(baseUrl, path, { method, body, sessionToken, timeoutMs })
  return data
}

/** Call and keep the raw response so Set-Cookie (the session token!) is reachable. */
async function callRaw(baseUrl, path, { method = 'GET', body, sessionToken, timeoutMs = 20_000 } = {}) {
  const url = normalizeBaseUrl(baseUrl) + PORTAL_PREFIX + path
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (sessionToken) headers['Cookie'] = `${SESSION_COOKIE}=${sessionToken}`
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new PortalError(`portal returned non-JSON (HTTP ${response.status})`, undefined, response.status)
  }
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code !== 0) {
      const error = new PortalError(payload.message || `portal error ${payload.code}`, payload.code, response.status)
      // 门户把熔断/门禁细节放在 data.reason 等字段里（如 platform_premium_breaker、
      // price_band_breaker、calibrating），不透传的话用户在插件里只会看到
      // "Access is forbidden" 而无从判断原因。
      error.data = payload.data
      throw error
    }
    return { data: payload.data, response }
  }
  // Non-wrapped payloads (defensive; the portal always wraps today).
  return { data: payload, response }
}

/**
 * The portal never echoes the session token in a body — it only sets the
 * `tb_portal_session` cookie (http.go:685). The proxy side therefore reads
 * the token straight out of Set-Cookie.
 */
export function sessionTokenFromResponse(response) {
  const cookies = typeof response?.headers?.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : []
  for (const cookie of cookies) {
    const pair = cookie.split(';', 1)[0]
    const eq = pair.indexOf('=')
    if (eq > 0 && pair.slice(0, eq).trim() === SESSION_COOKIE) {
      return pair.slice(eq + 1).trim()
    }
  }
  return ''
}

/** Register + capture session token: `{ user, accessKey, sessionToken, sessionExpiresMS }`. */
export async function registerWithSession(baseUrl, { email, code, password, displayName }) {
  const { data, response } = await callRaw(baseUrl, '/register', {
    method: 'POST',
    body: { email, code, password, display_name: displayName ?? '' },
  })
  return {
    user: data.user,
    accessKey: data.access_key,
    sessionExpiresMS: Number(data.session_expires_ms ?? 0),
    sessionToken: sessionTokenFromResponse(response),
  }
}

/** Login + capture session token: `{ user, sessionToken, sessionExpiresMS }`. */
export async function loginWithSession(baseUrl, { email, password, captchaId, captchaCode }) {
  const { data, response } = await callRaw(baseUrl, '/login', {
    method: 'POST',
    body: { email, password, captcha_id: captchaId, captcha_code: captchaCode },
  })
  return {
    user: data.user,
    sessionExpiresMS: Number(data.session_expires_ms ?? 0),
    sessionToken: sessionTokenFromResponse(response),
  }
}

/* ── anonymous endpoints ─────────────────────────────────────────────── */

export const sendCode = (baseUrl, email, purpose = 'register') =>
  call(baseUrl, '/register/send-code', { method: 'POST', body: { email, purpose } })

export const verifyCode = (baseUrl, email, code, purpose = 'register') =>
  call(baseUrl, '/register/verify-code', { method: 'POST', body: { email, code, purpose } })

/** Register: returns `{ user, access_key, session_expires_ms }` (http.go:217). */
export const register = (baseUrl, { email, code, password, displayName }) =>
  call(baseUrl, '/register', {
    method: 'POST',
    body: { email, code, password, display_name: displayName ?? '' },
  })

export const newCaptcha = (baseUrl) => call(baseUrl, '/captcha')

/** Login: returns `{ user, session_expires_ms }` (http.go:257). */
export const login = (baseUrl, { email, password, captchaId, captchaCode }) =>
  call(baseUrl, '/login', {
    method: 'POST',
    body: { email, password, captcha_id: captchaId, captcha_code: captchaCode },
  })

/* ── session endpoints (cookie carried by us) ────────────────────────── */

export const me = (baseUrl, sessionToken) => call(baseUrl, '/me', { sessionToken })

/** 更新昵称:PUT /me { display_name },返回 `{ user }`(http.go portal.profile.update)。 */
export const updateProfile = (baseUrl, sessionToken, displayName) =>
  call(baseUrl, '/me', { method: 'PUT', body: { display_name: displayName ?? '' }, sessionToken })
// 列出当前用户的访问密钥(不含明文)
export const listAccessKeys = (baseUrl, sessionToken) =>
  call(baseUrl, '/access-keys', { sessionToken })

// 取回某把访问密钥的明文(仅限本人)
export const revealAccessKey = (baseUrl, sessionToken, id) =>
  call(baseUrl, `/access-keys/${encodeURIComponent(id)}/key`, { sessionToken })

export const logout = (baseUrl, sessionToken) =>
  call(baseUrl, '/logout', { method: 'POST', sessionToken })
export const groups = (baseUrl, sessionToken) => call(baseUrl, '/groups', { sessionToken })
export const listDeposits = (baseUrl, sessionToken) => call(baseUrl, '/deposits', { sessionToken })
export const listModels = (baseUrl, sessionToken) => call(baseUrl, '/models', { sessionToken })

export const addDeposit = (baseUrl, sessionToken, { groupId, keys }) =>
  call(baseUrl, '/deposits', { method: 'POST', sessionToken, body: { group_id: groupId, keys } })

/** Pre-deposit live probe: per-key {outcome,reason,...} without storing anything. */
/** POST /deposits/auto — 单 Key 托管,服务端逐分组探活自动选分组。 */
export const autoDeposit = (baseUrl, sessionToken, key) =>
  call(baseUrl, '/deposits/auto', { method: 'POST', sessionToken, body: { key } })

export const validateDepositKeys = (baseUrl, sessionToken, { groupId, keys }) =>
  call(baseUrl, '/deposits/validate', {
    method: 'POST', sessionToken, body: { group_id: groupId, keys },
  })

export const removeDeposit = (baseUrl, sessionToken, id) =>
  call(baseUrl, `/deposits/${encodeURIComponent(id)}`, { method: 'DELETE', sessionToken })

export const setDepositStatus = (baseUrl, sessionToken, id, enabled) =>
  call(baseUrl, `/deposits/${encodeURIComponent(id)}/status`, {
    method: 'PUT', sessionToken, body: { enabled },
  })

export const rechargeConfig = (baseUrl, sessionToken) =>
  call(baseUrl, '/recharge/config', { sessionToken })

export const createRechargeOrder = (baseUrl, sessionToken, body) =>
  call(baseUrl, '/recharge/orders', { method: 'POST', sessionToken, body })

export const getRechargeOrder = (baseUrl, sessionToken, orderNo) =>
  call(baseUrl, `/recharge/orders/${encodeURIComponent(orderNo)}`, { sessionToken })

/** Alipay page.pay auto-submit form HTML (recharge.go:291). */
export async function payRechargeOrderHtml(baseUrl, sessionToken, orderNo) {
  const url = normalizeBaseUrl(baseUrl) + PORTAL_PREFIX +
    `/recharge/orders/${encodeURIComponent(orderNo)}/pay`
  const response = await fetch(url, {
    headers: { Cookie: `${SESSION_COOKIE}=${sessionToken}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new PortalError(`pay page HTTP ${response.status}`, undefined, response.status)
  return response.text()
}

/** Query the gateway's OpenAI-compatible model list with an access key. */
export async function listGatewayModels(baseUrl, accessKey) {
  const url = normalizeBaseUrl(baseUrl) + '/v1/models'
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessKey}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new PortalError(`/v1/models HTTP ${response.status}`, undefined, response.status)
  const payload = await response.json()
  return Array.isArray(payload?.data) ? payload.data : []
}


/** 门户模型目录(GET /models,带能力元数据)。返回 [{group_id, group_name, models:[...]}]。 */
export const portalModels = async (baseUrl, sessionToken) => {
  const data = await call(baseUrl, '/models', { sessionToken })
  // 形状兼容:新版本直接返回数组;现网包 {groups:[...]}
  return Array.isArray(data) ? data : (data?.groups ?? [])
}

/** GET /wordcoin/market — 词元现价(price_nano_usd_per_wc)。 */
export const checkinStatus = (baseUrl, sessionToken) => call(baseUrl, '/checkin/status', { sessionToken })

export const doCheckin = (baseUrl, sessionToken) => call(baseUrl, '/checkin', { method: 'POST', sessionToken })

export const wordcoinMarket = (baseUrl, sessionToken, historyBuckets) =>
  call(baseUrl, '/wordcoin/market' + (Number(historyBuckets) > 0 ? '?history_buckets=' + Math.floor(Number(historyBuckets)) : ''), { sessionToken })

/** GET /wordcoin/account — 词元持仓/盈亏/交易限制(WordCoinAccount)。 */
export const wordcoinAccount = (baseUrl, sessionToken) => call(baseUrl, '/wordcoin/account', { sessionToken })

/** GET /wordcoin/ledger — 词元成交流水(分页)。 */
export const wordcoinLedger = (baseUrl, sessionToken, page, pageSize) =>
  call(baseUrl, `/wordcoin/ledger?page=${Number(page) || 1}&page_size=${Number(pageSize) || 20}`, { sessionToken })

/** POST /wordcoin/buy — 市价买入,body.amount_nano_usd 为整手倍数的 nanoUSD。 */
/** POST /wordcoin/buy — 市价买入,body.lots 为手数(1 手 = $1 面值,按当前价折算词元)。 */
export const wordcoinBuy = (baseUrl, sessionToken, lots) =>
  call(baseUrl, '/wordcoin/buy', { method: 'POST', sessionToken, body: { lots: Math.floor(Number(lots) || 0) } })

/** POST /wordcoin/sell — 市价卖出,body.amount_nano_wc 为任意词元数量(nanoWC)，手续费按费率从款项扣除。 */
export const wordcoinSell = (baseUrl, sessionToken, amountNanoWC) =>
  call(baseUrl, '/wordcoin/sell', { method: 'POST', sessionToken, body: { amount_nano_wc: Math.floor(Number(amountNanoWC) || 0) } })
