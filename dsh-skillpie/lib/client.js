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
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // dsh-plugins-plugin: 精选推荐板块
      },
    }
  },
})
