// 冒烟测试:@skillpie/dsh-project-report
// 覆盖:shouldFire 纯函数 / PluginState / git 采集(临时真实仓库) / 日报模板 / PNG 附件 /
//       单路由 API(桩 webServer+credentials+timer,真实 http 服务器)。
// 运行:node test/smoke.mjs  (DSH_PROJECT_REPORT_STATE 隔离状态文件,不碰真实配置)
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import { shouldFire, parseTimeStr } from '../lib/schedule.js'
import { PluginState } from '../lib/state.js'
import { listProjects, discoverRepos, collectPaths, windowFor, isValidDateStr, localDateStr, normalizeCutover, DEFAULT_CUTOVER } from '../lib/git.js'
import { buildReport, buildReason, cleanSubject } from '../lib/report.js'
import { renderAttachment, buildSnippet } from '../lib/render.js'
import { collectSessions } from '../lib/sessions.js'
import plugin from '../lib/index.js'
import { ROUTE } from '../lib/index.js'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-project-report-test-'))
const STATE_FILE = path.join(TMP, 'state.json')
process.env.DSH_PROJECT_REPORT_STATE = STATE_FILE

const failures = []
let passed = 0
async function check(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failures.push({ name, err })
    console.error(`  ✗ ${name}\n    ${err?.stack || err}`)
  }
}

/* ── git 仓库夹具 ───────────────────────────────────────────────────── */
const WORKSPACE = path.join(TMP, 'workspace')
fs.mkdirSync(WORKSPACE, { recursive: true })

function sh(args, opts = {}) {
  return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts })
}
function makeRepo(name) {
  const dir = path.join(WORKSPACE, name)
  fs.mkdirSync(dir, { recursive: true })
  sh(['init', '-b', 'main', dir])
  sh(['config', 'user.name', '张三'], { cwd: dir })
  sh(['config', 'user.email', 'zhang@test.local'], { cwd: dir })
  return dir
}
function commit(dir, msg, iso, author) {
  const f = path.join(dir, `f${Math.random().toString(36).slice(2)}.txt`)
  fs.writeFileSync(f, msg + '\n')
  sh(['add', '.'], { cwd: dir })
  const env = { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso }
  const args = ['commit', '-m', msg]
  if (author) args.push('--author', author)
  sh(args, { cwd: dir, env })
}

const alpha = makeRepo('alpha')
const beta = makeRepo('beta')
fs.mkdirSync(path.join(WORKSPACE, 'notagit'), { recursive: true }) // 无 .git,应被忽略

commit(alpha, 'feat(order): 新增订单导出接口', '2026-11-10T09:30:00+08:00')
commit(alpha, 'fix: 修复列表分页错位', '2026-11-10T20:05:00+08:00')
commit(alpha, 'sync meta files', '2026-11-10T23:40:00+08:00') // 无关键词 → 兜底
commit(alpha, 'docs: update readme', '2026-11-11T05:30:00+08:00') // 窗口内(次日 6 点前)
commit(alpha, 'out of window commit', '2026-11-11T07:00:00+08:00') // 窗口外
commit(alpha, 'feat: 其他人的提交', '2026-11-10T10:00:00+08:00', '李四 <li@test.local>') // 非本人
commit(beta, 'feat: gateway route filter|含竖线主题', '2026-11-10T21:00:00+08:00')

// gamma(TMP 下独立仓库):凌晨提交,验证割接偏移的归日能力
const gamma = path.join(TMP, 'gamma')
fs.mkdirSync(gamma, { recursive: true })
sh(['init', '-b', 'main', gamma])
sh(['config', 'user.name', '张三'], { cwd: gamma })
sh(['config', 'user.email', 'zhang@test.local'], { cwd: gamma })
commit(gamma, 'feat: 凌晨提交(跨零点加班)', '2026-11-11T02:00:00+08:00') // 默认割接 06:00 → 归汇报日 11-10
commit(gamma, 'fix: 清晨提交', '2026-11-11T06:30:00+08:00') // 默认割接 → 归 11-11;偏移 8 → 归 11-10

/* ── 1. schedule 纯函数 ─────────────────────────────────────────────── */
console.log('\n[schedule]')
await check('parseTimeStr 合法/非法', () => {
  assert.deepEqual(parseTimeStr('21:30'), { h: 21, min: 30 })
  assert.deepEqual(parseTimeStr('9:05'), { h: 9, min: 5 })
  assert.equal(parseTimeStr('24:00'), null)
  assert.equal(parseTimeStr('abc'), null)
  assert.equal(parseTimeStr(''), null)
})
await check('shouldFire 触发/未触发/已跑/补跑', () => {
  const sched = { enabled: true, time: '21:30' }
  assert.equal(shouldFire(new Date(2026, 10, 10, 21, 31), sched, null), true)
  assert.equal(shouldFire(new Date(2026, 10, 10, 21, 30), sched, null), true)
  assert.equal(shouldFire(new Date(2026, 10, 10, 21, 29), sched, null), false)
  assert.equal(shouldFire(new Date(2026, 10, 10, 21, 31), sched, '2026-11-10'), false) // 今天已跑
  assert.equal(shouldFire(new Date(2026, 10, 10, 23, 0), sched, '2026-11-09'), true) // 昨天跑过,今天补跑
  assert.equal(shouldFire(new Date(2026, 10, 10, 21, 31), { ...sched, enabled: false }, null), false)
  assert.equal(shouldFire(new Date(2026, 10, 10, 21, 31), { enabled: true, time: 'bad' }, null), false)
})

await check('shouldFire 提交前一天:目标=昨天,游标按前一天记', () => {
  const sched = { enabled: true, time: '09:00', prevDay: true }
  const now = new Date(2026, 10, 12, 9, 1) // 2026-11-12 09:01
  assert.equal(shouldFire(now, sched, null), true)
  assert.equal(shouldFire(now, sched, '2026-11-11'), false) // 昨天(目标日)已跑
  assert.equal(shouldFire(now, sched, '2026-11-12'), true) // 只跑过今天 ≠ 目标(昨天) → 仍补跑
  assert.equal(shouldFire(now, { ...sched, prevDay: false }, '2026-11-12'), false) // 不偏移:今天已跑不重跑
  assert.equal(shouldFire(new Date(2026, 10, 12, 8, 59), sched, null), false) // 未到触发点
  assert.equal(shouldFire(new Date(2026, 10, 1, 9, 0), sched, '2026-10-31'), false) // 跨月:11-01 的昨天=10-31
  assert.equal(shouldFire(new Date(2026, 0, 1, 9, 0), sched, '2025-12-31'), false) // 跨年
})

/* ── 2. PluginState ─────────────────────────────────────────────────── */
console.log('\n[state]')
await check('默认值 → patchSettings → 持久化往返', () => {
  const st = new PluginState()
  assert.equal(st.settings.workspace, '')
  st.patchSettings({ workspace: `/tmp/x ` })
  assert.equal(st.settings.workspace, '/tmp/x')
  const st2 = new PluginState()
  assert.equal(st2.settings.workspace, '/tmp/x')
})
await check('settings.cutover 默认/patch(数字/字符串/非法)/持久化', () => {
  const st = new PluginState()
  assert.equal(st.settings.cutover, '06:00')
  st.patchSettings({ cutover: 5 })
  assert.equal(st.settings.cutover, '05:00')
  st.patchSettings({ cutover: '25:00' }) // 非法,保持
  assert.equal(st.settings.cutover, '05:00')
  st.patchSettings({ cutover: '05:30' })
  assert.equal(st.settings.cutover, '05:30')
  const st2 = new PluginState()
  assert.equal(st2.settings.cutover, '05:30') // 持久化往返
})
await check('每项目 schedule 隔离:setSchedule/getSchedule/回退模板', () => {
  const st = new PluginState()
  // 默认:enabled 不回退模板,一律 false;time/autoOvertime 回退全局模板
  assert.equal(st.getSchedule('/a').enabled, false)
  assert.equal(st.getSchedule('/a').time, '21:30')
  st.setSchedule('/a', { enabled: true, time: '23:45', autoOvertime: true })
  st.setSchedule('/b', { enabled: false })
  const st2 = new PluginState()
  assert.equal(st2.getSchedule('/a').enabled, true)
  assert.equal(st2.getSchedule('/a').time, '23:45')
  assert.equal(st2.getSchedule('/a').autoOvertime, true)
  assert.equal(st2.getSchedule('/b').enabled, false)
  // 隔离:改 /a 不影响 /b;/b.time 仍回退模板
  st2.setSchedule('/a', { time: '20:00' })
  assert.equal(st2.getSchedule('/a').time, '20:00')
  assert.equal(st2.getSchedule('/b').time, st2.settings.schedule.time)
  assert.equal(st2.getSchedule('/b').enabled, false)
  // 尾斜杠归一
  st2.setSchedule('/c/', { enabled: true })
  assert.equal(st2.getSchedule('/c').enabled, true)
})

await check('schedule.prevDay:默认 false/显式覆盖/回退模板', () => {
  const st = new PluginState()
  assert.equal(st.getSchedule('/pd-a').prevDay, false) // 默认关闭
  st.settings.schedule.prevDay = true // 模板改 true(applyConfigDefaults 场景)
  assert.equal(st.getSchedule('/pd-b').prevDay, true) // 未显式设置 → 回退模板
  st.setSchedule('/pd-b', { prevDay: false })
  assert.equal(st.getSchedule('/pd-b').prevDay, false) // 显式覆盖模板
  assert.equal(st.getSchedule('/pd-c').prevDay, true) // 仍未设置的项目继续回退模板
  st.setSchedule('/pd-d', { prevDay: 'yes' }) // 非法值被忽略
  assert.equal(st.getSchedule('/pd-d').prevDay, true)
})
await check('每项目运行游标:getRun/markRun 隔离', () => {
  const st = new PluginState()
  assert.equal(st.getRun('/x').lastRunDate, null)
  st.markRun('/x', '2026-11-11', '3 commits')
  st.markRun('/y', '2026-11-11', '7 commits')
  assert.equal(st.getRun('/x').lastRunDate, '2026-11-11')
  assert.equal(st.getRun('/x').lastRunSummary, '3 commits')
  assert.equal(st.getRun('/y').lastRunSummary, '7 commits')
  assert.notEqual(st.getRun('/x').lastRunAt, null)
})
await check('非法 schedule 字段被忽略', () => {
  const st = new PluginState()
  st.setSchedule('/pd-bad', { time: '99:99', enabled: 'yes' }) // 非法值丢弃,不落任何字段
  assert.notEqual(st.getSchedule('/pd-bad').time, '99:99')
  assert.equal(typeof st.getSchedule('/pd-bad').enabled, 'boolean')
  assert.equal(st.getSchedule('/pd-bad').enabled, false) // enabled 非布尔 → 默认关闭(不回退模板)
  assert.equal(st.getSchedule('/pd-bad').time, st.settings.schedule.time) // 回退模板
  st.setSchedule('/pd-bad2', { time: 'bad', prevDay: 'yes', autoOvertime: 'x' }) // 全非法 → 空存储
  const g = st.getSchedule('/pd-bad2')
  assert.equal(g.time, st.settings.schedule.time)
  assert.equal(g.prevDay, st.settings.schedule.prevDay)
  assert.equal(g.autoOvertime, st.settings.schedule.autoOvertime)
})
await check('history 上限 60 + findHistory', () => {
  const st = new PluginState()
  for (let i = 0; i < 63; i++) st.pushHistory({ date: `2026-01-01`, at: '', trigger: 'manual', commits: i, projects: [], report: '', overtime: null })
  assert.equal(st.data.history.length, 60)
  const first = st.data.history[0]
  assert.equal(st.findHistory(first.id)?.commits, 62)
  assert.equal(st.findHistory('nope'), null)
})
await check('applyConfigDefaults 只补默认项(scheduleEnabled 不再全局启用)', () => {
  const st = new PluginState()
  st.patchSettings({ workspace: '/already/set' })
  st.applyConfigDefaults({ workspace: '/from/config', gitAuthor: '张三', scheduleTime: '22:00', scheduleEnabled: true })
  assert.equal(st.settings.workspace, '/already/set') // 不覆盖已设置项
  assert.equal(st.settings.gitAuthor, '张三')
  assert.equal(st.settings.schedule.time, '22:00')
  // 模板 enabled 仍为 false,项目未显式开启前不全局启用
  assert.equal(st.settings.schedule.enabled, false)
  assert.equal(st.getSchedule('/any').enabled, false)
})

/* ── 3. git 采集 ────────────────────────────────────────────────────── */
console.log('\n[git]')
await check('windowFor = 当天 6:00 → 次日 6:00;区间 → 结束日次日 6:00', () => {
  assert.deepEqual(windowFor('2026-11-10'), { since: '2026-11-10 06:00:00', until: '2026-11-11 06:00:00', days: 1 })
  const r = windowFor('2026-11-10', '2026-11-12')
  assert.equal(r.since, '2026-11-10 06:00:00')
  assert.equal(r.until, '2026-11-13 06:00:00')
  assert.equal(r.days, 3)
  // dateEnd 非法或早于起始 → 退化为单日
  assert.equal(windowFor('2026-11-10', '2026-11-09').until, '2026-11-11 06:00:00')
  assert.equal(windowFor('2026-11-10', 'bad').until, '2026-11-11 06:00:00')
})
await check('normalizeCutover:整数小时/数字串/HH:MM/非法回退', () => {
  assert.equal(DEFAULT_CUTOVER, '06:00')
  assert.equal(normalizeCutover(undefined), '06:00')
  assert.equal(normalizeCutover(6), '06:00') // 用户语义:设置 6 = 窗口整体 +6 小时
  assert.equal(normalizeCutover(0), '00:00')
  assert.equal(normalizeCutover(23), '23:00')
  assert.equal(normalizeCutover('9'), '09:00')
  assert.equal(normalizeCutover('05:30'), '05:30') // 半小时割接也支持
  assert.equal(normalizeCutover(24), '06:00') // 越界
  assert.equal(normalizeCutover(-1), '06:00')
  assert.equal(normalizeCutover('25:00'), '06:00')
  assert.equal(normalizeCutover('abc'), '06:00')
})
await check('windowFor 割接偏移:窗口整体平移', () => {
  assert.deepEqual(windowFor('2026-11-10', null, '02:00'), { since: '2026-11-10 02:00:00', until: '2026-11-11 02:00:00', days: 1 })
  const r = windowFor('2026-11-10', '2026-11-11', 8) // 数字偏移
  assert.equal(r.since, '2026-11-10 08:00:00')
  assert.equal(r.until, '2026-11-12 08:00:00')
})
await check('割接偏移归日:凌晨提交算前一汇报日(偏移 0 除外)', async () => {
  // 默认偏移 6:11-11 02:00 ∈ [11-10 06:00, 11-11 06:00) → 汇报日 11-10
  let r = await collectPaths({ paths: [gamma], date: '2026-11-10' })
  let subs = r.projects[0].commits.map((c) => c.subject)
  assert.ok(subs.includes('feat: 凌晨提交(跨零点加班)'), '凌晨提交应归前一天')
  assert.equal(subs.length, 1)
  // 偏移 8:窗口 [11-10 08:00, 11-11 08:00) → 两条都归 11-10
  r = await collectPaths({ paths: [gamma], date: '2026-11-10', cutover: 8 })
  assert.equal(r.projects[0].commits.length, 2)
  // 偏移 0:窗口 [11-11 00:00, 11-12 00:00) → 两条都归 11-11
  r = await collectPaths({ paths: [gamma], date: '2026-11-11', cutover: 0 })
  assert.equal(r.projects[0].commits.length, 2)
})
await check('isValidDateStr / localDateStr', () => {
  assert.equal(isValidDateStr('2026-11-10'), true)
  assert.equal(isValidDateStr('2026-02-30'), false)
  assert.equal(isValidDateStr('2026-1-1'), false)
  assert.match(localDateStr(new Date(2026, 0, 5)), /^2026-01-05$/)
})
await check('listProjects 忽略无 .git/隐藏目录', async () => {
  const { projects, rootExists } = await listProjects(WORKSPACE)
  assert.equal(rootExists, true)
  assert.deepEqual(projects.map((p) => p.name), ['alpha', 'beta'])
})
await check('listProjects 根目录不存在', async () => {
  const { projects, rootExists } = await listProjects(path.join(TMP, 'missing'))
  assert.equal(rootExists, false)
  assert.deepEqual(projects, [])
})
await check('listProjects 根自身是仓库 → 计入项目', async () => {
  const { projects } = await listProjects(alpha)
  assert.equal(projects.length, 1)
  assert.equal(projects[0].name, 'alpha')
  assert.equal(projects[0].path, alpha)
})
await check('discoverRepos 多根合并去重 + 缺失根标记', async () => {
  const { rootInfo, projects } = await discoverRepos([WORKSPACE, alpha, path.join(TMP, 'missing')])
  assert.equal(rootInfo.length, 3)
  assert.equal(rootInfo[0].rootExists, true)
  assert.equal(rootInfo[2].rootExists, false)
  // alpha 出现在 WORKSPACE 深度1 与自身根两种途径,按 realpath 去重
  assert.deepEqual(projects.map((p) => p.name), ['alpha', 'beta'])
})
await check('collectPaths 全部仓库:窗口+作者过滤', async () => {
  const { projects } = await discoverRepos([WORKSPACE])
  const r = await collectPaths({ paths: projects.map((p) => p.path), date: '2026-11-10' })
  const alphaR = r.projects.find((p) => p.name === 'alpha')
  const betaR = r.projects.find((p) => p.name === 'beta')
  assert.equal(alphaR.author, '张三')
  // 窗口内:c1 c2 c3 c4(docs 次日 5:30);排除窗口外、他人提交
  assert.deepEqual(alphaR.commits.map((c) => c.subject), [
    'docs: update readme',
    'sync meta files',
    'fix: 修复列表分页错位',
    'feat(order): 新增订单导出接口',
  ])
  assert.equal(betaR.commits.length, 1)
  assert.equal(betaR.commits[0].subject, 'feat: gateway route filter|含竖线主题') // subject 含 | 不破坏解析
  assert.equal(r.total, 5)
})
await check('collectPaths 单仓库 + authorOverride', async () => {
  const r = await collectPaths({ paths: [alpha], date: '2026-11-10', authorOverride: '李四' })
  assert.equal(r.projects[0].name, 'alpha')
  assert.equal(r.projects[0].author, '李四')
  assert.equal(r.projects[0].commits.length, 1) // 只有李四那条
  assert.equal(r.total, 1)
})
await check('collectPaths 区间(两天窗口)', async () => {
  const r = await collectPaths({ paths: [alpha, beta], date: '2026-11-10', dateEnd: '2026-11-11' })
  const alphaR = r.projects.find((p) => p.name === 'alpha')
  // 单日 4 条 + 次日窗口的 'out of window commit'(11-11 07:00) = 5
  assert.equal(alphaR.commits.length, 5)
  assert.equal(r.total, 6) // + beta 1 条(11-10 窗口内)
})

/* ── 4. 日报模板 ────────────────────────────────────────────────────── */
console.log('\n[report]')
let rep
await check('buildReport 结构与模板', () => {
  return collectPaths({ paths: [alpha, beta], date: '2026-11-10' }).then((r) => {
    rep = buildReport({ date: '2026-11-10', projects: r.projects })
    assert.ok(rep.markdown.startsWith('## 2026-11-10 工作日报'))
    assert.ok(rep.markdown.includes('**主要完成工作：**'))
    assert.ok(rep.markdown.includes('**总结：** 今日共提交 5 次'))
    assert.ok(rep.markdown.includes('> 最后提交时间：2026-11-11 05:30:00【alpha】'))
    assert.ok(rep.markdown.includes('> 最后提交时间：2026-11-10 21:00:00【beta】'))
    const cats = rep.items.map((i) => i.category)
    assert.ok(cats.includes('业务模块'), `分类缺业务模块: ${cats}`)
    assert.ok(cats.includes('缺陷修复'), `分类缺缺陷修复: ${cats}`)
    assert.ok(cats.includes('文档'), `分类缺文档: ${cats}`)
    // 多仓库时单仓库条目带 (alpha) 后缀
    const biz = rep.items.find((i) => i.category === '业务模块')
    assert.ok(biz.text.includes('（alpha）'))
    // 可解析回条目(与 index.js parseReportItems 同正则)
    const m = /^\s*\d+\.\s+\*\*(.+?)\*\*[：:]\s*(.+?)。?\s*$/m.exec(rep.markdown)
    assert.ok(m, '条目行应可被 submitOvertime 解析')
  })
})
await check('cleanSubject 去 conventional 前缀/截断', () => {
  assert.equal(cleanSubject('feat(api): 做了某事'), '做了某事')
  assert.equal(cleanSubject('fix: 修复 bug'), '修复 bug')
  assert.equal(cleanSubject('普通提交'), '普通提交')
  assert.equal(cleanSubject('x'.repeat(100)).length, 41) // 40 + 省略号
})
await check('buildReport 区间模板(标题/总结带区间)', async () => {
  const r = await collectPaths({ paths: [alpha, beta], date: '2026-11-10', dateEnd: '2026-11-11' })
  const ranged = buildReport({ date: '2026-11-10', dateEnd: '2026-11-11', projects: r.projects })
  assert.ok(ranged.markdown.startsWith('## 2026-11-10 ~ 2026-11-11 工作日报'))
  assert.ok(ranged.markdown.includes('**总结：** 2026-11-10 ~ 2026-11-11 共提交 6 次'))
  // 单日(dateEnd 缺省/相同)保持原模板(此处传入的是区间采集结果,共 6 条)
  const single = buildReport({ date: '2026-11-10', dateEnd: '2026-11-10', projects: r.projects })
  assert.ok(single.markdown.startsWith('## 2026-11-10 工作日报'))
  assert.ok(single.markdown.includes('**总结：** 今日共提交 6 次'))
})
await check('buildReason 拼接', () => {
  const reason = buildReason([{ category: '业务模块', text: '订单导出' }], '今日概览。')
  assert.equal(reason, '业务模块：订单导出 今日概览。')
  assert.equal(buildReason([], ''), '项目开发加班。')
})

/* ── 4b. 会话记录采集(lib/sessions.js,桩 controller) ───────────────── */
console.log('\n[sessions]')
const SESSION_MS = new Date('2026-11-10T10:30:00').getTime()
const fakeController = {
  async list() {
    return { items: [
      { sessionId: 's-main', updatedAt: SESSION_MS, cwd: WORKSPACE, projections: { values: { title: '一级仓库量查询' } } },
      { sessionId: 's-blank', blank: true, updatedAt: SESSION_MS, cwd: WORKSPACE },
      { sessionId: 's-out', updatedAt: SESSION_MS - 86400000, cwd: WORKSPACE },          // 窗口外
      { sessionId: 's-other', updatedAt: SESSION_MS, cwd: '/somewhere-else' },           // 项目外
      { sessionId: 's-sub', origin: 'subagent', updatedAt: SESSION_MS, cwd: WORKSPACE }, // 子代理
    ] }
  },
  async events() {
    return { records: [
      { event: { type: 'user/message', time: SESSION_MS, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '排查一级仓库量查询性能问题\n换行应合并' }] } } },
      { event: { type: 'user/message', time: SESSION_MS, data: { source: { kind: 'tool' }, content: [{ type: 'text', text: '工具来源应被过滤' }] } } },
      { event: { type: 'assistant/message', time: SESSION_MS, data: { content: [{ type: 'text', text: '助手消息应被过滤' }] } } },
      { event: { type: 'user/message', time: SESSION_MS - 86400000, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '窗口外应被过滤' }] } } },
    ] }
  },
}
await check('collectSessions:标题/窗口/项目范围/来源过滤', async () => {
  const out = await collectSessions({ controller: fakeController, root: WORKSPACE, dateStart: '2026-11-10', dateEnd: '2026-11-10' })
  assert.equal(out.total, 1)
  assert.equal(out.sessions[0].title, '一级仓库量查询')
  assert.equal(out.sessions[0].turns.length, 1)
  assert.equal(out.sessions[0].turns[0].text, '排查一级仓库量查询性能问题 换行应合并')
  assert.equal(out.items[0].desc, '一级仓库量查询')
  assert.equal(out.fallbackParent, undefined)
})
await check('collectSessions:项目内无会话 → 兜底父目录', async () => {
  const out = await collectSessions({ controller: fakeController, root: alpha, dateStart: '2026-11-10', dateEnd: '2026-11-10' })
  // alpha 内无会话 → 兜底取父目录(WORKSPACE)上的工作区级会话
  assert.equal(out.total, 1)
  assert.equal(out.fallbackParent, WORKSPACE)
  // 父目录上也没有会话的项目:一个都不取
  const none = await collectSessions({ controller: fakeController, root: '/somewhere-else/deep/proj', dateStart: '2026-11-10', dateEnd: '2026-11-10' })
  assert.equal(none.total, 0)
  assert.equal(none.fallbackParent, undefined)
})
await check('collectSessions:无 controller → 空结果(容错)', async () => {
  const out = await collectSessions({ controller: undefined, root: WORKSPACE, dateStart: '2026-11-10', dateEnd: '2026-11-10' })
  assert.equal(out.total, 0)
  assert.deepEqual(out.items, [])
})
await check('buildReport 含会话条目:预留槽位/总结/分类', () => {
  const withS = buildReport({
    date: '2026-11-10', projects: [{ name: 'alpha', commits: [{ hash: 'a1', subject: 'feat: 订单导出', time: '2026-11-10 09:00:00' }] }],
    sessions: [{ desc: '一级仓库量查询', time: SESSION_MS }],
  })
  assert.ok(withS.markdown.includes('**会话协作**：一级仓库量查询。'))
  assert.ok(withS.markdown.includes('提炼 1 条项目会话'))
  assert.ok(withS.items.some((b) => b.category === '会话协作'))
})

/* ── 5. PNG 附件 ────────────────────────────────────────────────────── */
console.log('\n[render]')
await check('renderAttachment 输出合法 PNG(签名/IHDR/IDAT 解压尺寸)', () => {
  const att = renderAttachment({ date: '2026-11-10', repoNames: ['alpha', 'beta'], total: 5, items: rep.items, overtime: null })
  assert.equal(att.mime, 'image/png')
  assert.equal(att.filename, 'project-report-2026-11-10.png')
  const b = att.buffer
  assert.deepEqual([...b.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(b.readUInt32BE(16), 1680) // IHDR width
  assert.equal(b.readUInt32BE(20), 2200) // IHDR height
  // 遍历 chunk,拼接 IDAT 解压
  let off = 8
  const idat = []
  while (off < b.length) {
    const len = b.readUInt32BE(off)
    const type = b.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(b.slice(off + 8, off + 8 + len))
    off += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  // 每行扫描线前有 1 字节 filter 类型
  assert.equal(raw.length, 2200 * (1 + 1680 * 3))
})
await check('buildSnippet 仅 ASCII 且含任务列表', () => {
  const lines = buildSnippet({ date: '2026-11-10', repoNames: ['alpha'], total: 3, items: [{ category: '业务模块', text: '订单导出接口', times: ['09:30'] }] })
  assert.ok(lines.some((l) => l.includes('def daily_report')))
  assert.ok(lines.some((l) => l.includes('business')))
  for (const l of lines) assert.ok(/^[\x20-\x7e]*$/.test(l), `非 ASCII 行: ${l}`)
})

/* ── 6. API(桩 ctx + 真实 http) ───────────────────────────────────── */
console.log('\n[api]')
let handler = null
const credStore = new Map()
const fakeChild = {
  effect: (fn) => fn(),
  webServer: { register(rec) { handler = rec.handler } },
  credentials: {
    async readRecord(key) { return credStore.get(key) },
    async modifyRecord(key, updater) { const rec = await updater(credStore.get(key)); credStore.set(key, rec); return rec },
  },
}
// 调度器用原生 setInterval:测试里捕获回调,立即清理
const timerCbs = []
const realSetInterval = globalThis.setInterval
globalThis.setInterval = (cb, ms) => { timerCbs.push(cb); return 12345 }
const realClearInterval = globalThis.clearInterval
globalThis.clearInterval = () => {}
// credentials / workspaceRegistry / sessionController 是可选服务:宿主侧经 ctx.get 惰性获取;顶层 effect 立即执行
const fakeWorkspaces = [{ id: 'ws1', title: 'workspace', path: WORKSPACE, sessionIds: ['s1', 's2'] }]
const API_SESSION_MS = new Date('2026-11-10T09:40:00').getTime()
const fakeSessionController = {
  async list() {
    return { items: [{ sessionId: 'api-s1', updatedAt: API_SESSION_MS, cwd: WORKSPACE, projections: { values: { title: '排查仓库量查询' } } }] }
  },
  async events() {
    return { records: [{ event: { type: 'user/message', time: API_SESSION_MS, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '仓库量查询接口超时,帮忙排查' }] } } }] }
  },
}
const fakeCtx = {
  inject(deps, fn) { fn(fakeChild) },
  effect(fn) { return fn() },
  get(name) {
    if (name === 'credentials') return fakeChild.credentials
    if (name === 'workspaceRegistry') return { list: () => fakeWorkspaces }
    if (name === 'sessionController') return fakeSessionController
    return undefined
  },
}
// API 段用独立 state(前面 state 测试已污染共享文件)
process.env.DSH_PROJECT_REPORT_STATE = path.join(TMP, 'api-state.json')
plugin.apply(fakeCtx, {})
assert.ok(handler, 'webServer.register 应被调用')
assert.equal(timerCbs.length, 1, '调度 timer 应注册')

const server = http.createServer((req, res) => { handler(req, res) })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const BASE = `http://127.0.0.1:${port}`

function call(action, payload, extra = {}) {
  return fetch(`${BASE}${ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(extra.headers || {}) },
    body: JSON.stringify({ action, ...payload }),
  }).then(async (res) => ({ status: res.status, body: await res.json() }))
}

try {
  await check('GET 非 POST → ping 兜底', async () => {
    const res = await fetch(`${BASE}${ROUTE}`)
    const body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.data.action, 'ping')
  })
  await check('跨域 Origin 被拒 403', async () => {
    const { status, body } = await call('ping', {}, { headers: { origin: 'http://evil.example' } })
    assert.equal(status, 403)
    assert.equal(body.ok, false)
  })
  await check('ping', async () => {
    const { body } = await call('ping')
    assert.equal(body.ok, true)
    assert.equal(body.data.route, ROUTE)
  })
  await check('getState:默认无附加目录,moka 未配置', async () => {
    const { body } = await call('getState')
    assert.equal(body.ok, true)
    assert.equal(body.data.settings.workspace, '')
    assert.equal(body.data.mokaConfigured, false)
  })
  await check('setSettings cutover(全局,数字归一化为 HH:MM)', async () => {
    const { body } = await call('setSettings', { cutover: 8 })
    assert.equal(body.ok, true)
    assert.equal(body.data.settings.cutover, '08:00')
    const { body: gs } = await call('getState')
    assert.equal(gs.data.settings.cutover, '08:00')
    await call('setSettings', { cutover: 'bad' })
    const { body: gs2 } = await call('getState')
    assert.equal(gs2.data.settings.cutover, '08:00') // 非法保持
    await call('setSettings', { cutover: 6 }) // 恢复默认,避免污染后续用例的窗口断言
  })
  await check('setSettings {cwd,schedule}:项目隔离保存', async () => {
    const { body } = await call('setSettings', { cwd: WORKSPACE, schedule: { enabled: true, time: '22:15', autoOvertime: false, prevDay: true } })
    assert.equal(body.ok, true)
    assert.equal(body.data.schedule.time, '22:15')
    assert.equal(body.data.schedule.enabled, true)
    assert.equal(body.data.schedule.prevDay, true)
    const disk = JSON.parse(fs.readFileSync(path.join(TMP, 'api-state.json'), 'utf8')) // API 段独立 state
    const mine = Object.values(disk.schedules).filter((s) => s.time === '22:15' && s.enabled === true && s.prevDay === true)
    assert.equal(mine.length, 1, 'WORKSPACE 的 schedule 应已落盘')
    // 隔离:另一项目不受影响(默认关闭)
    const { body: gs2 } = await call('getState', { cwd: alpha })
    assert.equal(gs2.data.schedule.enabled, false)
    assert.equal(gs2.data.schedule.prevDay, false)
    assert.notEqual(gs2.data.schedule.time, '22:15')
  })
  await check('getState {cwd}:返回该项目 schedule + 游标', async () => {
    const { body } = await call('getState', { cwd: WORKSPACE })
    assert.equal(body.ok, true)
    assert.equal(body.data.schedule.enabled, true)
    assert.equal(body.data.schedule.time, '22:15')
    assert.equal(body.data.schedule.prevDay, true)
    assert.equal(body.data.lastRunDate, null) // 尚未运行
  })
  await check('listProjects:工作区注册表来源', async () => {
    const { body } = await call('listProjects')
    assert.equal(body.ok, true)
    assert.deepEqual(body.data.workspaces.map((w) => w.title), ['workspace'])
    assert.deepEqual(body.data.projects.map((p) => p.name), ['alpha', 'beta'])
  })
  await check('generate cwd=工作区根(默认仅我的提交)', async () => {
    const { body } = await call('generate', { cwd: WORKSPACE, date: '2026-11-10' })
    assert.equal(body.ok, true)
    assert.equal(body.data.total, 5)
    assert.equal(body.data.mineOnly, true)
    assert.ok(body.data.report.includes('## 2026-11-10 工作日报'))
    assert.deepEqual(body.data.repos.map((r) => r.name), ['alpha', 'beta'])
  })
  await check('generate mineOnly=false 含全部作者', async () => {
    const { body } = await call('generate', { cwd: WORKSPACE, date: '2026-11-10', mineOnly: false })
    assert.equal(body.ok, true)
    assert.ok(body.data.total > 5, `全作者应多于仅本人 5 条: ${body.data.total}`)
  })
  await check('generate cwd=单仓库', async () => {
    const { body } = await call('generate', { cwd: alpha, date: '2026-11-10' })
    assert.equal(body.data.total, 4)
    assert.equal(body.data.project, 'alpha')
  })
  await check('generate cwd 不存在 → 业务错误', async () => {
    const { body } = await call('generate', { cwd: path.join(TMP, 'nope'), date: '2026-11-10' })
    assert.equal(body.ok, false)
    assert.ok(body.error.includes('项目目录不存在'))
  })
  await check('generate 缺 cwd → 报错', async () => {
    const { body } = await call('generate', { date: '2026-11-10' })
    assert.equal(body.ok, false)
    assert.ok(body.error.includes('cwd'))
  })
  await check('getReport 项目唯一:取最近一次生成且幂等', async () => {
    const { body } = await call('getReport', { cwd: WORKSPACE })
    assert.equal(body.ok, true)
    assert.ok(body.data.report, '应有已存日报')
    assert.equal(body.data.report.markdown.includes('## 2026-11-10 工作日报'), true)
    assert.ok(body.data.report.total >= 5) // 最近一次是 mineOnly=false 的生成(覆盖存储)
    const { body: again } = await call('getReport', { cwd: WORKSPACE })
    assert.equal(again.data.report.genAt, body.data.report.genAt)
  })
  await check('generate 非法日期 → 报错', async () => {
    const { body } = await call('generate', { date: '2026-13-99' })
    assert.equal(body.ok, false)
    assert.ok(body.error.includes('YYYY-MM-DD'))
  })
  await check('generate 区间:dateEnd 传递/存储/非法值报错', async () => {
    const { body } = await call('generate', { cwd: alpha, date: '2026-11-10', dateEnd: '2026-11-11' })
    assert.equal(body.ok, true)
    assert.equal(body.data.dateEnd, '2026-11-11')
    assert.equal(body.data.total, 5) // 单仓 4 + 次日窗口 1
    assert.ok(body.data.report.includes('## 2026-11-10 ~ 2026-11-11 工作日报'))
    const { body: stored } = await call('getReport', { cwd: alpha })
    assert.equal(stored.data.report.dateEnd, '2026-11-11')
    const { body: bad } = await call('generate', { cwd: alpha, date: '2026-11-10', dateEnd: '2026-11-0x' })
    assert.equal(bad.ok, false)
    assert.ok(bad.error.includes('YYYY-MM-DD'))
    const { body: rev } = await call('generate', { cwd: alpha, date: '2026-11-11', dateEnd: '2026-11-10' })
    assert.equal(rev.ok, false)
    assert.ok(rev.error.includes('早于'))
  })
  await check('generate 含会话记录(sessionController 桩)', async () => {
    const { body } = await call('generate', { cwd: WORKSPACE, date: '2026-11-10', collect: { commits: true, sessions: true } })
    assert.equal(body.ok, true)
    assert.equal(body.data.sessionCount, 1)
    assert.ok(body.data.report.includes('**会话协作**'), '日报应含会话协作条目')
    assert.ok(body.data.report.includes('排查仓库量查询'))
    assert.ok(body.data.report.includes('提炼 1 条项目会话'))
    const { body: stored } = await call('getReport', { cwd: WORKSPACE })
    assert.equal(stored.data.report.sessionCount, 1)
  })
  await check('generate collect.sessions=false 不采集会话', async () => {
    const { body } = await call('generate', { cwd: alpha, date: '2026-11-10', collect: { commits: true, sessions: false } })
    assert.equal(body.ok, true)
    assert.equal(body.data.sessionCount, 0)
    assert.equal(body.data.report.includes('会话协作'), false)
  })
  await check('submitOvertime 未配置账号 → 拒绝(不触网)', async () => {
    const { body } = await call('submitOvertime', { date: '2026-11-10', reportMarkdown: '' })
    assert.equal(body.ok, false)
    assert.ok(body.error.includes('尚未配置 Moka 账号'))
  })
  await check('saveMoka → 凭据记录 → getState 可见', async () => {
    const { body } = await call('saveMoka', { email: 'a@b.com', password: 'pw' })
    assert.equal(body.data.configured, true)
    assert.ok(credStore.has('project-report/moka')) // 凭据键:<scope短名>/<id>,scope 不得含 '/'
    const { body: gs } = await call('getState')
    assert.equal(gs.data.mokaConfigured, true)
    assert.equal(gs.data.mokaEmail, 'a@b.com')
  })
  await check('saveMoka 空字段拒绝', async () => {
    const { body } = await call('saveMoka', { email: '', password: '' })
    assert.equal(body.ok, false)
  })
  await check('runNow cwd=工作区 手动流水线(autoOvertime=false)', async () => {
    const { body } = await call('runNow', { cwd: WORKSPACE, date: '2026-11-10' })
    assert.equal(body.ok, true)
    assert.equal(body.data.entry.trigger, 'manual')
    assert.equal(body.data.entry.cwd, WORKSPACE)
    assert.equal(body.data.entry.commits, 5)
    assert.deepEqual(body.data.entry.projects, ['workspace']) // per-project 维度:项目根名
    assert.equal(body.data.entry.overtime, null)
    const { body: h } = await call('history', { cwd: WORKSPACE })
    assert.equal(h.data.entries.length, 1)
    assert.equal(h.data.entries[0].date, '2026-11-10')
    const id = h.data.entries[0].id
    const { body: he } = await call('historyEntry', { id })
    assert.equal(he.data.entry.id, id)
    // 每项目运行游标已更新
    const { body: gs } = await call('getState', { cwd: WORKSPACE })
    assert.equal(gs.data.lastRunDate, '2026-11-10')
  })
  await check('history cwd 过滤:项目隔离(其他项目看不到该条目)', async () => {
    const { body } = await call('history', { cwd: alpha })
    assert.equal(body.ok, true)
    assert.equal(body.data.entries.length, 0, 'alpha 项目不应看到 workspace 的运行记录')
    // 旧全局条目(无 cwd 且不带过滤)仍可见
    const { body: all } = await call('history')
    assert.equal(all.data.entries.length, 1)
  })
  await check('historyEntry 不存在 → 报错', async () => {
    const { body } = await call('historyEntry', { id: 'zzz' })
    assert.equal(body.ok, false)
  })
} finally {
  server.close()
}

/* ── 汇总 ───────────────────────────────────────────────────────────── */
globalThis.setInterval = realSetInterval
globalThis.clearInterval = realClearInterval
console.log(`\n${passed} passed, ${failures.length} failed  (tmp: ${TMP})`)
if (failures.length) process.exit(1)
