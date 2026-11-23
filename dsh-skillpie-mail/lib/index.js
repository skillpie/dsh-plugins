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
  id: "dsh-skillpie-mail", // 推荐源标识,重复登记以此覆盖
  title: "dsh-skillpie-mail", // 「推荐来源」显示名
  entries: [
    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):
    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",
    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },
  ],
}
// <<< dsh-plugins-plugin featured source

/**
 * dsh-skillpie-mail — Cordis 入口(宿主半)。
 *
 * POST /dsh-skillpie-mail/api 动作:
 *   list                     → { mailboxes }            (不含密码)
 *   add      {email,password,note} → { mailboxes }      (IMAP 登录校验后保存)
 *   remove   {email}          → { mailboxes }
 *   register {username,note}  → { mailboxes, address, appPassword }  (SkillPie 注册页 API 建号并自动入列)
 *   poll     {wait?}          → { notifications, seq }   (取走新邮件通知)
 *
 * 后台每 pollInterval 秒 IMAP 轮询全部邮箱;密码存凭据记录,永不出宿主。
 */
import { MailStore, RECORD_ID } from './store.js'
import { ImapClient } from './imap.js'

export const ROUTE = '/dsh-skillpie-mail/api'
const MAX_BODY = 64 * 1024
const REGISTER_URL = 'https://mail.skillpie.cn/register/api/register'

/** 插件配置(默认连 SkillPie 邮箱服务器)。 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-skillpie-mail',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) {
        return { issues: [{ message: 'expected an object' }] }
      }
      const value = {}
      for (const key of ['registerUrl', 'imapHost']) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== 'string' || !input[key].trim()) {
            return { issues: [{ message: 'expected a non-empty string', path: [key] }] }
          }
          value[key] = input[key].trim()
        }
      }
      if (input.imapPort !== undefined) {
        const port = Number(input.imapPort)
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          return { issues: [{ message: 'expected a port number', path: ['imapPort'] }] }
        }
        value.imapPort = port
      }
      if (input.pollInterval !== undefined) {
        const sec = Number(input.pollInterval)
        if (!Number.isFinite(sec) || sec < 5) {
          return { issues: [{ message: 'expected seconds >= 5', path: ['pollInterval'] }] }
        }
        value.pollInterval = sec
      }
      return { value }
    },
  },
}

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

/** 快速注册:调 SkillPie 注册页 API(注册码已放开,invite 传空)。 */
async function registerMailbox(registerUrl, username, note) {
  const response = await fetch(registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, note, invite: '' }),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!payload || payload.ok !== true) {
    throw new Error(payload?.message || `注册失败(HTTP ${response.status})`)
  }
  return payload
}

/** IMAP 登录校验(手动添加邮箱时)。 */
async function verifyImap(host, port, email, password) {
  const client = new ImapClient({ host, port, user: email, password, timeoutMs: 15000 })
  try {
    await client.connect()
  } finally {
    await client.logout().catch(() => {})
  }
}

async function dispatch(store, cfg, body) {
  const action = typeof body?.action === 'string' ? body.action : ''
  switch (action) {
    case 'list': {
      return { ok: true, mailboxes: await store.list() }
    }
    case 'addOrRegister': {
      // 合并入口:有应用密码先按已有邮箱验证添加;不通过/没填则自动注册
      const username = String(body.username || '').trim().toLowerCase()
      const note = String(body.note || '')
      const password = String(body.password || '')
      if (!/^[a-z0-9][a-z0-9._-]{2,30}$/.test(username)) {
        return { ok: false, error: '用户名格式不对(3-31位小写字母/数字/._-)' }
      }
      if (password) {
        try {
          const email = username.includes('@') ? username : username + '@skillpie.cn'
          await verifyImap(cfg.imapHost, cfg.imapPort, email, password)
          await store.add(email, password, note)
          return { ok: true, mode: 'added', mailboxes: await store.list() }
        } catch (e) { /* 登录失败→当新邮箱自动注册 */ }
      }
      const result = await registerMailbox(cfg.registerUrl, username, note)
      await store.addFromRegister({ address: result.address, appPassword: result.appPassword, note })
      return { ok: true, mode: 'registered', address: result.address, appPassword: result.appPassword, mailboxes: await store.list() }
    }
    case 'add': {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const note = String(body.note || '')
      await verifyImap(cfg.imapHost, cfg.imapPort, email, password)
      await store.add(email, password, note)
      return { ok: true, mailboxes: await store.list() }
    }
    case 'remove': {
      await store.remove(body.email)
      return { ok: true, mailboxes: await store.list() }
    }
    case 'register': {
      const username = String(body.username || '').trim().toLowerCase()
      const note = String(body.note || '')
      const result = await registerMailbox(cfg.registerUrl, username, note)
      await store.addFromRegister({ address: result.address, appPassword: result.appPassword, note })
      return { ok: true, address: result.address, appPassword: result.appPassword, mailboxes: await store.list() }
    }
    case 'unread': {
      return { ok: true, count: await store.unreadCount() }
    }
    case 'markAllRead': {
      await store.markAllRead(String(body.email || ''))
      return { ok: true }
    }
    case 'deleteMail': {
      await store.deleteMail(String(body.id || ''))
      return { ok: true }
    }
    case 'markRead': {
      await store.markRead(String(body.id || ''))
      return { ok: true }
    }
    case 'history': {
      return { ok: true, messages: await store.history(String(body.email || '').trim().toLowerCase()) }
    }
    case 'clearHistory': {
      const remaining = await store.clearHistory(String(body.email || '').trim().toLowerCase())
      return { ok: true, remaining }
    }
    case 'poll': {
      const sinceSeq = Number(body.sinceSeq) || 0
      return { ok: true, notifications: store.takeNotifications(sinceSeq) }
    }
    case 'pollNow': {
      const sinceSeq = Number(body.sinceSeq) || 0
      await store.pollOnce(cfg)
      return { ok: true, notifications: store.takeNotifications(sinceSeq) }
    }
    default:
      throw new Error(`unknown action: ${action || '(empty)'}`)
  }
}

/** Cordis 插件入口。 */
export default {
  name: 'dsh-skillpie-mail',
  Config,
  inject: [],
  async apply(ctx, config = null) {
  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主


    const cfg = {
      registerUrl: config?.registerUrl ?? REGISTER_URL,
      imapHost: config?.imapHost ?? 'mail.skillpie.cn',
      imapPort: config?.imapPort ?? 993,
      pollInterval: config?.pollInterval ?? 20,
    }
    const folders = ['INBOX', 'Junk Mail'] // 验证码常进垃圾箱,一并监控

    // store 由 credentials 注入填充; HTTP 路由不依赖它, 先注册保证 API 可用
    const holder = { store: null }

    // 同步回调!async 回调会让宿主无法在插件停用时回收定时器,每次热重载泄漏一个轮询实例
    ctx.inject(['credentials'], (child) => {
      const credentials = child.credentials
      holder.store = new MailStore(credentials)
      const imapOpts = { host: cfg.imapHost, port: cfg.imapPort, folders }
      // 首轮立即拉一次,保证基线 lastUid(不推历史邮件:首轮只记水位)
      child.effect(() => {
        const timer = setInterval(() => {
          holder.store.pollOnce(imapOpts).catch(() => {})
        }, cfg.pollInterval * 1000)
        // 首轮只记水位,避免把存量邮件全推成弹窗
        holder.store.pollOnce({ ...imapOpts, baseline: true }).catch(() => {})
        return () => clearInterval(timer)
      }, 'dsh-skillpie-mail: poll timer')
    })

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
          try {
            const origin = req.headers?.origin
            if (typeof origin === 'string' && origin !== '') {
              let sameOrigin = false
              try { sameOrigin = new URL(origin).host === req.headers.host } catch {}
              if (!sameOrigin) {
                send(403, { ok: false, error: 'cross-origin request refused' })
                return
              }
            }
            if (req.method !== 'POST') {
              send(200, { ok: true, service: 'dsh-skillpie-mail', route: ROUTE })
              return
            }
            if (!holder.store) {
              send(200, { ok: false, error: 'credentials service not ready' })
              return
            }
            send(200, await dispatch(holder.store, { ...cfg, folders }, await readBody(req)))
          } catch (error) {
            send(200, { ok: false, error: error?.message ?? String(error) })
          }
        },
      }), 'dsh-skillpie-mail: http api')
    })
  },
}

export { MailStore, RECORD_ID, dispatch }
