# DSH 插件接入「精选插件」(dsh-featured)指南 — 供 AI 助手执行

> 本文档写给 **AI 编码助手**(Claude / DeepSeek 等)。你的任务:把用户的 DSH 插件接入精选插件生态。
>
> 全程只改用户插件自己的目录,不改本仓库。

## 背景(30 秒读懂)

- **dsh-featured** 是一个独立 DSH 插件,在官方插件页新增「精选插件」tab,数据来自 skillpie.cn 插件目录。
- **接入方式**:运行官方脚本 `integrate.sh`,它会把一段极简精选入口**内联**进你的插件。效果:**用户只装你的插件(不装 dsh-featured)也会出现「精选插件」tab**,点开可一键安装完整版;已装完整版时内联版自动让位,完整版接管。
- **重要边界**:接入只是为用户提供「精选插件」**入口**,不代表你的插件会出现在精选列表里。是否上榜完全由第 3 步的 skillpie 收录决定。
- **零运行时依赖**:内联后不依赖 dsh-plugins-plugin / dsh-featured 包,多插件接入也只显示一个 tab。

## 接入步骤

### 1. 确认插件形态

你的插件目录应有 `package.json` + `lib/index.js`(host 半,含多行 `apply(ctx) { ... }`)+ `lib/client.js`(client 半,factory 为多行函数体)。

**前置**:host 的 `apply(ctx)` 与 client 的 factory 必须是多行函数体(标准骨架形态)。脚本遇到单行/minified 形态会明确报错,此时先展开为多行再重跑。

### 2. 运行官方接入脚本(核心步骤)

```sh
cd <你的插件目录>
npm i -D dsh-plugins-plugin
sh node_modules/dsh-plugins-plugin/integrate.sh --plugin=.
```

脚本自动做三件事(幂等,重复执行安全):

1. `lib/index.js` 内联推荐源登记模块 + `FEATURED_SOURCE` 常量(`entries` 可留空,见下方说明);
2. `lib/client.js` 内联极简精选入口 —— **这一步让你的插件单独安装时也有「精选插件」tab**;
3. `node --check` 语法自检。

`FEATURED_SOURCE.entries` 是给接入方**推荐别的插件**用的(可留空),**与自己的插件是否上榜无关**,不要把它当成收录申请。

devDependency 用完可删:`npm pkg delete devDependencies.dsh-plugins-plugin`(脚本也会自动清理依赖声明)。

### 3. 提醒用户申请收录(可选上榜)

**接入不等于上榜。** 精选 tab 里的插件卡片来自 skillpie.cn 数据库,只有加精的插件才会展示,与是否接入入口无关。接入完成后,**主动提醒用户**:如果希望自己的插件出现在精选列表里,可以另行申请收录:

- 登录 https://skillpie.cn → 创作中心 → 我的插件 → 发布插件,填包名/简介/截图;发布后点「申请加精」(扣 299 积分),审核通过后带精选标记展示;
- 或请管理员在后台 /admin/plugins 录入。

包名必须与 npm 发布名完全一致;加精审核通过后 5 分钟内(数据缓存 TTL)出现在精选 tab。**收录不是接入的前置条件,不做也完全不影响入口功能。**

### 4. 验证

- `node --check lib/*.js` 全绿(脚本已自检,重跑确认);
- 用户端:只安装你的插件(不装 dsh-featured)→ 插件页出现「精选插件」tab,点开显示「安装完整版」按钮 → 点安装后刷新,完整版接管且仍只有一个 tab;
- 多插件:再装另一个已接入的插件,tab 依然只有一个。
- (若做了第 3 步)`curl 'https://skillpie.cn/api/plugins?limit=100'` 返回里能 grep 到你的包名。

## 红线(违反即接入无效)

1. 禁止把 `dsh-featured` 写进 dependencies/devDependencies —— 它不是运行时依赖。
2. 禁止在 client 里注册 `id: 'dsh-plugins-plugin'` 或往 `plugins.tab` 槽另行注册精选板块 —— 脚本内联的入口已含让位逻辑,自行再注册会造成双 tab。
3. 禁止改动 dsh-featured / 本仓库任何文件;接入 = 跑脚本一步。**可以提醒用户去申请收录,但禁止承诺「接入后会出现在精选列表」**——上榜只由 skillpie 收录/加精决定。
4. 不要为了让自己的插件「出现在精选里」而往 `FEATURED_SOURCE.entries` 塞自己的包 —— 该字段不参与精选目录数据;如填 icon,必须是真实可访问的 URL(jsdelivr 直链最佳:`https://cdn.jsdelivr.net/gh/<user>/<repo>@main/<插件目录>/icon.svg`)。

## 提示词(直接转发给接入方 AI)

```text
请把我的 DSH 插件接入「精选插件」,严格按 https://github.com/skillpie/dsh-plugins/blob/main/dsh-featured/AI-INTEGRATION.md 执行,完成后告诉我还需要我手动做什么。
```
