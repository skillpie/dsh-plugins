/**
 * dsh-termbar — Client 半。
 *
 * 右上角 utilities 区终端开关按钮 + shell.overlay 底部终端面板。
 * 与宿主半的通信全部走同源 HTTP/WS（/dsh-termbar/api、/dsh-termbar/ws），
 * 不依赖任何宿主内建 RPC。xterm 从本包 vendor 路由加载。
 */
window.__ModuleLoader__.load({
  id: 'dsh-termbar',
  factory(require) {
    var React = require('react')
    var h = React.createElement
    var NS = 'dsh-termbar'
    var API = 'dsh-termbar/api'
    var VENDOR = 'dsh-termbar/vendor/'
    var HEIGHT_KEY = 'dsh-termbar.height'

    /* ── 样式（工厂期注入，loader 会认领并在卸载时清理） ─────────────── */
    var css = [
      '.dsh-termbar-toggle{display:inline-flex;position:relative;align-items:center;justify-content:center;width:28px;height:28px;',
      'border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}',
      '.dsh-termbar-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dsh-termbar-toggle[data-active="true"]{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-primary)}',
      // 悬停键提示：逐条对齐原生 Tooltip.module.css + ShortcutKeys.module.css（tooltip 变体）
      '.dsh-termbar-tip{position:absolute;top:calc(100% + 8px);right:0;display:inline-flex;align-items:center;gap:8px;',
      'width:max-content;box-sizing:border-box;padding:3px 5px 3px 7px;border-radius:var(--dsw-radius-sm);',
      'background:var(--dsw-alias-tooltip-bg);color:var(--dsw-static-neutral-bluish-00);',
      'font-size:13px;line-height:20px;white-space:pre-line;overflow-wrap:break-word;opacity:0;pointer-events:none;',
      'transition:opacity .15s ease .4s;z-index:100}',
      '.dsh-termbar-tip-label{min-width:0}',
      '.dsh-termbar-toggle:hover .dsh-termbar-tip,.dsh-termbar-toggle:focus-visible .dsh-termbar-tip{opacity:1}',
      '.dsh-termbar-tip-keys{display:inline-flex;flex:none;align-items:center;gap:2px;color:inherit;font-family:inherit;',
      'font-size:11px;line-height:14px;white-space:nowrap}',
      '.dsh-termbar-tip-key{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:none;',
      'min-width:16px;height:16px;padding:0 2px;border-radius:4px;background:var(--dsw-alias-tooltip-key-bg);font:inherit}',
      '.dsh-termbar-dock{position:absolute;bottom:0;z-index:-1;display:flex;flex-direction:column;',
      'left:var(--dsh-termbar-left,0px);right:var(--dsh-termbar-right,0px);',
      'border-top:1px solid var(--dsw-alias-border-l2);border-left:1px solid var(--dsw-alias-border-l2)}',
      '@media (max-width: 768px){.dsh-termbar-dock{left:0 !important;right:0 !important;border-left:none;background:var(--dsw-alias-bg-layer-1)}}',
      '.dsh-termbar-resize{height:5px;flex:none;cursor:ns-resize;touch-action:none}',
      '.dsh-termbar-head{display:flex;align-items:center;gap:8px;height:34px;padding:0 8px 0 12px;flex:none;',
      'border-bottom:1px solid var(--dsw-alias-border-l3)}',
      '.dsh-termbar-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dsh-termbar-shell{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.dsh-termbar-tabs{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}',
      '.dsh-termbar-tab{display:inline-flex;align-items:center;gap:6px;max-width:180px;height:24px;padding:0 6px 0 10px;',
      'border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);',
      'font-size:12px;cursor:pointer;white-space:nowrap;flex:none}',
      '.dsh-termbar-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-termbar-tab[data-active="true"]{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}',
      '.dsh-termbar-tab-x{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:none;',
      'border-radius:4px;background:transparent;color:inherit;cursor:pointer;padding:0}',
      '.dsh-termbar-tab-x:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-termbar-actions{display:flex;align-items:center;gap:2px;flex:none}',
      '.dsh-termbar-status{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none}',
      '.dsh-termbar-body{position:relative;flex:1;min-height:0;padding:4px 8px 8px;overflow:hidden}',
      '.dsh-termbar-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:12px;pointer-events:none}',
      '.dsh-termbar-term{position:absolute;inset:4px 8px 8px;display:none;overflow:hidden}',
      '.dsh-termbar-body.split{display:flex;gap:6px}',
      '.dsh-termbar-body.split .dsh-termbar-term{position:relative;inset:auto;flex:1 1 0;min-width:0}',
      '.dsh-termbar-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
      'font-size:12px;color:var(--dsw-alias-label-tertiary)}',
    ].join('')
    var styleEl = document.createElement('style')
    styleEl.textContent = css
    document.head.appendChild(styleEl)
    /* 布局镜像：面板打开时把高度写进 frame 网格的 bottomRow 行，让主对话列
     * 被真实分割（而非悬浮遮盖）。grid-column 钉死在中列，左右侧栏整列保持
     * 原高不受影响。类哈希随构建变化，用后缀匹配锁定。 */
    var layoutEl = document.createElement('style')
    layoutEl.textContent = '@media (min-width: 769px){html.dsh-termbar-open [class$="_bottomRow"]{grid-column:2;height:var(--dsh-termbar-h,300px) !important}'
    layoutEl.textContent += 'html.dsh-termbar-open [class$="_sidebarCol"],html.dsh-termbar-open [class$="_rightbarCol"]{grid-row:1/-1}}'
    document.head.appendChild(layoutEl)

    /* ── vendor 加载（xterm UMD + fit addon + css），单例 Promise ────── */
    // 页面上可能存在多个 xterm 系构建抢写 window.Terminal（实测有 headless 形态：
    // 有 onData 无 onFocus/textarea），不能见全局名就认；加载完立即把类引用
    // 快照到 window.__tbTerminal/__tbFitAddon，后续一律用快照，避免被后加载者覆盖。
    var TB_TERMINAL_KEY = '__tbTerminal'
    var TB_FIT_KEY = '__tbFitAddon'
    function vendorReady() {
      try {
        return !!(window[TB_TERMINAL_KEY] && window[TB_FIT_KEY])
      } catch { return false }
    }
    function snapshotVendor() {
      try {
        if (window.Terminal) window[TB_TERMINAL_KEY] = window.Terminal
        if (window.FitAddon && window.FitAddon.FitAddon) window[TB_FIT_KEY] = window.FitAddon.FitAddon
      } catch { /* 快照失败走既有全局 */ }
    }
    var vendorPromise = null
    function ensureVendor() {
      if (vendorPromise) return vendorPromise
      vendorPromise = new Promise((resolve, reject) => {
        if (vendorReady()) { resolve(); return }
        var left = 3
        var fail = () => reject(new Error('termbar vendor load failed'))
        var done = () => { left -= 1; if (left === 0) { snapshotVendor(); resolve() } }
        var link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = VENDOR + 'xterm.css'
        link.onload = done
        link.onerror = fail
        document.head.appendChild(link)
        var core = document.createElement('script')
        core.src = VENDOR + 'xterm.js'
        core.onload = done
        core.onerror = fail
        document.head.appendChild(core)
        var fit = document.createElement('script')
        fit.src = VENDOR + 'addon-fit.js'
        fit.onload = done
        fit.onerror = fail
        document.head.appendChild(fit)
        setTimeout(() => reject(new Error('termbar vendor load timeout')), 15000)
      })
      return vendorPromise
    }

    /* ── 终端存储（脱离 React 生命周期，面板收起仍保活） ─────────────── */
    // project = 当前会话所属工作区（按项目隔离 tab）；sessionId = 当前打开的会话 id。
    var store = { open: false, sessions: [], activeId: null, status: 'idle', project: null, sessionId: null, split: false }
    var listeners = new Set()
    var terms = new Map() // id -> { term, fit, el }

    function emit() { listeners.forEach((fn) => { try { fn() } catch { /* listener gone */ } }) }
    function subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } }
    function setState(patch) { Object.assign(store, patch); emit() }
    function sessionById(id) { return store.sessions.find((s) => s.id === id) }
    function activeSession() { return sessionById(store.activeId) }

    /* ── 按项目隔离：解析当前会话的工作区 + 过滤/命名 tab ──────────────
       解析口径与 ui-workspace/navigation.ts 一致：
       workspaces.list.getSnapshot().items.find(w => w.sessionIds.includes(当前会话)) */
    var wsListFace = null // apply 里赋值（工厂作用域禁止引用 ctx）
    var connFace = null // apply 里 ctx.get('connection')；carrier 感知 WS（访客走 relay 隧道）
    function resolveProject() {
      var sid = store.sessionId
      var src = wsListFace
      if (!sid || !src || typeof src.getSnapshot !== 'function') return null
      try {
        var items = src.getSnapshot().items || []
        for (var i = 0; i < items.length; i++) {
          var ids = items[i].sessionIds || []
          if (ids.indexOf(sid) !== -1) {
            return { id: items[i].workspaceId || items[i].id, name: items[i].title, path: items[i].path }
          }
        }
      } catch { /* 目录未就绪（phase 未 ready 等） */ }
      return null
    }
    function syncProject() {
      var next = resolveProject()
      if (JSON.stringify(next) !== JSON.stringify(store.project)) setState({ project: next })
    }
    function setCurrentSession(id) {
      var next = id || null
      if (store.sessionId === next) return
      store.sessionId = next
      syncProject()
    }
    // 可见 tab = 当前项目的会话；无项目上下文时只看无主（历史）会话。
    function visibleSessions() {
      var p = store.project
      if (!p) return store.sessions.filter((s) => !s.project)
      return store.sessions.filter((s) => s.project && s.project.id === p.id)
    }
    // 标签名 = 项目名；同项目第 N 个 tab 追加序号（项目、项目2、项目3）。
    function tabTitle(list, index) {
      var s = list[index]
      var base = (s.project && s.project.name) || (store.project && store.project.name) || t('projectFallback')
      return index === 0 ? base : base + String(index + 1)
    }

    function removeSession(id) {
      var rec = terms.get(id)
      if (rec) {
        try { rec.term.dispose() } catch { /* already dead */ }
        terms.delete(id)
        if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el) // 防幽灵容器残留（否则旧画布叠加新会话）
      }
      var next = store.sessions.filter((s) => s.id !== id)
      var patch = { sessions: next }
      if (store.activeId === id) patch.activeId = next.length ? next[next.length - 1].id : null
      if (!next.length) patch.open = false // 最后一个 tab 关闭 → 连带收起面板（ZCode 行为）
      setState(patch)
    }

    /* ── xterm 主题（读主题 token，解析失败退回 xterm 默认） ─────────── */
    function themeColors() {
      var probe = document.createElement('span')
      probe.style.display = 'none'
      document.body.appendChild(probe)
      var read = (name, fallback) => {
        try {
          probe.style.color = 'var(' + name + ')'
          var v = getComputedStyle(probe).color
          return typeof v === 'string' && v ? v : fallback
        } catch { return fallback }
      }
      var colors = {
        background: read('--dsw-alias-bg-layer-2', '#1f1f24'),
        foreground: read('--dsw-alias-label-primary', '#d4d4d8'),
        cursor: read('--dsw-alias-brand-primary', '#4f8cff'),
        cursorAccent: read('--dsw-alias-bg-layer-1', '#1f1f24'),
      }
      // 选中配色与原生侧栏终端一致（terminal-theme.ts:61）：反色块——
      // fg 作选区底、bg 作选区字色，避免 hover token 这类深底色把选中块衬得过深。
      colors.selectionBackground = colors.foreground
      colors.selectionForeground = colors.background
      colors.selectionInactiveBackground = colors.foreground
      probe.remove()
      return colors
    }

    function ensureTerm(session) {
      var rec = terms.get(session.id)
      if (rec) return rec
      var el = document.createElement('div')
      el.className = 'dsh-termbar-term'
      el.dataset.sessionId = session.id
      var TerminalClass = window.__tbTerminal || window.Terminal
      var term = new TerminalClass({
        fontFamily: "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
        fontSize: 12,
        scrollback: 2000,
        cursorBlink: true,
        theme: themeColors(),
      })
      var FitClass = window.__tbFitAddon || (window.FitAddon && window.FitAddon.FitAddon)
      var fit = new FitClass()
      term.loadAddon(fit)
      term.onData((data) => { conn.send({ t: 'input', data }) })
      // rx = 该窗格已收到的输出字节数；attach 时回传服务器做增量补齐。
      rec = { term, fit, el, rx: 0 }
      terms.set(session.id, rec)
      return rec
    }

    /* ── 尺寸：fit + 通知宿主（80ms 合并） ───────────────────────────── */
    var resizeTimer = null
    function proposeDims(rec) {
      try {
        var p = rec.fit.proposeDimensions()
        return p && p.cols > 4 && p.rows > 2 ? { cols: p.cols, rows: p.rows } : null
      } catch { return null }
    }
    function scheduleResize() {
      if (resizeTimer) return
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        var rec = terms.get(store.activeId)
        if (!rec || !store.open) return
        try { rec.fit.fit() } catch { /* not mounted yet */ }
        var dims = proposeDims(rec)
        if (dims) conn.send({ t: 'resize', cols: dims.cols, rows: dims.rows })
      }, 80)
    }

    /* ── WS 连接（指数退避重连 + 心跳巡检；文本 JSON 控制帧 + 二进制输出帧）── */
    var conn = {
      ws: null,
      want: false,
      retries: 0,
      timer: null,
      sweep: null,
      bornAt: 0,
      lastFrameAt: 0,
      helloed: false, // 首个 hello 对账完成前不信任本地空表（会话可能还在路上）
      attachedId: null,
      mode: 'ws', // ws 失联两轮后切 stream（访客页隧道 WS 不可用时的 HTTP NDJSON 兜底）
      token: Math.random().toString(36).slice(2) + Date.now().toString(36),
      streamCtl: null,
      everOpened: false,
      sendQ: [], // 流式模式下把快速连发的帧合并进一次 POST：逐键一请求会乱序且慢
      sendTimer: null,
      send(obj) {
        if (this.mode !== 'stream') {
          if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj))
          return
        }
        this.sendQ.push(obj)
        if (this.sendTimer) return
        this.sendTimer = setTimeout(() => {
          this.sendTimer = null
          var batch = this.sendQ.splice(0, this.sendQ.length)
          if (batch.length) void this.postFrame(batch)
        }, 30)
      },
      postFrame(frames) {
        return fetch(new URL(API, document.baseURI || location.href).href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'frame', token: this.token, frames: frames }),
        }).catch(() => { /* sweep 兜底 */ })
      },
      startStream() {
        var self = this
        this.want = true
        if (this.streamCtl) { try { this.streamCtl.abort() } catch { /* gone */ } }
        var ctl = new AbortController()
        this.streamCtl = ctl
        this.ws = { readyState: 1 } // sweep 兼容占位（真实语义见 streamCtl）
        this.bornAt = Date.now()
        setState({ status: 'connecting' })
        // 看门狗：盖住「fetch 头挂死通道」与「流开了不来字节」两种情况（隧道重连窗口常见），
        // 12s 无首字节就 abort 重开，靠 scheduleRetry 的退避落到稳定隧道上。
        var watchdog = setTimeout(() => {
          console.warn('[dsh-termbar] 流通道 12s 无响应，放弃本次重开')
          try { ctl.abort() } catch { /* gone */ }
        }, 12000)
        var u = new URL('dsh-termbar/stream', document.baseURI || location.href)
        u.searchParams.set('token', this.token)
        fetch(u.href, { signal: ctl.signal, cache: 'no-store' }).then((res) => {
          if (!res.ok || !res.body) throw new Error('stream http ' + res.status)
          var reader = res.body.getReader()
          var decoder = new TextDecoder()
          var bufText = ''
          var pump = () => {
            reader.read().then((chunk) => {
              clearTimeout(watchdog)
              if (chunk.done) throw new Error('stream closed')
              bufText += decoder.decode(chunk.value, { stream: true })
              var lines = bufText.split('\n')
              bufText = lines.pop()
              for (var i = 0; i < lines.length; i += 1) {
                var line = lines[i]
                if (!line) continue
                try {
                  var frame = JSON.parse(line)
                  if (frame && typeof frame === 'object') handleFrame(frame)
                } catch { /* 半行/垃圾行 */ }
              }
              pump()
            }).catch((error) => {
              clearTimeout(watchdog)
              if (error && error.name === 'AbortError') {
                console.warn('[dsh-termbar] 流通道看门狗超时')
              } else {
                console.error('[dsh-termbar] 流通道异常', error && (error.stack || error.message || error))
              }
              if (!self.want) return
              self.ws = null
              self.attachedId = null
              self.scheduleRetry()
            })
          }
          pump()
        }).catch((error) => {
          clearTimeout(watchdog)
          if (error && error.name === 'AbortError') {
            console.warn('[dsh-termbar] 流通道看门狗超时（fetch 未响应）')
          } else {
            console.error('[dsh-termbar] 流请求失败', error && (error.message || error))
          }
          if (self.want) { self.ws = null; self.scheduleRetry() }
        })
        this.startSweep()
      },
      connect() {
        if (this.mode === 'stream') { this.startStream(); return }
        // 流式占位不拦截重开（startStream 自己 abort 旧的）。
        // 死连接（CLOSING/CLOSED）不拦截重连；半开连接由 sweep 巡检回收。
        if (this.ws && this.mode === 'ws' && this.ws.readyState === 1) return
        if (this.ws && this.mode === 'ws' && this.ws.readyState === 0) {
          // CONNECTING 挂超过 6s：访客页 relay 无私有升级路由、裸 WS 永远 pending 的特征 → 转流式。
          if (Date.now() - (this.bornAt || 0) < 6000) return
          this.mode = 'stream'
          console.warn('[dsh-termbar] WS 长时间无响应，切换 HTTP 流式通道')
          this.startStream()
          return
        }
        this.want = true
        var self = this
        var open = () => {
          // 优先走宿主连接面（carrier 感知）：直连页=同源 WS，访客页=relay 隧道，
          // 认证由 carrier 处理；无 face 回退裸 WebSocket，URL 相对 document.baseURI
          // 解析（宿主注入 <base href="./">，任意 /<码>/ 前缀挂载均正确）。
          var ws
          if (connFace && typeof connFace.openWebSocket === 'function') {
            try { ws = connFace.openWebSocket('/dsh-termbar/ws') } catch (error) { ws = null; console.error('[dsh-termbar] carrier WS 创建失败', error) }
          }
          if (!ws) {
            try {
              var u = new URL('dsh-termbar/ws', document.baseURI || location.href)
              u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
              ws = new WebSocket(u.href)
              try { ws.binaryType = 'arraybuffer' } catch { /* carrier 适配器无此属性 */ }
            } catch (error) {
              console.error('[dsh-termbar] WebSocket 创建失败', error)
              self.scheduleRetry()
              return
            }
          }
          self.ws = ws
          self.bornAt = Date.now()
          setState({ status: 'connecting' })
          // 两种 socket 形状都支持 addEventListener；消息 data 为文本串或二进制。
          ws.addEventListener('open', () => { self.retries = 0; self.everOpened = true; setState({ status: 'ready' }); attachActive() })
          ws.addEventListener('message', (event) => { handleFrame(event.data) })
          ws.addEventListener('close', (event) => {
            self.ws = null
            self.attachedId = null
            if (!self.want) return
            if (!self.everOpened && self.retries >= 1) {
              // 隧道/壳环境 WS 拨不通（访客页 relay 桥不支持侧通道）→ 永久切 HTTP 流。
              self.mode = 'stream'
              console.warn('[dsh-termbar] WS 不可用，切换 HTTP 流式通道')
            }
            if (self.retries % 3 === 0) {
              var code = event && typeof event.code === 'number' ? event.code : '-'
              console.warn('[dsh-termbar] ws 断开 code=' + code + '，即将重试（第 ' + (self.retries + 1) + ' 次）')
            }
            self.scheduleRetry()
          })
          ws.addEventListener('error', () => { try { ws.close() } catch { /* closing */ } })
          self.startSweep()
        }
        open()
      },
      /* 巡检：CONNECTING 卡死 >6s 强制换新连接；空闲 >20s 发心跳；
       * 心跳后 >10s 仍无任何帧 → 视为半开连接，主动断开重连。 */
      startSweep() {
        if (this.sweep) return
        var self = this
        this.sweep = setInterval(() => {
          try {
            if (!self.want) return
            if (!self.ws) { if (!self.timer) self.connect(); return }
            var state = self.ws.readyState
            if (state === 2 || state === 3) { self.ws = null; self.connect(); return }
            if (state === 0 && Date.now() - self.bornAt > 6000) {
              try { self.ws.close() } catch { /* already dead */ }
              self.ws = null
              self.connect()
              return
            }
            if (state !== 1) return
            var idle = Date.now() - self.lastFrameAt
            if (idle > 30000) {
              if (self.streamCtl) { try { self.streamCtl.abort() } catch { /* gone */ } self.streamCtl = null }
              try { self.ws.close() } catch { /* gone */ }
              self.ws = null
              self.attachedId = null
              self.connect()
            } else if (idle > 20000) {
              self.send({ t: 'ping' })
            }
          } catch { /* sweep 最好坏不致命 */ }
        }, 3000)
      },
      stopSweep() {
        if (this.sweep) { clearInterval(this.sweep); this.sweep = null }
      },
      scheduleRetry() {
        var self = this
        if (self.timer || !self.want) return
        var delay = Math.min(8000, 1000 * Math.pow(2, self.retries++))
        setState({ status: 'broken' })
        self.timer = setTimeout(() => { self.timer = null; self.connect() }, delay)
      },
      disconnect() {
        this.want = false
        this.stopSweep()
        if (this.timer) { clearTimeout(this.timer); this.timer = null }
        if (this.streamCtl) { try { this.streamCtl.abort() } catch { /* gone */ } this.streamCtl = null }
        if (this.ws) { try { this.ws.close() } catch { /* gone */ } this.ws = null }
        this.attachedId = null
        setState({ status: 'idle' })
      },
    }

    function handleFrame(data) {
      conn.lastFrameAt = Date.now() // 心跳巡检的活性信号（含二进制输出）
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        var rec = terms.get(conn.attachedId)
        if (rec) {
          var u8 = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer)
          rec.rx += u8.length
          rec.term.write(u8)
        }
        return
      }
      // 流式通道传入的是已解析对象，WS 传入的是原始字符串——两种形态都接。
      var frame
      if (data && typeof data === 'object') {
        frame = data
      } else {
        try { frame = JSON.parse(String(data)) } catch { return }
        if (!frame || typeof frame !== 'object') return
      }
      switch (frame.t) {
        case 'hello': {
          conn.helloed = true
          conn.retries = 0
          if (conn.mode === 'stream' && store.status !== 'ready') setState({ status: 'ready' })
          // 以服务器为准对账：清掉本地幽灵 tab（服务器重启/会话退出后的残留）。
          var incoming = Array.isArray(frame.sessions) ? frame.sessions : []
          var alive = new Set(incoming.map((s) => s.id))
          store.sessions.forEach((s) => {
            if (alive.has(s.id)) return
            var dead = terms.get(s.id)
            if (dead) { try { dead.term.dispose() } catch { /* already dead */ } terms.delete(s.id) }
          })
          var patch = { sessions: incoming }
          if (store.activeId !== null && !alive.has(store.activeId)) {
            patch.activeId = incoming.length ? incoming[incoming.length - 1].id : null
          }
          setState(patch)
          var vis0 = visibleSessions()
          // 服务器重启自愈：终端栏整体为空才保底建一个；仅当前项目为空时不建（用户手点 +）。
          if (store.open && !store.sessions.length) ensureSession()
          else if (store.open && !store.activeId && vis0.length) {
            setActive(vis0[vis0.length - 1].id)
          } else attachActive()
          break
        }
        case 'attached': {
          conn.attachedId = frame.id
          var rec2 = terms.get(frame.id)
          if (rec2) {
            if (frame.buffer) {
              // 整段重放：仅新窗格/严重落后时发生。reset 会清屏，随后重放+滚底。
              rec2.term.reset()
              var bin = atob(frame.buffer)
              var bytes = new Uint8Array(bin.length)
              for (var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
              rec2.term.write(bytes)
              rec2.rx = Number(frame.total) || bytes.length
              rec2.term.scrollToBottom()
            }
            // 增量补齐（无 buffer）：缺的尾部以二进制帧随后到达，视口保持原位
            // ——切页签不再「顶部↔底部」闪跳。
            scheduleResize()
          }
          break
        }
        case 'outb': {
          // 分栏附加订阅的输出（base64 文本帧）。不清屏不滚屏；落后太多时才 reset。
          var rec3 = terms.get(frame.id)
          if (rec3 && typeof frame.chunk === 'string') {
            var bin3 = atob(frame.chunk)
            var u8 = new Uint8Array(bin3.length)
            for (var j = 0; j < bin3.length; j += 1) u8[j] = bin3.charCodeAt(j)
            if (frame.reset) { rec3.term.reset(); rec3.rx = 0 }
            rec3.rx += u8.length
            rec3.term.write(u8)
          }
          break
        }
        case 'created': {
          if (!sessionById(frame.session.id)) {
            setState({ sessions: store.sessions.concat([frame.session]) })
          }
          if (store.open) setActive(frame.session.id)
          break
        }
        case 'renamed': {
          var s = sessionById(frame.id)
          if (s) { s.title = frame.title; emit() }
          break
        }
        case 'exit':
          removeSession(frame.id)
          break
        default:
          break
      }
    }

    function setActive(id) {
      setState({ activeId: id })
      if (store.open) attachActive()
    }

    function attachActive() {
      if (!conn.ws || conn.ws.readyState !== 1 || !store.activeId) return
      var rec = terms.get(store.activeId)
      if (rec) { try { rec.fit.fit() } catch { /* not mounted */ } }
      // 分栏模式下非聚焦窗格也要活输出（outb 文本帧），否则旁栏冻结到重新聚焦。
      var extra = []
      if (store.split) {
        visibleSessions().forEach((s) => {
          if (s.id === store.activeId) return
          var peer = terms.get(s.id)
          extra.push({ id: s.id, have: peer ? peer.rx : 0 })
        })
      }
      conn.send({ t: 'attach', id: store.activeId, have: rec ? rec.rx : 0, extra: extra })
    }

    async function createSession() {
      var rec = terms.get(store.activeId)
      var dims = rec ? proposeDims(rec) : null
      try {
        var res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', cols: dims ? dims.cols : 120, rows: dims ? dims.rows : 30, project: store.project }),
        })
        var payload = await res.json()
        if (!payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : 'create failed')
        // 'created' 广播负责入列与激活；这里只兜错误。
      } catch (error) {
        console.error('[dsh-termbar] 创建终端失败：', error)
      } finally {
        // POST 返回常早于 'created' 广播入列；立即放行会让并发入口重复建 tab。
        setTimeout(() => { creating = false }, 700)
      }
    }

    function closeSession(id) {
      // 乐观移除：先本地摘掉 tab（立即反馈），再通知服务器杀 PTY。
      // 迟到的 exit 广播对未知 id 会被 removeSession 忽略；POST 失败时
      // 下一次 hello 对账会把幸存会话拉回列表（自愈）。
      removeSession(id)
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', id }),
      }).catch((error) => { console.error('[dsh-termbar] 关闭终端失败：', error) })
    }

    var creating = false // 自动建会话的并发闸（toggleOpen 与 hello 自愈可能同时触发）
    function ensureSession() {
      if (creating || visibleSessions().length) return
      creating = true
      void createSession() // 放行时机由 createSession 的 finally（700ms 保持）统一控制
    }

    function toggleOpen() {
      if (store.open) { setState({ open: false }); return }
      setState({ open: true })
      ensureVendor().then(() => {
        conn.connect()
        // hello 未回来前本地表不可信：此时不自动建 tab（服务器有会话的话马上会同步进来）。
        // 对账完成后仍为空（服务器真没有）→ 由 hello 分支保底建一个。
        var vis = visibleSessions()
        if (!vis.length && conn.helloed) ensureSession()
        else if (vis.length && !store.activeId) setActive(vis[vis.length - 1].id)
        else attachActive()
      }).catch((error) => { console.error('[dsh-termbar]', error) })
    }

    function onSplit() {
      // 拆分 = 进入分栏布局并在当前项目新建一个终端（ZCode 同款：每点一次多一栏）。
      // 只剩一栏时自动回全宽；关闭面板不改变 split 记忆，重开后仍按分栏渲染。
      setState({ split: true })
      void createSession()
    }

    function dockHeight() {
      var stored = 0
      try { stored = Number(localStorage.getItem(HEIGHT_KEY)) } catch { /* private mode */ }
      if (!Number.isFinite(stored) || stored < 120) stored = 300
      var max = Math.round(window.innerHeight * 0.7)
      return Math.max(120, Math.min(max, stored))
    }

    /* ── 组件 ─────────────────────────────────────────────────────────── */
    var shortcutCatalog = null // apply 里捕获 ctx.shortcuts.catalog，ToggleButton 读键帽
    var ICON_TERMINAL = h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
      h('rect', { x: 2, y: 2, width: 12, height: 12, rx: 2, stroke: 'currentColor', strokeWidth: 1.3 }),
      h('path', { d: 'M5 5.5l2.5 2L5 9.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('path', { d: 'M8.5 10h3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }))
    var ICON_PLUS = h('svg', { width: 15, height: 15, viewBox: '0 0 15 15', fill: 'none', 'aria-hidden': 'true' },
      h('path', { d: 'M7.5 2.5v10M2.5 7.5h10', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }))
    var ICON_CLOSE = h('svg', { width: 13, height: 13, viewBox: '0 0 13 13', fill: 'none', 'aria-hidden': 'true' },
      h('path', { d: 'M3 3l7 7M10 3l-7 7', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }))
    var ICON_SPLIT = h('svg', { width: 15, height: 15, viewBox: '0 0 15 15', fill: 'none', 'aria-hidden': 'true' },
      h('rect', { x: 1.5, y: 2.5, width: 12, height: 10, rx: 2, stroke: 'currentColor', strokeWidth: 1.3 }),
      h('path', { d: 'M7.5 3.5v8', stroke: 'currentColor', strokeWidth: 1.3 }))
    var ICON_TAB_X = h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': 'true' },
      h('path', { d: 'M2 2l6 6M8 2l-6 6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }))

    function useStore() {
      var ref = React.useRef(null)
      if (ref.current === null) ref.current = { ...store }
      var pair = React.useState(0)
      var force = pair[1]
      React.useEffect(() => subscribe(() => {
        ref.current = { ...store }
        force((n) => n + 1)
      }), [])
      return ref.current
    }

    function shortcutEntries() {
      // 读快捷键目录快照（含格式化键帽），失败退回静态 ⌘⇧K。
      try {
        var rows = shortcutCatalog && shortcutCatalog.getSnapshot()
        if (Array.isArray(rows)) {
          for (var i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].id === 'dsh-termbar.toggle') return rows[i]
          }
        }
      } catch { /* 目录未就绪 */ }
      return null
    }

    function ToggleButton(props) {
      var state = useStore()
      // 槽位 scope=session：props 带 sessionId —— 驱动「按项目隔离」的项目解析。
      React.useEffect(() => { setCurrentSession(props.sessionId) }, [props.sessionId])
      var entry = shortcutEntries()
      var keys = entry && Array.isArray(entry.keys) && entry.keys.length ? entry.keys : ['⌘', '⇧', 'K']
      var aria = entry && entry.aria ? entry.aria : 'Meta+Shift+K'
      var tip = h('span', { className: 'dsh-termbar-tip', role: 'tooltip' },
        h('span', { className: 'dsh-termbar-tip-label' }, t(state.open ? 'closeBar' : 'openBar')),
        h('span', { className: 'dsh-termbar-tip-keys' },
          keys.map((k, i) => h('kbd', { className: 'dsh-termbar-tip-key', key: i }, k))))
      return h('button', {
        className: 'dsh-termbar-toggle',
        'aria-label': t(state.open ? 'closeBar' : 'openBar'),
        'aria-keyshortcuts': aria,
        'aria-expanded': state.open ? 'true' : 'false',
        'data-active': state.open ? 'true' : 'false',
        onClick: toggleOpen,
      }, ICON_TERMINAL, tip)
    }

    function Dock() {
      var state = useStore()
      var bodyRef = React.useRef(null)
      var loadedPair = React.useState(false)
      var loaded = loadedPair[0]
      var setLoaded = loadedPair[1]
      var heightPair = React.useState(dockHeight())
      var height = heightPair[0]
      var setHeight = heightPair[1]

      // 挂载：vendor 就绪 → 挂 xterm → fit；会话随面板保活。
      React.useEffect(() => {
        var cancelled = false
        ensureVendor().then(() => {
          if (cancelled) return
          setLoaded(true)
          mountTerms()
          attachActive()
          scheduleResize()
        }).catch((error) => { console.error('[dsh-termbar]', error) })
        var onWindowResize = () => scheduleResize()
        window.addEventListener('resize', onWindowResize)
        return () => {
          cancelled = true
          window.removeEventListener('resize', onWindowResize)
        }
      }, [])

      // 布局镜像：以 state.open 为开关（关闭时 Dock 仅 return null、组件不卸载，
      // effect 清理不会跑，必须在 effect 体里撤类）挂/撤 html.dsh-termbar-open
      // （bottomRow 行得高 → 主对话列被分割），并把左右内缩对齐侧栏边缘。
      React.useEffect(() => {
        var root = document.documentElement
        if (!state.open) { root.classList.remove('dsh-termbar-open'); return }
        root.classList.add('dsh-termbar-open')
        root.style.setProperty('--dsh-termbar-h', height + 'px')
        var syncInset = () => {
          var sidebar = document.querySelector('[class$="_sidebarCol"]')
          var rightbar = document.querySelector('[class$="_rightbarCol"]')
          var left = sidebar ? Math.max(0, Math.round(sidebar.getBoundingClientRect().width)) : 0
          var rightW = rightbar ? rightbar.getBoundingClientRect().width : 0
          root.style.setProperty('--dsh-termbar-left', (left - 1) + 'px')
          root.style.setProperty('--dsh-termbar-right', rightW > 4 ? Math.round(rightW) + 'px' : '0px')
          // 列宽变化（如开/关右侧栏）会连带改变 dock 宽度 → xterm 需要重排，
          // 否则旧画布宽于容器，文字会穿透到侧栏上。
          scheduleResize()
        }
        syncInset()
        var observer = new ResizeObserver(syncInset)
        var sidebarCol = document.querySelector('[class$="_sidebarCol"]')
        var rightbarCol = document.querySelector('[class$="_rightbarCol"]')
        if (sidebarCol) observer.observe(sidebarCol)
        if (rightbarCol) observer.observe(rightbarCol)
        if (bodyRef.current) observer.observe(bodyRef.current)
        window.addEventListener('resize', syncInset)
        return () => {
          observer.disconnect()
          window.removeEventListener('resize', syncInset)
        }
      }, [height, state.open])

      // activeId / 会话增减后：同步可见性、补挂新 term、attach、fit。
      React.useEffect(() => {
        mountTerms()
        // 分栏视图：当前项目全部可见会话横排；单栏视图：仅激活会话。
        var splitIds = store.split ? new Set(visibleSessions().map((s) => s.id)) : null
        var visIdx = 0
        terms.forEach((rec, id) => {
          var show = splitIds ? splitIds.has(id) : id === store.activeId
          rec.el.style.display = show ? 'block' : 'none'
          // 分隔条按「可见序」画：第 2 栏起加左边线；隐藏 pane 不能参与计数
          // （兄弟选择器会把 display:none 的 pane 也当相邻，误画分隔条）。
          rec.el.style.borderLeft = show && splitIds && visIdx++ > 0 ? '1px solid var(--dsw-alias-border-l2)' : ''
        })
        if (bodyRef.current) bodyRef.current.classList.toggle('split', !!(splitIds && splitIds.size > 1))
        var rec = terms.get(store.activeId)
        if (rec) { try { rec.fit.fit() } catch { /* not ready */ } }
        attachActive()
        scheduleResize()
        // 项目切换后：当前激活 tab 不属于新项目 → 落到新项目最后一个 tab；
        var vis = visibleSessions()
        if (vis.length && !vis.some((s) => s.id === store.activeId)) setActive(vis[vis.length - 1].id)
        else if (!vis.length && store.activeId !== null) setActive(null)
        // 新项目没有 tab 时不自动补建：是否新增由用户点 + 决定。
      }, [state.activeId, state.sessions.length, state.open, state.project, state.split])

      function mountTerms() {
        if (!bodyRef.current) return
        // 清掉不在册的幽灵容器（dispose 过的会话壳），防旧画布叠加渲染。
        Array.from(bodyRef.current.children).forEach((child) => {
          var sid = child.dataset && child.dataset.sessionId
          // 只清 term 壳（带 sid 且不在册）；无 sid 的节点归 React 管，不许碰。
          if (sid && !terms.has(sid)) child.remove()
        })
        store.sessions.forEach((s) => {
          var rec = ensureTerm(s)
          if (rec.el.parentNode !== bodyRef.current) bodyRef.current.appendChild(rec.el)
          if (!rec.opened) {
            // xterm 必须显式 open 到容器；等 el 入树再 open 保证尺寸测量有效。
            try { rec.term.open(rec.el); rec.opened = true } catch (error) { console.error('[dsh-termbar] open', error) }
          }
          if (rec.opened && !rec.focusBound && rec.term.textarea) {
            // 聚焦某栏 → 激活对应页签（vendored xterm 无 onFocus 事件，走 textarea focus）。
            rec.focusBound = true
            rec.term.textarea.addEventListener('focus', () => { if (store.activeId !== s.id) setActive(s.id) })
          }
        })
      }

      var startDrag = (event) => {
        event.preventDefault()
        var startY = event.clientY
        var startH = height
        var clamp = (v) => Math.max(120, Math.min(Math.round(window.innerHeight * 0.7), v))
        var move = (ev) => setHeight(clamp(startH + (startY - ev.clientY)))
        var up = (ev) => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          var next = clamp(startH + (startY - ev.clientY))
          setHeight(next)
          try { localStorage.setItem(HEIGHT_KEY, String(next)) } catch { /* private mode */ }
          scheduleResize()
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }

      if (!state.open) return null

      return h('div', { className: 'dsh-termbar-dock', style: { height: height + 'px' } },
        h('div', { className: 'dsh-termbar-resize', onPointerDown: startDrag }),
        h('div', { className: 'dsh-termbar-head' },
          h('span', { className: 'dsh-termbar-title' }, t('panelTitle')),
          h('span', { className: 'dsh-termbar-shell' }, activeSession() ? activeSession().shell : ''),
          h('div', { className: 'dsh-termbar-tabs' },
            visibleSessions().map((s, i) => h('div', {
              key: s.id,
              className: 'dsh-termbar-tab',
              'data-active': s.id === state.activeId ? 'true' : 'false',
              onClick: () => setActive(s.id),
            },
            h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, tabTitle(visibleSessions(), i)),
            h('button', {
              className: 'dsh-termbar-tab-x',
              title: t('closeTab'),
              'aria-label': t('closeTab'),
              onClick: (event) => { event.stopPropagation(); void closeSession(s.id) },
            }, ICON_TAB_X)))),
          state.status === 'broken' ? h('span', { className: 'dsh-termbar-status' }, t('reconnecting')) : null,
          h('div', { className: 'dsh-termbar-actions' },
            h('button', {
              className: 'dsh-termbar-toggle',
              title: t('splitTerm'),
              'aria-label': t('splitTerm'),
              onClick: onSplit,
            }, ICON_SPLIT),
            h('button', {
              className: 'dsh-termbar-toggle',
              title: t('newTab'),
              'aria-label': t('newTab'),
              onClick: () => { void createSession() },
            }, ICON_PLUS),
            h('button', {
              className: 'dsh-termbar-toggle',
              title: t('closePanel'),
              'aria-label': t('closePanel'),
              onClick: () => setState({ open: false }),
            }, ICON_CLOSE))),
        h('div', { className: 'dsh-termbar-body', ref: bodyRef }),
        // loading 兜底同样挂 dock 根：body 内只允许 term 包裹层（mountTerms 命令式管理），
        // React 管理的节点混进去会在状态切换时触发 removeChild 崩溃。
        !loaded ? h('div', { className: 'dsh-termbar-fallback' }, t('loading')) : null,
        // 空态提示必须挂在 dock 根上、bodyRef 之外：body 内部由 mountTerms 命令式
        // 清理/挂载 term 节点，混入 React 管理的节点会触发 removeChild 崩溃。
        loaded && !visibleSessions().length ? h('div', { className: 'dsh-termbar-empty' }, t('emptyHint')) : null)
    }

    /* ── locale ───────────────────────────────────────────────────────── */
    var dict = {
      zh: {
        openPanel: '打开终端',
        closePanel: '关闭终端',
        panelTitle: '终端',
        newTab: '新建终端',
        splitTerm: '拆分终端',
        projectFallback: '项目',
        emptyHint: '当前项目暂无终端，点击右上角 + 新建',
        closeTab: '关闭终端页',
        reconnecting: '重连中…',
        loading: '正在加载终端…',
        toggleBar: '展开/收起终端栏',
        openBar: '打开终端栏',
        closeBar: '收起终端栏',
      },
      en: {
        openPanel: 'Open terminal',
        closePanel: 'Close terminal',
        panelTitle: 'Terminal',
        newTab: 'New terminal',
        splitTerm: 'Split terminal',
        projectFallback: 'Project',
        emptyHint: 'No terminal in this project yet. Click + to add one.',
        closeTab: 'Close tab',
        reconnecting: 'Reconnecting…',
        loading: 'Loading terminal…',
        toggleBar: 'Toggle terminal bar',
        openBar: 'Open terminal bar',
        closeBar: 'Close terminal bar',
      },
    }
    var t = (key) => (dict.zh[key] !== undefined ? dict.zh[key] : key) // 兜底；apply 里替换为 locale.bind

    /* ── 注册 ─────────────────────────────────────────────────────────── */
// ======================================================================
// dsh-plugins-plugin:精选推荐(内联模块,自动插入,请勿手改)
// 注入在 factory(require) 内,可用 factory 的 require 取 react;
// apply 末尾通过 window.__DSH_FEATURED_INIT__(ctx) 注册 tab。
// ======================================================================
// >>> dsh-plugins-plugin featured inline (auto-inserted, do not remove markers)
// dsh-plugins-plugin — 精选推荐 client 内联模块(embed/featured.client.js)。
// 这是一段"函数体片段",由 integrate.sh 注入到接入插件 lib/client.js 的
// factory(require) 内部(MARK 之间的内容),因此可以直接用 factory 的 require
// 拿 react,并暴露 window.__DSH_FEATURED_INIT__(ctx) 供 apply 末尾调用。
//
// 为什么不用 DSH 的 require.async 包本地 chunk:chunk URL 必须与 bundle 的
// ?rev= 精确匹配,一旦接入包自己的 bundle 加载失败(如 dsh-app:// 404),
// chunk 永远到不了;内联后 tab 跟随接入插件自己的 bundle,零额外请求。
// 注意:本片段绝不能放到 factory 之外 —— 那样 require 会落到 Node 全局。
;(function () {
  window.__FEATURED_FACTORY_RAN__ = true
  try {
      const React = require('react')
          const h = React.createElement
      
          const NS = 'dsh-plugins-plugin'
          const ROUTE = '/dsh-plugins-plugin/featured'
          // 数据统一由宿主半提供:host 拉远程集中目录(node fetch,无浏览器缓存/CORS)
          // 并合并接入插件登记源,client 只读本地路由,永远新鲜。
      
          function fetchJson(url, timeoutMs) {
            const ctrl = typeof AbortController === 'function' ? new AbortController() : null
            const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs)
            return fetch(url, { cache: 'no-store', headers: { accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
              .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status)
                return res.json()
              })
              .finally(() => clearTimeout(timer))
          }
      
          function fetchText(url, timeoutMs) {
            const ctrl = typeof AbortController === 'function' ? new AbortController() : null
            const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs)
            return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
              .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status)
                return res.text()
              })
              .finally(() => clearTimeout(timer))
          }
      
          // 远程条目规范化(与 host 半 normalizeEntry 对齐的宽松版)。
          // 富字段(author/stars/downloads/screenshots 等)由 scripts/enrich.mjs
          // 在构建期从 awesome-dsh-plugin 官方目录 join 进来,这里原样放行。
          function normalizeRemoteEntry(raw) {
            if (!raw || typeof raw !== 'object') return null
            const pkg = String(raw.package || raw.name || '').trim()
            const title = String(raw.title || '').trim()
            if (!pkg || !title) return null
            const entry = { package: pkg, title, source: 'plugins.json' }
            for (const key of ['description', 'version', 'icon', 'homepage', 'author', 'category']) {
              const v = String(raw[key] || '').trim()
              if (v) entry[key] = v
            }
            if (Array.isArray(raw.screenshots)) {
              const shots = raw.screenshots.map((x) => String(x).trim()).filter(Boolean).slice(0, 2)
              if (shots.length) entry.screenshots = shots
            }
            if (typeof raw.stars === 'number' && raw.stars >= 0) entry.stars = raw.stars
            if (typeof raw.downloads === 'number' && raw.downloads >= 0) entry.downloads = raw.downloads
            if (Array.isArray(raw.tags)) {
              const tags = raw.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
              if (tags.length) entry.tags = tags
            }
            return entry
          }
      
          // 数值缩写:586200 → 586.2k,1200000 → 1.2m。
          function fmtCount(n) {
            if (n >= 1e6) return (Math.round(n / 1e5) / 10) + 'm'
            if (n >= 1e3) return (Math.round(n / 100) / 10) + 'k'
            return String(n)
          }
      
          // raw.githubusercontent 在国内常不可达;转 jsdelivr gh 镜像再失败则放弃。
          function shotCandidates(url) {
            const match = String(url).match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(HEAD|[0-9a-fA-F]{6,}|[^/]+)\/(.+)$/)
            if (!match) return [url]
            const [, owner, repo, ref, file] = match
            const branch = ref === 'HEAD' ? 'main' : ref
            return [
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${file}`,
              url,
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@master/${file}`,
            ]
          }
      
          // 合并已移到宿主半(host 侧远程目录 + 登记源,按包名去重)。
      
          const zh = {
            tabLabel: '精选推荐',
            title: '精选插件',
            subtitle: '来自接入插件的推荐,可一键安装',
            install: '安装',
            installed: '已安装',
            empty: '暂无精选内容:接入插件可通过 dsh-plugins-plugin 的 integrate.sh 推荐插件',
            loading: '加载中…',
            error: '加载失败',
            retry: '重试',
            recommendedBy: '推荐',
            tags: '标签',
            close: '关闭',
            readmeLoading: 'README 加载中…',
            readmeError: 'README 读取失败',
          }
          const en = {
            tabLabel: 'Featured',
            title: 'Featured Plugins',
            subtitle: 'Recommended by integrated plugins, one-click install',
            install: 'Install',
            installed: 'Installed',
            empty: 'Nothing featured yet: plugins can recommend entries via dsh-plugins-plugin integrate.sh',
            loading: 'Loading…',
            error: 'Failed to load',
            retry: 'Retry',
            recommendedBy: 'Recommended by',
            tags: 'Tags',
            close: 'Close',
            readmeLoading: 'Loading README…',
            readmeError: 'Failed to load README',
          }
      
          const S = {
            wrap: { padding: '12px 0 24px', display: 'flex', flexDirection: 'column', gap: 12 },
            // 官方 Discover 同款瀑布流:CSS 多列,卡片高度不一自然堆叠
            grid: { listStyle: 'none', margin: 0, padding: 0, columns: '300px', columnGap: 12 },
            card: {
              breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', marginBottom: 12,
              display: 'flex', flexDirection: 'column', gap: 8, padding: 14,
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 12, background: 'var(--dsw-alias-bg-layer-2)',
            },
            head: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
            // 插件名 + GitHub 图标紧贴成组,右侧留给 安装按钮/已安装徽标
            nameWrap: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 auto' },
            title: {
              fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
            },
            ghLink: { display: 'flex', flex: 'none', color: 'var(--dsw-alias-label-secondary)', textDecoration: 'none' },
            ghIcon: { width: 15, height: 15, fill: 'currentColor' },
            badge: { flex: 'none', fontSize: 12, color: 'var(--dsw-alias-state-success-primary)' },
            iconS: { width: 20, height: 20, borderRadius: 6, objectFit: 'contain', flex: 'none', display: 'block' },
            // 作者行 + 数据行合并为一行:左头像+作者,右 v·↓·★
            authorRow: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginTop: -4, cursor: 'pointer' },
            avatar: { width: 14, height: 14, borderRadius: 999, flex: 'none', display: 'block' },
            author: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            meta: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', flex: 'none', marginLeft: 'auto' },
            desc: {
              margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
              display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            },
            shots: { display: 'flex', gap: 8 },
            shot: {
              display: 'block', flex: 1, minWidth: 0, height: 104, objectFit: 'cover', objectPosition: 'top',
              borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', cursor: 'pointer',
            },
            foot: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 },
            chips: { display: 'flex', flexWrap: 'wrap', gap: 6, flex: '1 1 auto', minWidth: 0 },
            chip: { fontSize: 12, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 },
            src: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            btn: {
              flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12,
              padding: '4px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
            },
            btnBusy: { opacity: 0.6, cursor: 'default' },
            note: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
            retryBtn: {
              alignSelf: 'flex-start', cursor: 'pointer', font: 'inherit', fontSize: 12,
              padding: '4px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
              background: 'transparent', color: 'var(--dsw-alias-label-primary)',
            },
            // ── 自建详情弹窗(README 从 npm 包 jsdelivr 读取) ──
            overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
            panel: {
              width: 'min(860px, 92vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column',
              background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
            },
            panelHead: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 16px 12px' },
            panelIcon: { width: 44, height: 44, borderRadius: 10, objectFit: 'contain', flex: 'none', background: 'var(--dsw-alias-bg-layer-1)' },
            panelTitleCol: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' },
            panelTitle: { fontSize: 17, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', margin: 0 },
            panelPkg: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            panelClose: {
              flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, border: 'none', background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)', padding: '4px 6px',
            },
            panelMeta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 16px 10px', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
            panelDesc: { margin: '0 16px 12px', fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-primary)' },
            panelBody: { margin: '0 16px', borderTop: '1px solid var(--dsw-alias-border-l1)', padding: '14px 2px 18px', overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: 'var(--dsw-alias-label-primary)' },
            mdNote: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
            mdH: { fontSize: 15, fontWeight: 600, margin: '18px 0 8px' },
            mdH2: { fontSize: 14, fontWeight: 600, margin: '16px 0 6px' },
            mdP: { margin: '0 0 10px' },
            mdList: { margin: '0 0 10px', paddingLeft: 20 },
            mdLi: { margin: '0 0 4px' },
            mdImg: { display: 'block', maxWidth: '100%', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', margin: '8px 0' },
            mdCode: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 4, padding: '1px 5px' },
            mdPre: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 12, overflowX: 'auto', margin: '0 0 10px' },
            mdPreCode: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 },
            mdA: { color: 'var(--dsw-alias-link)' },
            linkIcon: { width: 11, height: 11, marginRight: 3, verticalAlign: '-1px', color: 'var(--dsw-alias-link)' },
            mdQuote: { borderLeft: '3px solid var(--dsw-alias-border-l1)', paddingLeft: 12, margin: '0 0 12px', color: 'var(--dsw-alias-label-secondary)' },
            mdTable: { borderCollapse: 'collapse', width: '100%', margin: '0 0 12px', fontSize: 12.5 },
            mdTd: { border: '1px solid var(--dsw-alias-border-l1)', padding: '6px 10px', textAlign: 'left', verticalAlign: 'top' },
          }
      
          // GitHub mark(octicon mark-github 16x16 路径)
          const GH_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'
      
          // 包名行:npm 包名(左,等宽)+ 数据(右,同行);整行可点开详情弹窗。
          // 不展示作者信息(不依赖 awesome-dsh-plugin 的 author 字段)。
          function FeaturedAuthor(props) {
            const pkg = props.pkg
            const meta = props.meta
            const onDetail = props.onDetail
            if (!pkg && !meta) return null
            return h('div', { style: S.authorRow, onClick: onDetail },
              pkg ? h('span', { style: S.author }, pkg) : null,
              meta ? h('span', { style: S.meta }, meta) : null)
          }
      
          // 截图:逐个候选地址回退(jsdelivr gh 镜像 → 原始 raw → master 分支),全失败则隐藏。
          function FeaturedShot(props) {
            const url = props.url
            const pair = React.useState(0)
            const idx = pair[0], setIdx = pair[1]
            const candidates = React.useMemo(() => shotCandidates(url), [url])
            if (idx >= candidates.length) return null
            return h('img', {
              src: candidates[idx], alt: '', style: S.shot, loading: 'lazy',
              onError: () => setIdx(idx + 1),
              onClick: () => window.open(candidates[idx], '_blank', 'noopener'),
            })
          }
      
          // 卡片布局对齐官方 Discover:
          // 标题行(标题 + GitHub 链接) → 作者行(头像+作者) → 数据行(v·↓·★)
          // → 简介(4 行截断) → 截图(≤2) → 脚行(标签 chips + 安装按钮)。
          // 卡片首行插件图标:候选地址逐个回退(jsdelivr gh 镜像优先),无 icon 或全失败不展示。
          function FeaturedHeadIcon(props) {
            const entry = props.entry
            const pair = React.useState(0)
            const idx = pair[0], setIdx = pair[1]
            const candidates = React.useMemo(() => (entry.icon ? shotCandidates(entry.icon) : []), [entry.icon])
            if (!candidates.length || idx >= candidates.length) return null
            return h('img', { src: candidates[idx], alt: '', style: props.large ? S.panelIcon : S.iconS, loading: 'lazy', onError: () => setIdx(idx + 1) })
          }
      
          function FeaturedCard(props) {
            const e = props.entry
            const t = props.t
            const install = props.install
            const onDetail = props.onDetail // 打开自建详情弹窗
            const installed = !!props.installed // 宿主侧 pluginManager.listBundles 判定
            const pair = React.useState(false) // busy
            const busy = pair[0], setBusy = pair[1]
            const donePair = React.useState(false) // 本会话刚装过(仅避免重复点击)
            const done = donePair[0], setDone = donePair[1]
      
            const onClick = () => {
              if (busy || done || typeof install !== 'function') return
              setBusy(true)
              try {
                install({ spec: e.version ? `${e.package}@${e.version}` : e.package, title: e.title, version: e.version || '' })
                setDone(true)
              } finally {
                setBusy(false)
              }
            }
      
            const btnLabel = busy ? '…' : t('install')
            const metaParts = []
            if (e.version) metaParts.push(`v${e.version}`)
            const metaText = metaParts.join(' · ')
      
            const chips = (e.tags || []).slice(0, 2)
            return h('li', { style: S.card },
              h('div', { style: S.head },
                h(FeaturedHeadIcon, { entry: e }),
                h('div', { style: S.nameWrap },
                  h('span', { style: S.title, title: e.title, onClick: onDetail }, e.title),
                  e.homepage ? h('a', { style: S.ghLink, href: e.homepage, target: '_blank', rel: 'noreferrer noopener', title: e.package },
                    h('svg', { style: S.ghIcon, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('path', { d: GH_PATH }))) : null),
                // 右上角:已安装绿色徽标,否则安装按钮(参考 billion-context 卡片布局)
                installed || done
                  ? h('span', { style: S.badge }, `✓ ${t('installed')}`)
                  : h('button', {
                      type: 'button', style: Object.assign({}, S.btn, busy ? S.btnBusy : {}),
                      onClick, disabled: busy,
                    }, btnLabel)),
              h(FeaturedAuthor, { pkg: e.package, meta: metaText, onDetail }),
              e.description ? h('p', { style: S.desc, onClick: onDetail }, e.description) : null,
              e.screenshots && e.screenshots.length
                ? h('div', { style: S.shots }, e.screenshots.map((url) => h(FeaturedShot, { key: url, url })))
                : null,
              h('div', { style: S.foot },
                h('div', { style: S.chips },
                  chips.map((c) => h('span', { key: c, style: S.chip, title: c }, c)),
                  e.sourceTitle ? h('span', { style: S.src, title: `${t('recommendedBy')} ${e.sourceTitle}` }, `${t('recommendedBy')} ${e.sourceTitle}`) : null)))
          }
      
          // ── 自建详情弹窗:README 从 npm 包(jsdelivr)读取,轻量 markdown 渲染 ──
          // 相对路径的图片/链接重写到 jsdelivr 包根。
          function mdAbsUrl(url, base) {
            const u = String(url).trim()
            if (/^https?:\/\//i.test(u)) return u
            return base + u.replace(/^\.\//, '')
          }
      
          // 占位符还原:把 s 里 \u0000<idx>\u0000 换回暂存的节点
          function restoreInline(s, tokens) {
            const parts = String(s).split(/\u0000(\d+)\u0000/g)
            const out = []
            for (let i = 0; i < parts.length; i++) {
              if (i % 2 === 1) out.push(tokens[Number(parts[i])])
              else if (parts[i]) out.push(parts[i])
            }
            return out
          }
      
          // 行内解析(占位符两段式):
          // 粗体 → 图片 → 链接 → 行内代码。图片先于链接,使 [![徽章](i)](l) 外链图可用;
          // 粗体内部递归解析,粗体套链接/链接套图片均正常。
          function mdInline(text, base) {
            const tokens = []
            const stash = (node) => { tokens.push(node); return '\u0000' + (tokens.length - 1) + '\u0000' }
            const stashText = (t) => { tokens.push(t); return '\u0000' + (tokens.length - 1) + '\u0000' }
            // 链接统一形态:蓝色 + 前置地球图标(与官方 markdown 链接色一致)
            const makeLink = (href, kids) => h('a', { style: S.mdA, href, target: '_blank', rel: 'noreferrer noopener' },
              h('svg', { style: S.linkIcon, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2' },
                h('circle', { cx: 8, cy: 8, r: 6.3 }),
                h('path', { d: 'M1.7 8h12.6M8 1.7c2.4 1.9 2.4 10.7 0 12.6M8 1.7c-2.4 1.9-2.4 10.7 0 12.6' })),
              ...kids)
            let s = String(text)
            s = s.replace(/\*\*([^*]+)\*\*/g, (m0, inner) => stash(h('strong', null, mdInline(inner, base))))
            s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m0, alt, url) => stash(h('img', { style: S.mdImg, src: mdAbsUrl(url, base), alt: alt || '', loading: 'lazy' })))
            s = s.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m0, label, url) => stash(makeLink(mdAbsUrl(url, base), restoreInline(label, tokens))))
            s = s.replace(/`([^`]+)`/g, (m0, c) => stash(h('code', { style: S.mdCode }, c)))
            // 裸自动链接:<https://…> 与 http(s)://…(URL 中间允许点/斜杠,仅结尾剔除标点)
            const TRAIL_PUNCT = /([.,;:!?"'）)\u3001\u3002\uff0c\uff1b\uff1a\uff01\uff1f\u201d\u2019]|[^\x20-\x7e])+$/
            s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (m0, url) => stash(makeLink(url, [url])))
            s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()\u0000]+)/g, (m0, pre, rawUrl) => {
              const trailMatch = TRAIL_PUNCT.exec(rawUrl)
              const trail = trailMatch ? trailMatch[0] : ''
              const url = trail ? rawUrl.slice(0, -trail.length) : rawUrl
              return stashText(pre) + stash(makeLink(url, [url])) + (trail ? stashText(trail) : '')
            })
            return restoreInline(s, tokens)
          }
      
          // 块级解析:围栏代码块 / 标题 / 列表 / 段落(不追求完整 markdown,够读 README 即可)
          function renderReadme(text, base) {
            const lines = String(text).split('\n')
            const out = []
            let key = 0, para = [], i = 0
            const flushPara = () => {
              if (para.length) {
                out.push(h('p', { style: S.mdP, key: 'p' + (key++) }, mdInline(para.join(' '), base)))
                para = []
              }
            }
            while (i < lines.length) {
              const line = lines[i]
              if (/^```/.test(line)) {
                flushPara()
                const buf = []
                i++
                while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++ }
                i++
                out.push(h('pre', { style: S.mdPre, key: 'c' + (key++) }, h('code', { style: S.mdPreCode }, buf.join('\n'))))
                continue
              }
              // 引用块(> 行,支持连续多行合并)
              if (/^\s*>\s?/.test(line)) {
                flushPara()
                const buf = []
                while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                  buf.push(lines[i].replace(/^\s*>\s?/, ''))
                  i++
                }
                out.push(h('div', { style: S.mdQuote, key: 'q' + (key++) },
                  h('p', { style: S.mdP }, mdInline(buf.join(' ').trim(), base))))
                continue
              }
              // 表格(| 行,第二行为 |---| 分隔)
              if (/^\s*\|/.test(line)) {
                const block = []
                while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i].trim()); i++ }
                const cells = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
                const isSep = (row) => /^\|?[\s:|-]+\|?$/.test(row) && row.includes('-')
                if (block.length >= 2 && isSep(block[1])) {
                  flushPara()
                  const head = cells(block[0])
                  const rows = block.slice(2).filter((r) => !isSep(r)).map(cells)
                  out.push(h('table', { style: S.mdTable, key: 't' + (key++) },
                    h('thead', null, h('tr', null, head.map((c) => h('th', { style: S.mdTd }, mdInline(c, base))))),
                    h('tbody', null, rows.map((r) => h('tr', null, head.map((_, ci) => h('td', { style: S.mdTd }, mdInline(r[ci] || '', base))))))))
                  continue
                }
                // 非法表格形态 → 按普通段落处理
                for (const row of block) para.push(row)
                continue
              }
              const hm = line.match(/^(#{1,4})\s+(.*)/)
              if (hm) {
                flushPara()
                out.push(h(hm[1].length <= 2 ? 'h3' : 'h4', { style: hm[1].length <= 2 ? S.mdH : S.mdH2, key: 'h' + (key++) }, mdInline(hm[2], base)))
                i++
                continue
              }
              const lm = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)/)
              if (lm) {
                flushPara()
                const items = []
                while (i < lines.length) {
                  const m2 = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)/)
                  if (!m2) break
                  items.push(h('li', { style: S.mdLi, key: 'li' + items.length }, mdInline(m2[1], base)))
                  i++
                }
                out.push(h('ul', { style: S.mdList, key: 'u' + (key++) }, items))
                continue
              }
              if (!line.trim()) { flushPara(); i++; continue }
              para.push(line.trim())
              i++
            }
            flushPara()
            return out
          }
      
          function FeaturedModal(props) {
            const e = props.entry
            const t = props.t
            const onClose = props.onClose
            const pair = React.useState({ status: 'loading', kids: [] })
            const state = pair[0], setState = pair[1]
      
            React.useEffect(() => {
              let alive = true
              setState({ status: 'loading', kids: [] })
              const base = `https://cdn.jsdelivr.net/npm/${e.package}/`
              fetchText(base + 'README.md', 10000).then((txt) => {
                if (!alive) return
                setState({ status: 'ready', kids: renderReadme(txt, base) })
              }).catch(() => {
                if (!alive) return
                // jsdelivr npm 主源失败 → GitHub 仓库兜底(README 大小写两种形态)
                const ghCandidates = e.homepage && /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i.exec(e.homepage)
                if (!ghCandidates) { setState({ status: 'error', kids: [] }); return }
                const ghBase = `https://cdn.jsdelivr.net/gh/${ghCandidates[1]}/${ghCandidates[2]}@main/`
                fetchText(ghBase + 'README.md', 10000).then((txt2) => {
                  if (!alive) return
                  setState({ status: 'ready', kids: renderReadme(txt2, ghBase) })
                }).catch(() => { if (alive) setState({ status: 'error', kids: [] }) })
              })
              return () => { alive = false }
            }, [e.package])
      
            React.useEffect(() => {
              const onKey = (ev) => { if (ev.key === 'Escape') onClose() }
              window.addEventListener('keydown', onKey)
              return () => window.removeEventListener('keydown', onKey)
            }, [onClose])
      
            const metaParts = []
            if (e.version) metaParts.push(`v${e.version}`)
            return h('div', {
              style: S.overlay,
              onClick: (ev) => { if (ev.target === ev.currentTarget) onClose() },
            },
              h('div', { style: S.panel },
                h('div', { style: S.panelHead },
                  h(FeaturedHeadIcon, { entry: e, large: true }),
                  h('div', { style: S.panelTitleCol },
                    h('p', { style: S.panelTitle }, e.title),
                    h('span', { style: S.panelPkg }, e.package)),
                  h('button', { type: 'button', style: S.panelClose, onClick: onClose }, '✕')),
                metaParts.length ? h('div', { style: S.panelMeta }, metaParts.join(' · ')) : null,
                e.description ? h('p', { style: S.panelDesc }, e.description) : null,
                h('div', { style: S.panelBody },
                  state.status === 'loading' ? h('p', { style: S.mdNote }, t('readmeLoading')) : null,
                  state.status === 'error' ? h('p', { style: S.mdNote }, t('readmeError')) : null,
                  state.status === 'ready' ? state.kids : null),
                h('div', { style: Object.assign({}, S.panelMeta, { justifyContent: 'flex-end', paddingTop: 10 }) },
                  h('button', { type: 'button', style: S.retryBtn, onClick: onClose }, t('close')))))
          }
      
          function FeaturedSection(props) {
            const install = props.install
            void props.openPackage // 详情改为自建弹窗,不再调官方 openPackage
            const t = props.t
      
            const pair = React.useState({ status: 'loading', entries: [], installed: {} })
            const state = pair[0], setState = pair[1]
            const noncePair = React.useState(0)
            const nonce = noncePair[0], setNonce = noncePair[1]
            const detailPair = React.useState(null)
            const detail = detailPair[0], setDetail = detailPair[1]
      
            React.useEffect(() => {
              let alive = true
              setState({ status: 'loading', entries: [], installed: {} })
              // 宿主路由一站式返回:远程集中目录(已富化)+ 接入插件登记源 + 已安装表。
              fetchJson(ROUTE, 8000).then((body) => {
                if (!alive) return
                const entries = body && body.ok && body.data && Array.isArray(body.data.entries)
                  ? body.data.entries.map(normalizeRemoteEntry).filter(Boolean)
                  : []
                const installed = body && body.ok && body.data && body.data.installed && typeof body.data.installed === 'object'
                  ? body.data.installed
                  : {}
                setState({ status: entries.length ? 'ready' : 'empty', entries, installed })
              }).catch(() => {
                if (alive) setState({ status: 'error', entries: [] })
              })
              return () => { alive = false }
            }, [nonce])
      
            // tab 标签已表达板块名,不再渲染顶部标题/副标题
            const kids = []
      
            if (state.status === 'loading') {
              kids.push(h('p', { key: 'note', style: S.note }, t('loading')))
            } else if (state.status === 'error') {
              kids.push(h('p', { key: 'note', style: S.note }, t('error')))
              kids.push(h('button', { key: 'retry', type: 'button', style: S.retryBtn, onClick: () => setNonce((n) => n + 1) }, t('retry')))
            } else if (state.status === 'empty') {
              kids.push(h('p', { key: 'note', style: S.note }, t('empty')))
            } else {
              kids.push(h('ul', { key: 'grid', style: S.grid }, state.entries.map((e) => (
                h(FeaturedCard, { key: e.package, entry: e, t, install, onDetail: () => setDetail(e), installed: !!state.installed[e.package] })
              ))))
            }
            return h('div', { style: S.wrap }, kids,
              detail ? h(FeaturedModal, { key: detail.package, entry: detail, t, onClose: () => setDetail(null) }) : null)
          }
      
          // 导出:接入插件 apply 末尾调用 window.__DSH_FEATURED_INIT__(ctx)。
          // 判重用 window 标志,确保多插件接入只注册一块(最先调用者生效)。
          function initFeatured(ctx) {
            if (typeof window !== 'undefined') window.__FEATURED_INIT_CALLED__ = true
            if (typeof window !== 'undefined' && window.__DSH_FEATURED_APPLIED__) return
            if (typeof window !== 'undefined') window.__DSH_FEATURED_APPLIED__ = true
            try {
            ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugins-plugin: locale')
      
            const t = ctx.locale.bind(NS)
      
            ctx.slots.inject('plugins.tab', () => ctx.slots.register({
              name: 'plugins.tab',
              id: 'dsh-plugins-plugin',
              label: () => t('tabLabel'),
              locale: NS,
            }, FeaturedSection), 'dsh-plugins-plugin: featured tab')
            if (typeof window !== 'undefined') window.__FEATURED_OK__ = true
            } catch (e) {
              if (typeof window !== 'undefined') window.__FEATURED_ERR__ = String(e && (e.stack || e.message || e))
            }
          }
      
          window.__DSH_FEATURED_INIT__ = initFeatured
  } catch (error) {
    // 内联模块自身故障不能拖垮接入插件:记录原因,由 apply 处的调用方检查标志位。
    console.error('[dsh-plugins-plugin] 精选推荐模块初始化失败', error)
    window.__FEATURED_ERR__ = String((error && (error.stack || error.message)) || error)
  }
})()
// <<< dsh-plugins-plugin featured inline
    return {
      name: 'dsh-termbar',
      inject: ['slots', 'locale', 'shortcuts', 'workspaces'],
      apply(ctx) {
        t = ctx.locale.bind(NS)
        shortcutCatalog = ctx.shortcuts.catalog
        try { connFace = ctx.get('connection') } catch { connFace = null }
        ctx.effect(() => ctx.locale.register(NS, dict))
        ctx.effect(() => () => {
          conn.disconnect()
          terms.forEach((rec) => { try { rec.term.dispose() } catch { /* gone */ } })
          terms.clear()
          if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl)
          if (layoutEl.parentNode) layoutEl.parentNode.removeChild(layoutEl)
          document.documentElement.classList.remove('dsh-termbar-open')
        }, 'dsh-termbar: client teardown')
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
          { name: 'conversation.session.header.utilities', id: 'dsh-termbar-toggle', order: 999, label: dict.zh.openPanel },
          ToggleButton))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          { name: 'shell.overlay', id: 'dsh-termbar-dock', order: 100, locale: NS },
          Dock))
        // 排障把柄：控制台可直查内部状态（window.__termbar）。
        var wsProbe = null
        var wl = null
        try {
          wl = ctx.workspaces && ctx.workspaces.list
          wsProbe = wl ? wl.getSnapshot() : 'no-ctx-workspaces'
        } catch (e) { wsProbe = 'err:' + (e && e.message) }
        wsListFace = wl || null
        window.__termbar = { store: store, conn: conn, terms: terms, resize: scheduleResize, theme: themeColors, ws: wsProbe, wsList: wl }
        // 暗色切换：别名 token 由主题服务翻值，订阅 theme/change 后重读并刷 xterm 主题
        // （官方 ui-sidebar-terminal 同款订阅方式），否则终端停留旧配色。
        // 工作区目录变化（改名/会话归属调整）→ 重新解析当前项目（tab 集随之切换）。
        try {
          var wsList = ctx.workspaces && ctx.workspaces.list
          wsListFace = wsList || null
          if (wsList && typeof wsList.subscribe === 'function') {
            ctx.effect(() => wsList.subscribe(() => syncProject()), 'dsh-termbar: workspaces watch')
          }
        } catch { /* 服务面缺失时退化为无项目模式 */ }
        ctx.effect(() => ctx.on('theme/change', () => {
          terms.forEach((rec) => {
            try { rec.term.options.theme = themeColors() } catch { /* term 已销毁 */ }
          })
        }), 'dsh-termbar: theme watch')
        // 快捷键：primary(⌘K / Ctrl+K) 开合底部终端栏；快捷键弹窗目录自动收录本条目。
        try {
          ctx.effect(() => ctx.shortcuts.register({
            id: 'dsh-termbar.toggle',
            label: () => t('toggleBar'),
            aliases: ['terminal', '终端', '底部终端栏'],
            defaults: {
              // Web 侧白名单禁单键 ⌘K（isWebBindingAllowed 仅放行 ⌘, ⌘\ `⌃` 与 ⌘⇩/⌘⇧* 双修饰），
              // 故 mac 默认取 ⌘⇧K；未声明 windows/linux profile（注册校验会逐 profile 验证，缺省即跳过）。
              'desktop:macos': { code: 'KeyK', modifiers: ['primary', 'shift'] },
              'web:macos': { code: 'KeyK', modifiers: ['primary', 'shift'] },
            },
            regions: ['page', 'editable', 'terminal'], // 输入框、终端内聚焦时同样生效
            modals: [],
            resolve: () => ({ status: 'handled', run: () => toggleOpen() }),
          }), 'dsh-termbar: shortcut')
        } catch (e) { window.__termbar.shortcutError = String(e && e.stack || e) } // 注册失败不许拖垮整个面板
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // dsh-plugins-plugin: 精选推荐板块
      },
    }
  },
})
