# DSH 插件接入「精选插件」(dsh-featured)指南 — 供 AI 助手执行

> 本文档写给 **AI 编码助手**(Claude / DeepSeek 等)。你的任务:把用户的 DSH 插件接入精选插件生态,使其出现在 DSH 官方插件页的「精选插件」板块中。
>
> 全程只改用户插件自己的仓库/目录,不 clone 本仓库,不装 dsh-featured。

## 背景(30 秒读懂)

- **dsh-featured** 是一个独立 DSH 插件,在官方插件页新增「精选插件」tab,数据来自 skillpie.cn 的插件目录。
- **接入方式**:在你的插件 package.json 的 `dsh.bundle.patch` 补丁层加一段 patch,把你的插件登记为「精选推荐源」。dsh-featured 启动时会聚合所有已接入插件的推荐,用户在精选 tab 里看到你的插件并一键安装。
- **零代码依赖**:不需要 `npm install dsh-featured`,不进 `dependencies`,只是一段 patch 声明 + 一条收录申请。

## 接入步骤

### 1. 确认插件形态

你的插件目录应有(AGENTS.md 标准骨架):

```
your-plugin/
├── package.json        # name/version/dsh.* 字段齐全
├── cordis.patch.yml    # 补丁层
├── lib/index.js        # host 半
└── ...
```

### 2. 在 cordis.patch.yml 加推荐声明

在补丁层追加(若已有 `dsh.profile.bundles` 等节点,合并进去,不要另起重复键):

```yaml
dsh:
  featured:
    source:
      title: <你的插件中文名>
      entries:
        - package: <你的插件 npm 包名,如 dsh-your-plugin>
          title: <插件名>
          description: <一句话简介,30 字内>
          # version: 可选,建议填
          # icon: 可选,图标 URL
          # tags: 可选,如 [效率, git]
```

YAML 语法自检:`node -e "require('js-yaml').load(require('fs').readFileSync('cordis.patch.yml','utf8'))"`(或用任意 YAML parser)。

### 3. 申请收录到 skillpie 目录(必须)

精选 tab 的最终数据源是 skillpie.cn 数据库,patch 声明只是「聚合通道」。让用户(或你提示用户)完成任一:

- 登录 https://skillpie.cn → 创作中心 → 我的插件 → 发布插件,填包名/简介/截图;
- 或请管理员在后台 /admin/plugins 录入。

包名必须与 npm 发布名完全一致,否则目录匹配不上。

### 4. 验证

- `node --check lib/*.js` 全绿(本次改动只碰 yml,一般不会坏);
- 用户端:DSH 里安装/更新你的插件 + 安装 dsh-featured → 插件页出现「精选插件」tab → 能搜到你的插件;
- 数据侧:`curl https://skillpie.cn/api/plugins?limit=100` 的返回里能 grep 到你的包名。

## 红线(违反即接入无效)

1. 禁止把 `dsh-featured` 写进 dependencies/devDependencies —— 它不是库。
2. 禁止在你的 client 里注册 `id: 'dsh-plugins-plugin'` 或往 `plugins.tab` 槽注册自定义精选板块 —— 旧「内联版」方案已废弃,双注册会造成 tab 竞态。dsh-featured 0.1.12+ 会自动注销残留内联版,但请不要新增。
3. 禁止改动 dsh-featured / 本仓库任何文件;接入 = 改你自己插件 + 申请收录,两步。
4. `version`/`icon` 字段如填,必须是真实可访问的值(icon 用 jsdelivr 直链最佳: `https://cdn.jsdelivr.net/gh/<user>/<repo>@main/<插件目录>/icon.svg`)。

## 提示词(直接转发给接入方 AI)

```text
请把我的 DSH 插件接入「精选插件」生态。严格按 https://github.com/skillpie/dsh-plugins/blob/main/dsh-featured/AI-INTEGRATION.md 执行:
1. 读该文档;
2. 在我的插件 cordis.patch.yml 里加 dsh.featured.source 声明(我的包名: <npm 包名>,中文名: <名称>,一句话简介: <简介>);
3. YAML 改完做语法自检;
4. 提醒我去 skillpie.cn 创作中心申请收录(或告诉我你已经帮我准备好发布信息)。
不要 install dsh-featured,不要注册 plugins.tab 槽,不要动 dsh-featured 仓库。
```
