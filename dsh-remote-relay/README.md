# dsh-remote-relay

DeepSeek Harness(DSH)插件:像 ZCodeOnline 远程协助一样,用 **8 位远程码** 在浏览器里访问任意一台装有本插件的 DSH 宿主机 —— 打开 `https://dsh.skillpie.cn/12345678/` 即得到**该宿主机完整的真实 Web GUI**(会话、工具渲染、交付物、终端、设置无一裁剪),而不是另做一套简化前端。

纯插件形态:只装在 profile 里,**不改任何 DSH 源码**,官方 DSH 升级后直接可用。

## 工作模型

```
宿主机(你自己的 DSH + dsh-remote-relay)              中转站(dsh.skillpie.cn 的 DSH + relay.enabled)
  │ 出站 wss /dsh-remote-relay/host ──────────────▶ /<code>/ 与 /<code>/api/remote.mux 随注册挂载
  │  (无需公网 IP/端口)                        │
  └──────── 字节级桥接 ◀─────────────────────┴── 访客浏览器 https://dsh.skillpie.cn/12345678/
```

- **GUI 透传(`mode: 'gui'`,默认)**:中转面把 `/<code>/…` 的 HTTP 请求剥掉前缀后经控制通道转发给宿主机;宿主机侧的 GUI 桥用进程内 launch token 自动铸造 owner 会话 cookie,对自己的 loopback web 服务完成请求;响应(含流式内容)原样回传。GUI 唯一的多路 WebSocket `/api/remote.mux` 按帧拼接(JSON 文本帧与二进制帧双向透传)。
- **身份与会话**:远程码/宿主 ID/token 持久化在凭据记录 `dsh-remote-relay/identity`(重启不漂移);token 只在中转站存哈希,重连凭 token 顶替旧路由,fail-closed 自愈。
- **多宿主机隔离**:同一中转域名下,每台宿主机挂在自己的 `/<code>/` 前缀;owner cookie 由宿主机侧持有并逐请求注入,**不落到访客浏览器**,访客之间也互不可见。
- **入口**：GUI 左侧栏底部（账号区上方）的「远程控制」按钮，点击弹窗进入属主面板；侧栏菜单不再有独立入口。侧栏收起时按钮自动变为纯图标。
- **`mode: 'console'`(可选)**:轻量只读/控制页(会话列表、消息流、发送/中断),供想要最小暴露面或低带宽的场景使用。
- **直连模式(`direct: true`,默认开)**:同一套桥接同时挂在本机 web 服务上,`http://<host>:<port>/<code>/` 可用——局域网使用与本地联调都走它。

## 安装

本机(宿主面,默认即可,装完重启 GUI):

```text
在 DSH 的插件管理器安装本目录即可,无需配置。
```

服务器(dsh.skillpie.cn 等,官方 npm 形态 DSH):安装同一包,并在该 profile 补丁层覆盖:

```yaml
- id: dsh-remote-relay
  name: dsh-remote-relay
  config:
    enabled: false          # 服务器自身不必外连别的中转站
    direct: false
    relay:
      enabled: true
      mode: gui             # 默认值;console 为轻量页
      maxVisitorsPerHost: 16
```

中转面复用 DSH 自带的 web 服务(nginx 只需透传 Host 与 WebSocket 升级),根路径 `/<code>/` 就绪,无需额外部署单元。

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `mode` | `gui` | 访客体验:`gui` 真实 GUI 透传 / `console` 轻量页 |
| `enabled` | `true` | 宿主面总开关(外连中转站) |
| `relayUrl` | `wss://dsh.skillpie.cn` | 中转站 origin |
| `allowControl` | `true` | 仅 console 模式:`false` 为只读;gui 模式下见下方安全说明 |
| `direct` | `true` | 本机 web 服务挂 `/<code>/` 直连路由 |
| `code` | 自动生成 | 8 位远程码(1-9 开头),可手动指定 |
| `hostId` / `token` | 自动 | 运行身份,自动持久化,勿手改 |
| `name` | 主机名 | 设备名(属主面板/中转面显示) |
| `relay.enabled` | `false` | **服务器侧**启用中转面 |
| `relay.mode` | `gui` | 中转面给访客的体验(同上) |
| `relay.maxVisitorsPerHost` | `8` | 单宿主机并发访客/拼接上限 |

## 地址栏隐私（远程码不落 URL）

打开 `https://dsh.skillpie.cn/12345678/` 后,页面脚本会把远程码存入浏览器(localStorage + sessionStorage)、立刻用 `history.replaceState` 把地址栏改写为 `https://dsh.skillpie.cn/`,并把 `<base>` 钉到隧道前缀保证资源继续加载。同时注册一个 origin 级 Service Worker(`/dsh-remote-relay-sw.js`):之后直接访问裸域名也会自动恢复到对应宿主机的隧道,**全程不需要把码拼回 URL**。

- 转发/收藏裸域名即可再次进入(同一浏览器);`?gui` 参数可跳过恢复(例如访客想看中转站自己的 GUI 或排除故障)。
- 携带中转站属主会话 cookie(`dsh-auth-*`)的浏览器不受 SW 影响,裸域名始终是中转站自己的 GUI。
- 宿主机离线时,SW 回源得到的是离线占位页,不会渲染任何宿主内容。
- 清除站点数据(或换浏览器)后裸域名不再自动恢复,需要原始带码链接重新进入。
- 码以明文存在访客浏览器 localStorage 中——这是为「无需重复输入」做的权衡;公用电脑请勿勾选记住,或用后清除站点数据。

## 未知远程码 → 输码弹窗

访问一个不存在(或已失效)的远程码(如 `https://dsh.skillpie.cn/99999999/`)不再看到裸 404,而是深色卡片输码弹窗:标红提示该码无效,输入正确的 8 位码即可直接进入对应宿主机——和第一次打开链接一样。地址栏保持在原路径。

三层机制,层层独立:

1. **输码页路由** `/dsh-remote-relay-enter`(插件自带,gui 模式注册;`?code=<码>` 时显示该码无效的提示)。
2. **Service Worker 探测**(覆盖所有已装 SW 的浏览器,任何部署形态都生效):SW 拦截 `/〈8 位码〉` 形状的导航,HEAD 探测一次,后端 404 就改呈现输码页;裸域名恢复时回源到失效码同样转输码页,并清掉失效的缓存码。活码探测一次 200 后正常放行,隧道不受影响。
3. **nginx 兜底**(公网部署,覆盖首次访问、还没装 SW 的陌生访客):裸码路径 `location ~ "^/[1-9][0-9]{7}/?$"` + `proxy_intercept_errors on` + `error_page 404 = @dsh_remote_enter` 内部改写到 `/dsh-remote-relay-enter?code=〈码〉`。配置见 `deploy/nginx-dsh.skillpie.cn.conf`。

已知限制:局域网直连宿主机端口、且浏览器从未装过 SW 的首次访问仍会看到 404(SW 只能在页面加载过一次之后安装)。

## 访客文件下载

远程访问时,文件预览页的打开方式菜单(LibreOffice/WorkBuddy/… 那个)会在**最前面**多出一项「下载文件」:点击后把宿主机磁盘上的该文件经隧道流回访客浏览器,由浏览器弹出保存框存到本地——GUI 本身的菜单只能把路径交给宿主机桌面,远程访客原本无从取回生成的文件(xlsx/pdf/任意类型均可)。

- 菜单项按原生菜单行**整行克隆**渲染(图标/字号/对齐与 LibreOffice 等原生项完全一致),始终位于菜单第一位。
- 路径按优先级取三处:聊天文件卡的预览按钮 `title`(含完整绝对路径)→ 文档预览页头的完整路径显示 → 最近一次通过 mux 请求过的文件路径(兜底);都拿不到会提示「无法定位文件」。
- 下载路由 `/dsh-remote-relay-file` 挂在宿主机自己的 web 服务上,仅接受 GET/HEAD,经隧道访问时由宿主会话 cookie 保护;另外校验一个由宿主 hostId 派生的密钥(`x-dsh-remote-relay-key`,自动注入),防止本机回环的其他进程任意读文件。只允许下载普通文件,单文件上限 512MB。
- 仅访客态注入该菜单项,宿主机本地 GUI 不受影响;React 重渲染摘除插入行时会自动重新补插。
- 点击反馈:下载中显示「下载中…」;失败按原因区分——404(聊天卡片还在、磁盘文件已被清理)提示「文件已不存在(可能已被清理)」,其余失败提示「下载失败,请重试」;浏览器默认直接保存到「下载」文件夹,想要每次弹保存框请在浏览器设置开启「保存每个文件前询问保存位置」。

## 安全（重要）

- **gui 模式下访客拥有与属主等价的完整 GUI 权限**(可见所有会话、可操作界面、含设置页)。远程码就是分享授权:**只把链接给你信任的人**;不再需要时用属主面板「重新生成远程码」立即作废旧链接(浏览器缓存的旧码会失效,SW 恢复到离线占位页)。
- 远程码/宿主 token:token 只存哈希;owner 会话 cookie 只在宿主机进程内持有并逐请求注入,不进入访客浏览器。
- 每台宿主机限制并发访客;请求体、帧大小、空闲时间均有上限;帧处理器带异常边界,任何桥接错误只断开对应连接,不会影响宿主进程。
- 局限:gui 模式是多宿主共享入口,属主面板的「在线访客」仅统计拼接连接;首次加载资源走隧道一次(之后浏览器缓存生效)。Service Worker 需要安全上下文(https 或 localhost),LAN 明文 http 下仅地址栏摘除生效,无自动恢复。

## 验证（本仓库）

- `node test/smoke.mjs` — 轻量控制台模式(注册/欢迎/历史/发送/中断/白名单/双通道扇出)
- `node test/gui-smoke.mjs` — GUI 透传模式(302 挂载、cookie 仅宿主侧、POST 透传、资源代理、WS 拼接多帧 echo、离线页)
- `node test/live-check.mjs [origin] [code]` — 对真实宿主进程的只读冒烟(welcome/会话列表/observe)

## License

MIT
