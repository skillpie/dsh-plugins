// dsh-featured — 精选插件 client 半。
//
// 正式 DSH bundle:向官方插件页 plugins.tab 槽注册「精选插件」tab,
// 带搜索栏、标签筛选、申请收录入口与 README 详情弹窗。
//
// 与内联欢迎页(历史集成自带)的关系:
//   - 两者用同一个 slot id(兼容常量,见 apply),页面只显示一个 tab;
//   - 本插件启动时若发现内联版已注册,先调它的 disposer 注销(GitHub 上挂
//     window.__DSH_FEATURED_ENTRY__),再注册完整版 —— 干净替换,不靠 priority 遮蔽。
//   - 内联版保持原样不动(已发布,有人下载);本插件装上后自动接管。
window.__ModuleLoader__.load({
  id: 'dsh-featured',
  __FEATURED_FULL__: true,
  factory(require) {
    // 模块加载期即挂标记(早于所有插件 apply),内联版据此让位,从根上避免双 tab 竞态
    try {
      const w = typeof globalThis !== 'undefined' ? globalThis.window : undefined
      if (w) w.__DSH_FEATURED_FULL__ = true
    } catch { /* 非浏览器环境忽略 */ }

    const React = require('react')

    const h = React.createElement

    const NS = 'dsh-featured'
    const ROUTE = '/dsh-featured/featured'
    const DETAIL_ROUTE = '/dsh-featured/detail'
    // 数据统一由宿主半提供:host 从 skillpie 公开接口分页拉取
    // 「插件分类 + 插件列表 + 详情(readme 内嵌)」,client 只读本地路由,永远新鲜。

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

    // 远程条目规范化(与 host 半 toEntry 对齐的宽松版)。
    // readme/detail/screenshots 等富字段已由 skillpie 数据库随列表返回,这里原样放行。
    function normalizeRemoteEntry(raw) {
      if (!raw || typeof raw !== 'object') return null
      const pkg = String(raw.package || raw.name || '').trim()
      const title = String(raw.title || '').trim()
      if (!pkg || !title) return null
      const entry = { package: pkg, title, source: 'skillpie' }
      for (const key of ['detail', 'description', 'version', 'spec', 'icon', 'homepage', 'author', 'category', 'categoryDisplayName', 'readme']) {
        if (raw[key] != null && raw[key] !== '') entry[key] = raw[key]
      }
      if (raw.categoryId) entry.categoryId = raw.categoryId
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
      tabLabel: '精选插件',
      install: '安装',
      installed: '已安装',
      installed_short: '✓ 已安装',
      loading: '加载中…',
      error: '加载失败',
      retry: '重试',
      empty: '暂无精选内容',
      searchPlaceholder: '搜索插件名称、简介或标签…',
      allTags: '全部',
      apply: '申请收录',
      count: (n) => `${n} 个插件`,
      noMatch: '没有匹配的插件,换个关键词试试',
      recommendedBy: '推荐',
      close: '关闭',
      readmeLoading: 'README 加载中…',
      readmeError: 'README 读取失败',
      applyTitle: '申请收录到精选插件',
      applyDesc: '精选插件列表在 GitHub 仓库集中维护,提交一个 Pull Request 即可收录你的插件。',
      applyStep1: 'Fork 仓库 skillpie/dsh-plugins',
      applyStep2: '在 plugins.json 的 entries 里加一条',
      applyStep3: '提交 Pull Request,等待合并后自动生效',
      applyOpen: '打开仓库',
      applyOk: '知道了',
      exampleTitle: '示例条目',
    }
    const en = {
      tabLabel: 'Featured',
      install: 'Install',
      installed: 'Installed',
      installed_short: '✓ Installed',
      loading: 'Loading…',
      error: 'Failed to load',
      retry: 'Retry',
      empty: 'Nothing featured yet',
      searchPlaceholder: 'Search by name, description or tag…',
      allTags: 'All',
      apply: 'Submit plugin',
      count: (n) => `${n} plugin${n === 1 ? '' : 's'}`,
      noMatch: 'No plugin matches your search',
      recommendedBy: 'Recommended by',
      close: 'Close',
      readmeLoading: 'Loading README…',
      readmeError: 'Failed to load README',
      applyTitle: 'Submit your plugin',
      applyDesc: 'The featured list is maintained in a GitHub repository. Open a Pull Request to add yours.',
      applyStep1: 'Fork skillpie/dsh-plugins',
      applyStep2: 'Add an entry to entries in plugins.json',
      applyStep3: 'Open a Pull Request; it goes live once merged',
      applyOpen: 'Open repository',
      applyOk: 'Got it',
      exampleTitle: 'Example entry',
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
      viewer: { position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      viewerImg: { maxWidth: '82vw', maxHeight: '82vh', borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.5)', background: 'var(--dsw-alias-bg-layer-1)' },
      viewerBtn: { position: 'absolute', width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      viewerCount: { position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.85)', fontSize: 12 },
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
      // ── 完整版工具栏:搜索栏 + 标签筛选 + 申请收录入口 ──
      toolbar: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      search: {
        flex: '1 1 220px', minWidth: 160, font: 'inherit', fontSize: 13, padding: '6px 10px',
        border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', outline: 'none',
      },
      tabBar: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
      tabBtn: {
        cursor: 'pointer', font: 'inherit', fontSize: 12, padding: '4px 12px', borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-primary)',
      },
      tabBtnActive: {
        cursor: 'pointer', font: 'inherit', fontSize: 12, padding: '4px 12px', borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontWeight: 600,
      },
      applyBtn: {
        flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, padding: '5px 12px', borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent', color: 'var(--dsw-alias-label-primary)',
      },
      count: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', flex: 'none' },
    }

    // GitHub mark(octicon mark-github 16x16 路径)
    const GH_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'

    // 包名行:npm 包名(左,等宽)+ 数据(右,同行);整行可点开详情弹窗。
    // 不展示作者信息(不依赖 awesome-dsh-plugin 的 author 字段)。
    function FeaturedAuthor(props) {
      const e = props.entry
      const pkg = e.package
      const meta = props.meta
      const onDetail = props.onDetail
      if (!pkg && !meta && !e.author) return null
      return h('div', { style: S.authorRow, onClick: onDetail },
        pkg ? h('span', { style: S.author, title: pkg }, pkg) : null,
        e.author ? h('span', { style: S.author, title: e.author }, '@' + e.author) : null,
        meta ? h('span', { style: S.meta }, meta) : null)
    }

    // 截图来源:不依赖目录 screenshots 字段(可能指向别的仓库),直接读
    // 插件自己 npm 包里的 README,提取其中的图片作为截图。
    function readmeBase(entry) {
      return `https://cdn.jsdelivr.net/npm/${entry.package}${entry.version ? '@' + entry.version : ''}/`
    }

    function extractReadmeImages(txt, base) {
      const out = []
      const push = (u) => {
        const a = mdAbsUrl(u, base)
        if (out.indexOf(a) < 0) out.push(a)
      }
      const s = String(txt)
      s.replace(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m0, u) => { push(u); return m0 })
      s.replace(/<img[^>]*\ssrc=["']([^"']+)["']/gi, (m0, u) => { push(u); return m0 })
      // 过滤徽章类小图:svg / shields / badge / CI 字样
      return out.filter((u) => !/\.svg(?:[?#]|$)|shields\.io|badge|travis|circleci|codecov/i.test(u)).slice(0, 8)
    }

    // 尺寸过滤阈值:加载后 宽<240 或 高<160 视为太小(徽章/图标),不进截图区。
    const SHOT_MIN_W = 240
    const SHOT_MIN_H = 160

    function ReadmeShots(props) {
      const entry = props.entry
      const onOpen = props.onOpen
      const pair = React.useState({ status: 'loading', urls: [] })
      const state = pair[0], setState = pair[1]
      const dropPair = React.useState({})
      const drop = dropPair[0], setDrop = dropPair[1]

      React.useEffect(() => {
        let alive = true
        const base = readmeBase(entry)
        fetchText(base + 'README.md', 10000).then((txt) => {
          if (alive) setState({ status: 'ready', urls: extractReadmeImages(txt, base) })
        }).catch(() => {
          const gh = entry.homepage && /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i.exec(entry.homepage)
          if (!gh) { if (alive) setState({ status: 'error', urls: [] }); return }
          const ghBase = `https://cdn.jsdelivr.net/gh/${gh[1]}/${gh[2]}@main/`
          fetchText(ghBase + 'README.md', 10000).then((txt) => {
            if (alive) setState({ status: 'ready', urls: extractReadmeImages(txt, ghBase) })
          }).catch(() => { if (alive) setState({ status: 'error', urls: [] }) })
        })
        return () => { alive = false }
      }, [entry.package])

      const visible = state.urls.filter((u) => !drop[u]).slice(0, 2)
      if (!visible.length) return null
      return h('div', { style: S.shots }, visible.map((url, i) =>
        h('img', {
          key: url, src: url, alt: '', style: S.shot, loading: 'lazy',
          onLoad: (ev) => {
            const im = ev.target || {}
            if (im.naturalWidth && (im.naturalWidth < SHOT_MIN_W || im.naturalHeight < SHOT_MIN_H)) {
              setDrop(Object.assign({}, drop, { [url]: true }))
            }
          },
          onError: () => setDrop(Object.assign({}, drop, { [url]: true })),
          onClick: () => onOpen && onOpen(visible, i),
        })))
    }

    // 截图灯箱:点击缩略图弹出大图,左右按钮切换,Esc/←/→ 键盘可用。
    function ShotViewer(props) {
      const list = props.list
      const onClose = props.onClose
      const pair = React.useState(props.index || 0)
      const idx = pair[0], setIdx = pair[1]
      React.useEffect(() => {
        const onKey = (ev) => {
          if (ev.key === 'Escape') onClose()
          else if (ev.key === 'ArrowLeft') setIdx((i) => (i + list.length - 1) % list.length)
          else if (ev.key === 'ArrowRight') setIdx((i) => (i + 1) % list.length)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose, list.length])
      if (!list.length) return null
      const i = Math.min(idx, list.length - 1)
      const go = (d) => setIdx((i + d + list.length) % list.length)
      return h('div', { style: S.viewer, onClick: (ev) => { if (ev.target === ev.currentTarget) onClose() } },
        h('img', { src: list[i], alt: '', style: S.viewerImg }),
        h('button', { type: 'button', style: Object.assign({}, S.viewerBtn, { top: 16, right: 16 }), onClick: onClose }, '✕'),
        list.length > 1 ? h('button', { type: 'button', style: Object.assign({}, S.viewerBtn, { top: '50%', left: 16, marginTop: -16 }), onClick: () => go(-1) }, '‹') : null,
        list.length > 1 ? h('button', { type: 'button', style: Object.assign({}, S.viewerBtn, { top: '50%', right: 16, marginTop: -16 }), onClick: () => go(1) }, '›') : null,
        list.length > 1 ? h('div', { style: S.viewerCount }, (i + 1) + ' / ' + list.length) : null)
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
      const onShots = props.onShots // 打开截图灯箱(list, idx)
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
      if (typeof e.downloads === 'number' && e.downloads > 0) metaParts.push('↓ ' + fmtCount(e.downloads))
      if (typeof e.stars === 'number' && e.stars > 0) metaParts.push('★ ' + fmtCount(e.stars))
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
        h(FeaturedAuthor, { entry: e, meta: metaText, onDetail }),
        (e.detail || e.description) ? h('p', { style: S.desc, onClick: onDetail }, e.detail || e.description) : null,
        h(ReadmeShots, { entry: e, onOpen: onShots }),
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
        // 优先走宿主半的详情代理(/dsh-featured/detail,skillpie 数据库,10 分钟缓存);
        // 失败再回退 jsdelivr npm 包 README。
        fetchJson(DETAIL_ROUTE + '?package=' + encodeURIComponent(e.package), 10000).then((body) => {
          if (!alive) return
          const entry = body && body.ok && body.data && body.data.entry
          const md = entry && (entry.readme || entry.description)
          if (md && String(md).trim()) {
            setState({ status: 'ready', kids: renderReadme(String(md).trim(), readmeBase(e)) })
            return
          }
          throw new Error('no readme')
        }).catch(() => {
          if (!alive) return
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
          (e.detail || e.description) ? h('p', { style: S.panelDesc }, e.detail || e.description) : null,
          h('div', { style: S.panelBody },
            state.status === 'loading' ? h('p', { style: S.mdNote }, t('readmeLoading')) : null,
            state.status === 'error' ? h('p', { style: S.mdNote }, t('readmeError')) : null,
            state.status === 'ready' ? state.kids : null),
          h('div', { style: Object.assign({}, S.panelMeta, { justifyContent: 'flex-end', paddingTop: 10 }) },
            h('button', { type: 'button', style: S.retryBtn, onClick: onClose }, t('close')))))
    }


    // ── 申请收录弹窗(GitHub PR 引导 + 可复制的 JSON 示例)──
    // ── tab 入口:搜索栏 + 标签筛选 + 申请收录 ──
    function FeaturedSection(props) {
      const install = props.install
      void props.openPackage
      const t = props.t

      const pair = React.useState({ status: 'loading', entries: [], installed: {}, categories: [], baseUrl: '' })
      const state = pair[0], setState = pair[1]
      const noncePair = React.useState(0)
      const nonce = noncePair[0], setNonce = noncePair[1]
      const detailPair = React.useState(null)
      const detail = detailPair[0], setDetail = detailPair[1]
      const queryPair = React.useState('')
      const query = queryPair[0], setQuery = queryPair[1]
      const catPair = React.useState('')
      const activeCat = catPair[0], setActiveCat = catPair[1]
      const viewerPair = React.useState(null)
      const viewer = viewerPair[0], setViewer = viewerPair[1]

      React.useEffect(() => {
        let alive = true
        setState({ status: 'loading', entries: [], installed: {}, categories: [], baseUrl: '' })
        fetchJson(ROUTE, 8000).then((body) => {
          if (!alive) return
          const entries = body && body.ok && body.data && Array.isArray(body.data.entries)
            ? body.data.entries.map((raw) => {
          const e = normalizeRemoteEntry(raw)
          if (e && raw && raw.sourceTitle) e.sourceTitle = String(raw.sourceTitle)
          return e
        }).filter(Boolean)
            : []
          const installed = body && body.ok && body.data && body.data.installed && typeof body.data.installed === 'object'
            ? body.data.installed
            : {}
          const categories = body && body.ok && body.data && Array.isArray(body.data.categories)
            ? body.data.categories
            : []
          const baseUrl = body && body.ok && body.data && typeof body.data.baseUrl === 'string'
            ? body.data.baseUrl
            : 'https://skillpie.cn'
          setState({ status: entries.length ? 'ready' : 'empty', entries, installed, categories, baseUrl })
        }).catch(() => {
          if (alive) setState({ status: 'error', entries: [], installed: {}, categories: [], baseUrl: '' })
        })
        return () => { alive = false }
      }, [nonce])

      // 标签集合:所有条目 tags 去重
      const tags = React.useMemo(() => {
        const set = []
        for (const e of state.entries) {
          for (const tg of (e.tags || [])) if (set.indexOf(tg) < 0) set.push(tg)
        }
        return set.slice(0, 12)
      }, [state.entries])

      // 过滤:搜索 + 分类 + 标签
      const visible = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        return state.entries.filter((e) => {
          if (activeCat && e.categoryId !== activeCat && e.category !== activeCat) return false
          if (!q) return true
          const hay = [e.title, e.package, e.detail, e.description, (e.tags || []).join(' ')].join(' ').toLowerCase()
          return hay.includes(q)
        })
      }, [state.entries, query, activeCat])

      const kids = []

      if (state.status === 'loading') {
        kids.push(h('p', { key: 'note', style: S.note }, t('loading')))
      } else if (state.status === 'error') {
        kids.push(h('p', { key: 'note', style: S.note }, t('error')))
        kids.push(h('button', { key: 'retry', type: 'button', style: S.retryBtn, onClick: () => setNonce((n) => n + 1) }, t('retry')))
      } else if (state.status === 'empty') {
        kids.push(h('p', { key: 'note', style: S.note }, t('empty')))
      } else {
        // 工具栏:搜索 + 申请收录
        kids.push(h('div', { key: 'toolbar', style: S.toolbar },
          h('input', {
            type: 'search', value: query, placeholder: t('searchPlaceholder'), style: S.search,
            onChange: (ev) => setQuery(ev.target.value),
          }),
          h('span', { style: S.count }, t('count')(visible.length)),
          h('button', {
            key: 'apply', type: 'button', style: S.applyBtn, title: t('applyTitle'),
            onClick: () => { globalThis.window.open(state.baseUrl + '/profile/plugins', '_blank', 'noopener') },
          }, t('apply'))))
        // 标签筛选(分类优先,其次标签)
        if (state.categories.length) {
          kids.push(h('div', { key: 'cats', style: S.tabBar },
            h('button', {
              type: 'button', style: activeCat ? S.tabBtn : S.tabBtnActive,
              onClick: () => setActiveCat(''),
            }, t('allTags')),
            state.categories.map((c) => h('button', {
              key: c.id, type: 'button',
              style: (activeCat === c.id || activeCat === c.name) ? S.tabBtnActive : S.tabBtn,
              onClick: () => setActiveCat(activeCat === c.id ? '' : c.id),
              title: c.name,
            }, c.displayName))))
        }
        // 标签行已移除(标签太多,筛选入口收进搜索与分类)
        if (visible.length) {
          kids.push(h('ul', { key: 'grid', style: S.grid }, visible.map((e) => (
            h(FeaturedCard, { key: e.package, entry: e, t, install, onDetail: () => setDetail(e), onShots: (list, idx) => setViewer({ list, idx }), installed: !!state.installed[e.package] })
          ))))
        } else {
          kids.push(h('p', { key: 'nomatch', style: S.note }, t('noMatch')))
        }
      }

      return h('div', { style: S.wrap }, kids,
        detail ? h(FeaturedModal, { key: 'detail-' + detail.package, entry: detail, t, onClose: () => setDetail(null) }) : null,
        viewer ? h(ShotViewer, { key: 'viewer', list: viewer.list, index: viewer.idx, onClose: () => setViewer(null) }) : null)
    }

    // 独立插件是唯一「官方完整版」:
    // 1) 若某个接入插件内联了极简版,它会在 window.__DSH_FEATURED_ENTRY__ 挂 disposer ——
    //    先调它注销,避免同 id 两条注册并存(Priority 遮蔽虽可用,但干净替换更可靠)。
    // 2) 再用同一 slot id 注册完整版,页面上始终只有一个「精选插件」tab。
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-featured: locale')
      const t = ctx.locale.bind(NS)

      // 取 globalThis.window:DSH 真实运行是浏览器全局;测试/SSR 下可能被替换。
      try {
        const w = typeof globalThis !== 'undefined' ? globalThis.window : undefined
        const inline = w && w.__DSH_FEATURED_ENTRY__
        if (inline && typeof inline.dispose === 'function') inline.dispose()
      } catch { /* 内联版不存在或已注销,忽略 */ }

      ctx.slots.inject('plugins.tab', () => ctx.slots.register({
        name: 'plugins.tab',
        id: 'dsh-plugins-plugin',
        label: () => t('tabLabel'),
        locale: NS,
        priority: 0,
      }, FeaturedSection), 'dsh-featured: featured tab')

      // 内联版(接入插件 client 内嵌)的激活顺序不确定:可能在全量版 apply 之后才注册。
      // 这里延迟复查几次 window.__DSH_FEATURED_ENTRY__,发现晚到的内联版立即注销,
      // 保证界面上永远只有一个「精选插件」tab。
      const disposeInlineLater = (delay) => {
        const timer = setTimeout(() => {
          try {
            const w = typeof globalThis !== 'undefined' ? globalThis.window : undefined
            const inline = w && w.__DSH_FEATURED_ENTRY__
            if (inline && typeof inline.dispose === 'function') inline.dispose()
          } catch { /* 忽略 */ }
        }, delay)
        ctx.effect(() => () => clearTimeout(timer))
      }
      disposeInlineLater(0)
      disposeInlineLater(800)
      disposeInlineLater(2500)
    }

    return { name: 'dsh-featured', inject: ['slots', 'locale'], apply }

  },
})
