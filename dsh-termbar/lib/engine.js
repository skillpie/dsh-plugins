/**
 * dsh-termbar — 底部终端引擎（宿主半）。
 *
 * 每个"终端会话"是一条由 subprocess 服务 spawnTerminal 分配的完整 PTY：
 * 交互式登录 shell（$SHELL -l，TERM=xterm-256color）。引擎负责：
 *   - 会话表（创建/写/改尺寸/关闭）与退出回收；
 *   - 每 会话 的滚动回看环形缓冲（重连/重开面板时回放）；
 *   - 把输出广播给 attach 在该会话上的 WebSocket，把
 *     created/exit 等生命周期事件广播给所有 WebSocket。
 *
 * 引擎本身不知道 webServer/ws 的存在，只暴露订阅者集合；宿主入口负责
 * WebSocket 的生命周期与帧协议。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Buffer } from 'node:buffer'

const DEFAULT_SCROLLBACK_BYTES = 512 * 1024

let nextSessionSeq = 1

/** 规整客户端上报的项目信息；不合规（无 id 且无 name）退 null。路径必须是绝对路径。 */
function normalizeProject(input) {
  if (!input || typeof input !== 'object') return null
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim().slice(0, 160) : ''
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : ''
  const p = typeof input.path === 'string' && input.path.startsWith('/') ? input.path : ''
  if (!id && !name) return null
  return { id: id || name, name: name || id, ...(p ? { path: p } : {}) }
}

function pathLeaf(p) {
  const clean = String(p ?? '').replace(/\/+$/, '')
  const leaf = clean.split(/[\\/]/).pop()
  return leaf && leaf.length > 0 ? leaf : clean
}

/** 另一端还开着时安全发送；任何发送异常都吞掉（close 流程会清理订阅）。 */
function safeSend(ws, payload) {
  try {
    if (ws.readyState === 1 /* WebSocket.OPEN */) ws.send(payload)
  } catch { /* socket already tearing down */ }
}

export class TermbarEngine {
  /**
   * @param {{ subprocess: object, config?: object, log?: (kind: string, text: string) => void }} deps
   */
  constructor({ subprocess, config = {}, log = () => {} }) {
    this.subprocess = subprocess
    this.config = config
    this.log = log
    /** @type {Map<string, any>} id → session record */
    this.sessions = new Map()
    /** @type {Set<any>} 所有连上的 ws（无论 attach 与否），用于广播 */
    this.clients = new Set()
    this.closing = false
  }

  /* ── 状态快照 ─────────────────────────────────────────────────────── */

  listSessions() {
    const list = []
    for (const s of this.sessions.values()) {
      list.push({ id: s.id, title: s.title, pid: s.pid, cwd: s.cwd, shell: s.shell, rows: s.rows, cols: s.cols, createdAt: s.createdAt, project: s.project || null })
    }
    return list
  }

  /* ── 生命周期 ─────────────────────────────────────────────────────── */

  /** 解析新终端的 shell 与工作目录。 */
  async resolveSpawnTarget(cwdOverride) {
    let defaultShell
    let platform = process.platform === 'win32' ? 'windows' : 'posix'
    try {
      const env = await this.subprocess.terminalEnvironment(undefined)
      if (env && typeof env === 'object') {
        if (typeof env.defaultShell === 'string' && env.defaultShell) defaultShell = env.defaultShell
        if (env.platform === 'windows' || env.platform === 'posix') platform = env.platform
      }
    } catch (error) {
      this.log('engine', `terminalEnvironment 读取失败，退回进程环境：${error?.message ?? error}`)
    }
    if (typeof this.config.shell === 'string' && this.config.shell.trim()) defaultShell = this.config.shell.trim()
    if (platform === 'windows') {
      defaultShell = defaultShell ?? process.env.ComSpec ?? 'cmd.exe'
    } else {
      defaultShell = defaultShell ?? process.env.SHELL ?? '/bin/zsh'
    }
    const argv = platform === 'windows' ? [defaultShell] : [defaultShell, '-l']

    const home = os.homedir()
    let cwd = typeof cwdOverride === 'string' && cwdOverride.trim() ? cwdOverride.trim() : home
    if (typeof this.config.cwd === 'string' && this.config.cwd.trim()) cwd = this.config.cwd.trim()
    let usable = false
    try {
      usable = fs.statSync(cwd).isDirectory()
    } catch { usable = false }
    if (!usable) {
      this.log('engine', `cwd 不可用（${cwd}），退回用户主目录`)
      cwd = home
    }
    return { argv, cwd, shell: defaultShell, platform }
  }

  /**
   * 创建一条终端会话并开始泵输出。返回会话快照；PTY 分配失败时抛错。
   */
  async create({ cols = 120, rows = 30, cwd, project } = {}) {
    if (this.closing) throw new Error('termbar: engine is shutting down')
    if (!this.subprocess || typeof this.subprocess.spawnTerminal !== 'function') {
      throw new Error('termbar: subprocess 服务不可用（spawnTerminal 缺失）')
    }
    const proj = normalizeProject(project)
    const target = await this.resolveSpawnTarget(cwd || (proj && proj.path))
    const id = `term-${Date.now().toString(36)}-${nextSessionSeq++}`
    const c = Number.isFinite(cols) ? Math.floor(cols) : 120
    const r = Number.isFinite(rows) ? Math.floor(rows) : 30

    const handle = await this.subprocess.spawnTerminal({
      argv: target.argv,
      cwd: target.cwd,
      env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      rows: Math.max(2, r),
      cols: Math.max(2, c),
      terminalType: 'xterm-256color',
      graceMs: 3000,
    })

    // 标题 = 路径叶子；同名并存时追加序号（ZCode 风格）。
    const leaf = pathLeaf(target.cwd)
    let dup = 1
    for (const s of this.sessions.values()) {
      if (s.title === leaf || s.title.startsWith(`${leaf} ·`)) dup += 1
    }
    const title = dup > 1 ? `${leaf} · ${dup}` : leaf

    const session = {
      id,
      title,
      project: proj,
      cwd: target.cwd,
      shell: target.shell,
      pid: handle.pid,
      rows: Math.max(2, r),
      cols: Math.max(2, c),
      createdAt: Date.now(),
      handle,
      /** @type {Buffer[]} */
      chunks: [],
      bytes: 0,
      /** 回看上限裁剪掉的累计字节；chunks 覆盖区间 = [dropped, bytes) */
      dropped: 0,
      exited: false,
      /** @type {Set<any>} attach 在该会话上的 ws */
      subscribers: new Set(),
    }
    this.sessions.set(id, session)
    this.log('engine', `终端 ${id} 已创建（pid=${handle.pid} shell=${target.shell} cwd=${target.cwd}）`)

    // 输出泵：追加回看缓冲 + 广播二进制帧。
    handle.output.on('data', (chunk) => {
      try {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        this.appendScrollback(session, buf)
        for (const ws of session.subscribers) {
          try {
            if (ws.readyState !== 1) continue
            // 输出统一走 outb 文本帧（base64 + id）：relay 隧道只过文本帧，直连也兼容。
            safeSend(ws, JSON.stringify({ t: 'outb', id: session.id, chunk: buf.toString('base64'), total: session.bytes }))
          } catch { /* subscriber gone */ }
        }
      } catch { /* never let the pump crash the host */ }
    })
    handle.output.on('error', () => { /* transport errors surface via done */ })

    // 退出回收：广播 exit、移除会话、解除订阅。
    handle.done.then(
      (outcome) => this.handleExit(session, outcome),
      (error) => this.handleExit(session, { exitCode: null, signal: null, error: error?.message ?? String(error) }),
    )

    this.broadcast({ t: 'created', session: this.snapshot(session) })
    return this.snapshot(session)
  }

  snapshot(session) {
    return { id: session.id, title: session.title, pid: session.pid, cwd: session.cwd, shell: session.shell, rows: session.rows, cols: session.cols, createdAt: session.createdAt, project: session.project || null }
  }

  appendScrollback(session, buf) {
    session.chunks.push(buf)
    session.bytes += buf.length
    const cap = this.scrollbackBytes()
    while (session.bytes > cap && session.chunks.length > 1) {
      const dropped = session.chunks.shift()
      session.bytes -= dropped.length
      session.dropped += dropped.length
    }
  }

  scrollbackBytes() {
    const kb = Number(this.config.scrollbackKB)
    if (!Number.isFinite(kb) || kb <= 0) return DEFAULT_SCROLLBACK_BYTES
    return Math.min(16 * 1024 * 1024, Math.max(64 * 1024, Math.floor(kb) * 1024))
  }

  handleExit(session, outcome) {
    if (session.exited) return
    session.exited = true
    // 让订阅端先收到缓冲里剩余输出再收 exit：下一轮事件循环再广播。
    setImmediate(() => {
      try {
        this.sessions.delete(session.id)
        for (const ws of session.subscribers) {
          if (ws.readyState === 1 && ws.attachedId === session.id) ws.attachedId = null
        }
        session.subscribers.clear()
        this.broadcast({
          t: 'exit',
          id: session.id,
          exitCode: outcome?.exitCode ?? null,
          signal: outcome?.signal ?? null,
        })
        this.log('engine', `终端 ${session.id} 已退出（code=${outcome?.exitCode} signal=${outcome?.signal ?? ''}）`)
      } catch { /* shutdown race */ }
    })
  }

  /* ── I/O ──────────────────────────────────────────────────────────── */

  async write(id, data) {
    const session = this.sessions.get(id)
    if (!session || typeof data !== 'string' || data.length === 0) return
    await session.handle.write(data)
  }

  async resize(id, cols, rows) {
    const session = this.sessions.get(id)
    if (!session) return
    const c = Math.max(2, Math.min(1000, Math.floor(Number(cols) || session.cols)))
    const r = Math.max(2, Math.min(300, Math.floor(Number(rows) || session.rows)))
    if (c === session.cols && r === session.rows) return
    session.cols = c
    session.rows = r
    await session.handle.resize(c, r)
  }

  /** 回放缓冲（base64）。 */
  scrollbackBase64(id) {
    const session = this.sessions.get(id)
    if (!session) return undefined
    return Buffer.concat(session.chunks, session.bytes).toString('base64')
  }

  /** 用户主动关闭一个 tab：终结整条 PTY；exit 事件随后广播。 */
  async close(id) {
    const session = this.sessions.get(id)
    if (!session) return false
    // 交互式 shell 对 SIGTERM 免疫（zsh 默认忽略），terminate() 会等满 graceMs
    // 才补杀——表现为关 tab 卡顿。先 SIGHUP（登录 shell 对 HUP 顺从，立即退出），
    // 400ms 内未退再补 SIGKILL/terminate 兜底。
    try {
      if (typeof session.handle.signalForeground === 'function') {
        const signaled = await session.handle.signalForeground('SIGHUP')
        if (signaled > 0) {
          const backstop = setTimeout(() => {
            if (!this.sessions.has(id)) return
            try {
              if (typeof session.handle.signalForeground === 'function') {
                void session.handle.signalForeground('SIGKILL').catch(() => {})
              }
            } catch { /* 已死 */ }
            session.handle.terminate().catch(() => {})
          }, 400)
          backstop.unref?.()
          return true
        }
      }
    } catch { /* 走兜底 */ }
    try {
      await session.handle.terminate()
    } catch (error) {
      this.log('engine', `终端 ${id} terminate 失败：${error?.message ?? error}`)
    }
    return true
  }

  /* ── WebSocket 订阅管理 ───────────────────────────────────────────── */

  addClient(ws) {
    this.clients.add(ws)
    ws.attachedId = null
    safeSend(ws, JSON.stringify({ t: 'hello', sessions: this.listSessions() }))
  }

  removeClient(ws) {
    this.clients.delete(ws)
    const id = ws.attachedId
    ws.attachedId = null
    if (id) {
      const session = this.sessions.get(id)
      if (session) session.subscribers.delete(ws)
    }
    // 分栏附加订阅也要清，否则死 ws 滞留在 subscribers 里。
    if (ws.extraSubs) {
      for (const sid of ws.extraSubs) {
        const session = this.sessions.get(sid)
        if (session) session.subscribers.delete(ws)
      }
      ws.extraSubs.clear()
    }
  }

  attach(ws, id, have, extra) {
    const session = this.sessions.get(id)
    if (!session) {
      safeSend(ws, JSON.stringify({ t: 'miss', id }))
      return
    }
    // 换绑：先从旧会话解除。
    const prev = ws.attachedId
    if (prev && prev !== id) {
      const prevSession = this.sessions.get(prev)
      if (prevSession) prevSession.subscribers.delete(ws)
    }
    ws.attachedId = id
    session.subscribers.add(ws)
    // 增量补齐：客户端 have 落在 [dropped, bytes] 区间 → 只发缺失尾部，
    // 客户端不清屏不滚屏；超出区间（新端/落后太多）才整段重放。
    const ask = Number(have)
    const deltaFrom = Number.isFinite(ask) && ask >= session.dropped && ask <= session.bytes ? ask : null
    if (deltaFrom === null) {
      safeSend(ws, JSON.stringify({
        t: 'attached',
        id,
        rows: session.rows,
        cols: session.cols,
        buffer: this.scrollbackBase64(id),
        total: session.bytes,
      }))
    } else {
      safeSend(ws, JSON.stringify({ t: 'attached', id, rows: session.rows, cols: session.cols, total: session.bytes }))
      const tail = this.tailBuffer(session, deltaFrom)
      if (tail.length) safeSend(ws, JSON.stringify({ t: 'outb', id, chunk: tail.toString('base64'), total: session.bytes }))
    }
    this.syncExtra(ws, Array.isArray(extra) ? extra : [])
  }

  /** 取 session.chunks 中 [from, bytes) 的缺失尾部。 */
  tailBuffer(session, from) {
    const parts = []
    let skip = from - session.dropped
    for (const chunk of session.chunks) {
      if (skip >= chunk.length) { skip -= chunk.length; continue }
      parts.push(skip > 0 ? chunk.subarray(skip) : chunk)
      skip = 0
    }
    return Buffer.concat(parts)
  }

  /** 分栏模式下非聚焦窗格的输出订阅：base64 文本帧（带路由 id），与二进制热路径区分。 */
  syncExtra(ws, extra) {
    const wanted = new Map()
    for (const item of extra) {
      if (!item || typeof item !== 'object') continue
      const sid = String(item.id ?? '')
      if (sid && sid !== ws.attachedId && this.sessions.has(sid)) wanted.set(sid, Number(item.have))
    }
    const prevExtra = ws.extraSubs || new Set()
    // 解除不再需要的订阅。
    for (const sid of prevExtra) {
      if (!wanted.has(sid)) {
        const session = this.sessions.get(sid)
        if (session) session.subscribers.delete(ws)
        prevExtra.delete(sid)
      }
    }
    for (const [sid, haveNum] of wanted) {
      const session = this.sessions.get(sid)
      if (!session) continue
      session.subscribers.add(ws)
      prevExtra.add(sid)
      const ask = Number.isFinite(haveNum) && haveNum >= session.dropped && haveNum <= session.bytes ? haveNum : null
      if (ask === null) {
        // 客户端落后太多（新端/缓冲被裁）：整段重放并要求客户端清屏。
        safeSend(ws, JSON.stringify({ t: 'outb', id: sid, chunk: this.scrollbackBase64(sid), reset: true, total: session.bytes }))
      } else {
        const tail = this.tailBuffer(session, ask)
        if (tail.length) safeSend(ws, JSON.stringify({ t: 'outb', id: sid, chunk: tail.toString('base64'), total: session.bytes }))
      }
    }
    ws.extraSubs = prevExtra
  }

  sendRaw(ws, buf) {
    try { if (ws.readyState === 1) ws.send(buf) } catch { /* gone */ }
  }

  detach(ws) {
    const id = ws.attachedId
    ws.attachedId = null
    if (id) {
      const session = this.sessions.get(id)
      if (session) session.subscribers.delete(ws)
    }
  }

  broadcast(event) {
    const text = JSON.stringify(event)
    for (const ws of this.clients) safeSend(ws, text)
  }

  /** 插件停用：终结所有 PTY 并断开所有客户端。 */
  async dispose() {
    this.closing = true
    const jobs = []
    for (const session of this.sessions.values()) {
      jobs.push(session.handle.terminate().catch(() => {}))
    }
    await Promise.allSettled(jobs)
    this.sessions.clear()
    for (const ws of this.clients) {
      try { ws.close(1001, 'termbar shutting down') } catch { /* already gone */ }
    }
    this.clients.clear()
  }
}
