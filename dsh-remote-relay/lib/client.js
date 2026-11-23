/**
 * dsh-remote-relay — Web client half (module-loader bundle).
 *
 * The sidebar foot gains a compact "远程控制" action button (icon when the
 * rail is collapsed, icon + label when wide). Clicking it opens an
 * application-level dialog (shell.overlay) that carries the owner panel:
 * the 8-digit code, shareable links, relay/direct status, the activity log,
 * and the owner controls (regenerate code, allow/deny visitor control,
 * enable/disable remote access).
 *
 * No sidebar.panellist entry and no `main` view: the dialog is the surface.
 *
 * Host conventions: theme tokens only, locale dictionaries for visible
 * text, React from the module table, no DOM writes outside the React tree,
 * components with hooks rendered through h(Component, props).
 */
window.__ModuleLoader__.load({
  id: 'dsh-remote-relay',
  factory(require) {
    var React = require('react')
    var h = React.createElement
    var NS = 'dsh-remote-relay'
    var API = '/dsh-remote-relay/api'

    var zh = {
      title: '远程控制',
      codeLabel: '远程码',
      relayUrl: '远程链接',
      directUrl: '本机直连',
      copy: '复制',
      copied: '已复制',
      open: '打开',
      relay: '中转站',
      direct: '直连',
      online: '已连接',
      offline: '未连接',
      disabled: '远程控制已关闭',
      regenerate: '重新生成远程码',
      log: '活动记录',
      loading: '正在读取状态…',
      actionFailed: '操作失败',
      confirmRegenerate: '重新生成后旧链接立即失效，确认？',
      stop: '停止',
      enable: '开启',
      statusActive: '远程控制已开启',
      riskNote: '风险提示：远程码等同于本机完整控制权限，请妥善保管、仅分享给信任的人；不再使用时请停止并重新生成。',
      relayFaceHosts: '中转面已注册宿主机',
      offlineHost: '离线',
      close: '关闭',
    }
    var en = {
      title: 'Remote control',
      codeLabel: 'Remote code',
      relayUrl: 'Remote link',
      directUrl: 'Direct link',
      copy: 'Copy',
      copied: 'Copied',
      open: 'Open',
      relay: 'Relay',
      direct: 'Direct',
      online: 'connected',
      offline: 'not connected',
      disabled: 'Remote control is disabled',
      regenerate: 'Regenerate remote code',
      log: 'Activity',
      loading: 'Loading status…',
      actionFailed: 'Action failed',
      confirmRegenerate: 'The old link stops working immediately. Regenerate?',
      stop: 'Stop',
      enable: 'Enable',
      statusActive: 'Remote control is on',
      riskNote: 'Risk notice: the remote code grants full control of this machine. Please keep it safe and share it only with people you trust; stop and regenerate it when no longer needed.',
      relayFaceHosts: 'Relay face registered hosts',
      offlineHost: 'offline',
      close: 'Close',
    }
    var pageT = function (key) { return key }

    /* ── shared dialog open state (footer button ⇄ overlay) ───────────── */

    var openStore = { open: false, listeners: new Set() }
    // 用户主动停止后的标记：之后再点侧栏图标不再自动开启（面板里手动开启会清除）。
    var STOP_FLAG = 'dsh-remote-relay:user-stopped'
    function setPanelOpen(value) {
      openStore.open = value
      openStore.listeners.forEach(function (listener) { listener(value) })
    }
    function usePanelOpen() {
      var pair = React.useState(openStore.open)
      var open = pair[0]
      var setLocal = pair[1]
      React.useEffect(function () {
        var listener = function (value) { setLocal(value) }
        openStore.listeners.add(listener)
        return function () { openStore.listeners.delete(listener) }
      }, [])
      return [open, setPanelOpen]
    }

    /* ── icon ─────────────────────────────────────────────────────────── */

    // ZCode 同款远程控制图标（lucide MonitorSmartphone，24 网格 stroke 风格）。
    function RemoteIcon(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('path', { d: 'M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8' }),
        h('path', { d: 'M10 19v-3.96 3.15' }),
        h('path', { d: 'M7 19h5' }),
        h('rect', { width: 6, height: 10, x: 16, y: 12, rx: 2 }),
      )
    }

    // lucide unplug（停止/断开按钮图标，与 ZCode 停止钮同款）。
    function UnplugIcon(props) {
      var size = props && props.size ? props.size : 14
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('path', { d: 'm19 5 3-3' }),
        h('path', { d: 'm2 22 3-3' }),
        h('path', { d: 'M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z' }),
        h('path', { d: 'M7.5 13.5 10 11' }),
        h('path', { d: 'M10.5 16.5 13 14' }),
        h('path', { d: 'm12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z' }),
      )
    }

    // lucide plug（开启/连接按钮图标，与停止钮的 unplug 配对同风格）。
    function PlugIcon(props) {
      var size = props && props.size ? props.size : 14
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('path', { d: 'M12 22v-5' }),
        h('path', { d: 'M9 8V2' }),
        h('path', { d: 'M15 8V2' }),
        h('path', { d: 'M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z' }),
      )
    }

    // lucide triangle-alert（风险提示卡图标）。
    function AlertIcon(props) {
      var size = props && props.size ? props.size : 14
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }),
        h('path', { d: 'M12 9v4' }),
        h('path', { d: 'M12 17h.01' }),
      )
    }

    /* ── sidebar foot action button ───────────────────────────────────── */

    function FooterAction(props) {
      var t = pageT
      var wide = !!(props && props.wide)
      var pair = usePanelOpen()
      var hoverState = React.useState(false)
      var hovered = hoverState[0]
      var setHovered = hoverState[1]
      // 启动中（远程控制已开启）图标用品牌高亮色，关闭时为次级灰。
      var status = useStatus()
      var active = !!(status && status.enabled)
      var idleColor = 'var(--dsw-alias-label-secondary)'
      var baseColor = active ? 'var(--dsw-alias-state-warning-primary, #f59e0b)' : idleColor
      // ZCode 观感：图标与账号行同行、位于其右端。账号行本身是宿主占用的
      // settingsArea（插件无法插入同排元素）。宿主槽契约固定为
      // footerActions（本槽容器）与 settingsArea 相邻（SidebarRoot.tsx），
      // 因此运行时测量账号行的真实几何，用 fixed 定位把按钮钉到它的右端——
      // 不写死偏移，其他插件往本槽注册卡片（如额度卡）把账号行顶下去时，
      // 图标始终跟随账号行，不会叠到别的插件内容上。
      // 收起（rail）模式 56px 栏放不下并排图标，账号行又是侧栏最后一个元素
      // （下方无空间，写 top+gap 会出视口），改为钉在头像按钮右下角的
      // 20px 圆形徽标，带底色与阴影，不遮头像主体。
      var wrapperRef = React.useRef(null)
      var posState = React.useState(null)
      var pos = posState[0]
      var setPos = posState[1]
      React.useLayoutEffect(function () {
        var wrapper = wrapperRef.current
        // 结构锚点：运行时 slot 框架会在 footerActions 内再包一层
        // display:contents 容器（源码契约里没有这层），所以
        // wrapper.parentElement 未必是 footerActions 本身。沿父链向上爬，
        // 找到第一个「存在下一个兄弟元素」的祖先（即 footerActions），
        // 其下一个兄弟元素就是 settingsArea（账号行）。
        var seat = null
        var node = wrapper
        while (node && node !== document.body) {
          node = node.parentElement
          if (node && node.nextElementSibling) { seat = node.nextElementSibling; break }
        }
        // 守卫：锚不到结构正常的账号行就保持隐藏——宁可图标不出现，
        // 也不能叠到其他插件内容上。
        if (!seat || typeof seat.getBoundingClientRect !== 'function') return undefined
        var seatRect = seat.getBoundingClientRect()
        if (seatRect.width === 0 && seatRect.height === 0) return undefined
        var measure = function () {
          // 宽模式锚账号行整行（右端对齐）；收起模式锚头像按钮（徽标贴角）。
          var anchor = seat
          if (!wide) {
            var ab = seat.querySelector('button')
            if (ab && ab.getBoundingClientRect().width > 0) anchor = ab
          }
          var r = anchor.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) return
          var next = wide
            ? { left: r.right - 28 - 12, top: r.top + (r.height - 28) / 2 }
            : { left: r.right - 15, top: r.bottom - 15 }
          setPos(function (prev) {
            return (prev && prev.left === next.left && prev.top === next.top) ? prev : next
          })
        }
        measure()
        // 收起/展开是 transform 过渡动画（railIn/railOut），不改变布局尺寸，
        // ResizeObserver 不触发。effect 挂载瞬间的量取会停在动画中间帧，
        // 所以挂载后跑 ~600ms 的逐帧重测覆盖动画全程；之后靠 RO + resize
        // 管真实布局变化。setPos 内有等值短路，重复帧不会引发重渲染。
        var frames = 0
        var raf = 0
        var tick = function () {
          measure()
          frames += 1
          if (frames < 36) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        // 账号行自身尺寸、侧栏宽度（折叠动画）变化都触发重测。
        var ro = new ResizeObserver(function () { measure() })
        ro.observe(seat)
        if (wrapper.parentElement) ro.observe(wrapper.parentElement)
        window.addEventListener('resize', measure)
        return function () {
          if (raf) cancelAnimationFrame(raf)
          ro.disconnect()
          window.removeEventListener('resize', measure)
        }
      }, [wide])
      var wrapperStyle = { position: 'relative', height: 0, width: 0, overflow: 'visible', pointerEvents: 'none' }
      // 收起模式下按钮是头像右下角的小圆徽标；宽模式是账号行右端的方圆角图标。
      var btnSize = wide ? 28 : 20
      var iconSize = wide ? 16 : 12
      var buttonStyle = {
        position: 'fixed', zIndex: 3,
        left: pos ? pos.left : -9999, top: pos ? pos.top : -9999,
      }
      return h('div', { ref: wrapperRef, style: wrapperStyle },
        h('button', {
          type: 'button',
          title: t('title'),
          'aria-label': t('title'),
          // 默认关闭：首次点图标打开面板时自动开启远程控制（用户主动点击
          // 即视为开启意愿）；点过「停止」后不再自动开，只开面板。
          onClick: function () {
            setPanelOpen(true)
            if (typeof localStorage !== 'undefined' && localStorage.getItem(STOP_FLAG)) return
            post({ action: 'status' }).then(function (data) {
              if (data && data.ok && data.status && !data.status.enabled) {
                post({ action: 'set-enabled', value: true }).catch(function () {})
              }
            }).catch(function () {})
          },
          onMouseEnter: function () { setHovered(true) },
          onMouseLeave: function () { setHovered(false) },
          onFocus: function () { setHovered(true) },
          onBlur: function () { setHovered(false) },
          style: Object.assign({
            display: pos ? 'inline-flex' : 'none',
            alignItems: 'center', justifyContent: 'center',
            width: btnSize, height: btnSize,
            borderRadius: wide ? 8 : 999,
            // 徽标形态带实底和描边，避免与头像融为一体；宽模式悬浮在浅色
            // 背景上，默认透明底即可。按钮本身不加阴影——阴影加在图标
            // 笔画上（见下方图标包裹 span 的 drop-shadow，用户要求）。
            border: '1px solid ' + (hovered || !wide ? 'var(--dsw-alias-border-l1)' : 'transparent'),
            background: hovered
              ? 'var(--dsw-alias-bg-layer-1)'
              : (wide ? 'transparent' : 'var(--dsw-alias-bg-layer-1)'),
            color: hovered ? (active ? baseColor : 'var(--dsw-alias-label-primary)') : baseColor,
            cursor: 'pointer', flex: 'none',
            pointerEvents: 'auto',
          }, buttonStyle),
        },
          // 图标包一层带 drop-shadow 的 span：阴影跟随图标笔画的实际形状
          //（filter 对子元素生效），而不是按钮方框的投影。
          h('span', {
            style: {
              display: 'inline-flex',
              filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.15))',
            },
          },
            h(RemoteIcon, { size: iconSize }),
          ),
        ),
      )
    }

    /* ── status polling ───────────────────────────────────────────────── */

    function useStatus() {
      var state = React.useState(undefined)
      var status = state[0]
      var setStatus = state[1]
      React.useEffect(function () {
        var stopped = false
        var tick = function () {
          fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) })
            .then(function (res) { return res.json() })
            .then(function (data) { if (!stopped && data && data.ok) setStatus(data.status) })
            .catch(function () { /* transient; next tick retries */ })
        }
        tick()
        var timer = setInterval(tick, 3000)
        return function () { stopped = true; clearInterval(timer) }
      }, [])
      return status
    }

    function post(body) {
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) { return res.json() })
    }

    /* ── owner panel pieces ───────────────────────────────────────────── */

    var cardStyle = {
      background: 'var(--dsw-alias-bg-layer-1)',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 12,
      padding: '16px 18px',
    }
    var labelStyle = { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 }
    var buttonStyle = {
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px',
      borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', cursor: 'pointer',
      background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12,
    }
    var codeStyle = {
      fontFamily: 'var(--dsw-font-mono, ui-monospace, Menlo, monospace)',
      fontSize: 30, letterSpacing: 6, fontWeight: 700,
      color: 'var(--dsw-alias-label-primary)',
    }

    function LinkRow(props) {
      var t = props.t
      var label = props.label
      var url = props.url
      var state = React.useState(false)
      var copied = state[0]
      var setCopied = state[1]
      if (!url) return null
      var copy = function () {
        var done = function () { setCopied(true); setTimeout(function () { setCopied(false) }, 1500) }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, done)
        } else {
          var ta = document.createElement('textarea')
          ta.value = url
          document.body.appendChild(ta)
          ta.select()
          try { document.execCommand('copy') } catch (e) { /* noop */ }
          document.body.removeChild(ta)
          done()
        }
      }
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 } },
        h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', flex: 'none', width: 62 } }, label),
        h('code', {
          style: {
            flex: 1, fontSize: 12, fontFamily: 'var(--dsw-font-mono, ui-monospace, Menlo, monospace)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--dsw-alias-label-primary)',
          },
        }, url),
        h('button', { type: 'button', onClick: copy, style: buttonStyle }, copied ? t('copied') : t('copy')),
        h('button', {
          type: 'button', style: buttonStyle,
          title: t('open'), 'aria-label': t('open'),
          onClick: function () { window.open(url, '_blank', 'noopener') },
        }, t('open')),
      )
    }

    // 活动记录（调试用）：默认折叠，点标题展开/收起。
    // 带 hooks 的组件必须以 h(Component, props) 渲染，禁止当普通函数调用。
    function LogCard(props) {
      var t = props.t
      var log = props.log
      var openPair = React.useState(false)
      var open = openPair[0]
      var setOpen = openPair[1]
      var entries = (log || []).slice().reverse()
      return h('div', { style: cardStyle },
        h('div', {
          role: 'button', tabIndex: 0,
          'aria-expanded': open ? 'true' : 'false',
          onClick: function () { setOpen(!open) },
          onKeyDown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(!open) } },
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', userSelect: 'none', color: 'var(--dsw-alias-label-secondary)',
            marginBottom: open ? 6 : 0,
          },
        },
          h('span', { style: Object.assign({}, labelStyle, { marginBottom: 0 }) },
            t('log') + (entries.length ? '（' + String(entries.length) + '）' : '')),
          h('span', { style: { fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' } }, '▾'),
        ),
        open ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' } },
          entries.map(function (entry, index) {
            return h('div', { key: index, style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: 8 } },
              h('span', { style: { flex: 'none', fontFamily: 'var(--dsw-font-mono, monospace)' } }, new Date(entry.time).toLocaleTimeString()),
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, entry.text),
            )
          }),
        ) : null,
      )
    }

    function OwnerPanel() {
      var t = pageT
      var status = useStatus()
      var errState = React.useState('')
      var err = errState[0]
      var setErr = errState[1]

      var act = function (body) {
        return function () {
          post(body).then(function (data) {
            if (!data.ok) setErr(data.error || t('actionFailed'))
            else setErr('')
          }).catch(function (error) { setErr(String(error)) })
        }
      }
      // 停止：断开连接并记标记（侧栏图标不再自动开启，直到手动开启）。
      var stop = function () {
        try { localStorage.setItem(STOP_FLAG, '1') } catch (e) { /* 隐私模式等；不影响断开 */ }
        act({ action: 'set-enabled', value: false })()
      }
      // 手动开启：清除停止标记，恢复侧栏图标的自动开启行为。
      var enable = function () {
        try { localStorage.removeItem(STOP_FLAG) } catch (e) { /* 同上 */ }
        act({ action: 'set-enabled', value: true })()
      }

      if (!status) {
        return h('div', { style: { padding: 24, color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } }, t('loading'))
      }
      return h('div', {
        style: {
          minHeight: 0, boxSizing: 'border-box',
          padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          color: 'var(--dsw-alias-label-primary)', fontSize: 13,
        },
      },
        // Status banner（开启/关闭 + 操作按钮；状态细节不再放标签，保持一行干净）
        h('div', {
          style: Object.assign({ display: 'flex', alignItems: 'center', gap: 10 }, cardStyle, { padding: '12px 16px' }),
        },
          h('span', { style: { fontSize: 14, fontWeight: 700, color: 'var(--dsw-alias-label-primary)' } },
            status.enabled ? t('statusActive') : t('disabled')),
          h('span', { style: { flex: 1 } }),
          h('button', {
            type: 'button', style: buttonStyle,
            onClick: status.enabled ? stop : enable,
          },
            status.enabled ? h(UnplugIcon, { size: 14 }) : h(PlugIcon, { size: 14 }),
            status.enabled ? t('stop') : t('enable'),
          ),
        ),
        // Code card
        h('div', { style: cardStyle },
          h('div', { style: labelStyle }, t('codeLabel') + '（访问 https://…/' + status.code + '）'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
            h('span', { style: codeStyle }, status.code),
            h('span', { style: { flex: 1 } }),
            h('button', {
              type: 'button', style: buttonStyle,
              onClick: function () {
                if (window.confirm(t('confirmRegenerate'))) act({ action: 'regenerate' })()
              },
            }, t('regenerate')),
          ),
          h(LinkRow, { key: 'relay', t: t, label: t('relayUrl'), url: status.enabled ? status.relayUrlPublic : undefined }),
          h(LinkRow, { key: 'direct', t: t, label: t('directUrl'), url: status.directUrl }),
          status.enabled ? null : h('div', { style: { marginTop: 8, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('disabled')),
          // 风险提示（弱化的注释条，收在远程码板块内）：
          // 点侧栏图标即开启，这条是「知情」的最低限度——码等于整台机器的控制权。
          h('div', {
            role: 'note',
            style: { display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, padding: '5px 0', background: 'var(--dsw-alias-bg-base)', borderRadius: 8 },
          },
            h('span', { style: { color: 'var(--dsw-alias-state-warn-primary)', marginTop: 2 } },
              h(AlertIcon, { size: 13 })),
            h('span', {
              style: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' },
            }, t('riskNote')),
          ),
        ),        // Relay-face hosts card（服务器部署面板用；宿主面无此数据）
        (status.relayFace && status.relayFace.hosts && status.relayFace.hosts.length)
          ? h('div', { style: cardStyle },
          h('div', { style: labelStyle }, t('relayFaceHosts')),
          status.relayFace.hosts.map(function (host) {
            return h('div', { key: host.hostId, style: { fontSize: 12, display: 'flex', gap: 8, marginBottom: 4 } },
              h('span', null, host.online ? '🟢' : '⚪'),
              h('span', null, host.name + ' · ' + host.code + (host.online ? '' : '（' + t('offlineHost') + '）')),
            )
          }),
          )
          : null,
        // Log card（调试用途，默认折叠）
        h(LogCard, { t: t, log: status.log }),
        err ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' } }, t('actionFailed') + '：' + err) : null,
      )
    }

    /* ── dialog (shell.overlay) ───────────────────────────────────────── */

    function RemotePanelDialog() {
      var t = pageT
      var pair = usePanelOpen()
      var open = pair[0]
      var setOpen = pair[1]
      var closeRef = React.useRef(null)
      React.useEffect(function () {
        if (!open) return undefined
        var onKey = function (ev) {
          if (ev.key === 'Escape') { ev.stopPropagation(); setOpen(false) }
        }
        document.addEventListener('keydown', onKey)
        var timer = setTimeout(function () { if (closeRef.current) closeRef.current.focus() }, 0)
        return function () {
          document.removeEventListener('keydown', onKey)
          clearTimeout(timer)
        }
      }, [open])
      if (!open) return null
      return h('div', {
        style: {
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
        },
        onClick: function () { setOpen(false) },
      },
        h('div', {
          role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title'),
          style: {
            width: 'min(510px, calc(100vw - 64px))', maxHeight: 'calc(100vh - 96px)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--dsw-alias-bg-overlay)',
            border: '1px solid var(--dsw-alias-border-l1)',
            borderRadius: 14, boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          },
          onClick: function (ev) { ev.stopPropagation() },
        },
          // Header
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: 'none',
            },
          },
            h(RemoteIcon, { size: 18 }),
            h('span', { style: { fontSize: 15, fontWeight: 700, color: 'var(--dsw-alias-label-primary)' } }, t('title')),
            h('span', { style: { flex: 1 } }),
            h('button', {
              type: 'button', ref: closeRef, 'aria-label': t('close'), title: t('close'),
              onClick: function () { setOpen(false) },
              style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
                cursor: 'pointer', fontSize: 14,
              },
            }, '✕'),
          ),
          // Body
          h('div', { style: { overflowY: 'auto', minHeight: 0 } },
            h(OwnerPanel),
          ),
        ),
      )
    }

// ======================================================================
// 注入在 factory(require) 内,可用 factory 的 require 取 react;
// apply 末尾通过 window.__DSH_FEATURED_INIT__(ctx) 注册 tab。
// ======================================================================
// >>> dsh-featured inline (auto-inserted, do not remove markers)
// 精选插件 client 内联模块(由 dsh-featured 的 integrate.sh 自动插入)。
// 这是一段"函数体片段",由 integrate.sh 注入到接入插件 lib/client.js 的
// factory(require) 内部(MARK 之间的内容),因此可以直接用 factory 的 require
// 拿 react,并暴露 window.__DSH_FEATURED_INIT__(ctx) 供 apply 末尾调用。
//
// 为什么不用 DSH 的 require.async 包本地 chunk:chunk URL 必须与 bundle 的
// ?rev= 精确匹配,一旦接入包自己的 bundle 加载失败(如 dsh-app:// 404),
// chunk 永远到不了;内联后 tab 跟随接入插件自己的 bundle,零额外请求。
// 注意:本片段绝不能放到 factory 之外 —— 那样 require 会落到 Node 全局。
//
// 本片段只做「极简入口」:注册精选插件 tab,点开自动安装完整版 dsh-featured,
// 装完由它接管完整功能。卡片/详情/搜索/筛选/申请收录等重逻辑都不在此,
// 全部交给 dsh-featured,这样接入插件只需背上极小的一段代码。
;(function () {
  window.__FEATURED_FACTORY_RAN__ = true
  try {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-plugins-plugin'
    const FULL_PKG = 'dsh-featured'

    const zh = {
      tabLabel: '精选插件',
      welcome: '精选插件完整版(dsh-featured)未安装。',
      installFull: '安装完整版',
      installing: '正在安装完整版…',
      installed: '已安装,刷新后即可使用完整功能。',
      installedShort: '已安装',
      desc: '一个入口逛完社区精选的好插件:搜索、标签筛选、一键安装、README 详情。',
    }
    const en = {
      tabLabel: 'Featured',
      welcome: 'The full Featured plugin (dsh-featured) is not installed.',
      installFull: 'Install full version',
      installing: 'Installing…',
      installed: 'Installed — refresh to use the full experience.',
      installedShort: 'Installed',
      desc: 'One tab for community-featured plugins: search, filter, one-click install, README details.',
    }

    const S = {
      wrap: { padding: '24px 16px', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 },
      title: { fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-primary)' },
      desc: { fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--dsw-alias-label-secondary)' },
      note: { fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--dsw-alias-label-primary)' },
      btn: {
        alignSelf: 'flex-start', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 500,
        padding: '7px 16px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-brand-primary)', color: '#fff',
      },
      btnOff: { opacity: 0.6, cursor: 'default' },
    }

    function FeaturedSection(props) {
      const install = props.install
      const t = props.t || ((k) => zh[k])
      // 已安装判定:宿主路由返回的 installed 表里有 FULL_PKG
      const pair = React.useState('idle') // idle | running | installed
      const st = pair[0], setSt = pair[1]

      React.useEffect(() => {
        if (st !== 'idle') return
        if (typeof install !== 'function') { setSt('installed'); return }
        setSt('running')
        try {
          install({ spec: FULL_PKG, title: t('tabLabel'), version: '' })
          setSt('installed')
        } catch {
          setSt('installed')
        }
      }, [st, install])

      const label = st === 'running' ? t('installing')
        : (st === 'installed' ? t('installedShort') : t('installFull'))

      return h('div', { style: S.wrap },
        h('p', { style: S.desc }, t('desc')),
        st === 'idle' ? h('p', { style: S.note }, t('welcome')) : null,
        h('button', {
          type: 'button',
          style: Object.assign({}, S.btn, st === 'installed' ? S.btnOff : {}),
          disabled: st === 'installed',
          onClick: () => {
            if (st !== 'idle' || typeof install !== 'function') return
            setSt('running')
            try { install({ spec: FULL_PKG, title: t('tabLabel'), version: '' }); setSt('installed') }
            catch { setSt('installed') }
          },
        }, label))
    }

    function initFeatured(ctx) {
      if (typeof window !== 'undefined') window.__FEATURED_INIT_CALLED__ = true
      if (typeof window !== 'undefined' && window.__DSH_FEATURED_APPLIED__) return
      if (typeof window !== 'undefined') window.__DSH_FEATURED_APPLIED__ = true
      if (typeof window !== 'undefined' && window.__DSH_FEATURED_FULL__) {
        // 全量版(dsh-featured 插件)已加载:让位,不注册内联板块,避免双 tab 竞态
        return
      }
      try {
        const localeDisposable = ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugins-plugin: locale')
        const t = ctx.locale.bind(NS)
        let tabDisposable = null
        ctx.slots.inject('plugins.tab', () => {
          tabDisposable = ctx.slots.register({
            name: 'plugins.tab',
            id: 'dsh-plugins-plugin',
            label: () => t('tabLabel'),
            locale: NS,
            priority: 100,
          }, FeaturedSection)
          return tabDisposable
        }, 'dsh-plugins-plugin: featured tab')

        if (typeof window !== 'undefined') {
          window.__DSH_FEATURED_ENTRY__ = {
            kind: 'inline',
            dispose() {
              try { if (typeof tabDisposable === 'function') tabDisposable() } catch { /* 已注销 */ }
              try { if (typeof localeDisposable === 'function') localeDisposable() } catch { /* 已注销 */ }
              window.__DSH_FEATURED_APPLIED__ = false
              window.__DSH_FEATURED_ENTRY__ = null
            },
          }
          window.__FEATURED_OK__ = true
        }
      } catch (e) {
        if (typeof window !== 'undefined') window.__FEATURED_ERR__ = String(e && (e.stack || e.message || e))
      }
    }

    window.__DSH_FEATURED_INIT__ = initFeatured
  } catch (error) {
    console.error('[精选插件] 模块初始化失败', error)
    window.__FEATURED_ERR__ = String((error && (error.stack || error.message)) || error)
  }
})()
// <<< dsh-featured inline
    return {
      name: 'dsh-remote-relay',
      inject: ['slots', 'layout', 'locale'],
      apply: function (ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-remote-relay: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key) { return (zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)) }

        // Sidebar foot: compact action button beside Settings.
        // 经中转透传访问的访客页（relay 注入 __DSH_REMOTE_VISITOR__）不挂远程入口：
        // 属主 API 对访客是跨源拒绝的，面板对他们没有用处，只有桌面端展示。
        if (window.__DSH_REMOTE_VISITOR__ === true) return

        ctx.slots.inject('sidebar.footer.action', function () {
          return ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'dsh-remote-relay-footer',
            order: 10,
            locale: NS,
            label: function () { return pageT('title') },
          }, FooterAction)
        })

        // Application-level floating layer: the dialog itself.
        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-remote-relay-overlay',
            order: 20,
            locale: NS,
          }, RemotePanelDialog)
        })
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // 精选插件
      },
    }
  },
})
