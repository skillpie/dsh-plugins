// 插件自有状态:设置 + 调度游标 + 历史记录。
// 存 ~/.config/skillpie/dsh-project-report/state.json;Moka 账号(敏感)走凭据记录,不落这里。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeCutover, isValidCutover, DEFAULT_CUTOVER } from './git.js'

export const STATE_DIR = path.join(os.homedir(), '.config', 'skillpie', 'dsh-project-report')
export const STATE_FILE = path.join(STATE_DIR, 'state.json')

export const DEFAULT_SETTINGS = {
  workspace: '',            // 可选附加目录(主来源是 DSH 已打开的工作区,见 lib/index.js discoverAll)
  gitAuthor: '',            // 覆盖作者;空 = 逐仓库读 git config user.name
  cutover: '06:00',         // 每日割接偏移(内部 HH:MM,UI 整数小时):汇报日 D 的窗口 = D 00:00+偏移 → 次日 00:00+偏移;偏移 6 = 凌晨6点前算前一汇报日
  schedule: {               // 默认模板:仅 time/autoOvertime/prevDay 作为每项目 schedule 的回退值;
    enabled: false,         // enabled 不回退——每日收集按项目隔离,默认全部关闭
    time: '21:30',          // 每日触发时间(本地 HH:MM)
    autoOvertime: false,    // 汇总后自动申请加班
    prevDay: false,         // 提交前一天:定时目标/加班单日期均为前一天(跨零点加班次日早上补交;报告窗口=前一天6点→当天6点,与Moka加班日界一致)
  },
  collect: {
    commits: true,          // 收集方式:代码提交记录
    sessions: true,         // 收集方式:项目会话记录(时间窗口内活跃会话)
  },
}

const HISTORY_CAP = 60

function normalizeSchedule(input) {
  const base = { ...DEFAULT_SETTINGS.schedule }
  if (!input || typeof input !== 'object') return base
  if (typeof input.enabled === 'boolean') base.enabled = input.enabled
  if (typeof input.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(input.time.trim())) {
    base.time = input.time.trim()
  }
  if (typeof input.autoOvertime === 'boolean') base.autoOvertime = input.autoOvertime
  if (typeof input.prevDay === 'boolean') base.prevDay = input.prevDay
  return base
}

function normalizeCollect(input) {
  const base = { ...DEFAULT_SETTINGS.collect }
  if (!input || typeof input !== 'object') return base
  if (typeof input.commits === 'boolean') base.commits = input.commits
  if (typeof input.sessions === 'boolean') base.sessions = input.sessions
  return base
}

export class PluginState {
  constructor(file = process.env.DSH_PROJECT_REPORT_STATE || STATE_FILE) {
    this.file = file
    this.data = { settings: { ...DEFAULT_SETTINGS }, reports: {}, history: [], schedules: {}, runs: {} }
    this.load()
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      this.data = {
        settings: {
          workspace: typeof parsed?.settings?.workspace === 'string' ? parsed.settings.workspace : DEFAULT_SETTINGS.workspace,
          gitAuthor: typeof parsed?.settings?.gitAuthor === 'string' ? parsed.settings.gitAuthor : DEFAULT_SETTINGS.gitAuthor,
          schedule: normalizeSchedule(parsed?.settings?.schedule),
          collect: normalizeCollect(parsed?.settings?.collect),
          cutover: isValidCutover(parsed?.settings?.cutover) ? normalizeCutover(parsed.settings.cutover) : DEFAULT_CUTOVER,
        },
        // 每个项目一份当前日报(项目唯一:同项目所有会话共享),key = 项目路径(cwd)
        reports: parsed?.reports && typeof parsed.reports === 'object' && !Array.isArray(parsed.reports) ? parsed.reports : {},
        history: Array.isArray(parsed?.history) ? parsed.history.slice(0, HISTORY_CAP) : [],
        // 项目隔离:每项目独立的每日收集设置与运行游标,key = 项目路径(cwd)
        schedules: parsed?.schedules && typeof parsed.schedules === 'object' && !Array.isArray(parsed.schedules) ? parsed.schedules : {},
        runs: parsed?.runs && typeof parsed.runs === 'object' && !Array.isArray(parsed.runs) ? parsed.runs : {},
      }
    } catch {
      // 首次运行或文件损坏:使用默认值,保留原文件不动
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp-${process.pid}-${Date.now()}`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    fs.renameSync(tmp, this.file)
  }

  get settings() { return this.data.settings }

  patchSettings(patch = {}) {
    const s = this.data.settings
    if (typeof patch.workspace === 'string') s.workspace = patch.workspace.trim()
    if (typeof patch.gitAuthor === 'string') s.gitAuthor = patch.gitAuthor.trim()
    if (patch.collect) s.collect = normalizeCollect({ ...s.collect, ...patch.collect })
    // 非法值保持现值(不静默重置为默认)
    if (patch.cutover !== undefined && isValidCutover(patch.cutover)) s.cutover = normalizeCutover(patch.cutover)
    this.save()
    return s
  }

  // ── 项目隔离的每日收集设置 ──
  // enabled 不从模板回退(默认关闭);time/autoOvertime/prevDay 未显式设置时回退到全局模板。
  getSchedule(cwd) {
    const key = String(cwd || '').replace(/\/+$/, '')
    const raw = this.data.schedules[key]
    const proj = raw && typeof raw === 'object' ? raw : {}
    return {
      enabled: typeof proj.enabled === 'boolean' ? proj.enabled : false,
      time: typeof proj.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(proj.time.trim())
        ? proj.time.trim()
        : this.data.settings.schedule.time,
      autoOvertime: typeof proj.autoOvertime === 'boolean' ? proj.autoOvertime : this.data.settings.schedule.autoOvertime,
      prevDay: typeof proj.prevDay === 'boolean' ? proj.prevDay : this.data.settings.schedule.prevDay,
    }
  }

  setSchedule(cwd, patch = {}) {
    const key = String(cwd || '').replace(/\/+$/, '')
    if (!key) throw new Error('cwd 不能为空')
    // 稀疏存储:只落显式合法字段,未设置的字段读取时才回退模板(避免 DEFAULT 在首次写入时固化,
    // 之后改模板不再生效;非法值直接丢弃而不是落成默认值)
    const next = { ...(this.data.schedules[key] || {}) }
    if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled
    if (typeof patch.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(patch.time.trim())) next.time = patch.time.trim()
    if (typeof patch.autoOvertime === 'boolean') next.autoOvertime = patch.autoOvertime
    if (typeof patch.prevDay === 'boolean') next.prevDay = patch.prevDay
    this.data.schedules[key] = next
    this.save()
    return this.getSchedule(key) // 返回含模板回退的生效视图
  }

  // 每项目运行游标(上次定时/手动整理结果)
  getRun(cwd) {
    const key = String(cwd || '').replace(/\/+$/, '')
    const r = this.data.runs[key]
    return {
      lastRunDate: r?.lastRunDate || null,
      lastRunAt: r?.lastRunAt || null,
      lastRunSummary: r?.lastRunSummary || '',
    }
  }

  markRun(cwd, dateStr, summary) {
    const key = String(cwd || '').replace(/\/+$/, '')
    if (!key) return
    this.data.runs[key] = { lastRunDate: dateStr, lastRunAt: new Date().toISOString(), lastRunSummary: summary !== undefined ? summary : (this.data.runs[key]?.lastRunSummary || '') }
    this.save()
  }

  // Config 默认值:仅补齐 state 里仍是默认的键(用户在 patch 里预填 workspace 的场景)
  applyConfigDefaults(config = {}) {
    const s = this.data.settings
    let changed = false
    if (config.workspace && !s.workspace) { s.workspace = config.workspace; changed = true }
    if (config.gitAuthor && !s.gitAuthor) { s.gitAuthor = config.gitAuthor; changed = true }
    if (config.scheduleTime && s.schedule.time === DEFAULT_SETTINGS.schedule.time) {
      s.schedule.time = config.scheduleTime; changed = true
    }
    if (isValidCutover(config.cutoverTime) && s.cutover === DEFAULT_SETTINGS.cutover) {
      s.cutover = normalizeCutover(config.cutoverTime); changed = true
    }
    // 注意:config.scheduleEnabled 只影响默认模板,不再全局启用——每日收集按项目隔离
    if (changed) this.save()
  }

  pushHistory(entry) {
    this.data.history.unshift({ id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, ...entry })
    if (this.data.history.length > HISTORY_CAP) this.data.history.length = HISTORY_CAP
    this.save()
  }

  findHistory(id) { return this.data.history.find((e) => e.id === id) || null }

  // 项目唯一日报:存/取当前项目的最近一份生成结果
  REPORT_CAP = 20
  putReport(projectKey, entry) {
    this.data.reports[projectKey] = entry
    const keys = Object.keys(this.data.reports)
    if (keys.length > this.REPORT_CAP) {
      // 淘汰最旧的(genAt 升序)
      const sorted = keys.sort((a, b) => String(this.data.reports[a]?.genAt || '').localeCompare(String(this.data.reports[b]?.genAt || '')))
      for (const k of sorted.slice(0, keys.length - this.REPORT_CAP)) delete this.data.reports[k]
    }
    this.save()
  }

  getReport(projectKey) { return this.data.reports[projectKey] || null }
}
