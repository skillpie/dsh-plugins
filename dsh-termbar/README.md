# dsh-termbar（终端栏）

在 DeepSeek Harness Web GUI 右上角工具区（`conversation.session.header.utilities`）
添加一枚终端开关按钮（位于右侧边栏按钮左侧），点按打开/关闭底部终端面板
（`shell.overlay`）。交互与逻辑参考 ZCodeOnline 的底部终端：

- **多标签**：头部横向 tab 列表，标题 = 工作目录叶子名，同名并存追加 ` · N` 序号；
  激活 tab 带关闭钮，右侧按钮组 = 新建（+）/ 收起面板（×）。
- **保活语义**：收起面板只隐藏 UI，PTY 与回看缓冲不清除；再次打开原样回放。
- **退出即删**：PTY 退出自动移除对应 tab；若它是最后一个 tab，面板连带收起。
- **实时回看**：重连/切换 tab 时按环形缓冲（默认 512KB，可配）全量重放，
  不丢输出。
- **拖拽调高**：面板顶部 5px 拖拽手调节高度（120px ～ 70% 视口），
  `localStorage` 持久化。

## 架构

```
Client 半（lib/client.js）                 Host 半（lib/index.js + lib/engine.js）
┌────────────────────────────┐   JSON 控制帧  ┌──────────────────────────────┐
│ 切换按钮 + 底部 Dock        │ ────────────→ │ /dsh-termbar/api (HTTP 控制)  │
│ xterm.js（vendored UMD）    │ ←──────────── │ /dsh-termbar/ws  (WS I/O)     │
│ 二进制帧 → term.write       │   二进制输出帧 │ TermbarEngine（会话表+环形缓冲）│
└────────────────────────────┘               └───────────┬──────────────────┘
                                             subprocess.spawnTerminal（PTY）
```

- **控制面**：`GET/POST /dsh-termbar/api`（create / close / rename），同源校验。
- **数据面**：`/dsh-termbar/ws` 文本 JSON 帧（attach/detach/input/resize/ping）
  + 二进制帧（PTY 输出直通）。
- **静态资源**：`/dsh-termbar/vendor/*` 内存缓存 xterm.js / addon-fit.js / xterm.css。

## 配置

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `shell` | `$SHELL` 或 `terminalEnvironment().defaultShell` | 登录 shell（posix 追加 `-l`） |
| `cwd` | 用户主目录 | 新终端初始工作目录（目录不存在时回退主目录） |
| `scrollbackKB` | `512` | 每会话回看缓冲上限（64–16384） |

## 测试

```bash
node test/smoke.mjs
```

桩 webServer + 假 PTY + 真实 http/ws，覆盖 API、vendor、WS 全生命周期
（hello/created/attached/input/resize/pong/renamed/exit）、跨源拒绝与 dispose 清理。
