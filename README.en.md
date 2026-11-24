# dsh-plugins

**English ｜ [简体中文](./README.md)**

[![DeepSeek Harness](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.1--rc.3-blue)](https://github.com/deepseek-ai/deepseek-harness)
[![npm](https://img.shields.io/badge/npm-skillpie-cb3837)](https://www.npmjs.com/~skillpie)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

A collection of plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): database access, remote control, a Git workbench, daily work reports, a terminal panel, free models, and more. Everything is published on npm — just type a package name in DSH's plugin manager to install.

## Plugins

| Plugin | What it does |
|---|---|
| [dsh-datasource](./dsh-datasource) · [npm](https://www.npmjs.com/package/dsh-datasource) | **DataSource**: connect to SQLite / PostgreSQL / MySQL and query or edit data right in the conversation; a sidebar panel for schemas and SQL |
| [dsh-gitx](./dsh-gitx) · [npm](https://www.npmjs.com/package/dsh-gitx) | **Git Workbench**: stage, commit, branch, rebase and resolve conflicts without leaving the session; history rewrites keep automatic restore points |
| [dsh-remote-relay](./dsh-remote-relay) · [npm](https://www.npmjs.com/package/dsh-remote-relay) | **Remote Control**: reach any DSH host's full Web GUI through a relay origin with an 8-digit code — no public IP needed |
| [dsh-termbar](./dsh-termbar) · [npm](https://www.npmjs.com/package/dsh-termbar) | **Terminal Bar**: a real terminal panel at the bottom, toggled from the top-right button (⌘⇧K); tabs, splits, commands keep running when collapsed |
| [dsh-project-report](./dsh-project-report) · [npm](https://www.npmjs.com/package/dsh-project-report) | **Project Report**: turn git commits and AI session topics into a daily work report, on schedule, with optional automatic Moka overtime submission |
| [dsh-skillpie](./dsh-skillpie) · [npm](https://www.npmjs.com/package/dsh-skillpie) | **Skill Marketplace**: the [SkillPie](https://skillpie.cn) skill library embedded in the sidebar — browse, search, install community skills in one click |
| [dsh-skillpie-mail](./dsh-skillpie-mail) · [npm](https://www.npmjs.com/package/dsh-skillpie-mail) | **SkillPie Mail**: register `@skillpie.cn` inboxes in one click and see verification emails live in a bottom status bar |
| [dsh-tokenbank](./dsh-tokenbank) · [npm](https://www.npmjs.com/package/dsh-tokenbank) | **TokenBank Free Models**: register for a free API key and credit, free GLM models appear in your model list, plus balance lookup, key hosting and daily check-ins |
| [dsh-featured](./dsh-featured) · [npm](https://www.npmjs.com/package/dsh-featured) | **Featured Plugins**: a "Featured" tab in DSH's plugin page — browse, search and install the best community plugins in one click |
| [dsh-webkit](./dsh-webkit) · [npm](https://www.npmjs.com/package/dsh-webkit) | **Web Toolbox**: an element picker for the right-sidebar browser — click a webpage element and it lands in your conversation draft |

> Not sure where to start? Install [dsh-featured](./dsh-featured) first and browse the whole community catalog from the plugin page.

There is also [dsh-plugins-plugin](./dsh-plugins-plugin) · [npm](https://www.npmjs.com/package/dsh-plugins-plugin): an npm library for plugin authors (not a standalone plugin). Run `sh integrate.sh --plugin=<package>` inside your plugin directory to embed the "Featured" section into your own plugin.

**Notes**: dsh-gitx requires [Git](https://git-scm.com/downloads) ≥ 2.36 on your system; dsh-datasource supports SQLite (no driver needed), PostgreSQL and MySQL.

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) ≥ 0.2.1-rc.3 (a few plugins need ≥ 0.2.2-rc.1 — see each plugin's README)
- Node.js ≥ 22.13 (built into the DSH desktop runtime; usually nothing to install)

## Install

### Option 1: DSH plugin manager (recommended)

Open the **Plugins** page in DSH → **Add plugin**, type the package name (e.g. `dsh-termbar`), then install and enable it.

### Option 2: Command line

```bash
# macOS desktop
DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH_CLI" plugin --profile desktop add dsh-termbar
```

On Windows / Linux use the `dsh` command available on your machine; for server relay deployments use `--profile web`.

### Option 3: Install from source

```bash
git clone https://github.com/skillpie/dsh-plugins.git
"$DSH_CLI" plugin --profile desktop add "$PWD/dsh-plugins/dsh-termbar"
```

Restart DeepSeek Harness (or refresh the page) afterwards, then follow the README inside each plugin directory.

## Repository layout

```
dsh-plugins/
├── dsh-<name>/          # one directory per plugin: README, lib, locale, test
├── publish_npm.sh       # npm publishing script (maintainers)
└── .github/workflows/   # daily job that refreshes the featured-plugin catalog (versions / downloads / stars)
```

## Links

- DeepSeek Harness: <https://github.com/deepseek-ai/deepseek-harness>
- SkillPie marketplace: <https://skillpie.cn>
- TokenBank: <https://bank.skillpie.cn>
- SkillPie Mail: <https://mail.skillpie.cn>
- Community featured-plugin catalog: <https://awesome-dsh-plugin.com>
- npm publisher: <https://www.npmjs.com/~skillpie>

## License

All plugins are released under the [MIT](https://opensource.org/licenses/MIT) license; see the LICENSE file in each plugin directory.
