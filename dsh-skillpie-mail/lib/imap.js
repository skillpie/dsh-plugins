/**
 * dsh-skillpie-mail — 最小 IMAP 客户端 + 邮件解析(零依赖)。
 *
 * 只实现插件需要的子集: LOGIN / SELECT / UID SEARCH / UID FETCH / LOGOUT,
 * 处理 IMAP 字面量({N})字节级读取;邮件解析只取 From/To/Subject/Date/正文,
 * RFC2047 编码头 + 裸 8bit GBK 链兜底(配合 TextDecoder 的 gbk 支持)。
 */
import tls from 'node:tls'

const CRLF = '\r\n'

/** 带字面量({N}\r\n + N 字节)的响应读取器。 */
class ImapStream {
  constructor(socket) {
    this.socket = socket
    this.buffer = Buffer.alloc(0)
    this.queue = [] // 完整的一批行(含字面量拼接结果)
    this.waiters = [] // { resolve }
    this.closed = false
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.#drain()
    })
    socket.on('error', () => this.#close())
    socket.on('close', () => this.#close())
  }

  #close() {
    if (this.closed) return
    this.closed = true
    for (const w of this.waiters) w.resolve(null)
    this.waiters = []
  }

  /** 按行 + 字面量切分缓冲区。 */
  #drain() {
    for (;;) {
      const idx = this.buffer.indexOf(CRLF)
      if (idx < 0) return
      const line = this.buffer.subarray(0, idx).toString('utf-8')
      const litMatch = /\{(\d+)\}$/.exec(line)
      if (litMatch) {
        const need = Number(litMatch[1])
        const start = idx + 2
        if (this.buffer.length < start + need) return // 等更多数据
        const literal = this.buffer.subarray(start, start + need)
        const rest = this.buffer.subarray(start + need)
        const nextIdx = rest.indexOf(CRLF)
        if (nextIdx < 0) return // 字面量后必须紧跟 CRLF + 下一段,等数据
        const tail = rest.subarray(0, nextIdx).toString('utf-8')
        this.buffer = rest.subarray(nextIdx + 2)
        this.queue.push({ line, literal, tail })
      } else {
        this.buffer = this.buffer.subarray(idx + 2)
        this.queue.push({ line, literal: null, tail: '' })
      }
      const waiters = this.waiters
      this.waiters = []
      for (const w of waiters) w.resolve(this.queue.shift())
    }
  }

  /** 读下一条响应,连接关闭时 resolve(null)。 */
  read(timeoutMs = 20000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift())
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(entry)
        if (i >= 0) this.waiters.splice(i, 1)
        resolve(null)
      }, timeoutMs)
      const entry = {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
      }
      this.waiters.push(entry)
    })
  }
}

/** IMAP 字符串字面量:加引号并转义。 */
function quote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}

export class ImapError extends Error {}

export class ImapClient {
  constructor({ host, port = 993, user, password, timeoutMs = 20000 }) {
    this.host = host
    this.port = port
    this.user = user
    this.password = password
    this.timeoutMs = timeoutMs
    this.tagSeq = 0
  }

  async connect() {
    this.socket = tls.connect({ host: this.host, port: this.port, rejectUnauthorized: false })
    this.stream = new ImapStream(this.socket)
    const greeting = await this.stream.read(this.timeoutMs)
    if (!greeting || !/^\*\s+(OK|PREAUTH)/.test(greeting.line)) {
      throw new ImapError('IMAP 连接失败: ' + (greeting ? greeting.line : '无响应'))
    }
    await this.command('LOGIN', quote(this.user), quote(this.password))
  }

  /** 发命令并收集到同 tag 完成为止的所有响应行(含字面量段)。 */
  async command(...words) {
    const tag = 'A' + (++this.tagSeq)
    const line = [tag, ...words].join(' ') + CRLF
    this.socket.write(line)
    const responses = []
    for (;;) {
      const msg = await this.stream.read(this.timeoutMs)
      if (!msg) throw new ImapError('IMAP 连接中断')
      // FETCH 响应的字面量段与 tail 属同一条,合并保留
      responses.push(msg.line + (msg.literal != null ? '{lit}' + msg.tail : ''))
      if (msg.literal != null) {
        // 字面量内容按原样插入,供解析器提取
        responses[responses.length - 1] = responses[responses.length - 1].replace(
          '{lit}',
          '\x00LIT\x00' + msg.literal.toString('utf-8') + '\x00END\x00',
        )
      }
      if (msg.line.startsWith(tag + ' ')) break
    }
    const status = responses[responses.length - 1].slice(tag.length + 1).split(' ')[0]
    if (status === 'BAD' || status === 'NO') {
      throw new ImapError('IMAP ' + status + ': ' + responses[responses.length - 1].slice(tag.length + 1))
    }
    return responses
  }

  /** SELECT 文件夹,返回 { exists }。 */
  async select(mailbox) {
    const lines = await this.command('SELECT', quote(mailbox))
    let exists = 0
    for (const l of lines) {
      const m = /\*\s+(\d+)\s+EXISTS/.exec(l)
      if (m) exists = Number(m[1])
    }
    return { exists }
  }

  /** UID SEARCH UID <from>:* → 升序 UID 数组。 */
  async searchUids(from) {
    const lines = await this.command('UID', 'SEARCH', 'UID', `${from}:*`)
    for (const l of lines) {
      const m = /^\*\s+SEARCH\s*(.*)$/.exec(l)
      if (m) {
        return m[1].trim() ? m[1].trim().split(/\s+/).map(Number).filter((n) => n >= from) : []
      }
    }
    return []
  }

  /** UID FETCH 完整原文(BODY.PEEK[] 不动未读标记)。返回 [{uid, raw}]。 */
  async fetchRaw(uids) {
    if (!uids.length) return []
    const lines = await this.command('UID', 'FETCH', uids.join(','), '(BODY.PEEK[])')
    const out = []
    for (const l of lines) {
      const m = /\x00LIT\x00([\s\S]*)\x00END\x00/.exec(l)
      if (m) out.push({ uid: 0, raw: Buffer.from(m[1], 'utf-8') })
    }
    return out
  }

  async logout() {
    try {
      await this.command('LOGOUT')
    } catch {}
    this.socket.end()
    this.socket.destroy()
  }
}

/* ── 邮件头解析 ─────────────────────────────────────────────────────────── */

const textDecoder = (enc) => {
  try {
    return new TextDecoder(enc, { fatal: true })
  } catch {
    return null
  }
}

const FALLBACK_DECODERS = ['utf-8', 'gbk', 'gb18030', 'big5', 'latin1']
  .map((e) => [e, textDecoder(e)])
  .filter(([, d]) => d)

/** bytes → str:GBK 链兜底(发件方乱标或不标编码时)。 */
export function decodeBytes(buf) {
  for (const [, dec] of FALLBACK_DECODERS) {
    try {
      return dec.decode(buf)
    } catch {}
  }
  return buf.toString('utf-8')
}

/** 解码单个 encoded-word (RFC2047 B/Q)。 */
function decodeEncodedWord(word) {
  const m = /^=\?([^?]+)\?([BbQq])\?([\s\S]*?)\?=$/.exec(word)
  if (!m) return word
  const [, cs, enc, text] = m
  let buf
  try {
    if (enc.toUpperCase() === 'B') buf = Buffer.from(text, 'base64')
    else buf = Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'binary')
  } catch {
    return word
  }
  try {
    return textDecoder(cs)?.decode(buf) ?? decodeBytes(buf)
  } catch {
    return decodeBytes(buf)
  }
}

/** 整行 header 值:encoded-word 展开 + 裸 8bit GBK 兜底。 */
export function decodeHeaderValue(value) {
  if (value == null) return ''
  let s = value.replace(/\r?\n[ \t]+/g, ' ') // 折行展开
  if (/=[\s\S]*\?/.test(s)) s = s.replace(/=\?[^?]+\?[BbQq]\?[\s\S]*?\?=/g, decodeEncodedWord)
  // 剩余裸 8bit(非 ASCII)按字节还原(GBK 链优先,兼容发件方不标编码)
  if (/[^\x00-\x7F]/.test(s) && !s.includes('\uFFFD')) {
    try {
      const buf = Buffer.from(s, 'latin1')
      for (const enc of ['utf-8', 'gbk', 'gb18030', 'big5']) {
        const d = textDecoder(enc)
        if (!d) continue
        try {
          return d.decode(buf)
        } catch {}
      }
    } catch {}
  }
  return s
}

/** 从原始头块提取指定头(支持折行)。 */
function getHeader(headerBlock, name) {
  const re = new RegExp('^' + name + ':([\\s\\S]*?)(?=\\r?\\n[^ \\t]|$)', 'im')
  const m = re.exec(headerBlock)
  return m ? m[1].trim() : ''
}

/** 地址字段只取邮箱地址。 */
export function parseAddress(value) {
  const m = /<([^>]+)>/.exec(value || '')
  return (m ? m[1] : value || '').trim()
}

/** 解码 transfer-encoded 文本。 */
function decodeBodyText(buf, cte, charset) {
  let bytes = buf
  const enc = (cte || '').toLowerCase()
  try {
    if (enc === 'base64') bytes = Buffer.from(buf.toString('ascii').replace(/\s+/g, ''), 'base64')
    else if (enc === 'quoted-printable') {
      bytes = Buffer.from(
        buf.toString('latin1').replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
        'binary',
      )
    }
  } catch {}
  const cs = (charset || '').toLowerCase().replace(/"[^"]*"/g, (q) => q.slice(1, -1)).trim()
  if (cs && cs !== 'unknown-8bit') {
    const d = textDecoder(cs) || textDecoder(cs.split('/')[0])
    if (d) {
      try {
        return d.decode(bytes)
      } catch {}
    }
  }
  return decodeBytes(bytes)
}

function contentTypeOf(headerBlock) {
  const raw = getHeader(headerBlock, 'Content-Type') || ''
  const type = (/^\s*([^;]+)/.exec(raw) || [])[1] || 'text/plain'
  const charset = (/charset\s*=\s*"?([^";]+)"?/i.exec(raw) || [])[1]
  const boundary = (/boundary\s*=\s*"?([^";]+)"?/i.exec(raw) || [])[1]
  return { type: type.trim().toLowerCase(), charset, boundary: boundary && boundary.trim() }
}

/** 提取纯文本正文(截断 maxLength)。 */
export function extractText(rawBuf, maxLength = 800) {
  const sep = rawBuf.indexOf('\r\n\r\n')
  const headerBlock = rawBuf.subarray(0, sep < 0 ? 0 : sep).toString('latin1')
  const bodyBuf = sep < 0 ? rawBuf : rawBuf.subarray(sep + 4)
  const walk = (buf, ct) => {
    if (ct.type.startsWith('multipart/') && ct.boundary) {
      const b = '--' + ct.boundary
      const parts = []
      let idx = buf.indexOf(b)
      while (idx >= 0) {
        const next = buf.indexOf(b, idx + b.length)
        if (next < 0) break
        parts.push(buf.subarray(idx + b.length, next))
        idx = next
      }
      for (const part of parts) {
        const psep = part.indexOf('\r\n\r\n')
        if (psep < 0) continue
        const ph = part.subarray(0, psep).toString('latin1')
        const pct = contentTypeOf(ph)
        const text = walk(part.subarray(psep + 4), pct)
        if (text) return text
      }
      return ''
    }
    const cte = (getHeader(buf.toString('latin1', 0, Math.min(buf.length, 4096)), 'Content-Transfer-Encoding') || '').trim()
    const text = decodeBodyText(buf, cte, ct.charset)
    if (ct.type === 'text/plain' || ct.type === 'text/html' || !ct.type) {
      return ct.type === 'text/html' ? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : text.trim()
    }
    return ''
  }
  const text = walk(bodyBuf, contentTypeOf(headerBlock)) || bodyBuf.toString('utf-8')
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text
}

/** 解析整封邮件 → {from, to, subject, date, text}。 */
export function parseMail(rawBuf) {
  const sep = rawBuf.indexOf('\r\n\r\n')
  const headerBlock = rawBuf.subarray(0, sep < 0 ? rawBuf.length : sep).toString('latin1')
  return {
    from: decodeHeaderValue(getHeader(headerBlock, 'From')),
    to: decodeHeaderValue(getHeader(headerBlock, 'To')),
    subject: decodeHeaderValue(getHeader(headerBlock, 'Subject')),
    date: getHeader(headerBlock, 'Date'),
    text: extractText(rawBuf),
  }
}

/* ── 高层:检查一个邮箱的新邮件 ──────────────────────────────────────────── */

/**
 * 检查邮箱自 lastUid 以来的新邮件。
 * @returns {Promise<{messages: Array<{uid, folder, from, to, subject, date, text}>, lastUid}>}
 */
export async function fetchNewMail({ host, port, user, password, folders = ['INBOX'], lastUid = 0 }) {
  const client = new ImapClient({ host, port, user, password })
  await client.connect()
  try {
    const messages = []
    let maxUid = lastUid
    for (const folder of folders) {
      await client.select(folder)
      const uids = await client.searchUids(lastUid + 1)
      const fresh = uids.filter((u) => u > lastUid)
      for (const uid of fresh) {
        const lines = await client.command('UID', 'FETCH', String(uid), '(BODY.PEEK[])')
        for (const l of lines) {
          const m = /\x00LIT\x00([\s\S]*)\x00END\x00/.exec(l)
          if (!m) continue
          const parsed = parseMail(Buffer.from(m[1], 'utf-8'))
          messages.push({ uid, folder, ...parsed })
          if (uid > maxUid) maxUid = uid
        }
      }
    }
    return { messages, lastUid: maxUid }
  } finally {
    await client.logout().catch(() => {})
  }
}
