// dsh-plugins-plugin — client half(在官方插件页注入「精选插件」板块)。
// 与 dsh-market 同款接入方式:向 plugins.tab 槽注册一个 tab。
window.__ModuleLoader__.load({
  id: 'dsh-plugins-plugin',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-plugins-plugin'
    const ROUTE = '/dsh-plugins-plugin/featured'
    // 集中维护的精选列表(GitHub 仓库内 plugins.json):
    // jsdelivr CDN 为主(国内可达),raw.githubusercontent 兜底。
    const REMOTE_URLS = [
      'https://cdn.jsdelivr.net/gh/skillpie/dsh-plugins@main/dsh-plugins-plugin/plugins.json',
      'https://raw.githubusercontent.com/skillpie/dsh-plugins/main/dsh-plugins-plugin/plugins.json',
    ]

    function fetchJson(url, timeoutMs) {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null
      const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs)
      return fetch(url, { headers: { accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
        .then((res) => {
          if (!res.ok) throw new Error('HTTP ' + res.status)
          return res.json()
        })
        .finally(() => clearTimeout(timer))
    }

    // 拉取远程 plugins.json;全部失败返回 null。
    function fetchRemote() {
      let idx = 0
      const attempt = () => {
        if (idx >= REMOTE_URLS.length) return Promise.resolve(null)
        const url = REMOTE_URLS[idx++]
        return fetchJson(url, 8000).catch(attempt)
      }
      return attempt()
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

    // 合并:远程为主,本地聚合路由(接入插件登记的推荐源)为补充,按包名去重(先到者优先)。
    function mergeEntries(remoteEntries, localEntries) {
      const seen = new Set()
      const out = []
      for (const e of remoteEntries.concat(localEntries)) {
        if (seen.has(e.package)) continue
        seen.add(e.package)
        out.push(e)
      }
      return out
    }

    const zh = {
      tabLabel: '精选插件',
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
    }

    const S = {
      wrap: { padding: '12px 0 24px', display: 'flex', flexDirection: 'column', gap: 12 },
      head: { margin: 0 },
      title: { margin: '0 0 2px', fontSize: 16, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      sub: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      grid: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
      card: {
        display: 'flex', flexDirection: 'column', gap: 8, padding: 14,
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12, background: 'var(--dsw-alias-bg-layer-2)',
      },
      cardHead: { display: 'flex', alignItems: 'center', gap: 10 },
      icon: { width: 36, height: 36, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', fontSize: 16, fontWeight: 600, overflow: 'hidden' },
      iconImg: { width: 36, height: 36, objectFit: 'contain' },
      nameCol: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 },
      name: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      pkg: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      desc: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
      authorRow: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
      avatar: { width: 16, height: 16, borderRadius: 999, flex: 'none', display: 'block' },
      author: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      meta: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
      shots: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
      shot: { display: 'block', width: '100%', height: 110, objectFit: 'cover', objectPosition: 'top', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', cursor: 'pointer' },
      foot: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 },
      chip: { fontSize: 11, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      src: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
      btn: {
        flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12,
        padding: '4px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
      },
      btnBusy: { opacity: 0.6, cursor: 'default' },
      btnInstalled: { color: 'var(--dsw-alias-label-secondary)' },
      note: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      retryBtn: {
        alignSelf: 'flex-start', cursor: 'pointer', font: 'inherit', fontSize: 12,
        padding: '4px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent', color: 'var(--dsw-alias-label-primary)',
      },
    }

    // 图标加载失败兜底为首字母。
    function FeaturedIcon(props) {
      const entry = props.entry
      const pair = React.useState(true)
      const ok = pair[0], setOk = pair[1]
      if (entry.icon && ok) {
        return h('span', { style: S.icon }, h('img', { src: entry.icon, alt: '', style: S.iconImg, onError: () => setOk(false) }))
      }
      return h('span', { style: S.icon }, (entry.title || entry.package || '?').trim().charAt(0).toUpperCase())
    }

    // 作者行:GitHub 头像 + 用户名(头像加载失败只隐藏头像)。
    function FeaturedAuthor(props) {
      const author = props.author
      const pair = React.useState(true)
      const ok = pair[0], setOk = pair[1]
      if (!author) return null
      return h('div', { style: S.authorRow },
        ok ? h('img', { src: `https://github.com/${author}.png?size=32`, alt: '', style: S.avatar, onError: () => setOk(false) }) : null,
        h('span', { style: S.author }, author))
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

    function FeaturedCard(props) {
      const e = props.entry
      const t = props.t
      const install = props.install
      const pair = React.useState(false) // busy
      const busy = pair[0], setBusy = pair[1]
      const donePair = React.useState(false) // 已点过安装(对话框提交与否未知,仅避免重复点击)
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

      const btnLabel = done ? t('installed') : (busy ? '…' : t('install'))
      const stats = []
      if (e.downloads != null) stats.push(`↓ ${fmtCount(e.downloads)}`)
      if (e.stars != null) stats.push(`★ ${fmtCount(e.stars)}`)
      return h('li', { style: S.card },
        h('div', { style: S.cardHead },
          h(FeaturedIcon, { entry: e }),
          h('div', { style: S.nameCol },
            h('span', { style: S.name, title: e.title }, e.title),
            e.author ? h(FeaturedAuthor, { author: e.author }) : h('span', { style: S.pkg }, e.package))),
        e.description ? h('p', { style: S.desc }, e.description) : null,
        stats.length || e.version ? h('div', { style: S.meta },
          e.version ? h('span', null, `v${e.version}`) : null,
          stats.map((s, i) => h('span', { key: i }, s))) : null,
        e.screenshots && e.screenshots.length
          ? h('div', { style: S.shots }, e.screenshots.map((url) => h(FeaturedShot, { key: url, url })))
          : null,
        h('div', { style: S.foot },
          e.sourceTitle ? h('span', { style: S.src, title: `${t('recommendedBy')} ${e.sourceTitle}` }, `${t('recommendedBy')} ${e.sourceTitle}`) : null,
          h('button', {
            type: 'button', style: Object.assign({}, S.btn, done ? S.btnInstalled : {}, busy ? S.btnBusy : {}),
            onClick, disabled: busy || done,
          }, btnLabel)))
    }

    function FeaturedSection(props) {
      const install = props.install
      const openPackage = props.openPackage
      void openPackage // 语义对齐 plugins.tab 契约,当前未用
      const t = props.t

      const pair = React.useState({ status: 'loading', entries: [] })
      const state = pair[0], setState = pair[1]
      const noncePair = React.useState(0)
      const nonce = noncePair[0], setNonce = noncePair[1]

      React.useEffect(() => {
        let alive = true
        setState({ status: 'loading', entries: [] })
        // 远程 plugins.json 为主;本地聚合路由(接入插件登记源)为补充。
        Promise.all([
          fetchRemote(),
          fetchJson(ROUTE, 8000).catch(() => null),
        ]).then(([remote, localBody]) => {
          if (!alive) return
          const remoteEntries = (remote && Array.isArray(remote.entries) ? remote.entries : [])
            .map(normalizeRemoteEntry).filter(Boolean)
          const localEntries = localBody && localBody.ok && localBody.data && Array.isArray(localBody.data.entries)
            ? localBody.data.entries
            : []
          const entries = mergeEntries(remoteEntries, localEntries)
          if (!remote && !localEntries.length) {
            setState({ status: 'error', entries: [] })
            return
          }
          setState({ status: entries.length ? 'ready' : 'empty', entries })
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
          h(FeaturedCard, { key: e.package, entry: e, t, install })
        ))))
      }
      return h('div', { style: S.wrap }, kids)
    }

    return {
      name: 'dsh-plugins-plugin',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugins-plugin: locale')

        const t = ctx.locale.bind(NS)

        ctx.slots.inject('plugins.tab', () => ctx.slots.register({
          name: 'plugins.tab',
          id: 'dsh-plugins-plugin',
          label: () => t('tabLabel'),
          locale: NS,
        }, FeaturedSection), 'dsh-plugins-plugin: featured tab')
      },
    }
  },
})
