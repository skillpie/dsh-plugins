# dsh-plugins-plugin(精选插件)

在 DSH 官方插件页新增「精选推荐」板块,聚合展示各接入插件推荐收录的精选插件(多插件接入只显示一块),支持查看 README 详情与一键安装。数据来自集中维护的 [plugins.json](./plugins.json)(jsdelivr 分发)。

**本包是一个 npm 库,不是独立插件** —— 其他插件通过 `integrate.sh` 把功能接入自己,用户装任何一个接入插件即可获得板块,无需单独安装本包。

## 快速接入

```sh
sh integrate.sh --plugin=dsh-tokenbank
```

脚本行为(幂等,可重复执行):

1. 目标插件 `package.json` 写入 `"dsh-plugins-plugin": "^0.2.0"` 依赖并 `npm install`(npm 源上还没有包时自动符号链接兜底);
2. `lib/index.js` 插入带标记的 `import { integrateFeaturedPlugins } from 'dsh-plugins-plugin/host'` + `FEATURED_SOURCE` 常量块(推荐条目样例,自行编辑),并在 `apply(ctx)` 开头插入调用;
3. `lib/client.featured.js` 拷入包本地 chunk(client 代码,由本包 `embed/featured.client.js` 生成,owner id 已替换),`lib/client.js` 的 `apply` 内插入 `require.async('./client.featured.js')` 调用。

可选参数:`--title=<推荐来源显示名>`、`--list=<JSON 文件>`(用文件内容填充 `entries`)。

其它命令:

```sh
sh integrate.sh --list-targets   # 列出工作区已接入/未接入的插件,不修改
sh integrate.sh --all            # 重跑工作区所有「已接入」插件,同步最新代码
```

## 升级约定(重要)

本包拆成两半,**耦合深度不同**,更新后要做的操作也不同:

| 改动内容 | 接入插件要做什么 |
|---|---|
| 只改 host 半(`embed/featured.host.js`:拉取/聚合/路由/轮询) | 各接入插件目录 `npm update dsh-plugins-plugin` 即可,host 半运行时从包内 import,立即生效 |
| 改 client 半(`embed/featured.client.js`:UI/卡片/markdown/弹窗) | client 不能走 npm 依赖(DSH 模块表限制),必须先 `npm update dsh-plugins-plugin` 更新包,再在本包目录 `sh integrate.sh --all` 重跑一次,把新 chunk 同步进各接入插件 |
| 只改 `plugins.json`(推荐列表内容) | 无需任何操作,它是运行时远程拉取(jsdelivr),推 GitHub 即可 |

记住这个判断:**动了 `embed/featured.client.js` 或本脚本 `integrate.sh` → 跑 `sh integrate.sh --all`;只动了 `embed/featured.host.js` → `npm update` 就够**。拿不准就两个都做,`--all` 是幂等的、秒级、无副作用。

## 为什么 client 半要「拷贝」而不是 npm 依赖

DSH client 侧的浏览器 `require` 只认平台 seed 表那 11 个包(react、@deepseek-ai/cordis、@deepseek-ai/dsh-client-ui-slots 等),拿不到任意 npm 包;且运行时 `window.__ModuleLoader__.load({ id })` 只会把 factory 存进表、不建 cordis fiber,`apply` 永不执行。所以 client 代码必须落成接入插件的**包本地 chunk** `lib/client.featured.js`,由接入插件自己的 `apply` 经 `require.async('./client.featured.js')` 加载——tab 注册发生在活跃 graph 条目的 apply 内,多插件接入也只渲染一块。

## 多插件接入

- 板块与聚合路由由**最先激活**的接入方持有(通过跨插件服务 `featured-plugins` 判重),其余接入方只贡献数据;
- client 侧用 `window.__DSH_FEATURED_APPLIED__` 判重,板块只渲染一块。

## 推荐条目

`FEATURED_SOURCE.entries` 是本插件的补充推荐;集中列表维护在仓库根的 `plugins.json`(由 `scripts/enrich.mjs` 从官方目录 enrich),宿主每 5 分钟拉取一次,远程条目优先、按包名去重。

条目字段:`package`(必填)/ `title`(必填)/ `description` / `version` / `icon` / `homepage` / `author` / `category` / `screenshots[]` / `stars` / `downloads` / `tags[]`。

## 目录结构

```
embed/featured.host.js    宿主半:服务判重 + 远程目录 + 已安装轮询 + 聚合路由
embed/featured.client.js  client 半:包本地 chunk 源,export initFeatured(ctx) 注册「精选推荐」tab
integrate.sh              一键接入脚本(支持 --all / --list-targets)
plugins.json              集中推荐目录
scripts/enrich.mjs        目录富化(官方 catalog join + 退化探测)
lib/                      旧独立插件形态保留(./standalone 导出,已弃用)
test/                     冒烟:node test/embed.mjs(嵌入) / node test/plugin.mjs(standalone 回归)
```

## License

MIT
