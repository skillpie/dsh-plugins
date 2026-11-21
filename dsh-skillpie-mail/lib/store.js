/**
 * dsh-skillpie-mail — 邮箱列表存储(凭据记录承载) + 轮询引擎。
 *
 * 凭据记录 id: 'dsh-skillpie-mail/mailboxes'
 * payload: { mailboxes: [{ email, password, note }], lastUid: { [email]: n } }
 * 密码只在宿主侧保存,任何 API 都不会原样返回。
 */
import { fetchNewMail } from './imap.js'

export const RECORD_ID = 'dsh-skillpie-mail/mailboxes'
export const MAX_NOTIFICATIONS = 20

export class MailStore {
  constructor(credentials) {
    this.credentials = credentials
    // 内存通知环:客户端轮询取走
    this.notifications = []
    this.listeners = new Set()
  }

  async #read() {
    const record = await this.credentials.getRecord(RECORD_ID)
    const payload = record?.kind === 'grant' && record.payload ? record.payload : {}
    return { mailboxes: Array.isArray(payload.mailboxes) ? payload.mailboxes : [], lastUid: payload.lastUid ?? {} }
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
        const lastUid = state.lastUid[box.email] ?? 0
        const result = await fetchNewMail({ host, port, user: box.email, password: box.password, folders, lastUid })
        if (!baseline) {
          for (const message of result.messages) {
            fresh.push({ email: box.email, ...message })
          }
        }
        if (result.lastUid > (state.lastUid[box.email] ?? 0)) state.lastUid[box.email] = result.lastUid
      } catch (error) {
        // 单个邮箱失败不影响其它邮箱(密码错/网络断等)
        if (options.onBoxError) options.onBoxError(box.email, error)
      }
    }
    await this.#write(state)
    // 入通知环(新在前,截断)
    for (const message of fresh.reverse()) {
      this.notifications.unshift({ id: message.email + ':' + message.uid, seq: ++MailStore.seq, ...message })
    }
    if (this.notifications.length > MAX_NOTIFICATIONS) this.notifications.length = MAX_NOTIFICATIONS
    if (fresh.length) for (const fn of this.listeners) fn()
    return fresh
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
