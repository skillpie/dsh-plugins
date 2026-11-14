/**
 * dsh-remote-relay — host-side visitor command engine.
 *
 * One engine per host process. It speaks the control-channel frames over one
 * OR MORE transports at a time (relay WebSocket and the local direct pipe
 * are both common), and drives the in-process sessionController exactly
 * where the web GUI does: list, state, create, prompt (queued), cancel, plus
 * per-session durable event and state streams shared across observing
 * visitors.
 *
 * Routing rule: a reply or addressed push always rides the transport the
 * visitor came in on; session-wide fan-out rides every transport with an
 * observer. The engine never reaches the model or the filesystem directly;
 * every capability is a sessionController call, so a visitor can do remotely
 * what the owner could do in the GUI — and nothing else.
 */
import { generateId, VISITOR_COMMANDS, INTERNAL_COMMANDS, PROTOCOL_VERSION } from './protocol.js'

const HEARTBEAT_MS = 15_000
const MAX_TEXT = 32 * 1024
const LOG_CAP = 200
const HISTORY_MAX_MESSAGES = 40
/** sessionController's remote signatures require a signal; cap one-shot reads. */
const READ_TIMEOUT_MS = 20_000

/** A fresh bounded signal for one-shot sessionController reads. */
const readSignal = () => AbortSignal.timeout(READ_TIMEOUT_MS)

export class HostEngine {
  /**
   * @param services lazy service access: { sessionController(): object | undefined }
   * @param host static host facts: { name, dsh, code } (plain values)
   */
  constructor({ services, host, log = () => {} }) {
    this.services = services
    this.host = host
    this.log = log
    /** channel records: { channel, heartbeat } */
    this.channels = new Map()
    /** visitorId → { connectedAt, sessions:Set, channel } */
    this.visitors = new Map()
    /** sessionId → { refs, controller, cleanups[] } */
    this.streams = new Map()
    this.allowControl = true
    this.startedAt = Date.now()
    this.broadcastTimer = undefined
    this.closed = false
  }

  /** Wire the engine to a transport. The transport speaks hello itself. */
  attach(channel) {
    const record = { channel, heartbeat: undefined }
    this.channels.set(channel, record)
    record.offMessage = channel.onMessage((text) => this.onFrame(text, channel))
    record.offClose = channel.onClose(() => this.detach(channel))
    record.heartbeat = setInterval(() => {
      if (this.channels.has(channel)) channel.send({ t: 'hb' })
    }, HEARTBEAT_MS)
    this.log('engine', 'channel attached')
  }

  /** Remove one transport; its visitors go with it. */
  detach(channel) {
    const record = this.channels.get(channel)
    if (!record) return
    this.channels.delete(channel)
    record.offMessage?.()
    record.offClose?.()
    if (record.heartbeat) clearInterval(record.heartbeat)
    for (const [visitorId, visitor] of [...this.visitors]) {
      if (visitor.channel === channel) {
        for (const sessionId of visitor.sessions) this.unobserve(visitorId, sessionId)
        this.visitors.delete(visitorId)
      }
    }
  }

  /** Full teardown for plugin unload. */
  close() {
    if (this.closed) return
    this.closed = true
    for (const channel of [...this.channels.keys()]) this.detach(channel)
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer)
    this.broadcastTimer = undefined
    for (const stream of this.streams.values()) stream.controller.abort()
    this.streams.clear()
  }

  onFrame(text, channel) {
    if (this.closed) return
    const frame = (() => {
      try { return JSON.parse(text) } catch { return null }
    })()
    if (!frame || typeof frame !== 'object') return
    if (frame.t === 'hb') return
    if (frame.t !== 'cmd') return
    const { id, from, cmd } = frame
    if (typeof id !== 'string' || typeof from !== 'string' || typeof cmd !== 'string') return
    // 访客活跃度：任何指令帧都刷新该访客的 lastActive（面板展示用）。
    const activeRecord = this.visitors.get(from)
    if (activeRecord) activeRecord.lastActive = Date.now()
    const known = VISITOR_COMMANDS.has(cmd) || INTERNAL_COMMANDS.has(cmd)
    if (!known) return this.reply(id, false, undefined, `unknown command: ${cmd}`, channel)
    Promise.resolve()
      .then(() => this.dispatch(cmd, frame.p, from, channel))
      .then((data) => this.reply(id, true, data, undefined, channel))
      .catch((error) => {
        this.log('cmd-error', `${cmd}: ${error?.message ?? String(error)}`)
        this.reply(id, false, undefined, error?.message ?? String(error), channel)
      })
  }

  reply(id, ok, data, error, channel) {
    channel.send({ t: 'res', id, ok, ...(ok ? { data } : { error }) })
  }

  controller() {
    return this.services.sessionController?.()
  }

  requireControl() {
    if (!this.allowControl) throw new Error('远程控制已关闭（只读模式）')
  }

  async dispatch(cmd, p = {}, from, channel) {
    const controller = this.controller()
    if (!controller) throw new Error('sessionController 服务不可用')
    switch (cmd) {
      case 'visitor.hello': {
        const previous = this.visitors.get(from)
        if (previous) {
          for (const sessionId of previous.sessions) this.unobserve(from, sessionId)
        }
        this.visitors.set(from, {
          id: from,
          connectedAt: Date.now(),
          lastActive: Date.now(),
          // channel.meta.ip 由接入方携带（直连模式为本机来源地址；
          // relay 模式流量走单条隧道，宿主侧无访客 IP）。
          ip: channel.meta && typeof channel.meta.ip === 'string' ? channel.meta.ip : undefined,
          sessions: new Set(),
          channel,
        })
        this.log('visitor', `访客接入 ${shortId(from)}`)
        return {
          host: {
            name: this.host.name,
            dsh: this.host.dsh,
            code: this.host.code,
            allowControl: this.allowControl,
          },
          sessions: await this.listSessions(),
        }
      }
      case 'visitor.gone': {
        const record = this.visitors.get(from)
        if (record) {
          for (const sessionId of record.sessions) this.unobserve(from, sessionId)
          this.visitors.delete(from)
        }
        this.log('visitor', `访客断开 ${shortId(from)}`)
        return { ok: true }
      }
      case 'host.info': {
        return { name: this.host.name, dsh: this.host.dsh, allowControl: this.allowControl }
      }
      case 'sessions.list': {
        return { sessions: await this.listSessions() }
      }
      case 'sessions.state': {
        const state = await controller.state({ sessionId: p.sessionId }, readSignal())
        return { state: projectState(state) }
      }
      case 'sessions.create': {
        this.requireControl()
        const created = await controller.create({})
        this.log('cmd', `访客新建会话 ${shortId(created.sessionId)}`)
        this.scheduleSessionsBroadcast()
        return { sessionId: created.sessionId, agentPreset: created.agentPreset }
      }
      case 'sessions.send': {
        this.requireControl()
        const text = typeof p.text === 'string' ? p.text.trim() : ''
        if (!text) throw new Error('消息内容为空')
        if (text.length > MAX_TEXT) throw new Error('消息过长')
        const sessionId = p.sessionId
        await controller.prompt({
          requestId: generateId(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text }],
          clientTimeZone: 'Asia/Shanghai',
        }, readSignal())
        this.log('cmd', `访客向会话 ${shortId(sessionId)} 发送指令 (${text.length} 字)`)
        return { accepted: true }
      }
      case 'sessions.cancel': {
        this.requireControl()
        await controller.cancel({ sessionId: p.sessionId })
        this.log('cmd', `访客中断会话 ${shortId(p.sessionId)}`)
        return { accepted: true }
      }
      case 'sessions.observe': {
        const sessionId = p.sessionId
        const visitor = this.visitors.get(from)
        if (!visitor) throw new Error('访客会话不存在（请重连）')
        for (const previous of visitor.sessions) {
          if (previous !== sessionId) this.unobserve(from, previous)
        }
        visitor.sessions.add(sessionId)
        const stream = this.streamFor(sessionId)
        const [state, history] = await Promise.all([
          controller.state({ sessionId }, readSignal()),
          controller.events({
            address: { kind: 'session', sessionId },
            maxMessages: HISTORY_MAX_MESSAGES,
            turnWindow: { minMessages: 10, minTurns: 2 },
          }, readSignal()),
        ])
        this.pushTo(from, {
          t: 'session-history',
          sessionId,
          records: history.records,
          hasMore: history.hasMore,
          state: projectState(state),
        })
        this.log('cmd', `访客查看会话 ${shortId(sessionId)}`)
        return { cursor: state.cursor, state: projectState(state) }
      }
      case 'sessions.unobserve': {
        this.unobserve(from, p.sessionId)
        return { ok: true }
      }
      default:
        throw new Error(`unknown command: ${cmd}`)
    }
  }

  async listSessions() {
    const controller = this.controller()
    if (!controller) return []
    const { items } = await controller.list({}, readSignal())
    return items
      .filter((item) => !item.blank && !item.origin)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50)
      .map((item) => projectSummary(item))
  }

  streamFor(sessionId) {
    let stream = this.streams.get(sessionId)
    if (stream) {
      stream.refs += 1
      return stream
    }
    const controller = this.controller()
    if (!controller) throw new Error('sessionController 服务不可用')
    const ctl = new AbortController()
    const cleanups = []
    stream = { refs: 1, controller: ctl, cleanups }
    this.streams.set(sessionId, stream)
    // Durable event feed: 'ready' then one entry per committed event.
    void this.pump(
      ctl,
      controller.observeEvent({ address: { kind: 'session', sessionId } }, ctl.signal),
      (event) => this.pushSession(sessionId, { t: 'session-event', sessionId, event }),
    )
    // Passive state feed: running flag, queue, pending approvals.
    void this.pump(
      ctl,
      controller.observeState({ sessionId }, ctl.signal),
      (state) => this.pushSession(sessionId, { t: 'session-state', sessionId, state: projectState(state) }),
    )
    cleanups.push(() => this.streams.delete(sessionId))
    return stream
  }

  async pump(ctl, iterator, onFrame) {
    try {
      for await (const frame of iterator) {
        if (ctl.signal.aborted) return
        if (frame && frame.type !== 'ready') onFrame(frame)
      }
    } catch (error) {
      if (!ctl.signal.aborted) this.log('stream', `stream error: ${error?.message ?? String(error)}`)
    }
  }

  unobserve(visitorId, sessionId) {
    const visitor = this.visitors.get(visitorId)
    visitor?.sessions.delete(sessionId)
    const stream = this.streams.get(sessionId)
    if (!stream) return
    stream.refs -= 1
    if (stream.refs <= 0) {
      stream.controller.abort()
      for (const cleanup of stream.cleanups) cleanup()
    }
  }

  pushSession(sessionId, frame) {
    for (const visitor of this.visitors.values()) {
      if (visitor.sessions.has(sessionId)) visitor.channel.send({ t: 'push', to: visitor.id, f: frame })
    }
  }

  pushTo(visitorId, frame) {
    const visitor = this.visitors.get(visitorId)
    visitor?.channel.send({ t: 'push', to: visitorId, f: frame })
  }

  /** Fan a refreshed session list to every visitor, throttled. */
  scheduleSessionsBroadcast() {
    if (this.broadcastTimer) return
    this.broadcastTimer = setTimeout(async () => {
      this.broadcastTimer = undefined
      if (this.visitors.size === 0) return
      try {
        const sessions = await this.listSessions()
        for (const visitor of this.visitors.values()) {
          visitor.channel.send({ t: 'push', to: visitor.id, f: { t: 'sessions-updated', sessions } })
        }
      } catch {
        // listing raced a disposal; the next trigger retries
      }
    }, 400)
  }

  /** Wire session lifecycle events, best-effort; degrades to action-triggered refresh. */
  observeSessionEvents(on) {
    const names = ['api-session/added', 'api-session/removed', 'api-session/status', 'api-session/activity']
    const offs = []
    for (const name of names) {
      try {
        offs.push(on(name, () => this.scheduleSessionsBroadcast()))
      } catch {
        // event bus not offered in this assembly
      }
    }
    return () => { for (const off of offs) off() }
  }

  status() {
    return {
      protocol: PROTOCOL_VERSION,
      startedAt: this.startedAt,
      visitors: [...this.visitors.entries()].map(([id, visitor]) => ({
        id,
        connectedAt: visitor.connectedAt,
        lastActive: visitor.lastActive ?? visitor.connectedAt,
        ip: visitor.ip,
        sessions: [...visitor.sessions],
      })),
    }
  }
}

function projectSummary(item) {
  return {
    id: item.sessionId,
    title: typeof item.projections?.values?.title === 'string' ? item.projections.values.title : null,
    updatedAt: item.updatedAt,
    running: item.running === true,
    agentAvailable: item.agentAvailable === true,
    cwd: typeof item.cwd === 'string' ? item.cwd : undefined,
  }
}

function projectState(state) {
  return {
    cursor: state?.cursor ?? 0,
    active: state?.active === true,
    running: state?.running === true,
    queued: Array.isArray(state?.queue) ? state.queue.length : 0,
    pendingInput: Array.isArray(state?.pendingInput) ? state.pendingInput : [],
  }
}

function shortId(id) {
  return typeof id === 'string' && id.length > 10 ? `${id.slice(0, 8)}…` : String(id)
}
