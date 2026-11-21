# dsh-skillpie-mail — SkillPie邮箱

DeepSeek Harness 插件：在 GUI 里管理自建邮件服务器（mail.skillpie.cn）的邮箱。

## 功能

- **设置页「SkillPie邮箱」分区**：
  - 「快速注册」弹窗：输入用户名+备注，调 SkillPie 注册页 API（`https://mail.skillpie.cn/register/api/register`）建号并签发应用密码，成功后自动加入邮箱列表。
  - 「添加邮箱」：手动录入已有邮箱（邮箱+密码，IMAP 登录校验通过才保存）。
  - 列表支持逐条移除；密码只存宿主凭据记录，任何 API 都不回传。
- **全局新邮件弹窗**：宿主半每 20s IMAP 轮询（INBOX + Junk Mail，验证码常进垃圾箱），客户端每 8s 取走通知；收到新邮件时右上角弹窗展示主题/发件人/正文摘要，并注明是哪个邮箱接收的。

## 配置（Config ~standard）

| 键 | 默认 | 说明 |
|---|---|---|
| `registerUrl` | `https://mail.skillpie.cn/register/api/register` | 注册页 API |
| `imapHost` | `mail.skillpie.cn` | IMAP 服务器 |
| `imapPort` | `993` | IMAPS 端口 |
| `pollInterval` | `20` | 轮询间隔（秒，最小 5） |

## 存储

凭据记录 `dsh-skillpie-mail/mailboxes`：`{ mailboxes: [{email,password,note,addedAt}], lastUid: {[email]: n} }`。
`lastUid` 水位保证每封邮件只提醒一次；插件重启首轮只推进水位、不弹历史邮件。

## 开发

```sh
for f in lib/*.js; do node --check "$f"; done
node test/smoke.mjs
```

安装：`plugin_manager install_bundle(target=dsh-skillpie-mail)`，改宿主代码后 `set_plugin` off→on 重载，客户端改动刷新 GUI 页面。
