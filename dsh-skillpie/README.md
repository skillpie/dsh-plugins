# dsh-skillpie

DeepSeek Harness(DSH)插件:左侧栏「技能市场」入口。浏览并安装 [SkillPie](https://skillpie.cn) 技能库中的 Agent 技能,一键装入用户级技能目录(`~/.agents/skills/<normalizedName>`),新开会话即可使用。

## 功能

- 左侧栏面板图标「技能市场」→ 主区**内嵌 SkillPie 整站页面**(`https://skillpie.cn/skills`),与 ZCode 的 skill-market 主视图同构:侧栏保持可见,像内嵌浏览器一样直接访问网站。
- 顶部细工具条:刷新页面、在浏览器中打开(兜底)。
- Host 半提供 `POST /dsh-skillpie/api`(search / detail / install / installed),供后续对话工具或程序化安装复用;技能安装到 `~/.agents/skills/<normalizedName>`。

## 安全

- 安装包(zip)逐条目校验路径安全,拒绝绝对路径与 `..` 穿越,包体积与解压总量、条目数均有上限。
- 目标目录名只允许单个安全路径段,由服务端 `normalizedName` 给出。
- Host API(`/dsh-skillpie/api`)仅限同源页面访问,且位于 Web GUI 会话鉴权之后;安装动作只能由已登录用户在面板里发起。

## 配置

在 profile 的 `cordis.patch.yml` 覆盖该行 `config`:

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `skillRoot` | `~/.agents/skills` | 技能安装根目录 |
| `baseUrl` | `https://skillpie.cn` | SkillPie 服务地址(自部署可覆盖) |

## License

MIT
