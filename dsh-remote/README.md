# dsh-remote

DeepSeek Harness(DSH)插件:像 ZCodeOnline 远程协助一样,用 **8 位远程码** 在浏览器里访问任意一台装有本插件的 DSH 宿主机 —— 打开 `https://dsh.skillpie.cn/12345678/` 即得到**该宿主机完整的真实 Web GUI**(会话、工具渲染、交付物、终端、设置无一裁剪),而不是另做一套简化前端。

纯插件形态:只装在 profile 里,**不改任何 DSH 源码**,官方 DSH 升级后直接可用。

## 工作模型

```
宿主机(你自己的 DSH + dsh-remote)              中转站(dsh.skillpie.cn 的 DSH + relay.enabled)
  │ 出站 wss /dsh-remote/host ──────────────▶ /<code>/ 与 /<code>/api/remote.mux 随注册挂载
  │  (无需公网 IP/端口)                        │
  └──────── 字节级桥接 ◀─────────────────────┴── 访客浏览器 https://dsh.skillpie.cn/12345678/
```

- **GUI 透传(`mode: 'gui'`,默认)**:中转面把 `/<code>/…` 的 HTTP 请求剥掉前缀后经控制通道转发给宿主机;宿主机侧的 GUI 桥用进程内 launch token 自动铸造 owner 会话 cookie,对自己的 loopback web 服务完成请求;响应(含流式内容)原样回传。GUI 唯一的多路 WebSocket `/api/remote.mux` 按帧拼接(JSON 文本帧与二进制帧双向透传)。
- **身份与会话**:远程码/宿主 ID/token 持久化在凭据记录 `dsh-remote/identity`(重启不漂移);token 只在中转站存哈希,重连凭 token 顶替旧路由,fail-closed 自愈。
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
- id: dsh-remote
  name: dsh-remote
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

## 安全（重要）

- **gui 模式下访客拥有与属主等价的完整 GUI 权限**(可见所有会话、可操作界面、含设置页)。远程码就是分享授权:**只把链接给你信任的人**;不再需要时用属主面板「重新生成远程码」立即作废旧链接。
- 远程码/宿主 token:token 只存哈希;owner 会话 cookie 只在宿主机进程内持有并逐请求注入,不进入访客浏览器。
- 每台宿主机限制并发访客;请求体、帧大小、空闲时间均有上限;帧处理器带异常边界,任何桥接错误只断开对应连接,不会影响宿主进程。
- 局限:gui 模式是多宿主共享入口,属主面板的「在线访客」仅统计拼接连接;首次加载资源走隧道一次(之后浏览器缓存生效)。

## 验证（本仓库）

- `node test/smoke.mjs` — 轻量控制台模式(注册/欢迎/历史/发送/中断/白名单/双通道扇出)
- `node test/gui-smoke.mjs` — GUI 透传模式(302 挂载、cookie 仅宿主侧、POST 透传、资源代理、WS 拼接多帧 echo、离线页)
- `node test/live-check.mjs [origin] [code]` — 对真实宿主进程的只读冒烟(welcome/会话列表/observe)

## License

MIT
