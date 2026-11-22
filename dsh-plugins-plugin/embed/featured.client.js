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
// __FEATURED_INLINE_BODY_START__
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
// __FEATURED_INLINE_BODY_END__
