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
#   2. <target>/lib/index.js 插入带标记的 import + FEATURED_SOURCE 常量块
#      (含推荐条目样例,自行编辑),apply(ctx) 开头插入 integrateFeaturedPlugins 调用。
#   3. <target>/lib/client.featured.js 拷入包本地 chunk(由本包 embed/featured.client.js
#      生成,id 已替换为目标包名);<target>/lib/client.js 的 apply 内插入
#      require.async('./client.featured.js').then(m => m.initFeatured(ctx)) 调用。
#      —— client 走 DSH 原生 chunk 机制(不能运行时 load 新 id:那不会建 fiber,
#         apply 永不执行)。npm update dsh-plugins-plugin 后重跑本脚本即可同步 client。
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
    [ -f "$d/lib/index.js" ] && [ -f "$d/lib/client.js" ] || continue
    printf '%s\n' "$b"
  done
}

if [ -n "$LIST_TARGETS" ]; then
  for b in $(list_plugin_dirs); do
    if grep -q 'dsh-plugins-plugin featured' "$WS/$b/lib/index.js" 2>/dev/null; then
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
    if grep -q 'dsh-plugins-plugin featured' "$WS/$b/lib/index.js" 2>/dev/null; then
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

node - "$PKG" "$DEP_VER" <<'NODE'
const fs = require('fs')
const [pkgPath, ver] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.dependencies = pkg.dependencies || {}
if (pkg.dependencies['dsh-plugins-plugin'] === '^' + ver) process.exit(0)
pkg.dependencies['dsh-plugins-plugin'] = '^' + ver
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log('→ 已把 dsh-plugins-plugin@^' + ver + ' 写入 dependencies')
NODE

# 已能解析到包就跳过安装(本地开发常用 link/上级 node_modules)
RESOLVE_OK=0
if node -e "require('module').createRequire(process.argv[1] + '/').resolve('dsh-plugins-plugin/host')" "$INDEX" >/dev/null 2>&1; then
  RESOLVE_OK=1
  echo "→ dsh-plugins-plugin 已可解析,跳过安装"
fi
if [ "$RESOLVE_OK" != "1" ]; then
  echo "→ 在目标目录执行 npm install(拿不到网络时,可手动 ln -s 本包到 <target>/node_modules/)"
  if ! (cd "$CAND" && npm install --no-audit --no-fund); then
    # npm 源上还没有这个包(未发布/离线)→ 本地符号链接兜底
    mkdir -p "$CAND/node_modules"
    ln -sfn "$HERE" "$CAND/node_modules/dsh-plugins-plugin"
    echo "→ npm install 失败,已用符号链接兜底:$CAND/node_modules/dsh-plugins-plugin → $HERE"
    echo "  (发版后可在目标目录 npm install 切换为正式依赖)"
  fi
fi

# ── 2. lib/index.js:插入推荐源 + apply 调用(幂等) ──────────────────────
node - "$INDEX" "$ID" "$TITLE" "$LIST" <<'NODE'
const fs = require('fs')
const [index, id, title, listPath] = process.argv.slice(2)

const BEGIN = '// >>> dsh-plugins-plugin featured source (auto-inserted, do not remove markers)'
const END = '// <<< dsh-plugins-plugin featured source'
const CALL = 'integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记 + 嵌入宿主'

let src = fs.readFileSync(index, 'utf8')

if (src.includes(BEGIN)) {
  console.log('→ index.js 已接入过,跳过(幂等)')
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
  `import { integrateFeaturedPlugins } from 'dsh-plugins-plugin/host'`,
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
console.log('→ 已在 lib/index.js 插入 FEATURED_SOURCE 与 integrateFeaturedPlugins 调用')
NODE

# ── 3. lib/client.js:apply 内插 require.async 调用 + 拷 chunk(幂等) ────
HERE="$HERE" node - "$CLIENT" "$ID" <<'NODE'
const fs = require('fs')
const path = require('path')
const [client, id] = process.argv.slice(2)

const CHUNK_SRC = path.join(process.env.HERE, 'embed', 'featured.client.js')
const CHUNK_DST = path.join(path.dirname(client), 'client.featured.js')

const BEGIN = '// >>> dsh-plugins-plugin featured chunk (auto-inserted, do not remove markers)'
const END = '// <<< dsh-plugins-plugin featured chunk'
const CALL = "require.async('./client.featured.js').then(function (m) { if (m && m.initFeatured) m.initFeatured(ctx) }) // dsh-plugins-plugin: 精选推荐板块"

// 1) 拷贝 chunk 到 lib/client.featured.js(替换 owner id 占位符)
const chunkSrc = fs.readFileSync(CHUNK_SRC, 'utf8')
if (!chunkSrc.includes('__FEATURED_OWNER_ID__')) {
  console.error('✗ embed/featured.client.js 缺少 __FEATURED_OWNER_ID__ 占位符(版本不匹配)')
  process.exit(1)
}
const chunk = chunkSrc.split('__FEATURED_OWNER_ID__').join(id)
fs.writeFileSync(CHUNK_DST, chunk)
console.log('→ 已拷贝 client 模块到 lib/client.featured.js(owner id = ' + id + ')')

// 2) client.js 的 apply 内插入 require.async 调用(幂等)
let src = fs.readFileSync(client, 'utf8')
if (src.includes(BEGIN)) {
  console.log('→ client.js 已接入过,跳过(幂等)')
  process.exit(0)
}
const block = BEGIN + '\n' + CALL + '\n' + END
// apply 形态(覆盖工作区各插件写法):apply(ctx) / apply: function(ctx) /
// apply: (ctx)=> / exports.apply = function / exports.apply = (ctx)=>
const APP_RE = /(^|\s)((?:exports\.)?apply\s*(?::\s*|=)?\s*(?:async\s+)?(?:function\s*)?\(\s*ctx\b[^)]*\)\s*(?:=>\s*)?\{)/
let inserted = false
const lines = src.split('\n')
for (let i = 0; i < lines.length && !inserted; i++) {
  const m = lines[i].match(APP_RE)
  if (!m) continue
  let j = i + 1
  while (j < lines.length && lines[j].trim() === '') j++
  const indent = (lines[j].match(/^[ \t]*/) || [''])[0] || '  '
  lines.splice(j, 0, indent + CALL)
  inserted = true
}
if (!inserted) {
  console.error('✗ 未找到 client.js 的 apply(ctx) 入口,请手动在 apply 开头加入:')
  console.error('  ' + CALL)
  process.exit(1)
}
fs.writeFileSync(client, lines.join('\n'))
console.log("→ 已在 lib/client.js 的 apply 内插入 require.async('./client.featured.js') 调用")
NODE

# ── 4. package.json files 白名单确保含 chunk(依赖 lib 或显式 chunk 文件名) ──
LIB="$LIB" node - "$PKG" <<'NODE'
const fs = require('fs')
const path = require('path')
const pkgPath = process.argv[2]
const lib = process.env.LIB
let pkg
try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { process.exit(0) }
if (!Array.isArray(pkg.files)) process.exit(0)
// chunk 文件(client.featured.js)必须随 npm 包分发,否则接入方安装后 require.async 404。
// 它要么在 lib/ 子目录(lib 已含则够),要么在根目录(需显式加 client.featured.js)。
const pkgRoot = path.dirname(pkgPath)
const chunkRel = path.relative(pkgRoot, path.join(lib, 'client.featured.js')).split(path.sep).join('/')
let changed = false
if (pkg.files.includes('lib') && path.dirname(chunkRel) === 'lib') {
  // lib 已含,chunk 随 lib 一起分发
} else if (!pkg.files.includes(chunkRel)) {
  pkg.files.push(chunkRel)
  changed = true
}
if (changed) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log('→ 已把 ' + chunkRel + ' 加入 package.json files 白名单')
}
NODE

# ── 5. 语法自检 ─────────────────────────────────────────────────────────
node --check "$INDEX" && node --check "$CLIENT" \
  && echo "✓ 语法检查通过" \
  || { echo "✗ 语法检查失败,请检查 $INDEX / $CLIENT" >&2; exit 1; }

cat <<EOF

接入完成(npm 库依赖方式)。后续步骤:
  1. (可选)编辑 $INDEX 里 FEATURED_SOURCE.entries,填入本插件的补充推荐。
  2. 重启/重载目标插件(plugin_manager set_plugin <目标> off→on),刷新 GUI。
  3. 打开官方插件页「精选推荐」板块验证。
  4. 升级(更新本包):改 host 半 → 各接入插件目录执行 npm update dsh-plugins-plugin;
     改 client 半或本脚本 → 在本包目录执行 sh integrate.sh --all 重跑同步 chunk。
EOF
