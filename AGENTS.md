# AGENTS.md

## 编写规则

本说明文档仅记录 AGENT 容易出错的场景或当前工程定制规则,经验需抽象精炼沉淀到「最佳实践」章节(一行一条),通用知识无需沉淀(基模能力会提升)

## 技术栈

**运行时**: dsh 0.2.2-rc.1(桌面/官方 npm 同版) | Node ≥22.13(桌面内置 24.21) | 纯 JS ESM,无构建步骤
**插件依赖**: ws ^8.21.3(@skillpie/dsh-remote) | yauzl ^3.2.0(@skillpie/dsh-market) | pnpm 本地开发/测试依赖
**测试**: node 独立冒烟脚本 `node test/*.mjs`(真实 http+ws 服务器) | agent-browser 无头浏览器验证 UI

## 新建插件最快路径

1. 复制 `dsh-remote/` 的骨架:`package.json`、`cordis.patch.yml`、`locale/{en,zh}.json`、`icon.svg`,改名改造。
2. Host 半:`lib/index.js` 导出 `export default { name, Config, inject, apply }`;Client 半:`lib/client.js` 为 module-loader 工厂。
3. `for f in lib/*.js; do node --check "$f"; done` 逐文件语法检查。
4. 写 `test/*.mjs` 冒烟(桩 webServer + 真实 ws),跑通再接 DSH。
5. `plugin_manager install_bundle(target=插件目录)` 安装;`set_plugin(include:<id>, false→true)` 重载 host 代码。
6. 属主 API `curl` 验状态 → agent-browser 打开 `/<code>/` 截图 → 刷新 GUI 页面看侧栏面板。

## 最佳实践

- 用中文交流和编写注释。
- 开发前加载 `cordis-plugin-development` 技能;写 patch/预设时加载 `cordis-composition-reference`。
- `cordis_inspect_query` 带 `input` 参数的调用会被 Provider 拒绝("input must be an object");精确契约改读 `~/Projects/deepseek-harness` 源码/`lib/types`,或已装包的 `lib/types/**/*.d.ts`。
- 每个插件一个包目录 `dsh-<name>/`;包名、`cordis.patch.yml` 行 id、client loader id 三者保持一致。
- `package.json` 必须声明 `dsh.bundle.patch`、`dsh.client.platform: "web"`、`exports`(含 `./locale/*.json`、`./icon`、`./client`)、`files`、`engines.dsh`。
- Client 半固定形态:`window.__ModuleLoader__.load({ id: '<包名>', factory(require) { ... return { name, inject: ['slots','layout','locale'], apply } } })`。
- Host 半所有注册(路由、监听、定时器)必须包在 `ctx.effect(() => () => disposal)` 里;注入可选服务用 `ctx.inject([...], child => ...)`。
- 安装/启停只走 `plugin_manager`(`install_bundle`/`set_plugin`);禁止手改 profile 的 `package.json` 与 `cordis.patch.yml`。
- Host 代码改动不会 HMR 重载,必须 `set_plugin` off→on;Client 改动需刷新 GUI 页面才生效。
- 可选服务(credentials 等)禁止进 `ctx.inject` 依赖——注入会永远 pending 且 fiber 仍显示 active,路由静默不注册;每请求 `ctx.get('credentials')` 惰性读取(dsh-remote 模式)。timer 服务 inject 子上下文不可达,插件自带定时用原生 setInterval + `ctx.effect` 清理。
- `ctx.inject` 回调内任一 `child.effect` 抛错会让 cordis 回滚整个作用域并 dispose 已注册的路由(现象:探针显示 register 已执行、请求却 405,无任何日志);注入多个服务前先确认每个都在依赖列表里,排障时在 apply 各阶段写 /tmp 探针文件定位。
- 插件自有状态(身份、token、码)写凭据记录 `ctx.credentials.modifyRecord('<包名>/identity', ...)`,返回 `{ kind: 'grant', payload }`;禁止用 `configEditor.edit`(桌面 HMR 事务未关闭时报 "HMR transactions cannot be nested")。
- `sessionController` 的 `list/state/events/observeEvent/observeState/prompt` 第二参必须传 AbortSignal,否则内部 `signal.throwIfAborted` 抛 TypeError;一次性读用 `AbortSignal.timeout(20_000)`。
- 读会话历史:`sessionController.events({ address: { kind: 'session', sessionId }, maxMessages, turnWindow })`,返回 `{ records, hasMore }` 分页对象。
- `webServer.register` 仅支持 `kind: 'exact' | 'prefix'`;`registerUpgrade` 只按精确 pathname 匹配;`registerFallback` 单席位且被 SPA 占用,插件禁止抢占。
- 根路径动态挂载(如 `/<code>`)用 `webServer.register({ kind: 'prefix', path })` 在注册时动态挂载并保存 disposer。
- GUI 透传:宿主 GUI 唯一 WS 端点是 `/api/remote.mux`,协议是 **JSON 文本帧**;拼接必须双向透传 text 与 binary 两种帧。
- GUI 资源由宿主机注入 `<base href="./">` 相对解析,任意 path 前缀挂载均可用;索引请求需带宿主签发的会话 cookie。
- Owner 会话 cookie 用 `ctx.get('connection').authenticatedUrl(origin + '/')` 铸造,只在宿主侧逐请求注入,禁止下发到访客浏览器。
- ws 的 message data 可能是 `Buffer | Buffer[] | ArrayBuffer`;统一走 `toBuffer()` 容错,严禁 `Buffer.concat(非数组)`。
- **所有** socket 监听器、升级回调、HTTP 路由体必须 try/catch:监听器内未捕获异常 = 宿主进程退出(已验证会把桌面端带崩)。
- `handleUpgrade(req, socket, head, cb)` 回调参数是 ws 实例而非 Duplex;关闭用 `ws.close()`/`terminate()`,`socket.raw` 不保证存在。
- Client 半组件用 `h()` 无 JSX;**带 hooks 的组件必须 `h(Component, props)` 渲染**,禁止当普通函数调用(React #310 会炸掉整个 main 槽)。
- Client 样式只用 `--dsw-alias-*` 主题 token;可见文字走 `ctx.locale.register(NS, {zh, en})` + `ctx.locale.bind(NS)`。
- 页面注册:侧栏 `sidebar.panellist` 用 `id`,主区 `main` 用同 `key`;slot 注册用 `ctx.slots.inject(ownerKey, () => ctx.slots.register(..., Component))`。
- 属主 HTTP API 只挂宿主角色(enabled||direct);relay-only 服务器行禁止挂属主 API,否则暴露 regenerate 等操作。
- 同源校验:插件 HTTP API 校验 `Origin` 与 `Host` 同源;访问凭据类操作一律同源限定。
- 每个插件必须带 `test/*.mjs` 冒烟:桩 `webServer`(register/registerUpgrade 存表)+ 真实 http/ws 服务器,不依赖 DSH 进程可跑。
- 真实进程验证:从属主 API 拿远程码 → `agent-browser open http://127.0.0.1:<port>/<code>/` → 截图并读 console 里的 `slot entry crashed`/`connection` 警告。
- 浏览器打开的页面若停在 `about:blank`,先 `agent-browser get url` 确认导航成功,再判断页面是否空白。
- 服务器中转部署用官方 npm 形态:`npm i -g @deepseek-ai/dsh` + `dsh plugin --profile web add <插件目录>`,profile 补丁层覆盖行开启 `relay.enabled`。
- systemd 启动:`dsh web --no-open --host 127.0.0.1 --port <p> --public-url https://<域名> --trusted-host <域名>`;nginx 原样透传 Host 与 WebSocket 升级。
- 服务器上插件依赖需在插件目录内 `npm install --registry=https://registry.npmmirror.com`(link 安装不会代装依赖)。
- 桌面崩溃恢复会把 profile 的 `dsh.profile.bundles` 重置为出厂两项;用 `plugin_manager set_bundle` 逐个恢复用户 bundle。
- relay 前缀透传下,GUI/插件的同源绝对路径 API(`/api/*`、`/dsh-dba/*`)必须由 relay 向代理 HTML 注入 fetch/WebSocket shim 重写到 `/<code>/` 前缀,否则公网访客命中 SPA fallback(POST→405)或无访客态的根 mux(→400);`relay-core.visitorShimScript` 即此实现。
- bridge 收到 `hreq` 帧不可立即 fetch:wss 路径上 `hchunk`/`hend` 是后续独立帧,必须等 body 就绪(`entry.ready`)再 dispatch;本地 pipe 同步送达会掩盖该时序,只在公网复现。
- 插件可选依赖(pg/mysql2)用裸 `import()` 惰性加载:一次解析失败会被 Node ESM 负缓存记住,进程内永久失败(磁盘 `node -e import()` 正常也无效),重启宿主进程才能恢复;诊断时先在磁盘验证解析再怀疑进程。
- 宿主进程日志(journal/stdout)看不到插件 `logLine`——它只写内存环,经属主 API 暴露;relay-only 服务器上属主 API 关闭时日志不可见,排障要靠复现探针而不是服务器日志。
- 安装插件前校验其 peer 版本与 dsh 运行时匹配(`plugin-market 0.2.1-alpha.4` 对 `0.2.2-rc.1` 会启动即 exit 1)。
- patch 行定位:`id` 必须等于 profile 依赖键(如 `dsh-remote`),`name` 必须等于包内 package.json 的 name(如 `@skillpie/dsh-remote`)——包改名后只改一处会导致补丁静默失效,插件以默认 config 运行;服务器排障先加 console.error 引导 trace 进 journal 再猜。
- 隐藏 URL 中的码用「conceal 脚本 + origin 级 Service Worker」:conceal 先把 `<base>` 钉到绝对隧道前缀再 `history.replaceState('/')`(顺序不能反,否则相对解析全错);SW 从自身 scriptURL query 读码,仅拦 origin 根路径的 navigate,带 `dsh-auth-` cookie 放行,回源 HTML 必须含 shim 标记防隧道下线兜回;SW 注册条件用 `window.isSecureContext`(https 与 localhost 都算),`location.protocol==='https:'` 会把 localhost 测试挡掉。
- 给透传 GUI 注入页面级行为(如访客下载菜单):MutationObserver 盯 `[role=menu]` 新增,新行必须**整行克隆原生 wrapper**(`parentNode.cloneNode(true)` 后改内部 icon/label span)——裸 button 直插菜单根+inline 样式必然字号/对齐全错(原生行是 `div > button[role=menuitem] > [span.itemIcon][span.itemLabel]`);插入行可能被 React 重渲染摘除,patch 要按「行还在才跳过」而非「有标记即跳过」。菜单与触发器的关联**必须逐版本实测**(本机/服务器运行时产物才是真相,源码检出版本可能不同):rc.1 实测 chevron 有 `aria-haspopup` 但**无 `aria-controls`、菜单根 id 为空**,可靠判据是开启时 `aria-expanded="true"` + 限定 `[data-open-target] [aria-haspopup]`,再按弹出位置最近兜底。**菜单分类(isFile)判定只用严格触发器**(aria-controls / aria-expanded=true),就近兜底只能在判定之后用于找路径——否则任意弹窗(如头像菜单)靠近残留的文件卡 chevron 会被误注入下载项。路径来源要按组件逐个核实:聊天文件卡(ui-deliverables PresentedFileCard)的绝对路径在**预览按钮 title**、其菜单走 HTTP 不走 mux,文档预览页头才是 `[data-path-label]` title;宿主 GUI 无文件 HTTP 端点,自行挂 `/dsh-remote-file` 路由(密钥从 hostId 派生,relay 由 hello.hostId 同式派生,零协议改动)。验证按钮自身请求要按 URL 过滤捕获(页面后台请求会把 cap 覆盖掉)。
- 冒烟桩的 webServer 若手动分发 prefix 路由,必须在分发前按 pathname 前缀过滤——处理器自身要守卫路径前缀,否则会在非匹配路径上被误调。
- webServer prefix 匹配是「p 或 p/」语义(webserver index.ts:660):短前缀命中不了更长的单段路径(`/9` 不匹配 `/99999999/`),**任何通用捕获式数字路由都不可能**;匹配顺序 exact → 最长前缀 → fallback,重复 (kind,path) 注册抛错。想接管任意 `/<码>` 只能走 SW 导航探测或边缘层(nginx)。
- SPA fallback(frontend-static)对未知子路径返回**裸 404**,仅 `/` 与 distIndex 的渲染走 `tapIndex`——插件想注入 `/<任意路径>` 的 404 场景,tapIndex 是死路;SW 内 fetch HEAD 探测 + `respondWith` 改写响应是插件侧通用解法(SW 内 fetch 不会重入自身 handler)。
- nginx 反代后端响应默认**不触发** `error_page`,必须 `proxy_intercept_errors on`;nginx 的 location/rewrite 正则含 `{n}` 必须整体引号包裹(裸 `{` 被当块起始,`nginx -t` 报 directive not terminated);`error_page 404 = @named` 进 named location 后原 regex 捕获 `$1` 仍可用,可直接拼改写参数。

## npm 发布

- 发布统一走工作区根目录 `publish_npm.sh`:在插件目录里 `../publish_npm.sh`(先 `--dry-run` 预检),脚本依次做身份校验、语法/测试、打包清单检查、发布、等官方异步索引、触发 npmmirror 同步。
- npm 账号 `skillpie`;发布 token 已配置在 `~/.npmrc`(`//registry.npmjs.org/:_authToken=`,Granular/免 2FA),直接使用,**不要向用户重复索取或建议轮换**;失效时由用户重新生成后更新该行。
- scoped 包必须在 package.json 设 `publishConfig.access: "public"`,否则按私有包收费拒绝发布。
- 本机默认 registry 是 npmmirror;官方源操作(publish/whoami/view 新包)必须显式 `--registry=https://registry.npmjs.org/`。
- 发布成功 ≠ 立刻可装:官方索引异步(数分钟),**新包首次发布可能先挂 `0.0.0-stage` 空壳占位版本**(无任何文件,按名安装会报 declares no dsh.bundle);`npm view <包名> version` 返回真实版本前不要分发安装。
- npmmirror 只读:发布后主动 `PUT https://registry-direct.npmmirror.com/<包>/sync?sync_upstream=true` 同步(URL 中 @→%40、/→%2F),验证 `registry.npmmirror.com/<包>` 的 dist-tags.latest 后再通知国内用户。
- 首次发布前查名:`npm view <包名>` 404 = 可用;npm scope(用户/组织)与用户名共享命名空间,先到先得,不可改名。
- files 白名单决定 tarball 内容:必含 `cordis.patch.yml`(locale/icon/README 同理),node_modules/lockfile 永不进包;`npm pack --dry-run` 逐项核对。
- 插件命名社区现状:`dsh-*` 裸前缀占 ~2/3 但重灾区(常用词几乎被占),`@scope/dsh-*` ~21%,`dsh-plugin-*` ~5%;官方自身全用 scope(`@deepseek-ai/dsh-*`),无硬性命名规定,建议 scope。

## 禁止事项

- 禁止在插件内注册 `process.on('uncaughtException')` 兜底。
- 禁止用 iframe 内嵌 HTML 页充当 GUI 面板(practices.md 明确禁止,丢失主题与 locale)。
- 禁止在插件激活期间直接改写 `cordis.patch.yml` 或 profile 的 `package.json`。
- 禁止跨插件 `require` 别的 Harness Client 包(`dsh.client.inject` 仅用于激活排序)。
- 禁止在未 `node --check` 与通读冒烟测试通过前执行 `install_bundle`。
