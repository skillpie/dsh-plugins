// 会话记录采集:项目范围内、时间窗口内活跃的 DSH 会话 → 标题与用户指令文本,供汇报汇总。
// 数据源 sessionController(宿主核心服务):list({}, signal) → {items:[SessionSummary]};
// events({address:{kind:'session',sessionId},maxMessages,turnWindow}, signal) → {records}。
// 记录信封 SessionWireEvent {type,seq,time(ms),data};用户消息 type='user/message',
// data.source.kind==='user'(过滤工具/子代理来源),data.content 为文本块数组。
import { addDays } from './git.js'

const SESSION_CAP = 20        // 最多处理的会话数(按 updatedAt 新→旧)
const TURNS_PER_SESSION = 6   // 每会话最多提取的用户指令条数
const TURN_TEXT_MAX = 160     // 单条指令文本截断
const DESC_MAX = 42           // 会话条目描述截断(与 cleanSubject 一致)

function windowMs(dateStart, dateEnd) {
  const end = dateEnd > dateStart ? dateEnd : dateStart
  const since = new Date(`${dateStart}T06:00:00`).getTime()
  const until = new Date(`${addDays(end, 1)}T06:00:00`).getTime()
  return { since, until }
}

// 会话属于项目:cwd 等于项目根或位于其子目录
function inScope(cwd, root) {
  if (!cwd) return false
  if (cwd === root) return true
  const prefix = root.endsWith('/') ? root : `${root}/`
  return cwd.startsWith(prefix)
}

export function cleanSessionText(s, max = DESC_MAX) {
  let t = String(s || '').replace(/\s+/g, ' ').trim()
  if (t.length > max) t = `${t.slice(0, max - 1)}…`
  return t
}

// controller = ctx.get('sessionController');服务缺失/读失败时容错返回空(代码记录不受影响)
// 返回 { sessions:[{sessionId,title,updatedAt,cwd,turns:[{text,time}]}], items:[{desc,time}], total, skipped, fallbackParent? }
export async function collectSessions({ controller, root, dateStart, dateEnd, log }) {
  const out = { sessions: [], items: [], total: 0, skipped: 0 }
  if (!controller) return out
  const { since, until } = windowMs(dateStart, dateEnd)
  let items = []
  try {
    ({ items } = await controller.list({}, AbortSignal.timeout(20_000)))
  } catch (err) {
    log?.(`session list 失败: ${err?.message || err}`)
    return out
  }
  const active = items.filter((it) =>
    it && !it.blank && !it.origin
    && typeof it.updatedAt === 'number' && it.updatedAt >= since && it.updatedAt <= until
    && inScope(it.cwd, root))
  // 兜底:项目内没有会话时,取「项目根父目录」上的会话(工作区级会话通常覆盖本项目)
  let scope = active
  if (!scope.length) {
    const parent = root.replace(/\/[^/]+$/, '') || '/'
    scope = items.filter((it) =>
      it && !it.blank && !it.origin
      && typeof it.updatedAt === 'number' && it.updatedAt >= since && it.updatedAt <= until
      && it.cwd === parent)
    if (scope.length) out.fallbackParent = parent
  }
  scope.sort((a, b) => b.updatedAt - a.updatedAt)
  for (const it of scope.slice(0, SESSION_CAP)) {
    const title = typeof it.projections?.values?.title === 'string' ? it.projections.values.title : ''
    const turns = []
    try {
      const { records } = await controller.events({
        address: { kind: 'session', sessionId: it.sessionId },
        maxMessages: 400,
        turnWindow: { minMessages: 10, minTurns: 2 },
      }, AbortSignal.timeout(20_000))
      for (const entry of records || []) {
        const ev = entry && entry.event ? entry.event : entry
        if (!ev || ev.type !== 'user/message' || typeof ev.time !== 'number') continue
        if (ev.time < since || ev.time > until) continue
        const src = ev.data && ev.data.source
        if (src && src.kind && src.kind !== 'user') continue
        const content = ev.data && ev.data.content
        const text = Array.isArray(content)
          ? content.filter((p) => p && p.type === 'text' && p.text).map((p) => p.text).join(' ').trim()
          : ''
        if (!text) continue
        turns.push({ text: cleanSessionText(text, TURN_TEXT_MAX), time: ev.time })
        if (turns.length >= TURNS_PER_SESSION) break
      }
    } catch (err) {
      out.skipped++
      log?.(`session ${it.sessionId} 读取失败: ${err?.message || err}`)
    }
    const desc = cleanSessionText(title || (turns[0] && turns[0].text) || '')
    if (!desc && !turns.length) continue
    out.total++
    out.sessions.push({ sessionId: it.sessionId, title, updatedAt: it.updatedAt, cwd: it.cwd || '', turns })
    if (desc) out.items.push({ desc, time: '', updatedAt: it.updatedAt })
  }
  return out
}
