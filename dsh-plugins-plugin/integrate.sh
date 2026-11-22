#!/bin/sh
# integrate.sh — 把「精选插件」接入任意 DSH 插件(npm 库依赖方式)。
#
# 用法:
#   sh integrate.sh --plugin=dsh-tokenbank
#   sh integrate.sh --plugin=/abs/path/to/dsh-tokenbank --title=令牌银行 --list=demo.json
#   sh integrate.sh --all    (重跑工作区所有已接入插件,同步 host+client 最新代码)
#   sh integrate.sh --list-targets   (仅列出工作区已接入/可接入的插件,不修改)
#
# 接入方式:
#   1. 目标插件 package.json 增加 dependency "dsh-plugins-plugin": "^0.2.0",
#      并在目标目录 npm install —— 宿主半代码从包内 import,升级只动这一个依赖。
#   2. <target>/lib/index.js 内联 host 模块(embed/featured.host.js 去 export)+ FEATURED_SOURCE
#      常量块(含推荐条目样例,自行编辑),apply(ctx) 开头插入 integrateFeaturedPlugins 调用;
#      同时移除 dsh-plugins-plugin 运行时依赖(卸载不再被依赖守卫拦截)。
#   3. <target>/lib/client.js 文件末尾内联本包的 featured 模块(embed/featured.client.js),
#      apply 末尾插入 window.__DSH_FEATURED_INIT__(ctx) 调用。
#      —— 内联而非运行时 load 新 id:运行时 load 只存 factory 不建 cordis fiber,
#         apply 永不执行(DSH 只从宿主 __DSH_BOOT__ graph 建 fiber)。内联后 tab
#         跟随接入插件自己的 bundle,零额外请求,也不依赖包本地 chunk 路径协商。
#   多插件接入:板块与路由由最先激活的一方持有,其余只贡献数据,只显示一块。
#   幂等:重复执行,已带标记的文件直接跳过。
set -eu

HERE=$(CD= cd -- "$(dirname -- "$0")" && pwd)
SRC_BEGIN='// >>> dsh-plugins-plugin featured source (auto-inserted, do not remove markers)'
SRC_END='// <<< dsh-plugins-plugin featured source'
LOADER_BEGIN='// >>> dsh-plugins-plugin featured loader (auto-inserted, do not remove markers)'
LOADER_END='// <<< dsh-plugins-plugin featured loader'

TARGET=''
TITLE=''
LIST=''
ALL=''
LIST_TARGETS=''

for arg in "$@"; do
  case "$arg" in
    --plugin=*) TARGET=${arg#--plugin=} ;;
    --title=*)  TITLE=${arg#--title=} ;;
    --list=*)   LIST=${arg#--list=} ;;
    --all)      ALL=1 ;;
    --list-targets) LIST_TARGETS=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0 ;;
    *)
      echo "未知参数:$arg(--help 查看用法)" >&2
      exit 2 ;;
  esac
done

# ── 扫描工作区(本包上级目录)下的插件 ─────────────────────────────────
WS=$(cd "$HERE/.." && pwd)
list_plugin_dirs() {
  for d in "$WS"/dsh-*/; do
    [ -d "$d" ] || continue
    b=$(basename -- "$d")
    [ "$b" = "dsh-plugins-plugin" ] && continue
    # 兼容 lib/ 与根目录两种形态(dsh-webkit 无 lib/)
    if [ -f "$d/lib/index.js" ] && [ -f "$d/lib/client.js" ]; then :;
    elif [ -f "$d/index.js" ] && [ -f "$d/client.js" ]; then :;
    else continue; fi
    printf '%s\n' "$b"
  done
}

# 取插件的主脚本目录(lib/ 或根目录),用于检查接入标记
plugin_script_dir() {
  if [ -f "$WS/$1/lib/index.js" ]; then printf '%s\n' "$WS/$1/lib"; else printf '%s\n' "$WS/$1"; fi
}

if [ -n "$LIST_TARGETS" ]; then
  for b in $(list_plugin_dirs); do
    sd=$(plugin_script_dir "$b")
    if grep -q 'dsh-plugins-plugin featured' "$sd/index.js" 2>/dev/null; then
      echo "已接入: $b"
    else
      echo "未接入: $b"
    fi
  done
  exit 0
fi

if [ -n "$ALL" ]; then
  ran=0
  for b in $(list_plugin_dirs); do
    sd=$(plugin_script_dir "$b")
    if grep -q 'dsh-plugins-plugin featured' "$sd/index.js" 2>/dev/null; then
      echo ""
      echo "═══ 重跑接入:$b ═══"
      sh "$0" --plugin="$b" || { echo "✗ $b 接入失败" >&2; exit 1; }
      ran=$((ran + 1))
    fi
  done
  [ "$ran" -gt 0 ] && echo "" && echo "✓ --all 完成,共重跑 $ran 个已接入插件"
  [ "$ran" -eq 0 ] && echo "工作区暂无已接入插件(可用 --list-targets 查看可接入项)"
  exit 0
fi

[ -n "$TARGET" ] || { echo "缺少 --plugin=<目标插件目录|名称>(或 --all / --list-targets)" >&2; exit 1; }

# ── 定位目标目录 ────────────────────────────────────────────────────────
CAND="$TARGET"
case "$TARGET" in
  /*) ;;                                # 绝对路径原样
  */*) CAND="$HERE/$TARGET" ;;          # 相对子路径
  *)                                    # 纯目录名:同级 → 上级 → 当前
    if [ -d "$HERE/$TARGET" ]; then CAND="$HERE/$TARGET"
    elif [ -d "$HERE/../$TARGET" ]; then CAND="$HERE/../$TARGET"
    fi ;;
esac
[ -d "$CAND" ] || { echo "目标插件目录不存在:$TARGET" >&2; exit 1; }
CAND=$(CD= cd -- "$CAND" && pwd)
# ── 定位 lib 目录(兼容文件在根目录的插件,如 dsh-webkit) ─────────────
if [ -f "$CAND/lib/index.js" ] && [ -f "$CAND/lib/client.js" ]; then
  LIB="$CAND/lib"
elif [ -f "$CAND/index.js" ] && [ -f "$CAND/client.js" ]; then
  LIB="$CAND"
else
  echo "目标缺少 index.js/client.js(找不到 lib/ 或根目录形态)$CAND" >&2; exit 1
fi
INDEX="$LIB/index.js"
CLIENT="$LIB/client.js"
PKG="$CAND/package.json"
[ -f "$INDEX" ] || { echo "目标缺少 index.js:$INDEX" >&2; exit 1; }
[ -f "$CLIENT" ] || { echo "目标缺少 client.js:$CLIENT" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "需要 node(>=22)" >&2; exit 1; }

echo "→ 目标插件:$CAND"

# ── 1. package.json:加依赖 + npm install ───────────────────────────────
DEP_VER=$(node -p "JSON.parse(require('fs').readFileSync('$HERE/package.json','utf8')).version")
ID=$(node -e '
  try {
    const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(p.name || process.argv[2]);
  } catch { process.stdout.write(process.argv[2]); }
' "$PKG" "$(basename -- "$CAND")")
TITLE=${TITLE:-$ID}

# host 半与 client 半都内联进目标插件,不再需要 dsh-plugins-plugin 运行时依赖。
# 历史集成可能残留依赖声明/符号链接,这里统一清掉(卸载 dsh-plugins-plugin 不再被拦)。
node - "$PKG" <<'NODE'
const fs = require('fs')
const [pkgPath] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
if (pkg.dependencies && pkg.dependencies['dsh-plugins-plugin'] !== undefined) {
  delete pkg.dependencies['dsh-plugins-plugin']
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log('→ 已从 dependencies 移除 dsh-plugins-plugin(host 半已内联,零运行时依赖)')
}
NODE
if [ -e "$CAND/node_modules/dsh-plugins-plugin" ]; then
  rm -rf "$CAND/node_modules/dsh-plugins-plugin"
  echo "→ 已清理 $CAND/node_modules/dsh-plugins-plugin"
fi

# ── 2. lib/index.js:插入推荐源 + apply 调用(幂等) ──────────────────────
node - "$INDEX" "$ID" "$TITLE" "$LIST" "$HERE/embed/featured.host.js" <<'NODE'
const fs = require('fs')
const [index, id, title, listPath, hostSrc] = process.argv.slice(2)

const BEGIN = '// >>> dsh-plugins-plugin featured source (auto-inserted, do not remove markers)'
const END = '// <<< dsh-plugins-plugin featured source'
const HOST_BEGIN = '// >>> dsh-plugins-plugin featured host (auto-inserted, do not remove markers)'
const HOST_END = '// <<< dsh-plugins-plugin featured host'
const IMPORT_LINE = "import { integrateFeaturedPlugins } from 'dsh-plugins-plugin/host'"
const CALL = 'integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主'

let src = fs.readFileSync(index, 'utf8')

// host 半内联:读本包 embed/featured.host.js,剥掉 export 后整体插入。
// 幂等:已有 HOST 标记 → 版本比对后整块替换;旧形态(裸 import)→ 原位升级。
function hostInline() {
  const raw = fs.readFileSync(hostSrc, 'utf8') // dsh-plugins-plugin/embed/featured.host.js
  const body = raw
    .replace(/^export\s+(?=const|let|var|function|class)/gm, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, '')
    .replace(/^/gm, '  ') // 整体缩进进工厂函数
    .trimEnd()
  // 工厂包裹:ROUTE/SERVICE 等内部名不污染目标插件;只暴露 integrateFeaturedPlugins
  return [HOST_BEGIN,
    'function dshFeaturedHostModule() {',
    body,
    '  return { integrateFeaturedPlugins }',
    '}',
    'const { integrateFeaturedPlugins } = dshFeaturedHostModule()',
    HOST_END].join('\n')
}

function replaceBetween(text, begin, end, next) {
  const head = text.indexOf(begin)
  if (head < 0) return { text, hit: false }
  const tail = text.indexOf(end, head)
  if (tail < 0) throw new Error('HOST 标记不完整(缺结束标记)')
  return { text: text.slice(0, head) + next + text.slice(tail + end.length), hit: true }
}

const inline = hostInline()
{
  const r = replaceBetween(src, HOST_BEGIN, HOST_END, inline)
  if (r.hit) {
    if (r.text === src) {
      console.log('→ index.js host 内联已最新,跳过(幂等)')
    } else {
      src = r.text
      console.log('→ 已把 index.js 的 host 内联块升级到最新版本')
    }
  } else if (src.includes(IMPORT_LINE)) {
    // 旧形态:整行 import 换成内联块(import 行可能在 SRC 标记内)
    src = src.replace(IMPORT_LINE, inline)
    console.log('→ 已把 import 行升级为 host 内联块')
  }
}

if (src.includes(BEGIN)) {
  // SRC(推荐源数据)块已存在:只做 host 内联升级 + 调用行清理,不再重复插 SRC。
  // 调用行幂等:先剔除所有历史调用行,再在 apply 开头补一行。
  const callRe = /^[ \t]*integrateFeaturedPlugins\(ctx, FEATURED_SOURCE\).*$/gm
  const hadCall = callRe.test(src)
  src = src.replace(callRe, '')
  if (!/^integrateFeaturedPlugins\(ctx, FEATURED_SOURCE\)/m.test(src)) {
    const APP_RE2 = /(^|\s)((?:exports\.)?apply\s*(?::\s*|=)?\s*(?:async\s+)?(?:function\s*)?\(\s*ctx\b[^)]*\)\s*(?:=>\s*)?\{)/
    const m = src.match(APP_RE2)
    if (!m) throw new Error('未找到 apply(ctx) 入口')
    const at = src.match(APP_RE2).index + m[1].length + m[2].length
    const nl = src.indexOf('\n', at)
    const nextLine = src.slice(nl + 1)
    const indent = (nextLine.match(/^[ \t]*/) || [''])[0] || '  '
    src = src.slice(0, nl + 1) + indent + CALL + '\n' + src.slice(nl + 1)
    if (hadCall) console.log('→ 已重插 integrateFeaturedPlugins 调用')
    else console.log('→ 已在 apply 开头插入 integrateFeaturedPlugins 调用')
  } else {
    console.log('→ integrateFeaturedPlugins 调用已存在,跳过')
  }
  fs.writeFileSync(index, src)
  process.exit(0)
}

let entriesLiteral
if (listPath) {
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8'))
  if (!Array.isArray(list)) throw new Error('--list 文件必须是数组')
  entriesLiteral = JSON.stringify(list, null, 2)
    .split('\n').map((l) => '    ' + l).join('\n')
} else {
  entriesLiteral = [
    '    // 集中列表在仓库 plugins.json 维护;这里的 entries 只是本插件的补充推荐(可为空):',
    '    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",',
    '    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },',
  ].join('\n')
}

const block = [
  BEGIN,
  inline,
  '',
  `// 精选插件推荐源(dsh-plugins-plugin):`,
  `const FEATURED_SOURCE = {`,
  `  id: ${JSON.stringify(id)}, // 推荐源标识,重复登记以此覆盖`,
  `  title: ${JSON.stringify(title)}, // 「推荐来源」显示名`,
  `  entries: [`,
  entriesLiteral,
  `  ],`,
  `}`,
  END,
].join('\n')

const lines = src.split('\n')
let insertAt = 0
while (insertAt < lines.length) {
  const l = lines[insertAt]
  if (l.startsWith('import ') || l.startsWith("'use strict'") || l.startsWith('"use strict"')) { insertAt++; continue }
  break
}
lines.splice(insertAt, 0, block, '')

let done = false
const APP_RE = /(^|\s)((?:exports\.)?apply\s*(?::\s*|=)?\s*(?:async\s+)?(?:function\s*)?\(\s*ctx\b[^)]*\)\s*(?:=>\s*)?\{)/
for (let i = 0; i < lines.length; i++) {
  if (done) break
  const m = lines[i].match(APP_RE)
  if (!m) continue
  let j = i + 1
  while (j < lines.length && lines[j].trim() === '') j++
  const indent = (lines[j].match(/^[ \t]*/) || [''])[0] || '  '
  lines.splice(j, 0, indent + CALL)
  done = true
}
if (!done) throw new Error('未找到 apply(ctx) 入口,请手动在 apply 开头加入:\n' + CALL)

fs.writeFileSync(index, lines.join('\n'))
console.log('→ 已在 lib/index.js 内联 host 模块 + FEATURED_SOURCE + 调用(零运行时依赖)')
NODE

# ── 3. lib/client.js:内联 featured 模块 + apply 末尾挂 init 调用(幂等) ──
HERE="$HERE" node - "$CLIENT" <<'NODE'
const fs = require('fs')
const path = require('path')
const [client] = process.argv.slice(2)

const SRC = path.join(process.env.HERE, 'embed', 'featured.client.js')

const BEGIN = '// >>> dsh-featured inline (auto-inserted, do not remove markers)'
const END = '// <<< dsh-featured inline'
const OLD_BEGIN = '// >>> dsh-plugins-plugin featured chunk (auto-inserted, do not remove markers)'
const OLD_END = '// <<< dsh-plugins-plugin featured chunk'
// 历史版本的 inline 标记(产品改名之前),重跑时一并替换掉
const LEGACY_BEGIN = '// >>> dsh-plugins-plugin featured inline (auto-inserted, do not remove markers)'
const LEGACY_END = '// <<< dsh-plugins-plugin featured inline'
// init 调用行按前缀识别,兼容任何历史注释尾部
const CALL_PREFIX = 'if (typeof window.__DSH_FEATURED_INIT__ === \'function\') window.__DSH_FEATURED_INIT__(ctx)'
const CALL_LINE = CALL_PREFIX + ' // 精选插件'
// 历史版本的调用行(带 dsh-plugins-plugin 注释),重跑时替换
const LEGACY_CALL_RE = /^[ \t]*if \(typeof window\.__DSH_FEATURED_INIT__ === 'function'\) window\.__DSH_FEATURED_INIT__\(ctx\)[ \t]*\/\/.*$/gm

let src = fs.readFileSync(client, 'utf8')

// 0) 清理旧版(包本地 chunk)接入痕迹
const hadOld = src.includes(OLD_BEGIN) || src.includes('require.async(\'./client.featured.js\')')
for (const marker of [OLD_BEGIN, OLD_END]) {
  const lines = src.split('\n').filter(l => l.indexOf(marker) === -1)
  src = lines.join('\n')
}
src = src.split('\n').filter(l => l.indexOf("require.async('./client.featured.js')") === -1).join('\n')
const staleChunk = path.join(path.dirname(client), 'client.featured.js')
if (fs.existsSync(staleChunk)) {
  fs.unlinkSync(staleChunk)
  console.log('→ 已移除旧版 chunk 文件 client.featured.js')
}
if (hadOld) console.log('→ 已清理旧版 require.async chunk 接入痕迹')

// 1b) 清理标记之外的历史横幅注释。早期版本的 banner 写在 BEGIN 之前,
//     而整块替换都从 BEGIN 开始,永远碰不到它,导致旧文案(含旧产品名)长期残留。
const STALE_BANNER_RE = /^[ \t]*\/\/.*(内联模块|inline module)[^\n]*[。.]?[ \t]*$/m
{
  const lines = src.split('\n')
  const keptLines = []
  let dropped = 0
  for (const line of lines) {
    const t = line.trim()
    // 只删「本模块」的历史横幅:必须是 // 注释且提到内联模块 + 自动插入/请勿手改
    const isStaleBanner = t.startsWith('//') &&
      /内联模块|inline module/.test(t) &&
      /自动插入|请勿手改|auto-inserted|do not (edit|remove)/.test(t) &&
      !t.startsWith(BEGIN) && !t.startsWith(END)
    if (isStaleBanner) { dropped += 1; continue }
    if (dropped > 0 && t === '' && keptLines.length > 0 && keptLines[keptLines.length - 1].trim() === '') continue
    keptLines.push(line)
  }
  if (dropped > 0) {
    src = keptLines.join('\n')
    console.log('→ 已清理 ' + dropped + ' 行历史横幅注释')
  }
}

const body = fs.readFileSync(SRC, 'utf8').split('\n')
  .filter(l => l.indexOf('__FEATURED_INLINE_BODY_START__') === -1 && l.indexOf('__FEATURED_INLINE_BODY_END__') === -1)
  .join('\n').trimEnd()
const block = BEGIN + '\n' + body + '\n' + END

// 括号配对扫描:返回 apply 函数体闭合花括号的下标
const APP_RE = /((?:exports\.|export\s+(?:default\s+)?)?apply\s*(?::\s*|=)?\s*(?:async\s+)?(?:function\s*\*?\s*)?\(\s*ctx\b[^)]*\)\s*(?:=>\s*)?\{)/
function findApplyClose(code) {
  const m = APP_RE.exec(code)
  if (m === null) return -1
  const open = m.index + m[0].length - 1
  let depth = 0
  let mode = 'code'
  let quote = ''
  for (let i = open; i < code.length; i++) {
    const c = code[i]
    const n = code[i + 1]
    if (mode === 'line') { if (c === '\n') mode = 'code'; continue }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i++ } continue }
    if (mode === 'string') { if (c === '\\') { i++; continue } if (c === quote) mode = 'code'; continue }
    if (mode === 'template') {
      if (c === '\\') { i++; continue }
      if (c === '`') { mode = 'code'; continue }
      continue
    }
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i++; continue }
      if (c === '/' && n === '*') { mode = 'block'; i++; continue }
      if (c === '"' || c === "'") { quote = c; mode = 'string'; continue }
      if (c === '`') { mode = 'template'; continue }
      if (c === '/' && startsRegex(code, i)) { mode = 'regex'; continue }
      if (c === '{' || c === '(' || c === '[') { depth++; continue }
      if (c === '}' || c === ')' || c === ']') {
        depth--
        if (depth === 0 && c === '}') return i
        continue
      }
    }
    if (mode === 'regex') {
      if (c === '\\') { i++; continue }
      if (c === '[') { i++; while (i < code.length && code[i] !== ']') { if (code[i] === '\\') i++; i++ } continue }
      if (c === '/') mode = 'code'
      continue
    }
  }
  return -1
}

// 启发式判断 / 是否起始正则字面量
function startsRegex(code, at) {
  let k = at - 1
  while (k >= 0 && /\s/.test(code[k])) k--
  if (k < 0) return true
  return '(,=:[!&|?{};+-*%<>~^'.indexOf(code[k]) !== -1
}

// 1) 内联 featured 模块到 factory(require) 内部 —— 必须在 `return {` 之前,
//    这样片段能直接用 factory 的 require 取 react。
function factoryReturnIndex(code) {
  // 语义定位:factory 体的最终返回语句通常是文件末尾顶层的
  //   `return module.exports`     (CJS 形态,如 dsh-datasource)
  //   `return { name: ...`        (对象字面量形态,如 dsh-tokenbank)
  // 先定位 factory(require) 起点,再在其后找「行首缩进不深于 4 空格」的 return。
  // 手写括号扫描在深度嵌套的 JSX 里容易失真,这里不再逐字符配对。
  const fm = /factory\s*(?::\s*)?\(\s*require\s*\)\s*(?:=>\s*)?\{/.exec(code)
  if (fm === null) return -1
  const from = fm.index + fm[0].length
  const rest = code.slice(from)
  // 末尾顶层 return:优先 module.exports,其次任何 "return {" / "return module"
  const candidates = []
  const re = /^[ \t]{0,6}return\b/gm
  let m
  while ((m = re.exec(rest)) !== null) {
    const abs = from + m.index
    const line = code.slice(abs, abs + 60)
    candidates.push({ abs, line })
  }
  if (candidates.length === 0) return -1
  // 取最后一个(最靠近文件末尾的 factory 导出)
  return candidates[candidates.length - 1].abs
}

// ESM 形态(lib/client.js 源码,无 factory 包裹,如 dsh-gitx):插在首个顶层
// `function apply(ctx)` / `export ... apply` 之前即可 —— 片段是 IIFE,只需
// 能引用到 require,而 ESM 源码本身由构建器打包进 factory,require 天然可见。
function esmInsertIndex(src) {
  const m = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+apply\s*\(/m.exec(src)
  if (m === null) return -1
  return m.index
}

// 历史版本用 dsh-plugins-plugin 作标记,统一升到新标记
for (const [b, e] of [[LEGACY_BEGIN, LEGACY_END]]) {
  if (src.indexOf(b) === -1) continue
  const s0 = src.indexOf(b)
  const e0 = src.indexOf(e, s0)
  if (e0 !== -1) {
    // 标记行之前若紧跟本模块的注释横幅,一并清掉(会被重建)
    // 注意:head 必须严格递减,否则当上一行本身就是 banner 时会原地打转(死循环)。
    let head = s0
    for (;;) {
      if (head <= 0) { head = 0; break }
      const prevNl = src.lastIndexOf('\n', head - 1)
      const lineStart = prevNl + 1
      const line = src.slice(lineStart, head)
      if (line.trim() !== '' && !line.trim().startsWith('//')) break
      if (lineStart >= head) break
      head = lineStart
    }
    // 去掉 head 之前多余的空行,避免重复插入后留下空白
    if (head > 0 && src.slice(0, head).endsWith('\n')) {
      let h2 = head
      while (h2 > 0 && src[h2 - 1] === '\n') h2--
      if (h2 !== head) head = h2 + 1
    }
    src = src.slice(0, head) + block + src.slice(e0 + e.length)
    src = src.replace(/^\s*$/m, '')
    console.log('→ 已把旧标记的内联块升级为新标记')
  }
}

if (src.indexOf(BEGIN) !== -1) {
  if (src.indexOf(body) !== -1) {
    console.log('→ featured 模块已内联且内容最新,跳过(幂等)')
  } else {
    const s0 = src.indexOf(BEGIN)
    const e0 = src.indexOf(END, s0)
    src = src.slice(0, s0) + block + src.slice(e0 + END.length)
    console.log('→ 已更新内联的 featured 模块(版本升级)')
  }
} else {
  let at = factoryReturnIndex(src)
  let mode = 'factory'
  if (at < 0) {
    at = esmInsertIndex(src)
    mode = 'esm'
  }
  if (at < 0) {
    console.error('✗ 未找到 client.js 的 factory(require) 顶层 return 或 function apply(ctx)')
    process.exit(1)
  }
  const lineStart = src.lastIndexOf('\n', at) + 1
  const lineIndent = (src.slice(lineStart, at).match(/^[ \t]*/) || [''])[0]
  const banner = [
    '// ' + '='.repeat(70),
    '// 精选插件(内联模块,由 dsh-featured 的 integrate.sh 自动插入,请勿手改)',
    '// 注入在 factory(require) 内,可用 factory 的 require 取 react;',
    '// apply 末尾通过 window.__DSH_FEATURED_INIT__(ctx) 注册 tab。',
    '// ' + '='.repeat(70),
  ].map(l => lineIndent + l).join('\n')
  const bodyIndented = body.split('\n').map(l => (l.trim() === '' ? '' : lineIndent + l)).join('\n')
  src = src.slice(0, lineStart) + banner + '\n' + BEGIN + '\n' + bodyIndented + '\n' + lineIndent + END + '\n' + src.slice(lineStart)
  console.log(mode === 'factory' ? '→ 已把 featured 模块内联进 factory(require)' : '→ 已把 featured 模块内联进 lib/client.js(ESM 源码,构建后进 dist)')
}

// 2) 清理历史 init 调用行:可能带旧注释,也可能因早期脚本重复插入多行。
//    一律先剔除,再由下面 2b 统一插一行(保持幂等)。
const callLines = src.split('\n')
const kept = callLines.filter((l) => l.trim().indexOf(CALL_PREFIX) !== 0)
const removedCalls = callLines.length - kept.length
if (removedCalls > 0) {
  src = kept.join('\n')
  console.log('→ 已清理 ' + removedCalls + ' 行历史 init 调用')
}

// 2b) apply 末尾插入 init 调用
if (src.indexOf(CALL_LINE) !== -1) {
  console.log('→ apply 内 init 调用已存在,跳过(幂等)')
} else {
  const close = findApplyClose(src)
  if (close < 0) {
    console.error('✗ 未找到 client.js 的 apply(ctx) 入口或括号配对失败')
    process.exit(1)
  }
  const lineStart = src.lastIndexOf('\n', close) + 1
  const lineIndent = (src.slice(lineStart, close).match(/^[ \t]*/) || [''])[0]
  src = src.slice(0, lineStart) + lineIndent + '  ' + CALL_LINE + '\n' + src.slice(lineStart)
  console.log('→ 已在 apply 末尾插入精选插件初始化调用')
}

fs.writeFileSync(client, src)
NODE


# ── 5. 语法自检 ─────────────────────────────────────────────────────────
node --check "$INDEX" && node --check "$CLIENT" \
  && echo "✓ 语法检查通过" \
  || { echo "✗ 语法检查失败,请检查 $INDEX / $CLIENT" >&2; exit 1; }

cat <<EOF

接入完成(npm 库依赖方式)。后续步骤:
  1. (可选)编辑 $INDEX 里 FEATURED_SOURCE.entries,填入本插件的补充推荐。
  2. 重启/重载目标插件(plugin_manager set_plugin <目标> off→on),刷新 GUI。
  3. 打开官方插件页「精选插件」板块验证。
  4. 升级(更新本包):改 host 半 → 各接入插件目录执行 npm update dsh-plugins-plugin;
     改 client 半或本脚本 → 在本包目录执行 sh integrate.sh --all 重跑内联同步。
EOF
