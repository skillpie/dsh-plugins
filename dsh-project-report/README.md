# @skillpie/dsh-project-report

项目日报插件 for DeepSeek Harness：在项目会话顶部「日报」标签页，基于当前项目的 git 提交记录一键生成工作日报，可选自动提交 Moka 加班，并支持插件自带的定时运行（不依赖 DSH 自动化任务）。项目唯一：同一项目的所有会话共享同一份日报。

## 功能

- **会话 Tab 入口**：在任意项目会话顶部注册「日报」标签页，自动绑定会话工作目录（cwd）所在项目；无侧栏入口。
- **日报生成**：在项目目录（深度 1，含项目根自身）下发现 git 仓库，统计当天 06:00 → 次日 06:00 窗口内的提交（`git log --all --author`），按关键词自动分类（业务模块/缺陷修复/前端页面/测试/文档/CI 等），套用日报模板生成 Markdown，可编辑后复制。默认勾选「仅整理我的提交」，可取消以统计全部作者。Merge 提交自动过滤（全部为 Merge 时保留）。
- **项目唯一**：生成结果按项目路径（cwd）保存在宿主侧，同项目所有会话打开「日报」看到的是同一份最近生成的日报（可编辑覆盖）。
- **Moka 加班**：配置 Moka 账号后可一键提交加班。完整移植 Moka 三步登录 → 考勤打卡读取 → 加班试算 → 表单构建 → 附件上传（代码片段渲染 PNG）→ 流程提交 → 审批路径预判。工作日需 18:30 后打卡（开始时间强制 18:30），休息日起算实际开始时间，最短 2 小时，默认「调休假」。
- **定时运行**：插件自带调度器（每 20s tick，纯函数判定），设置每日 HH:MM 触发，遍历所有已打开项目逐个生成日报并保存；支持错峰补跑（错过后当天首次 tick 即执行，每天最多一次）。可选「生成后自动提交加班」（用提交数最多的项目日报）。「立即运行一次」只处理当前项目。凭据（Moka 账号）存 DSH 凭据记录，其余状态存 `~/.config/skillpie/dsh-project-report/state.json`。

## 使用

1. 在某个项目的会话里打开顶部「日报」标签页（会话需从项目目录打开，有工作目录才可用）。
2. 选择日期、按需勾选「仅整理我的提交」，点「生成日报」，编辑后「复制」或「提交加班」。
3. 「Moka 账号」卡填入邮箱/密码，保存并「测试登录」验证。
4. 「定时任务」卡启用定时、设置时间、勾选「自动提交加班」（定时遍历所有已打开项目）；「立即运行一次」只跑当前项目。
5. 「历史记录」卡查看每次运行的结果（含加班提交状态与完整日报）。

## Host 配置（可选）

Config 可作默认值（GUI 设置优先）。`workspace` 现在只是定时运行的**附加目录**（在已打开项目之外额外整理的目录）：

```yaml
- insert:
    - id: project-report
      name: "@skillpie/dsh-project-report"
      config:
        workspace: /path/to/extra-dir   # 可选:附加扫描目录
        gitAuthor: ""            # 空 = 逐仓库读 git config user.name
        scheduleTime: "21:30"
        scheduleEnabled: false
```

## API

单路由 `POST /dsh-project-report/api`，JSON `{"action": ...}`：`ping / getState / setSettings / listProjects / generate{cwd,date,mineOnly} / getReport{cwd} / saveMoka / mokaStatus / mokaTest / submitOvertime / history / historyEntry / runNow{cwd,date,autoOvertime}`。同源限定；`GET` 返回 ping。

## 开发与测试

```bash
for f in lib/*.js; do node --check "$f"; done   # 语法检查
node test/smoke.mjs                              # 37 checks:调度/状态/git/日报/PNG/API
node test/moka.mjs                               # 14 checks:桩服务器全链路(登录/考勤/试算/提交)
```

安装：DSH GUI 插件管理或 `plugin_manager install_bundle(<本目录>)`。

## 已知局限

- 加班附件 PNG 中的代码片段仅含 ASCII 字形（内置 DejaVu Sans Mono 位图），中文字符以占位剔除；Moka 网页端可正常渲染图片本身。
- 「提交加班」会创建真实加班单，插件不做二次确认之外的保护；请核对日期与时长后提交。
