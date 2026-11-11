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

// 统计窗口:起始日 06:00:00 → 结束日次日 06:00:00(dateEnd 缺省 = 单日窗口)
export function windowFor(dateStr, dateEnd) {
  const end = isValidDateStr(dateEnd) && dateEnd > dateStr ? dateEnd : dateStr
  return { since: `${dateStr} 06:00:00`, until: `${addDays(end, 1)} 06:00:00`, days: Math.round((new Date(end) - new Date(dateStr)) / 86_400_000) + 1 }
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

export async function collectRepoCommits(repoPath, { author, date, dateEnd }) {
  const { since, until } = windowFor(date, dateEnd)
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
export async function collectPaths({ paths, date, dateEnd, authorOverride, mineOnly = true }) {
  const results = []
  for (const p of paths || []) {
    const author = mineOnly ? await resolveAuthor(p, authorOverride) : null
    const commits = await collectRepoCommits(p, { author, date, dateEnd })
    results.push({ name: path.basename(p) || p, path: p, author: author || '', commits })
  }
  return { projects: results, total: results.reduce((n, p) => n + p.commits.length, 0) }
}
