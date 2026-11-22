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
  id: "dsh-project-report", // 推荐源标识,重复登记以此覆盖
  title: "dsh-project-report", // 「推荐来源」显示名
  entries: [
    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):
    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",
    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },
  ],
}
// <<< dsh-plugins-plugin featured source

// dsh-project-report — host half.
//
// POST /dsh-project-report/api 单路由 JSON API:
//   项目发现 / 日报生成(按项目 cwd,项目唯一) / Moka 加班提交 / 定时调度 / 历史记录。
// 项目来源:客户端传入会话工作目录 cwd(= DSH 项目),服务端在该目录下发现 git 仓库。
// 定时:原生 setInterval 每 20s tick,纯函数 shouldFire 判定,不依赖 DSH 自动化任务。
import path from 'node:path'
import { MokaClient, MokaError } from './moka.js'
import { PluginState } from './state.js'
import { collectPaths, discoverRepos, localDateStr, isValidDateStr, addDays } from './git.js'
import { buildReport, buildReason } from './report.js'
import { renderAttachment } from './render.js'
import { shouldFire } from './schedule.js'
import { collectSessions } from './sessions.js'

export const ROUTE = '/dsh-project-report/api'
// 凭据键格式是 "<scope>/<id>",scope 本身不能再含 "/",scoped 包名只能取短名部分
const MOKA_RECORD = 'project-report/moka'
const BODY_LIMIT = 256 * 1024

/* ── config ─────────────────────────────────────────────────────────── */

const issue = (message, ...path) => ({ message, path: path.length ? path : undefined })

export const Config = {
  '~standard': {
    version: 1,
    vendor: 'skillpie',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) return { issues: [issue('expected an object')] }
      const value = {}
      const issues = []
      if (input.workspace !== undefined) {
        if (typeof input.workspace !== 'string') issues.push(issue('expected a string', 'workspace'))
        else value.workspace = input.workspace.trim()
      }
      if (input.gitAuthor !== undefined) {
        if (typeof input.gitAuthor !== 'string') issues.push(issue('expected a string', 'gitAuthor'))
        else value.gitAuthor = input.gitAuthor.trim()
      }
      if (input.scheduleTime !== undefined) {
        if (typeof input.scheduleTime !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(input.scheduleTime.trim())) {
          issues.push(issue("expected 'HH:MM'", 'scheduleTime'))
        } else value.scheduleTime = input.scheduleTime.trim()
      }
      if (input.scheduleEnabled !== undefined) {
        if (typeof input.scheduleEnabled !== 'boolean') issues.push(issue('expected a boolean', 'scheduleEnabled'))
        else value.scheduleEnabled = input.scheduleEnabled
      }
      return issues.length ? { issues } : { value }
    },
  },
}

/* ── helpers ────────────────────────────────────────────────────────── */

function json(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('request body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch (err) { reject(new Error(`invalid JSON body: ${err.message}`)) }
    })
    req.on('error', reject)
  })
}

// 同源校验:浏览器必带 Origin;curl 无 Origin 放行(宿主属主角色已限定)
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try { return new URL(origin).host === req.headers.host } catch { return false }
}

// cwd 规范化:去尾斜杠、非空校验
function normalizeCwd(cwd) {
  const s = String(cwd || '').trim().replace(/\/+$/, '')
  if (!s) throw new Error('缺少项目路径 cwd(应为会话工作目录)')
  return s
}

// 从日报 markdown 提取条目(与 report.js 输出格式互逆)
function parseReportItems(markdown) {
  const items = []
  for (const line of String(markdown || '').split('\n')) {
    const m = /^\s*\d+\.\s+\*\*(.+?)\*\*[：:]\s*(.+?)。?\s*$/.exec(line)
    if (m) items.push({ category: m[1], text: m[2].replace(/（[^）]*）$/, ''), times: [] })
  }
  return items
}

/* ── apply ──────────────────────────────────────────────────────────── */

export default {
  name: 'dsh-project-report',
  Config,
  inject: [],
  apply(ctx, rawConfig = null) {
  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主

    const cfg = rawConfig ?? {}
    const state = new PluginState()
    state.applyConfigDefaults(cfg)
    let running = false

    const readMoka = async (credentials) => {
      if (!credentials) return null
      const rec = await credentials.readRecord(MOKA_RECORD)
      const payload = rec?.payload
      return payload && payload.email && payload.password ? { email: payload.email, password: payload.password } : null
    }

    // credentials 是可选服务,不能进 inject 依赖(注入会永远 pending):
    // 参照 dsh-remote 的做法,每个请求惰性 ctx.get('credentials')
    const getCredentials = () => (typeof ctx.get === 'function' ? ctx.get('credentials') : undefined)

    // 项目来源(定时全量跑时用):DSH 已打开的工作区(workspaceRegistry) + 可选附加目录。
    // workspaceRegistry 同样惰性读取(可选依赖,不在 inject 列表里)。
    const getWorkspaces = () => {
      try {
        const reg = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : undefined
        if (!reg || typeof reg.list !== 'function') return []
        return reg.list().map((w) => ({
          id: String(w.id || ''),
          title: String(w.title || ''),
          path: String(w.path || ''),
          sessions: Array.isArray(w.sessionIds) ? w.sessionIds.length : 0,
        })).filter((w) => w.path)
      } catch { return [] }
    }

    const allRoots = () => {
      const roots = getWorkspaces().map((w) => w.path)
      const extra = String(state.settings.workspace || '').trim()
      if (extra && !roots.includes(extra)) roots.push(extra)
      return [...new Set(roots)]
    }

    // 单项目日报生成:cwd = 会话工作目录(项目根)。
    // cwd 自身是仓库 → 该仓库;cwd 下含多个仓库 → 全部聚合。mineOnly 默认仅本人提交。
    const generateForCwd = async ({ cwd, date, dateEnd, mineOnly, collect }) => {
      const root = normalizeCwd(cwd)
      const s = state.settings
      const d = date || localDateStr(new Date())
      const dEnd = dateEnd || d
      if (dEnd < d) throw new Error(`结束日期(${dEnd})早于起始日期(${d})`)
      const only = mineOnly === undefined ? true : !!mineOnly
      const wantCommits = collect ? collect.commits !== false : true
      const wantSessions = collect ? !!collect.sessions : !!s.collect?.sessions
      const { rootInfo, projects } = await discoverRepos([root])
      if (!projects.length) {
        throw new Error(rootInfo.some((r) => r.rootExists)
          ? `项目目录里没有发现 git 仓库: ${root}`
          : `项目目录不存在: ${root}`)
      }
      const results = wantCommits
        ? await collectPaths({ paths: projects.map((p) => p.path), date: d, dateEnd: dEnd, authorOverride: s.gitAuthor, mineOnly: only, cutover: s.cutover })
        : { projects: projects.map((p) => ({ name: p.name, path: p.path, author: '', commits: [] })), total: 0 }
      // 会话记录:智能提取项目(或其父工作区)在采集窗口内活跃的会话标题与用户指令
      let sessionInfo = null
      if (wantSessions) {
        const controller = ctx.get('sessionController')
        sessionInfo = await collectSessions({ controller, root, dateStart: d, dateEnd: dEnd, cutover: s.cutover })
      }
      const rep = buildReport({ date: d, dateEnd: dEnd, projects: results.projects, sessions: sessionInfo ? sessionInfo.items : [] })
      return {
        date: d, dateEnd: dEnd, cwd: root, project: path.basename(root), mineOnly: only,
        report: rep.markdown, items: rep.items, summary: rep.summary, stats: rep.stats,
        total: results.total,
        sessionCount: sessionInfo ? sessionInfo.total : 0,
        sessionFallback: !!(sessionInfo && sessionInfo.fallbackParent),
        repos: results.projects.map((p) => ({ name: p.name, total: p.commits.length })),
      }
    }

    // 定时/手动触发的完整流水线:逐项目采集 → 日报 → (可选)加班 → 历史。
    // 每个项目各存一份当前日报(项目唯一);加班用提交数最多的项目日报。
    const runDaily = async ({ trigger, date, autoOvertime, credentials, cwd }) => {
      if (running) return { ok: false, busy: true, error: '已有任务在运行中' }
      running = true
      try {
        const d0 = date || localDateStr(new Date())
        const s = state.settings
        // 「汇报前一天」:仅定时自动跑生效——目标汇报日为前一天(窗口=前一天割接→当天割接;
        // 跨零点加班第二天早上到点自动补交)。手动 runNow/generate 用户显式选日期,不偏移。
        const schedPrevDay = cwd ? state.getSchedule(normalizeCwd(cwd)).prevDay : s.schedule.prevDay
        const d = !date && trigger === 'schedule' && schedPrevDay ? addDays(d0, -1) : d0
        // cwd 给定 → 只跑该项目;否则跑全部项目(工作区+附加目录)
        const roots = cwd ? [normalizeCwd(cwd)] : allRoots()
        if (!roots.length) throw new Error('DSH 没有已打开的项目(工作区),请先在 GUI 侧栏打开项目目录')
        const perProject = []
        let grandTotal = 0
        for (const root of roots) {
          try {
            const rep = await generateForCwd({ cwd: root, date: d, mineOnly: true, collect: s.collect })
            state.putReport(rep.cwd, {
              cwd: rep.cwd, project: rep.project, date: rep.date, dateEnd: rep.dateEnd, genAt: new Date().toISOString(),
              markdown: rep.report, items: rep.items, total: rep.total, mineOnly: rep.mineOnly, repos: rep.repos,
              sessionCount: rep.sessionCount,
            })
            perProject.push({ cwd: rep.cwd, name: rep.project, total: rep.total, markdown: rep.report, items: rep.items })
            grandTotal += rep.total
          } catch { /* 单项目失败不阻断其它项目 */ }
        }
        if (!perProject.length) throw new Error('DSH 已打开的项目里没有发现 git 仓库')
        // 加班与日报主条目取提交数最多的项目
        const primary = [...perProject].sort((a, b) => b.total - a.total)[0]
        const repoNames = perProject.map((p) => p.name)
        const entry = {
          date: d, at: new Date().toISOString(), trigger,
          cwd: cwd ? normalizeCwd(cwd) : '',
          commits: grandTotal, projects: repoNames,
          perProject: perProject.map((p) => ({ cwd: p.cwd, name: p.name, total: p.total })),
          report: primary.markdown, overtime: null,
        }
        // 自动加班开关:显式参数 > 该项目 schedule.autoOvertime > 全局模板
        const projSched = cwd ? state.getSchedule(normalizeCwd(cwd)) : null
        const wantOvertime = autoOvertime ?? (projSched ? projSched.autoOvertime : state.settings.schedule.autoOvertime)
        if (wantOvertime && primary.total > 0) {
          const acct = await readMoka(getCredentials())
          if (!acct) {
            entry.overtime = { ok: false, error: '未配置 Moka 账号,跳过自动加班' }
          } else {
            try {
              const client = new MokaClient({ email: acct.email, password: acct.password })
              const reason = buildReason(primary.items, '')
              const attachment = renderAttachment({ date: d, repoNames, total: primary.total, items: primary.items, overtime: null })
              const result = await client.submitOvertime({ date: d, reason, attachment })
              entry.overtime = { ok: true, ...result }
            } catch (err) {
              entry.overtime = { ok: false, error: String(err?.message || err), step: err?.step || 'unknown' }
            }
          }
        }
        state.pushHistory(entry)
        // 每个项目各自的运行游标(项目隔离:只在命中该项目自己的时间点时触发)
        const otSuffix = entry.overtime ? (entry.overtime.ok ? ' · 加班已提交' : ` · 加班失败: ${entry.overtime.error}`) : ''
        for (const p of perProject) state.markRun(p.cwd, d, `${p.total} commits${otSuffix}`)
        return { ok: true, entry }
      } finally {
        running = false
      }
    }

    ctx.inject(['webServer'], (child) => {
      const dispatch = async (body) => {
        const action = body?.action
        switch (action) {
          case 'ping':
            return { name: 'dsh-project-report', version: '0.1.6', route: ROUTE, time: new Date().toISOString() }
          case 'getState': {
            const acct = await readMoka(getCredentials())
            const cwd = body?.cwd ? normalizeCwd(body.cwd) : null
            const run = cwd ? state.getRun(cwd) : { lastRunDate: null, lastRunAt: null, lastRunSummary: '' }
            return {
              settings: state.settings,
              // 项目隔离:cwd 给定时返回该项目自己的每日收集设置与运行游标
              schedule: cwd ? state.getSchedule(cwd) : state.settings.schedule,
              mokaConfigured: !!acct,
              mokaEmail: acct?.email || '',
              lastRunDate: run.lastRunDate,
              lastRunAt: run.lastRunAt,
              lastRunSummary: run.lastRunSummary || '',
              historyCount: state.data.history.length,
            }
          }
          case 'setSettings': {
            // 项目隔离:{cwd, schedule} 写该项目自己的每日收集设置;不带 cwd 走旧全局设置(schedule 字段忽略)
            if (body?.cwd && body?.schedule) {
              const schedule = state.setSchedule(normalizeCwd(body.cwd), body.schedule)
              return { settings: state.settings, schedule }
            }
            const settings = state.patchSettings(body || {})
            return { settings }
          }
          case 'listProjects': {
            // 定时任务可整理的项目范围(工作区 + 可选附加目录)
            const workspaces = getWorkspaces()
            const { rootInfo, projects } = await discoverRepos(allRoots())
            return { workspaces, rootInfo, projects }
          }
          case 'generate': {
            const date = body?.date || undefined
            if (date && !isValidDateStr(date)) throw new Error(`日期格式应为 YYYY-MM-DD: "${date}"`)
            const dateEnd = body?.dateEnd || undefined
            if (dateEnd && !isValidDateStr(dateEnd)) throw new Error(`日期格式应为 YYYY-MM-DD: "${dateEnd}"`)
            // 收集方式多选:{commits:bool, sessions:bool};缺省沿用设置默认
            const collect = body?.collect && typeof body.collect === 'object'
              ? { commits: body.collect.commits !== false, sessions: !!body.collect.sessions }
              : undefined
            const rep = await generateForCwd({ cwd: body?.cwd, date, dateEnd, mineOnly: body?.mineOnly, collect })
            state.putReport(rep.cwd, {
              cwd: rep.cwd, project: rep.project, date: rep.date, dateEnd: rep.dateEnd, genAt: new Date().toISOString(),
              markdown: rep.report, items: rep.items, total: rep.total, mineOnly: rep.mineOnly, repos: rep.repos,
              sessionCount: rep.sessionCount,
            })
            return rep
          }
          case 'getReport': {
            // 项目唯一日报:同项目所有会话共享同一份
            const cwd = normalizeCwd(body?.cwd)
            return { report: state.getReport(cwd) }
          }
          case 'saveMoka': {
            const email = String(body?.email || '').trim()
            const password = String(body?.password || '')
            if (!email || !password) throw new Error('email 与 password 均不能为空')
            const credentials = getCredentials()
            if (!credentials) throw new Error('凭据服务不可用,无法保存 Moka 账号')
            await credentials.modifyRecord(MOKA_RECORD, async () => ({ kind: 'grant', payload: { email, password } }))
            return { configured: true, email }
          }
          case 'mokaStatus': {
            const acct = await readMoka(getCredentials())
            return { configured: !!acct, email: acct?.email || '' }
          }
          case 'mokaTest': {
            const acct = await readMoka(getCredentials())
            if (!acct) throw new Error('尚未配置 Moka 账号')
            const client = new MokaClient({ email: acct.email, password: acct.password })
            const me = await client.login()
            return { ok: true, employeeId: me.employeeId, tenantId: me.tenantId, message: '登录成功' }
          }
          case 'submitOvertime': {
            // 加班单日期 = 所选汇报日(客户端传汇报日区间的最后一天;单日即该汇报日本身)
            const otDate = body?.date || localDateStr(new Date())
            if (!isValidDateStr(otDate)) throw new Error(`日期格式应为 YYYY-MM-DD: "${otDate}"`)
            const acct = await readMoka(getCredentials())
            if (!acct) throw new Error('尚未配置 Moka 账号,请先在设置里保存')
            const markdown = String(body?.reportMarkdown || '')
            const items = parseReportItems(markdown)
            const summaryMatch = /\*\*总结[：:]\*\*\s*(.+)/.exec(markdown)
            const reason = String(body?.reason || '').trim() || buildReason(items, summaryMatch ? summaryMatch[1].trim() : '')
            if (!reason) throw new Error('缺少加班事由:请先生成日报或手动填写 reason')
            const repoNames = body?.projects || []
            const attachment = renderAttachment({
              date: otDate, repoNames: repoNames.length ? repoNames : ['workspace'], total: body?.commits ?? items.length, items, overtime: null,
            })
            const client = new MokaClient({ email: acct.email, password: acct.password })
            const result = await client.submitOvertime({ date: otDate, reason, attachment })
            state.pushHistory({
              date: otDate, at: new Date().toISOString(), trigger: 'manual-submit',
              cwd: body?.cwd ? normalizeCwd(body.cwd) : '',
              commits: body?.commits ?? items.length, projects: repoNames, report: markdown,
              overtime: { ok: true, ...result },
            })
            return { ok: true, result, date: otDate }
          }
          case 'history': {
            // 项目隔离:cwd 给定时只返回与该项目相关的条目(单项目运行 / 汇总运行里包含该项目)
            const cwd = body?.cwd ? normalizeCwd(body.cwd) : null
            const entries = state.data.history
              .filter((e) => !cwd || e.cwd === cwd || (Array.isArray(e.perProject) && e.perProject.some((p) => p.cwd === cwd)))
              .map((e) => ({ id: e.id, date: e.date, at: e.at, trigger: e.trigger, cwd: e.cwd || '', commits: e.commits, projects: e.projects, overtime: e.overtime ? { ok: e.overtime.ok, error: e.overtime.error || '', durationText: e.overtime.durationText || '', dayType: e.overtime.dayType || '' } : null }))
            return { entries }
          }
          case 'historyEntry': {
            const entry = state.findHistory(String(body?.id || ''))
            if (!entry) throw new Error(`历史记录不存在: ${body?.id}`)
            return { entry }
          }
          case 'runNow': {
            const date = body?.date || undefined
            if (date && !isValidDateStr(date)) throw new Error(`日期格式应为 YYYY-MM-DD: "${date}"`)
            return await runDaily({ trigger: 'manual', date, autoOvertime: body?.autoOvertime, credentials: getCredentials(), cwd: body?.cwd })
          }
          default:
            throw new Error(`unknown action: ${action}`)
        }
      }

      child.effect(() => child.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          try {
            if (!sameOrigin(req)) { json(res, 403, { ok: false, error: 'cross-origin request rejected' }); return }
            if (req.method !== 'POST') { json(res, 200, { ok: true, data: { action: 'ping', name: 'dsh-project-report' } }); return }
            const body = await readBody(req)
            const data = await dispatch(body)
            json(res, 200, { ok: true, data })
          } catch (err) {
            const step = err instanceof MokaError ? ` [${err.step}]` : ''
            json(res, 200, { ok: false, error: `${err?.message || err}${step}` })
          }
        },
      }), 'project-report.api')
    })

    // 定时调度:每 20s tick,按项目隔离判定。原生 setInterval + effect 清理,
    // 不依赖 timer 服务(可选服务在 inject 子上下文不可达,曾致作用域回滚)。
    ctx.effect(() => {
      const t = setInterval(() => {
        try {
          // 候选项目 = 已打开工作区 ∪ 有独立定时设置的项目(项目可能已关闭,设置仍在)
          const candidates = new Set(allRoots().map((r) => normalizeCwd(r)))
          for (const k of Object.keys(state.data.schedules)) candidates.add(k)
          for (const cwd of candidates) {
            const sched = state.getSchedule(cwd)
            const run = state.getRun(cwd)
            if (shouldFire(new Date(), sched, run.lastRunDate)) {
              // 一次 tick 只跑一个,running 锁防并发;其余项目下一 tick 继续
              void runDaily({ trigger: 'schedule', credentials: getCredentials(), cwd, autoOvertime: sched.autoOvertime })
                .catch(() => {})
              break
            }
          }
        } catch { /* 调度错误不外抛 */ }
      }, 20_000)
      return () => clearInterval(t)
    }, 'project-report.scheduler')
  },
}
