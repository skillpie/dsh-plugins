// >>> dsh-plugins-plugin featured source (auto-inserted, do not remove markers)
// >>> dsh-plugins-plugin featured host (auto-inserted, do not remove markers)
function dshFeaturedHostModule() {
  // dsh-plugins-plugin — 嵌入式宿主模块(embed/featured.host.js)。
  //
  // 接入插件以 npm 依赖引用本包,在接入插件 apply 里调用:
  //   import { integrateFeaturedPlugins } from 'dsh-plugins-plugin/host'
  //   integrateFeaturedPlugins(ctx, FEATURED_SOURCE)
  //
  // 职责:
  //   1. 登记推荐源 FEATURED_SOURCE 到跨插件服务 `featured-plugins`
  //      (服务已由先激活的接入方提供时,只登记,不重复建)。
  //   2. 第一个激活的接入方作为「宿主」:拉远程集中目录、轮询已安装表、
  //      挂聚合路由 GET /dsh-plugins-plugin/featured(重复注册静默忽略)。
  //
  // client 半不走本文件分发:接入插件的 apply 经 DSH 原生 chunk 机制
  // require.async('./client.featured.js') 加载 client 模块(由 integrate.sh 拷入)。
  //
  // 多插件同时接入:板块与路由由最先激活的一方持有,其余只贡献数据;
  // 客户端用 chunk 导出 initFeatured(ctx) + window.__DSH_FEATURED_APPLIED__ 判重
  // (owner 的 apply 调用),保证「精选推荐」只渲染一块。
  
  const ROUTE = '/dsh-plugins-plugin/featured'
  const SERVICE = 'featured-plugins'
  
  /* ── 推荐源/条目规范化 ──────────────────────────────────────────────── */
  
  // 单条推荐:package 必填(npm 包名),title 必填;其余可选。
  // 富字段(author/stars/downloads/screenshots 等)由仓库 plugins.json 集中维护。
  function normalizeEntry(raw, sourceId) {
    if (!raw || typeof raw !== 'object') return null
    const pkg = String(raw.package || raw.name || '').trim()
    const title = String(raw.title || '').trim()
    if (!pkg || !title) return null
    const entry = { package: pkg, title, source: sourceId }
    for (const key of ['description', 'version', 'icon', 'homepage', 'author', 'category']) {
      const v = String(raw[key] || '').trim()
      if (v) entry[key] = v
    }
    if (Array.isArray(raw.screenshots)) {
      const shots = raw.screenshots.map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
      if (shots.length) entry.screenshots = shots
    }
    if (typeof raw.stars === 'number' && raw.stars >= 0) entry.stars = raw.stars
    if (typeof raw.downloads === 'number' && raw.downloads >= 0) entry.downloads = raw.downloads
    if (Array.isArray(raw.tags)) {
      const tags = raw.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
      if (tags.length) entry.tags = tags
    }
    return entry
  }
  
  // 一个推荐源:接入插件登记的单位。
  function normalizeSource(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('featured source must be an object')
    const id = String(raw.id || '').trim()
    if (!id) throw new Error('featured source needs an id (the integrating package name)')
    const title = String(raw.title || id).trim()
    const rawEntries = Array.isArray(raw.entries) ? raw.entries : []
    const entries = []
    for (const item of rawEntries) {
      const entry = normalizeEntry(item, id)
      if (entry) entries.push(entry)
    }
    return { id, title, entries }
  }
  
  /* ── HTTP helpers ───────────────────────────────────────────────────── */
  
  function json(res, code, obj) {
    const body = JSON.stringify(obj)
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }
  
  // 同源校验:浏览器必带 Origin;curl 无 Origin 放行(宿主属主角色已限定)
  function sameOrigin(req) {
    const origin = req.headers.origin
    if (!origin) return true
    try { return new URL(origin).host === req.headers.host } catch { return false }
  }
  
  /* ── 嵌入入口 ───────────────────────────────────────────────────────── */
  
  // ctx:接入插件自己的 cordis 上下文(apply 的第一参)。
  // source:推荐源 { id, title?, entries: [{ package, title, ... }] }。
  function integrateFeaturedPlugins(ctx, source) {
    // ── 推荐源注册表(跨插件服务,先激活者提供) ──
    let owner = false
    let registry = null
    try {
      registry = ctx.get(SERVICE)
    } catch { /* get 不可用时按未提供处理 */ }
    // 只接受具备 register 的真注册表:宿主桩可能返回 Promise 或残缺对象
    // (异步 get、版本差异),按未提供处理退化为自建,不让推荐源登记拖垮激活。
    if (!registry || typeof registry.register !== 'function') registry = null
    if (!registry) {
      const sources = new Map()
      registry = {
        register(rawSource) {
          const normalized = normalizeSource(rawSource)
          sources.set(normalized.id, normalized)
          return () => {
            if (sources.get(normalized.id) === normalized) sources.delete(normalized.id)
          }
        },
        list() {
          return [...sources.values()]
        },
      }
      try {
        ctx.effect(() => ctx.provide(SERVICE, registry), 'dsh-plugins-plugin: registry service')
        owner = true
      } catch { /* 已被并行提供 → 退化为纯登记方 */ }
    }
  
    // 登记本插件推荐源(effect 挂子上下文,插件停用即注销)
    ctx.inject([], (child) => {
      child.effect(() => registry.register(source), 'featured-plugins source: ' + String(source && source.id))
    })
  
    if (!owner) return // 非宿主:只贡献数据
  
    // ── 宿主职责:远程集中目录(5 分钟内存缓存,node fetch,无浏览器缓存/CORS) ──
    const REMOTE_CATALOG_URLS = [
      'https://cdn.jsdelivr.net/gh/skillpie/dsh-plugins@main/dsh-plugins-plugin/plugins.json',
      'https://raw.githubusercontent.com/skillpie/dsh-plugins/main/dsh-plugins-plugin/plugins.json',
    ]
    const REMOTE_TTL_MS = 5 * 60_000
    let remoteCache = { at: 0, doc: null }
  
    // 多源并发拉取,取「最新」的那份。单源「先到先用」会被 CDN 缓存坑:
    // jsdelivr 的 @main 有数分钟到数小时的延迟,raw.githubusercontent 通常更快,
    // 谁先返回就用谁会让旧数据长期遮住新数据。
    //
    // 判新三要素(优先级从高到低):
    //   1. updated 日期(仓库写入时的时间戳)
    //   2. 条目数 —— plugins.json 只会增不会减,多的一定更新
    //   3. 版本号总和 —— 同一条目升级时条目数不变,靠这个比出来
    // 只比 updated 不够:enrich 脚本按天写 updated(如 "2026-11-22"),
    // 同一天内的多次提交无法区分,会退化成「谁先返回用谁」。
    const catalogScore = (doc) => {
      const t = Date.parse(String(doc?.updated || ''))
      const entries = Array.isArray(doc?.entries) ? doc.entries : []
      let versions = 0
      for (const e of entries) {
        const parts = String(e?.version || '0.0.0').split('.').map((n) => Number.parseInt(n, 10) || 0)
        versions += (parts[0] || 0) * 1_000_000 + (parts[1] || 0) * 1_000 + (parts[2] || 0)
      }
      return { at: Number.isFinite(t) ? t : 0, count: entries.length, versions }
    }
  
    const newerCatalog = (a, b) => {
      // a 是否比 b 新
      if (a.at !== b.at) return a.at > b.at
      if (a.count !== b.count) return a.count > b.count
      return a.versions > b.versions
    }
  
    async function fetchRemoteCatalog() {
      const now = Date.now()
      if (remoteCache.doc && now - remoteCache.at < REMOTE_TTL_MS) return remoteCache.doc
      const results = await Promise.all(
        REMOTE_CATALOG_URLS.map(async (url) => {
          try {
            const res = await fetch(url, {
              headers: { accept: 'application/json' },
              signal: AbortSignal.timeout(8000),
              cache: 'no-store',
            })
            if (!res.ok) return null
            const doc = await res.json()
            return Array.isArray(doc?.entries) ? doc : null
          } catch { return null }
        }),
      )
      const docs = results.filter(Boolean)
      if (docs.length === 0) return null
      // 三要素比较;完全相同时保留并发顺序靠前者(jsdelivr 在前)。
      const best = docs.reduce((a, b) => (newerCatalog(catalogScore(b), catalogScore(a)) ? b : a))
      remoteCache = { at: now, doc: best }
      return best
    }
  
    // ── 已安装列表(host 侧轮询 pluginManager,独立 inject 作用域防回滚) ──
    let installedMap = {}
    try {
      ctx.inject(['pluginManager'], (child) => {
        child.effect(() => {
          let timer = null
          const refresh = async () => {
            try {
              const bundles = await child.pluginManager.listBundles()
              const map = {}
              for (const b of bundles) {
                if (b && b.name && b.installed) map[b.name] = b.version || ''
              }
              installedMap = map
            } catch { /* 保留上一次结果 */ }
          }
          refresh()
          timer = setInterval(refresh, 30_000)
          if (timer && typeof timer.unref === 'function') timer.unref() // 不阻塞宿主退出
          return () => clearInterval(timer)
        }, 'dsh-plugins-plugin: installed bundles watcher')
      })
    } catch { /* pluginManager 不可用 → 无已安装徽标,不影响板块 */ }
  
    // ── 聚合:远程目录(主)+ 登记源(补充),按包名去重,先到者优先;富字段回填 ──
    const RICH_KEYS = ['author', 'homepage', 'category', 'icon', 'screenshots', 'stars', 'downloads']
    const aggregate = async () => {
      const remoteRaw = Array.isArray(remoteCache.doc?.entries) ? remoteCache.doc.entries : []
      const remoteIndex = new Map()
      for (const raw of remoteRaw) {
        const pkg = String(raw?.package || raw?.name || '').trim()
        if (pkg && !remoteIndex.has(pkg)) remoteIndex.set(pkg, raw)
      }
      const seen = new Set()
      const entries = []
      const push = (normalized) => {
        if (!normalized || seen.has(normalized.package)) return
        seen.add(normalized.package)
        const rich = remoteIndex.get(normalized.package)
        if (rich && normalized.source !== 'plugins.json') {
          for (const key of RICH_KEYS) {
            if (normalized[key] === undefined && rich[key] !== undefined) normalized[key] = rich[key]
          }
        }
        entries.push(normalized)
      }
      for (const raw of remoteRaw) push(normalizeEntry(raw, 'plugins.json'))
      for (const src of registry.list()) {
        for (const entry of src.entries) push(entry)
      }
      return {
        entries,
        sources: registry.list().map((s) => ({ id: s.id, title: s.title, count: s.entries.length })),
        installed: installedMap,
        remote: remoteCache.doc ? { fetchedAt: new Date(remoteCache.at).toISOString(), count: entries.length } : null,
      }
    }
  
    // ── 聚合路由(重复注册会抛错 → try/catch 静默,已有宿主持有) ──
    ctx.inject(['webServer'], (child) => {
      child.effect(() => {
        let dispose = null
        try {
          dispose = child.webServer.register({
            kind: 'exact',
            path: ROUTE,
            handler: async (req, res) => {
              try {
                if (!sameOrigin(req)) { json(res, 403, { ok: false, error: 'cross-origin request rejected' }); return }
                if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
                await fetchRemoteCatalog().catch(() => null)
                json(res, 200, { ok: true, data: await aggregate() })
              } catch (err) {
                json(res, 200, { ok: false, error: String(err?.message || err) })
              }
            },
          })
        } catch { /* 路由已存在(另一接入方先注册)→ 本方只作数据方 */ }
        return () => {
          if (typeof dispose === 'function') dispose()
        }
      }, 'dsh-plugins-plugin: featured route')
    })
  }
  return { integrateFeaturedPlugins }
}
const { integrateFeaturedPlugins } = dshFeaturedHostModule()
// <<< dsh-plugins-plugin featured host

// 精选插件推荐源(dsh-plugins-plugin):
const FEATURED_SOURCE = {
  id: "dsh-tokenbank", // 推荐源标识,重复登记以此覆盖
  title: "TokenBank", // 「推荐来源」显示名
  entries: [
    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):
    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",
    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },
  ],
}
// <<< dsh-plugins-plugin featured source


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
 *   { action: 'promo-summary' }                → { ok, summary }  (推广码/累计人数/累计奖励)
 *   { action: 'portal-models' }                → { ok, models }  (门户模型目录,含分组归属)
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
          // 平台托管总数(门户总览页「托管凭证 x / y」的分母)
          platformCredentialCount: data.platform_credential_count,
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
    case 'key-quotas': {
      const identity = await requireLive()
      try {
        const data = await tb.listKeyQuotas(baseUrl, identity.sessionToken)
        return { ok: true, quotas: data?.quotas ?? [] }
      } catch (error) {
        if (error instanceof PortalError && (error.status === 401 || error.status === 403)) {
          return { ok: true, loggedIn: false, expired: true, quotas: [] }
        }
        throw error
      }
    }
    case 'notifications': {
      const identity = await requireLive()
      try {
        const data = await tb.listNotifications(baseUrl, identity.sessionToken)
        return { ok: true, notification: data?.notification ?? null }
      } catch (error) {
        if (error instanceof PortalError && (error.status === 401 || error.status === 403)) {
          return { ok: true, loggedIn: false, expired: true, notification: null }
        }
        throw error
      }
    }
    case 'notification-read': {
      const identity = await requireLive()
      const id = Number(body?.id)
      if (!Number.isFinite(id) || id <= 0) {
        return { ok: false, error: 'invalid id' }
      }
      try {
        await tb.markNotificationRead(baseUrl, identity.sessionToken, id)
        return { ok: true, read: true }
      } catch (error) {
        if (error instanceof PortalError && (error.status === 401 || error.status === 403)) {
          return { ok: true, loggedIn: false, expired: true, read: false }
        }
        throw error
      }
    }
    case 'profile-update': {
      const identity = await requireLive()
      const data = await tb.updateProfile(baseUrl, identity.sessionToken, String(body.displayName ?? '').trim())
      return { ok: true, user: data.user }
    }
    case 'groups': {
      const identity = await requireLive()
      return { ok: true, groups: (await tb.groups(baseUrl, identity.sessionToken))?.groups ?? [] }
    }
    case 'promo-summary': {
      // 推广概览(推广码/累计人数/累计奖励):「推广赚$」弹窗数据源
      const identity = await requireLive()
      return { ok: true, summary: await tb.promoSummary(baseUrl, identity.sessionToken) }
    }
    case 'portal-models': {
      // 门户模型目录 [{group_id, group_name, models:[...]}]:托管弹窗的厂商模型选择器数据源
      const identity = await requireLive()
      return { ok: true, models: (await tb.portalModels(baseUrl, identity.sessionToken)) ?? [] }
    }
    case 'deposits-list': {
      const identity = await requireLive()
      return { ok: true, deposits: (await tb.listDeposits(baseUrl, identity.sessionToken))?.deposits ?? [] }
    }
    case 'deposits-add': {
      const identity = await requireLive()
      let probeFallback = ''
      const keys = Array.isArray(body.keys) ? body.keys.map((k) => String(k).trim()).filter(Boolean) : []
      if (body.groupId == null) {
        // 自动分组:服务端 /deposits/auto 逐分组探活选组;未部署时降级为逐分组探活
        try {
          const results = []
          for (const key of keys) {
            results.push(await tb.autoDeposit(baseUrl, identity.sessionToken, key))
          }
          return { ok: true, auto: true, result: { results } }
        } catch (err) {
          probeFallback = String(err.message || err)
          if (!/404|not found|non-JSON/i.test(probeFallback) && !/validate/i.test(probeFallback)) {
            throw err
          }
        }
        // 降级:客户端侧逐分组探活
        const groups = (await tb.groups(baseUrl, identity.sessionToken))?.groups ?? []
        let chosenGroup = null
        for (const group of groups) {
          if (group == null || group.id == null) continue
          try {
            const probe = await tb.validateDepositKeys(baseUrl, identity.sessionToken, { groupId: Number(group.id), keys: keys.slice(0, 1) })
            if (Array.isArray(probe?.results) && probe.results[0]?.outcome !== 'failed') { chosenGroup = Number(group.id); break }
          } catch { /* 该分组探活不可用,试下一个 */ }
        }
        if (chosenGroup == null) throw new PortalError('no group accepts these keys')
        const probe2 = await tb.validateDepositKeys(baseUrl, identity.sessionToken, { groupId: chosenGroup, keys })
        const probeResults = Array.isArray(probe2?.results) ? probe2.results : []
        const alive = keys.filter((_, i) => probeResults[i]?.outcome !== 'failed')
        return {
          ok: true,
          probe: { model: probe2?.model ?? '', rejected: keys.length - alive.length },
          result: alive.length
            ? await tb.addDeposit(baseUrl, identity.sessionToken, { groupId: chosenGroup, keys: alive })
            : { added: 0, duplicated: 0, rejected: 0 },
        }
      }
      // 指定分组(设置页一键托管走这里)
      let results = []
      let probeModel = ''
      try {
        const probe = await tb.validateDepositKeys(baseUrl, identity.sessionToken, {
          groupId: Number(body.groupId), keys,
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
          ? await tb.addDeposit(baseUrl, identity.sessionToken, { groupId: Number(body.groupId), keys: alive })
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
      return { ok: true, market: await tb.wordcoinMarket(baseUrl, identity.sessionToken, body.buckets) }
    }
    case 'wordcoin-account': {
      const identity = await requireLive()
      return { ok: true, account: await tb.wordcoinAccount(baseUrl, identity.sessionToken) }
    }
    case 'wordcoin-ledger': {
      const identity = await requireLive()
      return { ok: true, ledger: await tb.wordcoinLedger(baseUrl, identity.sessionToken, Number(body.page) || 1, Number(body.pageSize) || 20) }
    }
    case 'wordcoin-buy': {
      const identity = await requireLive()
      const lots = Math.floor(Number(body.lots) || 0)
      if (!(lots > 0)) throw new PortalError('lots must be positive')
      return { ok: true, result: await tb.wordcoinBuy(baseUrl, identity.sessionToken, lots) }
    }
    case 'wordcoin-sell': {
      const identity = await requireLive()
      const amount = Math.floor(Number(body.amountNanoWC) || 0)
      if (!(amount > 0)) throw new PortalError('amount must be positive')
      return { ok: true, result: await tb.wordcoinSell(baseUrl, identity.sessionToken, amount) }
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
  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主




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
            // 门户的业务拒绝原因（熔断器/门禁）在 error.data 里，一并回传给客户端，
            // 否则用户只能看到一句 "Access is forbidden"。
            const detail = error?.data && typeof error.data === 'object'
              ? ' (' + Object.entries(error.data).map(([key, value]) => key + '=' + value).join(', ') + ')'
              : ''
            send(200, { ok: false, error: (error?.message ?? String(error)) + detail, data: error?.data })
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
