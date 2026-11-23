import { installStyles } from './client/styles.js'
import { NS, h } from './client/core/runtime.js'
import { en, zh } from './client/locales.js'
import { GitWindow } from './client/shell/window.js'
import { SettingsTab } from './client/features/settings/view.js'
import { callRpc } from './client/core/rpc.js'
import { registerCloneWorkspace } from './client/features/clone/integration.js'
import { WorkspaceGitAction, WorkspaceBlankBridge } from './client/core/workspace.js'
import { observeWorkspaceNavigation } from './client/core/workspace-navigation.js'
import { installSidebarWorkspaceGit } from './client/core/sidebar-workspaces.js'
import { openGitWindow } from './client/core/state.js'
import { runRegisteredSync, setShortcutCatalog } from './client/shell/header.js'

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

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
function apply(ctx) {
  ctx.effect(function () {
    return installStyles()
  }, 'git: styles')

  ctx.effect(function () {
    return ctx.locale.register(NS, { zh: zh, en: en })
  }, 'git: dictionaries')

  // ⌘⇧S：与标题栏同步按钮同一动作（按跟踪状态合并 fetch / pull / push）。
  // 运行期软注入：不进工厂 inject 依赖——服务缺失（如桌面壳不带 shortcuts 行）
  // 时只有这个子作用域 pending，标题栏 chips 照常渲染；服务存在时立即注册，
  // 并进入平台快捷键设置目录（可重绑）。
  ctx.inject(['shortcuts'], function (shortcutScope) {
    try {
      setShortcutCatalog(shortcutScope.shortcuts.catalog)
      var shortcutT = ctx.locale.bind(NS)
      shortcutScope.effect(function () {
        return shortcutScope.shortcuts.register({
          id: 'dsh-gitx.sync',
          label: function () { return shortcutT('shortcut.sync') },
          aliases: ['git', 'sync', 'fetch', 'pull', 'push', '同步', '拉取', '推送'],
          defaults: {
            // Web 侧白名单仅放行 ⌘⇧* 双修饰组合（与 termbar ⌘⇧K 同款约束）。
            'desktop:macos': { code: 'KeyS', modifiers: ['primary', 'shift'] },
            'web:macos': { code: 'KeyS', modifiers: ['primary', 'shift'] },
          },
          regions: ['page', 'editable', 'terminal'],
          modals: [],
          resolve: function () { return { status: 'handled', run: runRegisteredSync } },
        })
      }, 'git: sync shortcut')
    } catch (error) { console.warn('[dsh-gitx] 快捷键注册跳过/失败（不影响面板）:', error && error.message || error) }
  })

  // Soft injection: a profile without `connection` simply does not render
  // this window, instead of failing client activation.
  ctx.inject(['slots', 'connection'], function (scope) {
    var connection = scope.connection
    var t = scope.locale ? scope.locale.bind(NS) : function (key) { return key }
    registerCloneWorkspace(scope, connection, t)
    scope.inject(['workspaces'], function (workspaceScope) {
      workspaceScope.effect(function () {
        return installSidebarWorkspaceGit(workspaceScope.workspaces.list, function () { return t('window.open') }, function (directory) {
          openGitWindow({ directory: directory })
        })
      }, 'git: sidebar workspace actions')
    })
    scope.inject(['uiWorkspace'], function (navigationScope) {
      navigationScope.effect(function () { return observeWorkspaceNavigation(navigationScope.uiWorkspace) }, 'git: workspace navigation')
    })

    // The top-right corner of the session header. `utilities` is the
    // right-aligned cluster there, so the button sits with the session's own
    // controls instead of at the sidebar foot.
    //
    // Soft registration supports profiles without the session-header seat.
    // The Hero hides that header; the blank composer entry below stays visible.
    scope.slots.inject('conversation.session.header.utilities', function () {
      return scope.slots.register(
        {
          name: 'conversation.session.header.utilities',
          id: 'git',
          order: 40,
          label: function () { return t('panel.title') },
          locale: NS,
        },
        function HeaderGitAction(actionProps) {
          return h(WorkspaceGitAction, {
            ...actionProps,
            // The session this cluster belongs to. `conversation.session.header.*`
            // is a session-scoped slot, so the renderer injects `sessionId` from
            // the built-in session source; the window needs it because it lives
            // in a root-scoped slot with no session binding of its own.
            sessionId: actionProps.sessionId,
            connection: connection,
            t: actionProps.t || t,
          })
        },
      )
    })

    // Composer-surface bridge: settles resolved workspace switches (the ack)
    // and, on the blank New Session page — whose header hides the utilities
    // row — draws the chips in the header corner so every session shows them
    // top-right. Real sessions render nothing here beyond the ack.
    scope.slots.inject('conversation.input.left', function () {
      return scope.slots.register(
        { name: 'conversation.input.left', id: 'git-header-bridge', order: 40, locale: NS },
        function (seatProps) {
          return h(WorkspaceBlankBridge, { ...seatProps, connection: connection, t: seatProps.t || t })
        },
      )
    })

    scope.slots.inject('shell.overlay', function () {
      return scope.slots.register(
        {
          name: 'shell.overlay',
          id: 'git-window',
          order: 40,
          locale: NS,
        },
        function OverlayWindow(overlayProps) {
          return h(GitWindow, {
            connection: connection,
            t: overlayProps.t || t,
          })
        },
      )
    })

    scope.slots.inject('settings.section', function () {
      return scope.slots.register(
        {
          name: 'settings.section',
          id: 'git-plugin',
          order: 60,
          label: function () { return t('panel.title') },
          locale: NS,
          inject: function () { return { connection: connection } },
        },
        function SettingsSection(sectionProps) {
          return h(SettingsTab, {
            run: function (method, payload) {
              return callRpc(connection, method, payload, undefined)
            },
            gitPath: null,
            repo: null,
            onChanged: function () {},
            onToast: function () {},
            t: sectionProps.t || t,
          })
        },
      )
    })
  })
  if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // 精选插件
}

export const name = 'dsh-gitx'
export const inject = ['slots', 'locale']

export { apply }
