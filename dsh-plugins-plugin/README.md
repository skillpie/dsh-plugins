# dsh-plugins-plugin 精选插件

在官方插件页注入 **「精选插件」** 板块。列表**集中维护**在 GitHub 仓库的 [plugins.json](plugins.json):进入插件页时客户端自动拉取(jsdelivr CDN 为主,raw.githubusercontent 兜底),直接提交该 JSON 即可上/下架推荐,无需改任何插件代码。本地 `featured-plugins` 服务(接入插件登记的推荐源)作为补充合并,按包名去重。

## 维护精选列表

编辑 [plugins.json](plugins.json) 的 `entries` 并提交到 `skillpie/dsh-plugins` 仓库 `main` 分支:

```json
{
  "entries": [
    { "package": "dsh-xxx", "title": "xxx", "description": "一句话亮点",
      "version": "1.2.3", "icon": "https://…/icon.svg", "homepage": "…", "tags": ["效率"] }
  ]
}
```

`package`/`title` 必填,其余可选;jsdelivr 有分钟级缓存,提交后稍等片刻即可生效。

## 架构

- **Host 半**(`lib/index.js`)
  - 提供 cordis 服务 `featured-plugins`:接入插件通过 adapter 调用 `register(source)` 登记推荐源(推荐源 = `{ id, title, entries[] }`,entry = `{ package, title, description?, version?, icon?, homepage?, tags? }`)。
  - 挂载只读路由 `GET /dsh-plugins-plugin/featured`:按 npm 包名聚合去重(先登记者优先),返回 `{ ok, data: { entries, sources } }`(同源校验)。
- **Client 半**(`lib/client.js`):向 `plugins.tab` 槽注册「精选插件」tab,拉取聚合列表渲染卡片;安装走页面的 `install({ spec, title, version })`。
- **接入适配器**(`adapter/dsh-plugins-featured.js`):`integrateFeaturedPlugins(ctx, source)`,经 `ctx.inject(['featured-plugins'], …)` 登记推荐源;dsh-plugins-plugin 未安装时注入 pending、无害。

## 快速接入其他插件

```sh
sh integrate.sh --plugin=dsh-tokenbank
# 或带参数:
sh integrate.sh --plugin=/path/to/dsh-tokenbank --title=令牌银行 --list=entries.json
```

脚本会:拷贝适配器到 `<目标>/lib/`,在 `<目标>/lib/index.js` 插入带标记的 `FEATURED_SOURCE` 常量块与 `apply` 开头的登记调用(幂等,可重复执行),补齐 package.json `files` 白名单,并跑 `node --check`。之后编辑 `FEATURED_SOURCE.entries` 填入真实推荐条目即可。

entry 字段:`package`/`title` 必填;`description`、`version`、`icon`(URL)、`homepage`、`tags`(≤8)可选。

## 安装

```sh
# DSH 内:plugin_manager install_bundle(dsh-plugins-plugin 目录)后 set_plugin off→on
```

## 测试

```sh
node test/plugin.mjs   # 注册表聚合去重 + 路由(sameOrigin/405/聚合) + adapter 集成行为
```
