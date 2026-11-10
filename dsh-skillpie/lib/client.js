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
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
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
            onLoad: function () { setLoaded(true) },
            style: { width: '100%', height: '100%', border: 'none', display: 'block' },
          }),
        ),
      )
    }

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
            id: 'skillpie-market',
            order: 25,
            locale: NS,
            label: function () { return pageT('title') },
          }, PieIcon)
        })

        // Full-page embedded marketplace view (sidebar stays visible).
        ctx.slots.inject('main', function () {
          return ctx.slots.register({
            name: 'main',
            key: 'skillpie-market',
            locale: NS,
          }, EmbeddedMarket)
        })
      },
    }
  },
})
