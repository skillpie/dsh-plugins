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
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // dsh-plugins-plugin: 精选推荐板块
      },
    }
  },
})
