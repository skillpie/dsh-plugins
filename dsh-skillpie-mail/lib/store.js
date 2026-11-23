/**
 * dsh-skillpie-mail — 邮箱列表存储(凭据记录承载) + 轮询引擎。
 *
 * 凭据记录 id: 'dsh-skillpie-mail/mailboxes'
 * payload: { mailboxes: [{ email, password, note }], lastUid: { [email]: n } }
 * 密码只在宿主侧保存,任何 API 都不会原样返回。
 */
import { fetchNewMail, parseMail, sanitizeHtml, ImapClient } from './imap.js'

export const RECORD_ID = 'dsh-skillpie-mail/mailboxes'
export const MAX_NOTIFICATIONS = 20
export const MAX_HISTORY = 200

export class MailStore {
  constructor(credentials) {
    this.credentials = credentials
    // 内存通知环:客户端轮询取走
    this.notifications = []
    this.listeners = new Set()
  }

  async #read() {
    const record = await this.credentials.readRecord(RECORD_ID)
    const payload = record?.kind === 'grant' && record.payload ? record.payload : {}
    return {
      mailboxes: Array.isArray(payload.mailboxes) ? payload.mailboxes : [],
      lastUid: payload.lastUid ?? {},
      lastUidByFolder: payload.lastUidByFolder ?? {},
      lastTimeByFolder: payload.lastTimeByFolder ?? {},
      history: Array.isArray(payload.history) ? payload.history : [],
      readIds: payload.readIds && typeof payload.readIds === 'object' ? payload.readIds : {},
    }
  }

  async #write(next) {
    await this.credentials.modifyRecord(RECORD_ID, () => ({ kind: 'grant', payload: next }))
  }

  /** 列表(不含密码)。 */
  async list() {
    const { mailboxes } = await this.#read()
    return mailboxes.map(({ email, note, addedAt }) => ({ email, note: note || '', addedAt: addedAt || null }))
  }

  /** 添加(重复 email 拒绝)。 */
  async add(email, password, note = '') {
    email = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱地址格式不正确')
    if (!password) throw new Error('密码不能为空')
    const state = await this.#read()
    if (state.mailboxes.some((m) => m.email === email)) throw new Error('该邮箱已在列表中')
    state.mailboxes.push({ email, password: String(password), note: String(note || '').slice(0, 50), addedAt: new Date().toISOString() })
    await this.#write(state)
    return { email, note: note }
  }

  /** 移除。 */
  async remove(email) {
    const state = await this.#read()
    const before = state.mailboxes.length
    state.mailboxes = state.mailboxes.filter((m) => m.email !== String(email).trim().toLowerCase())
    if (state.mailboxes.length === before) throw new Error('列表中没有该邮箱')
    await this.#write(state)
  }

  /** 快速注册成功后直接入列表(密码用应用密码)。 */
  async addFromRegister(entry) {
    return this.add(entry.address, entry.appPassword, entry.note || '注册页创建')
  }

  /** 轮询一轮。baseline=true 时只推进水位、不产出通知(首轮防历史邮件刷屏)。 */
  async pollOnce(options = {}) {
    const { host, port, folders, baseline } = options
    const state = await this.#read()
    const fresh = []
    for (const box of state.mailboxes) {
      try {
        // 水位按 (邮箱, 文件夹) 独立记:各文件夹 UID 序列独立,共用一个水位会漏新信
        const lastUid = state.lastUid[box.email] ?? 0
        const folderMarks = state.lastUidByFolder?.[box.email] ?? {}
        const folderTimes = state.lastTimeByFolder?.[box.email] ?? {}
        const result = await fetchNewMail({ host, port, user: box.email, password: box.password, folders, lastUidByFolder: folderMarks, lastTimeByFolder: folderTimes })
        if (!baseline) {
          for (const message of result.messages) {
            fresh.push({ email: box.email, ...message })
          }
        }
        if (result.lastUidByFolder) {
          state.lastUidByFolder = state.lastUidByFolder ?? {}
          state.lastUidByFolder[box.email] = result.lastUidByFolder
          state.lastTimeByFolder = state.lastTimeByFolder ?? {}
          state.lastTimeByFolder[box.email] = result.lastTimeByFolder ?? state.lastTimeByFolder[box.email] ?? {}
        } else if (result.lastUid > (state.lastUid[box.email] ?? 0)) {
          state.lastUid[box.email] = result.lastUid // 兼容旧格式
        }
      } catch (error) {
        // 单个邮箱失败不影响其它邮箱(密码错/网络断等)
        if (options.onBoxError) options.onBoxError(box.email, error)
      }
    }
    // 收件历史(持久,最新在前,截断;不存密码);按 id 去重防历史损坏期间/并发轮询造成的重复
    {
      const seen = new Set()
      state.history = (state.history ?? []).filter((m) => {
        if (!m?.id || seen.has(m.id)) return false
        seen.add(m.id)
        return true
      })
    }
    if (fresh.length) {
      for (const message of fresh) {
        state.history.unshift({
          id: message.email + ':' + message.uid,
          email: message.email, uid: message.uid, folder: message.folder,
          from: message.from, to: message.to, subject: message.subject, date: message.date,
          text: (message.text || '').slice(0, 2000),
          html: sanitizeHtml(message.html || '', 8000),
          receivedAt: (() => { const t = Date.parse(message.date || ''); return isNaN(t) ? new Date().toISOString() : new Date(t).toISOString() })(), // 优先邮件头 Date,解析失败才用本机时间
        })
      }
      if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY
    }
    await this.#write(state)
    // 入通知环(新在前,截断)
    for (const message of fresh.reverse()) {
      this.notifications.unshift({
        id: message.email + ':' + message.uid, seq: ++MailStore.seq, ...message,
        html: sanitizeHtml(message.html || '', 8000),
      })
    }
    if (this.notifications.length > MAX_NOTIFICATIONS) this.notifications.length = MAX_NOTIFICATIONS
    if (fresh.length) for (const fn of this.listeners) fn()
    return fresh
  }

  /** 收件历史(不含密码,最新在前)。 */
  async history(email = '') {
    const { history, readIds } = await this.#read()
    const list = email ? history.filter((m) => m.email === email) : history
    return list.map((m) => ({ ...m, read: Boolean(readIds[m.id]) }))
  }

  /**
   * 修复存量历史邮件的正文链接。
   * 0.1.7 以前的 sanitizeHtml 会把 <a> 的 href 丢弃(pointer-events:none + 无 href),
   * 历史里存的 html 永久失去链接目标;这里按 (邮箱, 文件夹, UID) 回服务器重拉原文,
   * 用新版 sanitizeHtml 重新净化后原地覆盖。服务器已删的信保持原样。
   */
  async repairHtml(options = {}) {
    const { host, port, folders } = options
    const state = await this.#read()
    const need = (state.history ?? []).filter((m) => m.html && /<a[\s>]/i.test(m.html) && !/href\s*=/i.test(m.html))
    if (!need.length) return { repaired: 0 }
    const byBox = new Map()
    for (const m of need) {
      if (!byBox.has(m.email)) byBox.set(m.email, [])
      byBox.get(m.email).push(m)
    }
    let repaired = 0
    for (const box of state.mailboxes) {
      const targets = byBox.get(box.email)
      if (!targets?.length) continue
      try {
        const client = new ImapClient({ host, port, user: box.email, password: box.password })
        await client.connect()
        try {
          const byFolder = new Map()
          for (const m of targets) {
            if (!byFolder.has(m.folder)) byFolder.set(m.folder, [])
            byFolder.get(m.folder).push(m)
          }
          for (const [folder, mails] of byFolder) {
            if (!folders.includes(folder)) continue // 只修当前配置的文件夹
            await client.select(folder)
            for (const m of mails) {
              const raws = await client.fetchRaw([m.uid])
              if (!raws.length) continue
              const parsed = parseMail(raws[0].raw)
              const html = sanitizeHtml(parsed.html || '', 8000)
              if (html && /<a[\s>]/i.test(html) && /href\s*=/i.test(html)) {
                m.html = html
                m.text = (parsed.text || '').slice(0, 2000)
                repaired++
              }
            }
          }
        } finally {
          await client.logout().catch(() => {})
        }
      } catch (error) {
        // 单个邮箱失败不影响其它邮箱
        if (options.onBoxError) options.onBoxError(box.email, error)
      }
    }
    if (repaired) await this.#write(state)
    return { repaired }
  }

  /** 删除单封历史邮件(按 id)。返回是否删除。 */
  async deleteMail(id) {
    const target = String(id || '')
    await this.credentials.modifyRecord(RECORD_ID, (current) => {
      const payload = current?.payload ?? { mailboxes: [], lastUid: {}, history: [] }
      payload.history = (payload.history || []).filter((m) => m.id !== target)
      return { kind: 'grant', payload }
    })
    return true
  }

  /** 未读邮件总数(全部邮箱)。 */
  async unreadCount() {
    const { history, readIds } = await this.#read()
    return history.filter((m) => !readIds[m.id]).length
  }

  /** 全部已读:email 指定邮箱则只标该邮箱。 */
  async markAllRead(email = '') {
    const target = (email || '').trim().toLowerCase()
    await this.credentials.modifyRecord(RECORD_ID, (current) => {
      const payload = current?.payload ?? { mailboxes: [], lastUid: {}, history: [] }
      payload.readIds = payload.readIds || {}
      for (const m of payload.history || []) {
        if (!target || m.email === target) payload.readIds[m.id] = true
      }
      return { kind: 'grant', payload }
    })
  }

  /** 标记邮件已读(按 history 条目 id)。 */
  async markRead(id) {
    await this.credentials.modifyRecord(RECORD_ID, (current) => {
      const payload = current?.payload ?? { mailboxes: [], lastUid: {}, history: [] }
      payload.readIds = payload.readIds || {}
      payload.readIds[id] = true
      return { kind: 'grant', payload } // 必须返回完整记录(含 kind),否则记录失效列表变空
    })
  }

  /** 清空收件历史:email 指定邮箱则只清该邮箱,否则全清。返回剩余条数。 */
  async clearHistory(email = '') {
    const target = (email || '').trim().toLowerCase()
    await this.credentials.modifyRecord(RECORD_ID, (current) => {
      const payload = current?.payload ?? { mailboxes: [], lastUid: {}, history: [] }
      const left = target ? (payload.history ?? []).filter((m) => m.email !== target) : []
      return { kind: 'grant', payload: { ...payload, history: left } }
    })
    const { history } = await this.#read()
    return { remaining: history.length }
  }

  /** 取走通知(客户端轮询)。sinceSeq 之后的消息。 */
  takeNotifications(sinceSeq = 0) {
    const items = this.notifications.filter((n) => n.seq > sinceSeq)
    return items.map(({ password, ...rest }) => {
      void password
      return rest
    })
  }
}

MailStore.seq = 0
