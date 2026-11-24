# dsh-plugins · DSH 插件合集

**简体中文 ｜ [English](./README.en.md)**

[![DeepSeek Harness](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.1--rc.3-blue)](https://github.com/deepseek-ai/deepseek-harness)
[![npm](https://img.shields.io/badge/npm-skillpie-cb3837)](https://www.npmjs.com/~skillpie)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#许可)

一套为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）打造的插件合集：数据库操作、远程访问、Git 工作台、工作日报、终端面板、免费模型…… 全部以 npm 包发布，在 DSH 的插件管理里输入包名即可安装。

## 插件一览

| 插件 | 简介 |
|---|---|
| [dsh-datasource](./dsh-datasource) · [npm](https://www.npmjs.com/package/dsh-datasource) | **数据源**：连接 SQLite / PostgreSQL / MySQL，在对话里直接查数、改数；侧栏面板可浏览表结构、执行 SQL |
| [dsh-gitx](./dsh-gitx) · [npm](https://www.npmjs.com/package/dsh-gitx) | **代码版本管理**：会话内的 Git 工作台——暂存、提交、分支、变基、冲突编辑，改写历史自动留恢复点 |
| [dsh-remote-relay](./dsh-remote-relay) · [npm](https://www.npmjs.com/package/dsh-remote-relay) | **远程控制**：用 8 位远程码经中转站访问任意 DSH 宿主机的完整 Web GUI，无需公网 IP |
| [dsh-termbar](./dsh-termbar) · [npm](https://www.npmjs.com/package/dsh-termbar) | **终端栏**：右上角一键开合的底部真终端，多标签 + 分栏，收起不打断命令（⌘⇧K） |
| [dsh-project-report](./dsh-project-report) · [npm](https://www.npmjs.com/package/dsh-project-report) | **项目汇报**：把 git 提交与 AI 会话记录整理成工作日报，定时自动生成，可自动提交 Moka 加班单 |
| [dsh-skillpie](./dsh-skillpie) · [npm](https://www.npmjs.com/package/dsh-skillpie) | **技能市场**：侧栏内嵌 [SkillPie](https://skillpie.cn) 技能库，浏览、搜索、一键安装社区技能 |
| [dsh-skillpie-mail](./dsh-skillpie-mail) · [npm](https://www.npmjs.com/package/dsh-skillpie-mail) | **SkillPie 邮箱**：一键注册 `@skillpie.cn` 接码邮箱，验证码邮件实时汇总到底部状态栏 |
| [dsh-tokenbank](./dsh-tokenbank) · [npm](https://www.npmjs.com/package/dsh-tokenbank) | **TokenBank 免费模型**：注册领免费 API Key 与体验金，免费 GLM 模型直接进模型列表，带余额查询、密钥托管、每日签到 |
| [dsh-featured](./dsh-featured) · [npm](https://www.npmjs.com/package/dsh-featured) | **精选插件**：官方插件页新增「精选插件」板块，逛、搜、一键安装社区好插件 |
| [dsh-webkit](./dsh-webkit) · [npm](https://www.npmjs.com/package/dsh-webkit) | **网页工具箱**：右侧栏浏览器里的元素拾取器，点选网页元素直接送进对话草稿 |

> 不知道装哪个？先装 [dsh-featured](./dsh-featured)，打开插件页就能逛遍社区精选、一键安装。

另有 [dsh-plugins-plugin](./dsh-plugins-plugin) · [npm](https://www.npmjs.com/package/dsh-plugins-plugin)：面向插件作者的 npm 库（非独立安装的插件）。在自己的插件目录里执行 `sh integrate.sh --plugin=<包名>`，即可把「精选推荐」板块嵌入你的插件。

**依赖提示**：dsh-gitx 需要系统安装 [Git](https://git-scm.com/downloads) ≥ 2.36；dsh-datasource 支持 SQLite（免驱动）、PostgreSQL、MySQL。

## 环境要求

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) ≥ 0.2.1-rc.3（个别插件要求 ≥ 0.2.2-rc.1，以各插件 README 为准）
- Node.js ≥ 22.13（DSH 桌面端内置运行时，通常无需额外安装）

## 安装

### 方式一：DSH 插件管理（推荐）

打开 DSH 的「插件」页面 → **添加插件**，输入插件包名（例如 `dsh-termbar`），安装并启用。

### 方式二：命令行

```bash
# macOS 桌面端
DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH_CLI" plugin --profile desktop add dsh-termbar
```

Windows / Linux 使用本机对应的 `dsh` 命令路径；服务器中转部署使用 `--profile web`。

### 方式三：从源码安装

```bash
git clone https://github.com/skillpie/dsh-plugins.git
"$DSH_CLI" plugin --profile desktop add "$PWD/dsh-plugins/dsh-termbar"
```

安装后重启 DeepSeek Harness（或刷新页面），按各插件目录内 README 的说明开始使用。

## 仓库结构

```
dsh-plugins/
├── dsh-<name>/          # 每个插件一个目录：README、源码 lib、多语言文案 locale、测试 test
├── publish_npm.sh       # npm 发布脚本（维护者使用）
└── .github/workflows/   # 每日定时自动刷新精选插件目录数据（版本 / 下载量 / star）
```

## 相关链接

- DeepSeek Harness：<https://github.com/deepseek-ai/deepseek-harness>
- SkillPie 技能市场：<https://skillpie.cn>
- TokenBank：<https://bank.skillpie.cn>
- SkillPie 邮箱：<https://mail.skillpie.cn>
- 社区精选插件目录：<https://awesome-dsh-plugin.com>
- npm 发布账号：<https://www.npmjs.com/~skillpie>

## 许可

所有插件均以 [MIT](https://opensource.org/licenses/MIT) 许可发布，详见各插件目录内的 LICENSE。
