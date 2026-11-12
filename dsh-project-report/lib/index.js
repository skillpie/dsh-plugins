// @skillpie/dsh-project-report — host half.
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
  name: '@skillpie/dsh-project-report',
  Config,
  inject: [],
  apply(ctx, rawConfig = null) {
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
            return { name: '@skillpie/dsh-project-report', version: '0.1.5', route: ROUTE, time: new Date().toISOString() }
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
            if (req.method !== 'POST') { json(res, 200, { ok: true, data: { action: 'ping', name: '@skillpie/dsh-project-report' } }); return }
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
