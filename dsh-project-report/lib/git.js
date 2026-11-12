// git 采集:工作区项目发现 + 指定日期窗口(6:00 → 次日 6:00)的提交记录。
// 对齐 project-report 前身 coder-report 技能 collect-commits.py 的行为,超时 10s,--all 全分支。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const GIT_TIMEOUT_MS = 10_000

export function execGit(args, cwd, timeoutMs = GIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('git', args, { cwd: cwd || undefined, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    } catch (err) {
      resolve({ ok: false, stdout: '', stderr: String(err?.message || err) })
      return
    }
    let stdout = ''
    let stderr = ''
    let done = false
    const timer = setTimeout(() => {
      if (!done) { try { child.kill('SIGKILL') } catch {} }
    }, timeoutMs)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (err) => {
      if (done) return
      done = true; clearTimeout(timer)
      resolve({ ok: false, stdout, stderr: `${stderr}${err.message}` })
    })
    child.on('close', (code) => {
      if (done) return
      done = true; clearTimeout(timer)
      resolve({ ok: code === 0, stdout, stderr, code })
    })
  })
}

export function pad2(n) { return String(n).padStart(2, '0') }

// 本地时区 YYYY-MM-DD
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return localDateStr(dt)
}

export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

// 每日割接偏移:汇报日 D 的窗口 = D 00:00 + 偏移小时 → 次日 00:00 + 偏移小时。
// 偏移可用整数小时(6 → '06:00')或 'HH:MM' 字符串;默认 6(凌晨 6 点前仍算前一汇报日,
// 加班到次日凌晨的提交/会话都归到前一天,与 Moka 加班日界一致)。
export const DEFAULT_CUTOVER = '06:00'
// 割接偏移是否合法:整数小时 0-23(数字或数字串)或 'HH:MM'
export function isValidCutover(cutover) {
  if (typeof cutover === 'number') return Number.isInteger(cutover) && cutover >= 0 && cutover <= 23
  if (cutover == null || typeof cutover === 'object' || cutover === '') return false
  const n = Number(cutover)
  if (Number.isInteger(n) && n >= 0 && n <= 23) return true
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(cutover).trim())
}
export function normalizeCutover(cutover) {
  if (typeof cutover === 'number' && isValidCutover(cutover)) return `${String(cutover).padStart(2, '0')}:00`
  if (isValidCutover(cutover)) {
    const n = Number(cutover)
    if (Number.isInteger(n)) return `${String(n).padStart(2, '0')}:00`
    return String(cutover).trim()
  }
  return DEFAULT_CUTOVER
}

// 统计窗口:汇报日起始日割接时刻 → 结束日次日割接时刻(dateEnd 缺省 = 单日窗口)
export function windowFor(dateStr, dateEnd, cutover = DEFAULT_CUTOVER) {
  const end = isValidDateStr(dateEnd) && dateEnd > dateStr ? dateEnd : dateStr
  const cut = normalizeCutover(cutover)
  return { since: `${dateStr} ${cut}:00`, until: `${addDays(end, 1)} ${cut}:00`, days: Math.round((new Date(end) - new Date(dateStr)) / 86_400_000) + 1 }
}

// 逐仓库作者:设置覆盖 > 该仓库 git config user.name
export async function resolveAuthor(repoPath, override) {
  if (override) return override
  const r = await execGit(['config', 'user.name'], repoPath)
  const name = (r.stdout || '').trim()
  return name || null
}

// 扫描一个根目录,返回其中可直接使用的 git 仓库:
// 根自身含 .git 也算一个项目(名取 basename),再加深度 1 非隐藏子目录里的仓库。
export async function listProjects(root) {
  const out = []
  let entries
  let rootExists = true
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    rootExists = false
    entries = []
  }
  const base = path.basename(root) || root
  try {
    fs.accessSync(path.join(root, '.git'))
    out.push({ name: base, path: root })
  } catch { /* 根自身不是仓库 */ }
  for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue
    const dir = path.join(root, ent.name)
    try {
      fs.accessSync(path.join(dir, '.git'))
    } catch { continue }
    out.push({ name: ent.name, path: dir })
  }
  return { projects: out, rootExists }
}

// 多根发现(每个 DSH 工作区一个根):合并去重(按 realpath)
// 返回 { rootInfo: [{root, rootExists}], projects: [{name, path}] }
export async function discoverRepos(roots) {
  const seen = new Set()
  const projects = []
  const rootInfo = []
  for (const root of roots || []) {
    const { projects: found, rootExists } = await listProjects(root)
    rootInfo.push({ root, rootExists })
    for (const p of found) {
      let key = p.path
      try { key = fs.realpathSync(p.path) } catch { /* 保持原路径去重 */ }
      if (seen.has(key)) continue
      seen.add(key)
      projects.push(p)
    }
  }
  return { rootInfo, projects }
}

export async function collectRepoCommits(repoPath, { author, date, dateEnd, cutover }) {
  const { since, until } = windowFor(date, dateEnd, cutover)
  const args = ['log']
  if (author) args.push(`--author=${author}`)
  args.push('--since', since, '--until', until, '--all', '--pretty=format:%h|%s|%ci')
  const r = await execGit(args, repoPath)
  if (!r.ok) {
    // 空仓库等场景视为无提交
    return []
  }
  const commits = []
  for (const line of r.stdout.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const idx = t.indexOf('|')
    // %h 与 %ci 都不含 '|',时间取最后一个 '|' 之后,subject 可安全包含 '|'(等价 py split('|', 2))
    const idx2 = idx >= 0 ? t.lastIndexOf('|') : -1
    if (idx < 0 || idx2 < 0) continue
    const hash = t.slice(0, idx)
    const subject = t.slice(idx + 1, idx2)
    const time = t.slice(idx2 + 1).trim()
    commits.push({ hash, subject, time })
  }
  commits.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
  return commits
}

// 按显式仓库路径列表采集(null/空 = 由调用方先 discoverRepos)
// mineOnly: 仅统计本人的提交(author 覆盖或各仓库 git config user.name);false = 全部作者
// 返回 { projects: [{ name, path, author, commits }], total }
export async function collectPaths({ paths, date, dateEnd, authorOverride, mineOnly = true, cutover }) {
  const results = []
  for (const p of paths || []) {
    const author = mineOnly ? await resolveAuthor(p, authorOverride) : null
    const commits = await collectRepoCommits(p, { author, date, dateEnd, cutover })
    results.push({ name: path.basename(p) || p, path: p, author: author || '', commits })
  }
  return { projects: results, total: results.reduce((n, p) => n + p.commits.length, 0) }
}
