// 插件自有状态:设置 + 调度游标 + 历史记录。
// 存 ~/.config/skillpie/dsh-project-report/state.json;Moka 账号(敏感)走凭据记录,不落这里。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const STATE_DIR = path.join(os.homedir(), '.config', 'skillpie', 'dsh-project-report')
export const STATE_FILE = path.join(STATE_DIR, 'state.json')

export const DEFAULT_SETTINGS = {
  workspace: '',            // 可选附加目录(主来源是 DSH 已打开的工作区,见 lib/index.js discoverAll)
  gitAuthor: '',            // 覆盖作者;空 = 逐仓库读 git config user.name
  schedule: {
    enabled: false,         // 定时开关
    time: '21:30',          // 每日触发时间(本地 HH:MM)
    projects: 'all',        // 目前支持 'all'
    autoOvertime: false,    // 生成后自动提交加班
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
  if (typeof input.projects === 'string') base.projects = input.projects
  if (typeof input.autoOvertime === 'boolean') base.autoOvertime = input.autoOvertime
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
    this.data = { settings: { ...DEFAULT_SETTINGS }, reports: {}, history: [], lastRunDate: null, lastRunAt: null }
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
        },
        // 每个项目一份当前日报(项目唯一:同项目所有会话共享),key = 项目路径(cwd)
        reports: parsed?.reports && typeof parsed.reports === 'object' && !Array.isArray(parsed.reports) ? parsed.reports : {},
        history: Array.isArray(parsed?.history) ? parsed.history.slice(0, HISTORY_CAP) : [],
        lastRunDate: typeof parsed?.lastRunDate === 'string' ? parsed.lastRunDate : null,
        lastRunAt: typeof parsed?.lastRunAt === 'string' ? parsed.lastRunAt : null,
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
    if (patch.schedule) s.schedule = normalizeSchedule({ ...s.schedule, ...patch.schedule })
    if (patch.collect) s.collect = normalizeCollect({ ...s.collect, ...patch.collect })
    this.save()
    return s
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
    if (typeof config.scheduleEnabled === 'boolean' && s.schedule.enabled === false) {
      s.schedule.enabled = config.scheduleEnabled; changed = true
    }
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

  markRun(dateStr, summary) {
    this.data.lastRunDate = dateStr
    this.data.lastRunAt = new Date().toISOString()
    if (summary !== undefined) this.data.lastRunSummary = summary
    this.save()
  }
}
