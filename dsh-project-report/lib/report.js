// 日报生成:提交记录 → 分类 → 模板化 Markdown(对齐 project-report 前身 coder-report 技能的模板与关键词表)。

const CATEGORIES = [
  { key: 'infra',    zh: '后端基础设施', kw: ['common', 'config', 'entity', 'mapper', 'pom', 'docker', 'infra', 'framework', 'util'] },
  { key: 'auth',     zh: '认证安全',    kw: ['auth', 'login', 'jwt', 'permission', 'rbac', 'security', 'token'] },
  { key: 'gateway',  zh: '网关API',     kw: ['gateway', 'route', 'filter', 'api'] },
  { key: 'biz',      zh: '业务模块',    kw: ['erp', 'wms', 'tms', 'platform', 'order', 'inventory', 'billing', 'report'] },
  { key: 'frontend', zh: '前端页面',    kw: ['component', 'page', 'ui', 'style', 'css', 'layout', 'form', 'view'] },
  { key: 'test',     zh: '测试',        kw: ['test', 'spec', 'e2e', 'mock', 'fixture'] },
  { key: 'docs',     zh: '文档',        kw: ['docs', 'readme', 'wiki', 'doc', 'comment'] },
  { key: 'cicd',     zh: 'CI/CD',       kw: ['ci', 'cd', 'jenkins', 'deploy', 'pipeline', 'build', 'release'] },
  { key: 'feat',     zh: '功能开发',    kw: ['feat', 'feature', 'add', 'support', 'implement'] },
  { key: 'fix',      zh: '缺陷修复',    kw: ['fix', 'bug', 'hotfix', 'patch', 'repair'] },
  { key: 'refactor', zh: '重构优化',    kw: ['refactor', 'perf', 'optimize', 'chore', 'clean', 'improve', 'update'] },
]

// 会话协作:非关键词分类,由 sessions 采集显式注入
export const SESSION_CAT = { key: 'sessions', zh: '会话协作' }

// 清洗提交标题:去 conventional 前缀(feat:/fix(api): 等)、去重、截断
export function cleanSubject(subject) {
  let s = String(subject || '').trim()
  s = s.replace(/^(feat|fix|refactor|perf|docs|test|build|ci|chore|style|revert)(\([^)]*\))?!?\s*[:：]\s*/i, '')
  s = s.replace(/\s+/g, ' ')
  if (s.length > 42) s = `${s.slice(0, 40)}…`
  return s
}

export function categorize(subject) {
  const low = String(subject || '').toLowerCase()
  for (const cat of CATEGORIES) {
    if (cat.kw.some((kw) => low.includes(kw))) return cat
  }
  return null
}

export function pad2(n) { return String(n).padStart(2, '0') }

export function timeOfCommit(iso) {
  // "2026-11-11 22:14:03 +0800" → "22:14"
  const m = /\b(\d{2}:\d{2})(?::\d{2})?\b/.exec(String(iso || ''))
  return m ? m[1] : ''
}

// projects: [{ name, commits: [{hash, subject, time}] }]
// dateEnd 可选:给定且 ≠ date 时为区间日报(标题与总结带区间)
// 返回 { markdown, items, stats, repos }
export function buildReport({ date, dateEnd, projects, sessions }) {
  const ranged = !!dateEnd && dateEnd !== date
  const active = (projects || []).filter((p) => p.commits && p.commits.length > 0)
  const total = active.reduce((n, p) => n + p.commits.length, 0)
  const multiRepo = active.length > 1
  // sessions:[{desc,time}] — 项目会话记录提炼条目(会话协作)
  const sessionEntries = (sessions || [])
    .map((s) => ({ desc: typeof s?.desc === 'string' ? s.desc : '', repo: '', time: typeof s?.time === 'number' ? new Date(s.time).toLocaleString('zh-CN', { hour12: false }) : '' }))
    .filter((s) => s.desc)

  // 按分类聚合提交(默认过滤 Merge 噪音提交;若全部是 Merge 则保留)
  const isMerge = (s) => /^Merge (branch|remote-tracking|pull request|tag)/.test(s)
  const buckets = new Map()
  const fallback = []
  let mergeCount = 0
  let keptCount = 0
  for (const p of active) {
    for (const c of p.commits) {
      const cat = categorize(c.subject)
      const desc = cleanSubject(c.subject)
      if (!desc) continue
      if (isMerge(c.subject)) { mergeCount++; continue }
      keptCount++
      if (cat) {
        if (!buckets.has(cat.key)) buckets.set(cat.key, { cat, entries: [] })
        buckets.get(cat.key).entries.push({ desc, repo: p.name, time: timeOfCommit(c.time) })
      } else {
        fallback.push({ desc, repo: p.name, time: timeOfCommit(c.time) })
      }
    }
  }
  // 提交全是 Merge:不过滤,否则日报开天窗
  if (keptCount === 0 && mergeCount > 0) {
    for (const p of active) {
      for (const c of p.commits) {
        const cat = categorize(c.subject)
        const desc = cleanSubject(c.subject)
        if (!desc) continue
        if (cat) {
          if (!buckets.has(cat.key)) buckets.set(cat.key, { cat, entries: [] })
          buckets.get(cat.key).entries.push({ desc, repo: p.name, time: timeOfCommit(c.time) })
        } else {
          fallback.push({ desc, repo: p.name, time: timeOfCommit(c.time) })
        }
      }
    }
  }

  let items = [...buckets.values()]
  // 无关键词命中且完全无分类 → 兜底为"功能开发"
  if (items.length === 0 && fallback.length > 0) {
    items = [{ cat: CATEGORIES.find((c) => c.key === 'feat'), entries: fallback }]
  } else if (fallback.length > 0 && items.length < 5) {
    // 兜底补一条"功能开发"收纳未分类提交(不超过 5 条)
    items.push({ cat: CATEGORIES.find((c) => c.key === 'feat'), entries: fallback })
  }
  // 有会话记录时给「会话协作」预留一个条目槽位(提交分类让位到 4 条,总条数仍 ≤5)
  if (sessionEntries.length > 0) {
    items = items.slice(0, 4)
    items.push({ cat: SESSION_CAT, entries: sessionEntries })
  }
  items = items.slice(0, 5)

  const itemLines = []
  const flatItems = []
  items.forEach((b, i) => {
    // 每条:同分类取前 2-3 个描述拼接,目标 20-40 字
    const seen = new Set()
    const descs = []
    for (const e of b.entries) {
      if (seen.has(e.desc)) continue
      seen.add(e.desc)
      descs.push(e)
      if (descs.length >= 3) break
    }
    const text = descs.map((d) => d.desc).join('；')
    const repos = [...new Set(descs.map((d) => d.repo))]
    const suffix = multiRepo && repos.length === 1 ? `（${repos[0]}）` : ''
    itemLines.push(`${i + 1}. **${b.cat.zh}**：${text}${suffix}。`)
    flatItems.push({ category: b.cat.zh, text: `${text}${suffix}`, repos, times: descs.map((d) => d.time).filter(Boolean) })
  })

  // 总结:一句概览
  const repoNames = active.map((p) => p.name).join('、')
  const catNames = [...new Set(items.map((b) => b.cat.zh))].join('、')
  const periodText = ranged ? `${date} ~ ${dateEnd} ` : '今日'
  const sessionNote = sessionEntries.length > 0 ? `，并提炼 ${sessionEntries.length} 条项目会话` : ''
  const summary = `${periodText}共提交 ${total} 次代码${sessionNote}，围绕${catNames || '日常开发'}展开${multiRepo ? `，涉及 ${repoNames}` : ''}。`

  const lines = []
  lines.push(`## ${date}${ranged ? ` ~ ${dateEnd}` : ''} 工作日报`)
  lines.push('')
  lines.push('**主要完成工作：**')
  lines.push('')
  lines.push(...itemLines)
  lines.push('')
  lines.push(`**总结：** ${summary}`)
  lines.push('')

  // 最后提交时间:每仓库一行,时间精确到秒
  for (const p of active) {
    const last = p.commits[0]
    const t = String(last.time || '').replace(/\s+[+-]\d{4}$/, '').replace('T', ' ')
    lines.push(`> 最后提交时间：${t}【${p.name}】`)
  }

  const stats = {
    repos: active.map((p) => ({ name: p.name, commits: p.commits.length, lastCommit: p.commits[0] || null })),
    total,
  }
  return { markdown: lines.join('\n'), items: flatItems, stats, summary }
}

// 加班原因:条目 + 总结(移植 py 拼接规则)
export function buildReason(items, summary) {
  const parts = []
  for (const it of items || []) parts.push(`${it.category}：${it.text}`)
  if (summary) parts.push(summary)
  return parts.join(' ') || '项目开发加班。'
}
