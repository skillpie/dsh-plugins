/**
 * dsh-skillpie-mail — Cordis 入口(宿主半)。
 *
 * POST /dsh-skillpie-mail/api 动作:
 *   list                     → { mailboxes }            (不含密码)
 *   add      {email,password,note} → { mailboxes }      (IMAP 登录校验后保存)
 *   remove   {email}          → { mailboxes }
 *   register {username,note}  → { mailboxes, address, appPassword }  (SkillPie 注册页 API 建号并自动入列)
 *   poll     {wait?}          → { notifications, seq }   (取走新邮件通知)
 *
 * 后台每 pollInterval 秒 IMAP 轮询全部邮箱;密码存凭据记录,永不出宿主。
 */
import { MailStore, RECORD_ID } from './store.js'
import { ImapClient } from './imap.js'

export const ROUTE = '/dsh-skillpie-mail/api'
const MAX_BODY = 64 * 1024
const REGISTER_URL = 'https://mail.skillpie.cn/register/api/register'

/** 插件配置(默认连 SkillPie 邮箱服务器)。 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-skillpie-mail',
    validate(input) {
      if (input === undefined || input === null) return { value: {} }
      if (typeof input !== 'object' || Array.isArray(input)) {
        return { issues: [{ message: 'expected an object' }] }
      }
      const value = {}
      for (const key of ['registerUrl', 'imapHost']) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== 'string' || !input[key].trim()) {
            return { issues: [{ message: 'expected a non-empty string', path: [key] }] }
          }
          value[key] = input[key].trim()
        }
      }
      if (input.imapPort !== undefined) {
        const port = Number(input.imapPort)
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          return { issues: [{ message: 'expected a port number', path: ['imapPort'] }] }
        }
        value.imapPort = port
      }
      if (input.pollInterval !== undefined) {
        const sec = Number(input.pollInterval)
        if (!Number.isFinite(sec) || sec < 5) {
          return { issues: [{ message: 'expected seconds >= 5', path: ['pollInterval'] }] }
        }
        value.pollInterval = sec
      }
      return { value }
    },
  },
}

function readBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > MAX_BODY) {
        req.destroy()
        rejectPromise(new Error('request body too large'))
      }
    })
    req.on('end', () => {
      if (!data.trim()) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(data))
      } catch {
        rejectPromise(new Error('invalid JSON body'))
      }
    })
    req.on('error', rejectPromise)
  })
}

/** 快速注册:调 SkillPie 注册页 API(注册码已放开,invite 传空)。 */
async function registerMailbox(registerUrl, username, note) {
  const response = await fetch(registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, note, invite: '' }),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!payload || payload.ok !== true) {
    throw new Error(payload?.message || `注册失败(HTTP ${response.status})`)
  }
  return payload
}

/** IMAP 登录校验(手动添加邮箱时)。 */
async function verifyImap(host, port, email, password) {
  const client = new ImapClient({ host, port, user: email, password, timeoutMs: 15000 })
  try {
    await client.connect()
  } finally {
    await client.logout().catch(() => {})
  }
}

async function dispatch(store, cfg, body) {
  const action = typeof body?.action === 'string' ? body.action : ''
  switch (action) {
    case 'list': {
      return { ok: true, mailboxes: await store.list() }
    }
    case 'add': {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const note = String(body.note || '')
      await verifyImap(cfg.imapHost, cfg.imapPort, email, password)
      await store.add(email, password, note)
      return { ok: true, mailboxes: await store.list() }
    }
    case 'remove': {
      await store.remove(body.email)
      return { ok: true, mailboxes: await store.list() }
    }
    case 'register': {
      const username = String(body.username || '').trim().toLowerCase()
      const note = String(body.note || '')
      const result = await registerMailbox(cfg.registerUrl, username, note)
      await store.addFromRegister({ address: result.address, appPassword: result.appPassword, note })
      return { ok: true, address: result.address, appPassword: result.appPassword, mailboxes: await store.list() }
    }
    case 'history': {
      return { ok: true, messages: await store.history(String(body.email || '').trim().toLowerCase()) }
    }
    case 'poll': {
      const sinceSeq = Number(body.sinceSeq) || 0
      return { ok: true, notifications: store.takeNotifications(sinceSeq) }
    }
    case 'pollNow': {
      const sinceSeq = Number(body.sinceSeq) || 0
      await store.pollOnce(cfg)
      return { ok: true, notifications: store.takeNotifications(sinceSeq) }
    }
    default:
      throw new Error(`unknown action: ${action || '(empty)'}`)
  }
}

/** Cordis 插件入口。 */
export default {
  name: 'dsh-skillpie-mail',
  Config,
  inject: [],
  async apply(ctx, config = null) {
    const cfg = {
      registerUrl: config?.registerUrl ?? REGISTER_URL,
      imapHost: config?.imapHost ?? 'mail.skillpie.cn',
      imapPort: config?.imapPort ?? 993,
      pollInterval: config?.pollInterval ?? 20,
    }
    const folders = ['INBOX', 'Junk Mail'] // 验证码常进垃圾箱,一并监控

    // store 由 credentials 注入填充; HTTP 路由不依赖它, 先注册保证 API 可用
    const holder = { store: null }

    ctx.inject(['credentials'], async (child) => {
      const credentials = await child.credentials
      holder.store = new MailStore(credentials)
      const imapOpts = { host: cfg.imapHost, port: cfg.imapPort, folders }
      // 首轮立即拉一次,保证基线 lastUid(不推历史邮件:首轮只记水位)
      child.effect(() => {
        const timer = setInterval(() => {
          holder.store.pollOnce(imapOpts).catch(() => {})
        }, cfg.pollInterval * 1000)
        // 首轮只记水位,避免把存量邮件全推成弹窗
        holder.store.pollOnce({ ...imapOpts, baseline: true }).catch(() => {})
        return () => clearInterval(timer)
      }, 'dsh-skillpie-mail: poll timer')
    })

    ctx.inject(['webServer'], (child) => {
      child.effect(() => child.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          const send = (status, payload) => {
            res.writeHead(status, {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(JSON.stringify(payload))
          }
          try {
            const origin = req.headers?.origin
            if (typeof origin === 'string' && origin !== '') {
              let sameOrigin = false
              try { sameOrigin = new URL(origin).host === req.headers.host } catch {}
              if (!sameOrigin) {
                send(403, { ok: false, error: 'cross-origin request refused' })
                return
              }
            }
            if (req.method !== 'POST') {
              send(200, { ok: true, service: 'dsh-skillpie-mail', route: ROUTE })
              return
            }
            if (!holder.store) {
              send(200, { ok: false, error: 'credentials service not ready' })
              return
            }
            send(200, await dispatch(holder.store, { ...cfg, folders }, await readBody(req)))
          } catch (error) {
            send(200, { ok: false, error: error?.message ?? String(error) })
          }
        },
      }), 'dsh-skillpie-mail: http api')
    })
  },
}

export { MailStore, RECORD_ID, dispatch }
