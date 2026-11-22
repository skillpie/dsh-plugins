/**
 * dsh-skillpie — Web client half (module-loader bundle).
 *
 * Registers:
 *   - sidebar.panellist icon "skillpie-market" (opens the main view),
 *   - the "Skill marketplace" main view: the SkillPie site itself, embedded
 *     like an in-app browser page (ZCode's skill-market main view), with a
 *     thin toolbar for reload / open-in-browser.
 *
 * The host half's JSON API (/dsh-skillpie/api) stays available for
 * programmatic search/install, e.g. future agent tools.
 *
 * Follows the host UI conventions: theme tokens only, locale service for all
 * visible text, no host primitives imported, no DOM writes outside the React
 * tree. The factory returns the module object (template contract) so the web
 * boot graph can activate it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skillpie',
  factory(require) {
    var React = require('react')
    var h = React.createElement
    var NS = 'dsh-skillpie'
    var MARKET_URL = 'https://skillpie.cn/skills'

    var zh = {
      title: '技能市场',
      reload: '刷新',
      openInBrowser: '在浏览器中打开',
      loading: '正在加载技能市场…',
      loadHint: '如果长时间空白，可能是网络或站点限制；也可以「在浏览器中打开」。',
    }
    var en = {
      title: 'Skill marketplace',
      reload: 'Reload',
      openInBrowser: 'Open in browser',
      loading: 'Loading the SkillPie marketplace…',
      loadHint: 'If this stays blank, check the network or open it in a browser instead.',
    }

    // ── icons (currentColor, theme-aware) ────────────────────────────────
    // ZCodeOnline 同款技能市场图标（lucide Sparkles，24 网格 stroke 风格）。
    function PieIcon(props) {
      var size = props && props.size ? props.size : 16
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }),
        h('path', { d: 'M20 2v4' }),
        h('path', { d: 'M22 4h-4' }),
        h('circle', { cx: 4, cy: 20, r: 2 }),
      )
    }

    function ReloadIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': true,
        style: { display: 'block', flex: 'none' },
      }, h('path', {
        d: 'M12 4a8 8 0 0 1 7.75 6h-2.1A6 6 0 0 0 6.6 12H4.25A8 8 0 0 1 12 4zm-7.75 8h2.1a6 6 0 0 0 11.05 2H19.75A8 8 0 0 1 4.25 12zM12 20a8 8 0 0 1-7.75-6h2.1A6 6 0 0 0 17.4 12h2.35A8 8 0 0 1 12 20z',
        fill: 'currentColor',
      }))
    }

    // Bound per-apply so the locale service resolves the current language.
    var pageT = function (key) { return key }

    /** Full-bleed embedded marketplace page, sidebar stays visible. */
    function EmbeddedMarket() {
      var t = pageT
      var frameRef = React.useRef(null)
      var loadedState = React.useState(false)
      var loaded = loadedState[0]
      var setLoaded = loadedState[1]
      var tickState = React.useState(0)
      var tick = tickState[0]
      var setTick = tickState[1]

      var reload = React.useCallback(function () {
        setLoaded(false)
        setTick(function (value) { return value + 1 })
      }, [])

      return h('div', {
        style: {
          height: '100%', minHeight: 0, boxSizing: 'border-box',
          background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
          display: 'flex', flexDirection: 'column',
        },
      },
        h('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
            borderBottom: '1px solid var(--dsw-alias-border-l1)',
          },
        },
          h(PieIcon, { size: 16 }),
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, t('title')),
          h('span', { style: { flex: 1 } }),
          h('button', {
            type: 'button', onClick: reload,
            title: t('reload'), 'aria-label': t('reload'),
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
              borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', cursor: 'pointer',
              background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12,
            },
          }, h(ReloadIcon), t('reload')),
          h('a', {
            href: MARKET_URL, target: '_blank', rel: 'noopener noreferrer',
            style: {
              display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px',
              borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
              fontSize: 12, textDecoration: 'none',
            },
          }, t('openInBrowser')),
        ),
        h('div', {
          style: { position: 'relative', flex: 1, minHeight: 0, background: '#ffffff' },
        },
          !loaded ? h('div', {
            style: {
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6, padding: 24, textAlign: 'center',
              color: 'var(--dsw-alias-label-secondary)', fontSize: 13,
              background: 'var(--dsw-alias-bg-base)',
            },
          },
            h('div', null, t('loading')),
            h('div', { style: { fontSize: 12 } }, t('loadHint')),
          ) : null,
          h('iframe', {
            key: 'market-frame-' + tick,
            ref: frameRef,
            src: MARKET_URL,
            title: t('title'),
            // 授权内嵌页使用剪贴板(分享/安装复制);桌面 GUI 走 http 时
            // 站点自身还有 execCommand 降级,这里对安全上下文生效。
            allow: 'clipboard-write; clipboard-read',
            onLoad: function () { setLoaded(true) },
            style: { width: '100%', height: '100%', border: 'none', display: 'block' },
          }),
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
      name: 'dsh-skillpie',
      inject: ['slots', 'layout', 'locale'],
      apply: function (ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-skillpie: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key) { return (zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)) }

        // Sidebar panel icon → main view, mirroring ZCode's sidebar entry.
        ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: 'dsh-skillpie',
            order: 25,
            locale: NS,
            label: function () { return pageT('title') },
          }, PieIcon)
        })

        // Full-page embedded marketplace view (sidebar stays visible).
        ctx.slots.inject('main', function () {
          return ctx.slots.register({
            name: 'main',
            key: 'dsh-skillpie',
            locale: NS,
          }, EmbeddedMarket)
        })
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // 精选插件
      },
    }
  },
})
