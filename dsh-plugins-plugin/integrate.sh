#!/bin/sh
# integrate.sh — 把「精选插件」推荐源快速接入任意 DSH 插件。
#
# 用法:
#   sh integrate.sh --plugin=dsh-tokenbank
#   sh integrate.sh --plugin=/abs/path/to/dsh-tokenbank --title=令牌银行 --list=demo
#
# 行为:
#   1. 定位目标插件目录(--plugin 传目录名/相对/绝对路径;也可直接传本仓库
#      下已存在的目录名)。
#   2. 拷贝 adapter/dsh-plugins-featured.js 到 <target>/lib/。
#   3. 在 <target>/lib/index.js 顶部插入带标记的 import + FEATURED_SOURCE
#      常量块(含示例条目,自行编辑),并在 apply(ctx) 开头插入登记调用。
#      幂等:已带标记的文件直接跳过。目标 package.json 的 files 白名单若无
#      "lib" 会自动补上。
#   4. 语法自检(node --check)并打印后续步骤。
set -eu

HERE=$(CD= cd -- "$(dirname -- "$0")" && pwd)
ADAPTER="$HERE/adapter/dsh-plugins-featured.js"
MARK_BEGIN='// >>> dsh-plugins-plugin featured source (auto-inserted, do not remove markers)'
MARK_END='// <<< dsh-plugins-plugin featured source'

TARGET=''
TITLE=''
LIST=''

for arg in "$@"; do
  case "$arg" in
    --plugin=*) TARGET=${arg#--plugin=} ;;
    --title=*)  TITLE=${arg#--title=} ;;
    --list=*)   LIST=${arg#--list=} ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0 ;;
    *)
      echo "未知参数:$arg(--help 查看用法)" >&2
      exit 2 ;;
  esac
done

[ -n "$TARGET" ] || { echo "缺少 --plugin=<目标插件目录|名称>" >&2; exit 2; }
[ -f "$ADAPTER" ] || { echo "找不到适配器:$ADAPTER" >&2; exit 1; }

# ── 定位目标目录 ────────────────────────────────────────────────────────
case "$TARGET" in
  */*) CAND="$TARGET" ;;
  *)   CAND="$HERE/$TARGET" ;;
esac
if [ ! -d "$CAND" ] && [ ! -d "$TARGET" ]; then
  # 再尝试上级目录(脚本被拷走使用的场景)
  CAND="$HERE/../$TARGET"
fi
if [ -d "$TARGET" ]; then CAND=$TARGET; fi
[ -d "$CAND" ] || { echo "目标插件目录不存在:$TARGET" >&2; exit 1; }
CAND=$(CD= cd -- "$CAND" && pwd)
INDEX="$CAND/lib/index.js"
PKG="$CAND/package.json"
[ -f "$INDEX" ] || { echo "目标缺少 lib/index.js:$INDEX" >&2; exit 1; }

# ── 依赖检查 ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "需要 node(>=22)" >&2; exit 1; }

echo "→ 目标插件:$CAND"

# ── 1. 拷贝适配器 ───────────────────────────────────────────────────────
mkdir -p "$CAND/lib"
cp "$ADAPTER" "$CAND/lib/dsh-plugins-featured.js"
echo "→ 已拷贝 lib/dsh-plugins-featured.js"

# ── 2. 对 lib/index.js 做幂等手术(内嵌 node 脚本) ──────────────────────
ID=$(node -e '
  try {
    const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.stdout.write(p.name || process.argv[2]);
  } catch { process.stdout.write(process.argv[2]); }
' "$PKG" "$(basename -- "$CAND")")
TITLE=${TITLE:-$ID}

node - "$INDEX" "$ID" "$TITLE" "$LIST" <<'NODE'
const fs = require('fs')
const [index, id, title, listPath] = process.argv.slice(2)

const BEGIN = '// >>> dsh-plugins-plugin featured source (auto-inserted, do not remove markers)'
const END = '// <<< dsh-plugins-plugin featured source'
const CALL = '  integrateFeaturedPlugins(ctx, FEATURED_SOURCE) // dsh-plugins-plugin: 推荐源登记'

let src = fs.readFileSync(index, 'utf8')

if (src.includes(BEGIN)) {
  console.log('→ 已接入过,跳过(幂等)')
  process.exit(0)
}

// 示例条目:默认留两条注释样例,用户自行替换;--list=<文件> 可导入 JSON。
let entriesLiteral
if (listPath) {
  const list = JSON.parse(fs.readFileSync(listPath, 'utf8'))
  if (!Array.isArray(list)) throw new Error('--list 文件必须是数组')
  entriesLiteral = JSON.stringify(list, null, 2)
    .split('\n').map((l, i) => (i ? '    ' : '    ') + l).join('\n')
} else {
  entriesLiteral = [
    '    // 在此填写要推荐的精选插件(字段见 adapter 说明):',
    '    // { package: "dsh-xxx", title: "xxx", description: "一句话亮点",',
    '    //   version: "1.2.3", icon: "https://…/icon.svg", tags: ["效率"] },',
  ].join('\n')
}

const block = [
  BEGIN,
  `import { integrateFeaturedPlugins } from './dsh-plugins-featured.js'`,
  '',
  `// 精选插件推荐源(dsh-plugins-plugin 接入):`,
  `const FEATURED_SOURCE = {`,
  `  id: ${JSON.stringify(id)}, // 推荐源标识,重复登记以此覆盖`,
  `  title: ${JSON.stringify(title)}, // 「推荐来源」显示名`,
  `  entries: [`,
  entriesLiteral,
  `  ],`,
  `}`,
  END,
].join('\n')

// import/const 块:插到首个 import 之前;没有 import 就插到文件最顶部。
const lines = src.split('\n')
let insertAt = 0
while (insertAt < lines.length) {
  const l = lines[insertAt]
  if (l.startsWith('import ') || l.startsWith("'use strict'") || l.startsWith('"use strict"')) { insertAt++; continue }
  break
}
lines.splice(insertAt, 0, block, '')

// apply(ctx) 开头插登记调用:匹配 `apply(ctx) {` / `apply: function (ctx) {` 等。
let done = false
for (let i = 0; i < lines.length; i++) {
  if (done) break
  const m = lines[i].match(/(^|\s)(apply\s*\(\s*ctx\b[^)]*\)\s*\{|apply\s*:\s*(async\s+)?function\s*\(\s*ctx\b[^)]*\)\s*\{|apply\s*:\s*\(\s*ctx\b[^)]*\)\s*=>\s*\{)/)
  if (!m) continue
  // 函数体首行位置(沿用其缩进)
  let j = i + 1
  while (j < lines.length && lines[j].trim() === '') j++
  const indent = (lines[j].match(/^[ \t]*/) || [''])[0] || '  '
  lines.splice(j, 0, CALL.replace(/^  /, indent))
  done = true
}
if (!done) throw new Error('未找到 apply(ctx) 入口,请手动在 apply 开头加入:\n' + CALL)

fs.writeFileSync(index, lines.join('\n'))
console.log('→ 已在 lib/index.js 插入 FEATURED_SOURCE 与登记调用')
NODE

# ── 3. package.json files 白名单确保含 lib ─────────────────────────────
node - "$PKG" <<'NODE'
const fs = require('fs')
const pkgPath = process.argv[2]
let pkg
try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { process.exit(0) }
if (!Array.isArray(pkg.files)) process.exit(0)
if (!pkg.files.includes('lib')) {
  pkg.files.push('lib')
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log('→ 已把 lib 加入 package.json files 白名单')
}
NODE

# ── 4. 语法自检 ─────────────────────────────────────────────────────────
node --check "$CAND/lib/dsh-plugins-featured.js" && node --check "$INDEX" \
  && echo "✓ 语法检查通过" \
  || { echo "✗ 语法检查失败,请检查 $INDEX" >&2; exit 1; }

cat <<EOF

接入完成。后续步骤:
  1. 编辑 $INDEX 里 FEATURED_SOURCE.entries,填入真实推荐条目。
  2. node --check $INDEX 复核(刚才已自动跑过)。
  3. 确保 dsh-plugins-plugin 已安装启用,然后重启/重载目标插件
     (plugin_manager set_plugin <目标> off→on)。
  4. 打开官方插件页「精选插件」板块验证。
EOF
