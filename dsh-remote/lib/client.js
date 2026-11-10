/**
 * dsh-remote — Web client half (module-loader bundle).
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
  id: 'dsh-remote',
  factory(require) {
    var React = require('react')
    var h = React.createElement
    var NS = 'dsh-remote'
    var API = '/dsh-remote/api'

    var zh = {
      title: '远程控制',
      codeLabel: '远程码',
      relayUrl: '中转链接',
      directUrl: '本机直连',
      copy: '复制',
      copied: '已复制',
      relay: '中转站',
      direct: '直连',
      online: '已连接',
      offline: '未连接',
      disabled: '远程控制已关闭',
      visitors: '在线访客',
      none: '暂无',
      allowControl: '允许访客控制会话（关闭为只读）',
      enabledToggle: '启用远程控制',
      regenerate: '重新生成远程码',
      log: '活动记录',
      loading: '正在读取状态…',
      actionFailed: '操作失败',
      confirmRegenerate: '重新生成后旧链接立即失效，确认？',
      relayFaceHosts: '中转面已注册宿主机',
      offlineHost: '离线',
      visitorAt: '接入于',
      close: '关闭',
    }
    var en = {
      title: 'Remote control',
      codeLabel: 'Remote code',
      relayUrl: 'Relay link',
      directUrl: 'Direct link',
      copy: 'Copy',
      copied: 'Copied',
      relay: 'Relay',
      direct: 'Direct',
      online: 'connected',
      offline: 'not connected',
      disabled: 'Remote control is disabled',
      visitors: 'Visitors online',
      none: 'none',
      allowControl: 'Allow visitors to control sessions (off = read-only)',
      enabledToggle: 'Enable remote control',
      regenerate: 'Regenerate remote code',
      log: 'Activity',
      loading: 'Loading status…',
      actionFailed: 'Action failed',
      confirmRegenerate: 'The old link stops working immediately. Regenerate?',
      relayFaceHosts: 'Relay face registered hosts',
      offlineHost: 'offline',
      visitorAt: 'connected at',
      close: 'Close',
    }
    var pageT = function (key) { return key }

    /* ── shared dialog open state (footer button ⇄ overlay) ───────────── */

    var openStore = { open: false, listeners: new Set() }
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

    /* ── sidebar foot action button ───────────────────────────────────── */

    function FooterAction(props) {
      var t = pageT
      var wide = !!(props && props.wide)
      var pair = usePanelOpen()
      var hoverState = React.useState(false)
      var hovered = hoverState[0]
      var setHovered = hoverState[1]
      // ZCode 观感：图标与账号行同行、位于其右端。账号行本身是宿主占用的
      // settingsArea（插件无法插入同排元素），这里用零高覆盖层把 28px 图标
      // 按钮精确叠到账号行的右侧空白处（宽模式 trigger 高 42px + 上下 4px
      // 外边距；收起模式 36x36、上 8px）。
      var wrapperStyle = wide
        ? { position: 'relative', height: 0, width: '100%', zIndex: 2, pointerEvents: 'none' }
        : { position: 'relative', height: 0, width: '36px', margin: '0 auto', zIndex: 2, pointerEvents: 'none' }
      var buttonStyle = wide
        ? { position: 'absolute', top: 11, right: 12 }
        : { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)' }
      return h('div', { style: wrapperStyle },
        h('button', {
          type: 'button',
          title: t('title'),
          'aria-label': t('title'),
          onClick: function () { setPanelOpen(true) },
          onMouseEnter: function () { setHovered(true) },
          onMouseLeave: function () { setHovered(false) },
          onFocus: function () { setHovered(true) },
          onBlur: function () { setHovered(false) },
          style: Object.assign({
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28,
            borderRadius: 8,
            border: '1px solid ' + (hovered ? 'var(--dsw-alias-border-l1)' : 'transparent'),
            background: hovered ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
            color: hovered ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
            cursor: 'pointer', flex: 'none',
            pointerEvents: 'auto',
          }, buttonStyle),
        },
          h(RemoteIcon, { size: 16 }),
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

    function StatusChip(props) {
      var on = props.on
      var text = props.text
      return h('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
          color: on ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
          border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 999,
          padding: '2px 10px',
        },
      },
        h('span', { style: { width: 7, height: 7, borderRadius: 999, background: on ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-border-l1)' } }),
        text,
      )
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
      )
    }

    function Toggle(props) {
      var checked = props.checked
      var onChange = props.onChange
      return h('span', {
        role: 'switch', 'aria-checked': checked ? 'true' : 'false', tabIndex: 0,
        onClick: function () { onChange(!checked) },
        onKeyDown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') onChange(!checked) },
        style: {
          width: 34, height: 20, borderRadius: 999, padding: 2, boxSizing: 'border-box',
          background: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-border-l1))',
          display: 'inline-block', transition: 'background 0.15s', flex: 'none', cursor: 'pointer',
        },
      },
        h('span', {
          style: {
            display: 'block', width: 16, height: 16, borderRadius: 999, background: '#ffffff',
            transform: checked ? 'translateX(14px)' : 'translateX(0)', transition: 'transform 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          },
        }),
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

      if (!status) {
        return h('div', { style: { padding: 24, color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } }, t('loading'))
      }
      var relayText = status.enabled ? (status.relay && status.relay.connected ? t('online') : t('offline')) : t('disabled')
      return h('div', {
        style: {
          minHeight: 0, boxSizing: 'border-box',
          padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          color: 'var(--dsw-alias-label-primary)', fontSize: 13,
        },
      },
        // Header chips
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          StatusChip({ on: status.enabled && status.relay && status.relay.connected, text: t('relay') + ': ' + relayText }),
          status.direct ? StatusChip({ on: true, text: t('direct') }) : null,
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
        ),
        // Controls card
        h('div', { style: cardStyle },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('span', null, t('enabledToggle')),
              Toggle({ checked: status.enabled, onChange: act({ action: 'set-enabled', value: !status.enabled }) }),
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
              h('span', null, t('allowControl')),
              Toggle({ checked: status.allowControl, onChange: act({ action: 'set-control', value: !status.allowControl }) }),
            ),
          ),
        ),
        // Visitors card
        h('div', { style: cardStyle },
          h('div', { style: labelStyle }, t('visitors') + '：' + (status.visitors.length ? String(status.visitors.length) : t('none'))),
          status.visitors.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, status.visitors.map(function (v) {
              return h('div', { key: v.id, style: { fontSize: 12, display: 'flex', gap: 8 } },
                h('code', { style: { fontFamily: 'var(--dsw-font-mono, monospace)' } }, v.id),
                h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } },
                  t('visitorAt') + ' ' + new Date(v.connectedAt).toLocaleTimeString() +
                  (v.sessions && v.sessions.length ? ' · ' + v.sessions.length + ' 会话' : '')),
              )
            }))
            : null,
          status.relayFace && status.relayFace.hosts && status.relayFace.hosts.length
            ? h('div', { style: { marginTop: 12 } },
              h('div', { style: labelStyle }, t('relayFaceHosts')),
              status.relayFace.hosts.map(function (host) {
                return h('div', { key: host.hostId, style: { fontSize: 12, display: 'flex', gap: 8, marginBottom: 4 } },
                  h('span', null, host.online ? '🟢' : '⚪'),
                  h('span', null, host.name + ' · ' + host.code + (host.online ? '' : '（' + t('offlineHost') + '）')),
                )
              }),
            )
            : null,
        ),
        // Log card
        h('div', { style: cardStyle },
          h('div', { style: labelStyle }, t('log')),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' } },
            (status.log || []).slice().reverse().map(function (entry, index) {
              return h('div', { key: index, style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', display: 'flex', gap: 8 } },
                h('span', { style: { flex: 'none', fontFamily: 'var(--dsw-font-mono, monospace)' } }, new Date(entry.time).toLocaleTimeString()),
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, entry.text),
              )
            }),
          ),
        ),
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
            width: 'min(680px, calc(100vw - 64px))', maxHeight: 'calc(100vh - 96px)',
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

    return {
      name: 'dsh-remote',
      inject: ['slots', 'layout', 'locale'],
      apply: function (ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-remote: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key) { return (zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)) }

        // Sidebar foot: compact action button beside Settings.
        ctx.slots.inject('sidebar.footer.action', function () {
          return ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'dsh-remote-footer',
            order: 10,
            locale: NS,
            label: function () { return pageT('title') },
          }, FooterAction)
        })

        // Application-level floating layer: the dialog itself.
        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-remote-overlay',
            order: 20,
            locale: NS,
          }, RemotePanelDialog)
        })
      },
    }
  },
})
