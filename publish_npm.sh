#!/usr/bin/env bash
# publish_npm.sh — DSH 插件 npm 发布一条龙（预检 → 发布 → 等索引 → 同步镜像）
#
# 用法（在插件目录里执行，默认发布该目录 package.json 的包）:
#   ../publish_npm.sh --dry-run        # 只做预检，不发布
#   ../publish_npm.sh                  # 发布（索引/镜像校验转后台异步，立即返回）
#   ../publish_npm.sh --wait           # 发布后前台等待官方索引 + 镜像同步（旧行为）
#   ../publish_npm.sh @skillpie/dsh-x  # 显式指定包名（默认取 package.json）
#
# 前置（一次性）:
#   1. ~/.npmrc 配官方源 token: //registry.npmjs.org/:_authToken=npm_xxx
#      token 用 Granular Access Token（权限 Read and write），普通 token 发布会被
#      403 要求 2FA（此时只能 npm publish --otp=123456 人工给码）。
#   2. scoped 包 package.json 里设 publishConfig.access = "public"。
#   3. 首次发布前查名: npm view <包名> 返回 404 = 名字可用。
#
# 本机默认 registry 是 npmmirror（~/.npmrc 的 registry= 行），所以官方源操作
# 全部显式带 --registry=https://registry.npmjs.org/，绝不能省。
set -euo pipefail

OFFICIAL="https://registry.npmjs.org"
MIRROR="https://registry.npmmirror.com"
DRY_RUN=false
WAIT=false
PKG_ARG=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --wait) WAIT=true ;;
    *) PKG_ARG="$arg" ;;
  esac
done

# ── 0. 定位包名与版本 ──────────────────────────────────────────────
command -v node >/dev/null || { echo "❌ 需要 node"; exit 1; }
[ -f package.json ] || { echo "❌ 请在插件目录里运行（需要 package.json）"; exit 1; }
PKG=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
[ -n "$PKG_ARG" ] && [ "$PKG_ARG" != "$PKG" ] && echo "⚠️ 参数包名($PKG_ARG)与 package.json($PKG)不一致，以 package.json 为准"
PKG_ENC=$(printf '%s' "$PKG" | sed 's/@/%40/g; s/\//%2F/g')
echo "📦 包: $PKG@$VERSION"

# ── 1. 发布身份预检 ────────────────────────────────────────────────
grep -q "^//registry.npmjs.org/:_authToken=" ~/.npmrc \
  || { echo "❌ ~/.npmrc 缺少官方源 token（//registry.npmjs.org/:_authToken=...）"; exit 1; }
WHO=$(npm whoami --registry="$OFFICIAL" 2>/dev/null) \
  || { echo "❌ token 无效或过期，重新生成 Granular Access Token"; exit 1; }
case "$PKG" in
  @*) SCOPE=${PKG%%/*}; SCOPE_NAME=${SCOPE#@}
      [ "$WHO" = "$SCOPE_NAME" ] || echo "⚠️ scope $SCOPE 不属于当前账号 $WHO（应是同名用户/组织），发布将失败" ;;
esac
echo "✅ 发布身份: $WHO"

# ── 2. 质量预检：语法 + 测试 ───────────────────────────────────────
if [ -d lib ]; then
  for f in lib/*.js; do node --check "$f" || { echo "❌ 语法错误: $f"; exit 1; }; done
  echo "✅ lib/*.js 语法检查通过"
fi
# `npm run test --if-present`：无 test 脚本时静默成功（退出 0）；有脚本且失败才非零
if npm run test --if-present --silent >/dev/null 2>&1; then
  echo "✅ 测试通过（或无测试脚本）"
else
  echo "❌ 测试失败，中止发布"; exit 1
fi

# ── 3. 打包清单预检：DSH 插件必须带 patch 文件，绝不带 node_modules ──
PACK_OUT=$(npm pack --dry-run 2>&1)
echo "$PACK_OUT" | grep -q "cordis.patch.yml" \
  || { echo "❌ 打包产物缺 cordis.patch.yml（检查 package.json 的 files 白名单）——DSH 会报 declares no dsh.bundle"; exit 1; }
echo "$PACK_OUT" | grep -qE "node_modules|\.pnpm" \
  && { echo "❌ 打包产物混入 node_modules"; exit 1; } || true
echo "✅ 打包清单正常"

if $DRY_RUN; then
  echo "🏜️ dry-run 结束，未发布。完整流程: 发布 → 后台等官方索引 + 同步镜像"
  exit 0
fi

# ── 4. 发布（显式官方源；scoped 包 access 由 publishConfig 保证）───
echo "🚀 发布 $PKG@$VERSION → $OFFICIAL"
PUB_OUT=$(npm publish --registry="$OFFICIAL" 2>&1) || { echo "$PUB_OUT"; exit 1; }
echo "$PUB_OUT" | tail -2

# ── 5. 校验官方索引 + 触发镜像同步（默认后台异步，--wait 才前台等）──
# 发布成功 ≠ 立刻可安装；新包可能先出现 0.0.0-stage 空壳占位。校验逻辑抽成
# 函数，前台/后台共用，避免并发批量发布时逐个卡在等待窗口里。
VERIFY_LOG="$HOME/.dsh/logs/npm-publish-verify.log"
mkdir -p "$(dirname "$VERIFY_LOG")" 2>/dev/null || true

verify_publish() {
  local seen="" mv="" i
  for i in $(seq 1 40); do
    sleep 15
    seen=$(npm view "$PKG" version --registry="$OFFICIAL" 2>/dev/null || true)
    if [ "$seen" = "$VERSION" ]; then echo "✅ 官方源已索引 latest=$seen"; break; fi
    [ "$seen" = "0.0.0-stage" ] && echo "⏳ 第 $i 次: 出现 stage 空壳占位（首次发布正常现象），继续等待…"
  done
  if [ "$seen" != "$VERSION" ]; then
    echo "❌ 10 分钟内官方源未索引出 ${VERSION}（当前: ${seen}），稍后手动检查 npm view $PKG"
    return 1
  fi
  curl -sf -X PUT "https://registry-direct.npmmirror.com/$PKG_ENC/sync?sync_upstream=true" >/dev/null \
    || echo "⚠️ 触发同步接口失败（不阻塞，镜像也会自动同步）"
  for i in $(seq 1 18); do
    sleep 10
    mv=$(curl -sf "$MIRROR/$PKG_ENC" 2>/dev/null \
         | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).dist-tags.latest||'')}catch{console.log('')}})")
    if [ "$mv" = "$VERSION" ]; then echo "✅ 镜像已同步 latest=$mv，国内可按名安装"; return 0; fi
    echo "⏳ 第 $i 次: 镜像 latest=${mv:-未同步}，继续等待…"
  done
  echo "⚠️ 镜像暂未翻正，可稍后手动触发: curl -X PUT https://registry-direct.npmmirror.com/$PKG_ENC/sync?sync_upstream=true"
  return 0
}

if $WAIT; then
  verify_publish || exit 1
else
  (
    echo "===== $(date '+%F %T') verify $PKG@$VERSION ====="
    verify_publish
    echo
  ) >> "$VERIFY_LOG" 2>&1 < /dev/null &
  disown 2>/dev/null || true
  echo "🔍 索引与镜像校验已转后台（日志: ${VERIFY_LOG}）"
  echo "   需要可安装确认时执行: npm view $PKG version --registry=$OFFICIAL"
fi

# ── 7. 自动刷新精选插件目录里的版本号 ───────────────────────────────
# 精选卡片的「安装」按钮用 plugins.json 的 version 拼 spec，写旧了会装回旧包。
# 只在「工作区收录了这个包」时写（纯库/第三方包自动跳过）。
WORKSPACE=$(cd "$(dirname "$0")" && pwd)
CATALOG="$WORKSPACE/dsh-plugins-plugin/plugins.json"
if [ -f "$CATALOG" ]; then
  node - "$CATALOG" "$PKG" "$VERSION" <<'JS' || echo "⚠️ 刷新 plugins.json 版本号失败（不影响已完成的发布）"
const fs = require('node:fs')
const [file, pkg, version] = process.argv.slice(2)
const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
const entry = (doc.entries || []).find((e) => e.package === pkg)
if (!entry) { console.log(`目录未收录 ${pkg}，跳过版本刷新`); process.exit(0) }
if (entry.version === version) { console.log(`目录版本已是 ${version}`); process.exit(0) }
console.log(`目录版本: ${pkg} ${entry.version} → ${version}`)
entry.version = version
entry.enrichedAt = new Date().toISOString().slice(0, 10)
doc.updated = entry.enrichedAt
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
console.log('已写回 plugins.json（记得随代码一起提交）')
JS
fi

echo
echo "🎉 完成: $PKG@$VERSION"
echo "   官方: $OFFICIAL/$PKG"
echo "   安装: DSH 添加插件 → 输入 $PKG → 官方源索引后可用，大陆镜像源稍后同步"
