/**
 * dsh-skillpie-mail — Web client half (module-loader bundle).
 *
 * Registers:
 *   - settings.section "SkillPie邮箱": 快速注册弹窗(调 SkillPie 注册页 API)
 *     + 邮箱列表(手动添加 邮箱+密码 / 移除)。
 *   - shell.overlay 全局新邮件弹窗:宿主半后台 IMAP 轮询,客户端定时
 *     poll 取走通知,任一邮箱收到新邮件时顶部弹窗展示内容并注明收件邮箱。
 *
 * All state comes from the host half's POST /dsh-skillpie-mail/api.
 * Passwords never leave the host (list/register 响应均不含密码)。
 */
window.__ModuleLoader__.load({
  id: 'dsh-skillpie-mail',
  factory(require) {
    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement
    var NS = 'dsh-skillpie-mail'
    var API = '/dsh-skillpie-mail/api'

    var zh = {
      title: 'SkillPie邮箱',
      sectionDesc: '管理 @skillpie.cn 邮箱；收到新邮件时全局弹窗提醒。',
      quickRegister: '快速注册',
      registerTitle: '快速注册邮箱',
      registerUser: '用户名（邮箱前缀）',
      registerUserPh: '例如 taobao01',
      registerNote: '备注（可选）',
      registerNotePh: '用途备注，如“淘宝注册”',
      registerOk: '注册成功',
      registerResult: '邮箱',
      registerAppPwd: '应用密码（IMAP 登录用，请保存）',
      registerPwd: '应用密码 (IMAP 登录用)',
      registerDone: '已自动加入下方列表, 无需再手动添加',
      add: '添加邮箱',
      addTitle: '添加已有邮箱',
      email: '邮箱地址',
      password: '密码',
      appPasswordLabel: '应用密码',
      appPasswordTip: '填 app_ 开头的应用密码 (注册成功弹窗里有;老账号可在 mail.skillpie.cn/admin 的账户页签发)。账号密码无法用于此登录。',
      addOk: '添加',
      remove: '移除',
      empty: '还没有邮箱，点「快速注册」或「添加邮箱」。',
      mailboxCount: '共 {n} 个邮箱',
      newMail: '新邮件',
      close: '关闭',
      inbox: '收件箱',
      inboxAll: '全部邮箱',
      inboxEmpty: '还没有收过邮件',
      noSubject: '(无主题)',
      from: '发件人',
      toLabel: '收件邮箱',
      dateLabel: '时间',
      loading: '处理中…',
      copy: '复制',
      copied: '已复制',
    }
    var en = {
      title: 'SkillPie Mail',
      sectionDesc: 'Manage @skillpie.cn mailboxes; global popup on new mail.',
      quickRegister: 'Quick register',
      registerTitle: 'Register a mailbox',
      registerUser: 'Username (email prefix)',
      registerUserPh: 'e.g. taobao01',
      registerNote: 'Note (optional)',
      registerNotePh: 'what this mailbox is for',
      registerOk: 'Registered',
      registerResult: 'Address',
      registerAppPwd: 'App password (for IMAP, save it)',
      registerPwd: 'App password (for IMAP login)',
      registerDone: 'Added to the list below automatically',
      add: 'Add mailbox',
      addTitle: 'Add an existing mailbox',
      email: 'Email address',
      password: 'Password',
      appPasswordLabel: 'App password',
      appPasswordTip: 'Use the app_ password shown in the register dialog (or issue one in mail.skillpie.cn/admin). Account passwords cannot log in here.',
      addOk: 'Add',
      remove: 'Remove',
      empty: 'No mailboxes yet. Try "Quick register" or "Add mailbox".',
      mailboxCount: '{n} mailbox(es)',
      newMail: 'New mail',
      close: 'Close',
      inbox: 'Inbox',
      inboxAll: 'All mailboxes',
      inboxEmpty: 'No mail received yet',
      noSubject: '(no subject)',
      from: 'From',
      toLabel: 'Mailbox',
      dateLabel: 'Date',
      loading: 'Working…',
      copy: 'Copy',
      copied: 'Copied',
    }

    var pageT = function (key, vars) {
      var s = key
      return s
    }

    /* ── API ────────────────────────────────────────────────────────── */

    function api(action, payload) {
      return fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      })
        .then(function (response) { return response.json() })
        .then(function (data) {
          if (!data || data.ok !== true) throw new Error((data && data.error) || 'request failed')
          return data
        })
    }

    /* ── 小组件 ─────────────────────────────────────────────────────── */

    function MailIcon(props) {
      var size = (props && props.size) || 16
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        style: { display: 'block', flex: 'none' },
      },
        h('rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }),
        h('path', { d: 'm3 7 9 6 9-6' }),
      )
    }

    var btnStyle = {
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px',
      borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', cursor: 'pointer',
      background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', fontSize: 12,
    }
    var btnPrimaryStyle = Object.assign({}, btnStyle, {
      background: 'var(--dsw-alias-interactive-bg-selected, #4b6bfb)',
      borderColor: 'transparent', color: '#fff',
    })
    var inputStyle = {
      height: 28, padding: '0 8px', borderRadius: 7, fontSize: 12,
      border: '1px solid var(--dsw-alias-border-l1)',
      background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
      outline: 'none', boxSizing: 'border-box', width: '100%',
    }
    var labelStyle = { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }

    /** 极简模态(fixed 遮罩 + 居中卡片)。children 即内容。 */
    function Modal(props) {
      return h('div', {
        onClick: props.onClose,
        style: {
          position: 'fixed', inset: 0, zIndex: 2900, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      },
        h('div', {
          onClick: function (event) { event.stopPropagation() },
          style: {
            width: 340, maxWidth: '90vw', padding: 16, borderRadius: 12,
            background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', gap: 10,
          },
        },
          h('div', { style: { fontSize: 14, fontWeight: 600 } }, props.title),
          props.children,
        ),
      )
    }

    function Field(props) {
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { style: labelStyle }, props.label),
        h('input', {
          style: inputStyle, value: props.value, placeholder: props.placeholder || '',
          onChange: function (event) { props.onChange(event.target.value) },
        }),
      )
    }

    /* ── 设置页分区 ─────────────────────────────────────────────────── */

    var MAIL_SUFFIX = '@skillpie.cn'

    function RegisterDialog(props) {
      var t = props.t
      var usernameState = React.useState('')
      var noteState = React.useState('')
      var busyState = React.useState(false)
      var errorState = React.useState('')
      var resultState = React.useState(null)
      var copiedState = React.useState('')

      var submit = function () {
        if (busyState[0]) return
        busyState[1](true)
        errorState[1]('')
        api('register', { username: usernameState[0], note: noteState[0] })
          .then(function (data) {
            resultState[1]({ address: data.address, appPassword: data.appPassword })
            props.onChanged()
          })
          .catch(function (error) { errorState[1](error.message) })
          .finally(function () { busyState[1](false) })
      }

      var copy = function (text, tag) {
        navigator.clipboard.writeText(text).then(function () {
          copiedState[1](tag)
          window.setTimeout(function () { copiedState[1]('') }, 1500)
        }).catch(function () {})
      }

      var result = resultState[0]
      return h(Modal, { title: result ? t('registerOk') : t('registerTitle'), onClose: props.onClose },
        result
          ? [
              h('div', { key: 'addr', style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h('span', { style: labelStyle }, t('registerResult')),
                h('div', { style: { display: 'flex', gap: 6 } },
                  h('code', { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, result.address),
                  h('button', { type: 'button', style: btnStyle, onClick: function () { copy(result.address, 'addr') } },
                    copiedState[0] === 'addr' ? t('copied') : t('copy')),
                ),
              ),
              result.appPassword
                ? h('div', { key: 'pwd', style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                    h('span', { style: labelStyle }, t('registerPwd')),
                    h('div', { style: { display: 'flex', gap: 6 } },
                      h('code', { style: { flex: 1, fontSize: 12, wordBreak: 'break-all' } }, result.appPassword),
                      h('button', { type: 'button', style: btnStyle, onClick: function () { copy(result.appPassword, 'pwd') } },
                        copiedState[0] === 'pwd' ? t('copied') : t('copy')),
                    ),
                  )
                : null,
              h('div', { key: 'hint', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('registerDone')),
            ]
          : [
              h('label', { key: 'u', style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h('span', { style: labelStyle }, t('registerUser')),
                h('div', {
                  style: {
                    display: 'flex', alignItems: 'center', height: 28, borderRadius: 7,
                    border: '1px solid var(--dsw-alias-border-l1)',
                    background: 'var(--dsw-alias-bg-layer-1)', overflow: 'hidden',
                  },
                },
                  h('input', {
                    style: Object.assign({}, inputStyle, { border: 'none', borderRadius: 0, flex: 1, height: '100%' }),
                    value: usernameState[0], placeholder: 'taobao01',
                    onChange: function (event) { usernameState[1](event.target.value.replace(/@.*$/, '')) },
                  }),
                  h('span', {
                    style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: '0 8px', userSelect: 'none', flex: 'none' },
                  }, MAIL_SUFFIX),
                ),
              ),
              h(Field, { key: 'n', label: t('registerNote'), value: noteState[0], placeholder: t('registerNotePh'), onChange: noteState[1] }),
              errorState[0] ? h('div', { key: 'e', style: { fontSize: 12, color: '#e5484d' } }, errorState[0]) : null,
              h('div', { key: 'b', style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
                h('button', { type: 'button', style: btnStyle, onClick: props.onClose }, t('close')),
                h('button', { type: 'button', style: btnPrimaryStyle, disabled: busyState[0], onClick: submit },
                  busyState[0] ? t('loading') : t('quickRegister')),
              ),
            ],
      )
    }

    function AddDialog(props) {
      var t = props.t
      var emailState = React.useState('')
      var passwordState = React.useState('')
      var busyState = React.useState(false)
      var errorState = React.useState('')

      var submit = function () {
        if (busyState[0]) return
        busyState[1](true)
        errorState[1]('')
        // 支持 @skillpie.cn 前缀简写(自动补全)或任意完整邮箱地址
        var prefix = emailState[0].trim()
        var email = prefix.indexOf('@') >= 0 ? prefix : prefix + MAIL_SUFFIX
        api('add', { email: email, password: passwordState[0] })
          .then(function () {
            props.onChanged()
            props.onClose()
          })
          .catch(function (error) { errorState[1](error.message) })
          .finally(function () { busyState[1](false) })
      }

      return h(Modal, { title: t('addTitle'), onClose: props.onClose },
        h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h('span', { style: labelStyle }, t('email')),
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', height: 28, borderRadius: 7,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)', overflow: 'hidden',
            },
          },
            h('input', {
              style: Object.assign({}, inputStyle, { border: 'none', borderRadius: 0, flex: 1, height: '100%' }),
              value: emailState[0], placeholder: 'taobao01',
              onChange: function (event) { emailState[1](event.target.value.replace(/@.*$/, '')) },
            }),
            h('span', {
              style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: '0 8px', userSelect: 'none', flex: 'none' },
            }, MAIL_SUFFIX),
          ),
        ),
        h(Field, {
          label: [
            t('appPasswordLabel'),
            h('span', {
              key: 'tip', title: t('appPasswordTip'),
              style: {
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: 4, width: 14, height: 14, borderRadius: '50%',
                border: '1px solid var(--dsw-alias-border-l1)', fontSize: 10,
                color: 'var(--dsw-alias-label-secondary)', cursor: 'help', userSelect: 'none',
              },
            }, '?'),
          ],
          value: passwordState[0], onChange: passwordState[1],
        }),
        errorState[0] ? h('div', { style: { fontSize: 12, color: '#e5484d' } }, errorState[0]) : null,
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
          h('button', { type: 'button', style: btnStyle, onClick: props.onClose }, t('close')),
          h('button', { type: 'button', style: btnPrimaryStyle, disabled: busyState[0], onClick: submit },
            busyState[0] ? t('loading') : t('addOk')),
        ),
      )
    }

    function SettingsSection(props) {
      var t = props.t || pageT
      var listState = React.useState(null) // null=加载中
      var mailboxes = listState[0]
      var setMailboxes = listState[1]
      var dialogState = React.useState(null) // 'register' | 'add' | null
      var dialog = dialogState[0]
      var setDialog = dialogState[1]

      var refresh = React.useCallback(function () {
        api('list').then(function (data) { setMailboxes(data.mailboxes) }).catch(function () { setMailboxes([]) })
      }, [])
      React.useEffect(function () { refresh() }, [refresh])

      var removeOne = function (email) {
        api('remove', { email: email }).then(function (data) { setMailboxes(data.mailboxes) }).catch(function () {})
      }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h(MailIcon, { size: 16 }),
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, t('title')),
        ),
        h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('sectionDesc')),
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { type: 'button', style: btnPrimaryStyle, onClick: function () { setDialog('register') } }, t('quickRegister')),
          h('button', { type: 'button', style: btnStyle, onClick: function () { setDialog('add') } }, t('add')),
          h('button', { type: 'button', style: btnStyle, onClick: function () { setDialog('inbox:') } }, t('inbox')),
        ),
        mailboxes === null
          ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('loading'))
          : mailboxes.length === 0
            ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('empty'))
            : h('div', { style: { display: 'flex', flexDirection: 'column' } },
                mailboxes.map(function (box) {
                  return h('div', {
                    key: box.email,
                    style: {
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px',
                      borderBottom: '1px solid var(--dsw-alias-border-l1)', fontSize: 12,
                    },
                  },
                    h(MailIcon, { size: 13 }),
                    h('span', { style: { fontWeight: 500 } }, box.email),
                    box.note ? h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, box.note) : null,
                    h('span', { style: { flex: 1 } }),
                    h('button', {
                      type: 'button', style: btnStyle,
                      onClick: function () { setDialog('inbox:' + box.email) },
                    }, t('inbox')),
                    h('button', {
                      type: 'button', style: Object.assign({}, btnStyle, { color: '#e5484d' }),
                      onClick: function () { removeOne(box.email) },
                    }, t('remove')),
                  )
                }),
              ),
        dialog === 'register'
          ? h(RegisterDialog, { t: t, onClose: function () { setDialog(null) }, onChanged: refresh })
          : null,
        dialog === 'add'
          ? h(AddDialog, { t: t, onClose: function () { setDialog(null) }, onChanged: refresh })
          : null,
        typeof dialog === 'string' && dialog.indexOf('inbox:') === 0
          ? h(InboxDialog, { t: t, email: dialog.slice(6), onClose: function () { setDialog(null) } })
          : null,
      )
    }


    /* ── 收件箱弹窗(列表 → 详情) ───────────────────────────────────── */

    function InboxDialog(props) {
      var t = props.t
      var listState = React.useState(null)
      var messages = listState[0]
      var setMessages = listState[1]
      var openState = React.useState(null)
      var opened = openState[0]
      var setOpened = openState[1]

      React.useEffect(function () {
        api('history', { email: props.email || '' }).then(function (data) {
          setMessages(data.messages || [])
        }).catch(function () { setMessages([]) })
      }, [])

      if (!ReactDOM || typeof ReactDOM.createPortal !== 'function') return null
      var closeList = function () { props.onClose() }
      return ReactDOM.createPortal(
        h('div', {
          onClick: function () { if (!opened) closeList() },
          style: {
            position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
          },
        },
          h('div', {
            onClick: function (event) { event.stopPropagation() },
            style: {
              width: 560, maxWidth: '92vw', maxHeight: '72vh', overflowY: 'auto',
              padding: 18, borderRadius: 12,
              background: '#ffffff', color: '#1c1c1e',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)', fontSize: 13, lineHeight: 1.55,
              display: 'flex', flexDirection: 'column', gap: 8,
            },
          },
            /* 标题行 */
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { fontWeight: 600, fontSize: 14 } },
                opened ? (opened.subject || t('noSubject')) : t('inbox')),
              h('span', { style: { flex: 1 } }),
              opened
                ? h('button', { type: 'button', style: btnStyle, onClick: function () { setOpened(null) } }, t('back'))
                : null,
              h('button', { type: 'button', style: btnStyle, onClick: closeList }, t('close')),
            ),
            opened
              ? /* 详情视图 */
              [
                h('div', { key: 'meta', style: { fontSize: 12, color: '#6d6d72', display: 'flex', flexDirection: 'column', gap: 2 } },
                  h('span', null, (t('from') || '发件人') + '：' + (opened.from || '-')),
                  h('span', null, (t('toLabel') || '收件邮箱') + '：' + opened.email),
                  opened.date ? h('span', null, (t('dateLabel') || '时间') + '：' + opened.date) : null,
                ),
                opened.html
                  ? h('div', {
                      key: 'body',
                      style: {
                        fontSize: 13, color: '#3a3a3c', wordBreak: 'break-all', lineHeight: 1.6,
                        background: '#f5f5f7', borderRadius: 8, padding: '10px 12px',
                        maxHeight: 320, overflowY: 'auto',
                      },
                      dangerouslySetInnerHTML: { __html: opened.html },
                    })
                  : h('div', {
                      key: 'body',
                      style: {
                        fontSize: 12, color: '#3a3a3c', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        background: '#f5f5f7', borderRadius: 8, padding: '8px 10px',
                        maxHeight: 320, overflowY: 'auto',
                      },
                    }, opened.text || '(无正文)'),
              ]
              : /* 列表视图 */
              [
                h('div', {
                  key: 'sub', style: { fontSize: 12, color: '#8a8a8e' },
                }, props.email || t('inboxAll')),
                messages === null
                  ? h('div', { key: 'load', style: { fontSize: 12, color: '#8a8a8e' } }, t('loading'))
                  : messages.length === 0
                    ? h('div', { key: 'empty', style: { fontSize: 12, color: '#8a8a8e' } }, t('inboxEmpty'))
                    : h('div', { key: 'list', style: { display: 'flex', flexDirection: 'column' } },
                        messages.map(function (m) {
                          return h('div', {
                            key: m.id,
                            onClick: function () { setOpened(m) },
                            style: {
                              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px',
                              borderBottom: '1px solid #f0f0f2', fontSize: 12, cursor: 'pointer',
                              borderRadius: 6,
                            },
                            onMouseEnter: function (event) { event.currentTarget.style.background = '#f5f5f7' },
                            onMouseLeave: function (event) { event.currentTarget.style.background = 'transparent' },
                          },
                            h('span', { style: { color: '#8a8a8e', flex: 'none', width: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                              m.email.replace(/@skillpie\.cn$/, '')),
                            h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 } },
                              m.subject || t('noSubject')),
                            h('span', { style: { color: '#8a8a8e', flex: 'none', width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' } },
                              m.from || '-'),
                          )
                        })),
              ],
          ),
        ),
        document.body,
      )
    }

    /* ── 全局新邮件弹窗 ─────────────────────────────────────────────── */


    var pollSeq = 0 // 已取走的通知最大 seq(内存态,刷新后从 0 重新拉取不重复弹:seq 会重置)

    function MailPopup(props) {
      var t = props.t
      var mailState = React.useState(null)
      var mail = mailState[0]
      var setMail = mailState[1]

      React.useEffect(function () {
        var stopped = false
        var timer = window.setInterval(function () {
          api('poll', { sinceSeq: pollSeq }).then(function (data) {
            if (stopped || !data.notifications || !data.notifications.length) return
            // 只展示最新一封;seq 推进到最大,跳过的旧通知视为已读
            for (var i = 0; i < data.notifications.length; i++) {
              var item = data.notifications[i]
              if (item.seq > pollSeq) pollSeq = item.seq
            }
            setMail(data.notifications[data.notifications.length - 1])
          }).catch(function () {})
        }, 8000)
        return function () {
          stopped = true
          window.clearInterval(timer)
        }
      }, [])

      if (!mail || !ReactDOM || typeof ReactDOM.createPortal !== 'function') return null
      var close = function () { setMail(null) }
      // 全局居中模态:遮罩+浅色卡片,仅用户点击关闭按钮/遮罩才消失
      return ReactDOM.createPortal(
        h('div', {
          onClick: close,
          style: {
            position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
          },
        },
          h('div', {
            onClick: function (event) { event.stopPropagation() },
            style: {
              width: 420, maxWidth: '88vw', maxHeight: '70vh', overflowY: 'auto',
              padding: 18, borderRadius: 12,
              background: '#ffffff', color: '#1c1c1e',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)', fontSize: 13, lineHeight: 1.55,
              display: 'flex', flexDirection: 'column', gap: 8,
            },
          },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('span', { style: { display: 'inline-flex', color: '#34c759' } },
                h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                  h('rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }),
                  h('path', { d: 'm3 7 9 6 9-6' }))),
              h('span', { style: { fontWeight: 600 } }, t('newMail')),
              h('span', { style: { flex: 1 } }),
              h('span', { style: { fontSize: 12, color: '#8a8a8e', wordBreak: 'break-all' } }, mail.email),
              h('button', {
                onClick: close,
                style: {
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 16, lineHeight: 1, color: '#8a8a8e', padding: '0 2px',
                },
              }, '×'),
            ),
            h('div', { style: { fontWeight: 600, wordBreak: 'break-all' } }, mail.subject || '(无主题)'),
            mail.from
              ? h('div', { style: { fontSize: 12, color: '#6d6d72', wordBreak: 'break-all' } }, mail.from)
              : null,
            mail.html
              ? h('div', {
                  style: {
                    fontSize: 13, color: '#3a3a3c', wordBreak: 'break-all', lineHeight: 1.6,
                    background: '#f5f5f7', borderRadius: 8, padding: '10px 12px', maxHeight: 260, overflowY: 'auto',
                  },
                  dangerouslySetInnerHTML: { __html: mail.html },
                })
              : mail.text
                ? h('div', {
                    style: {
                      fontSize: 12, color: '#3a3a3c', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      background: '#f5f5f7', borderRadius: 8, padding: '8px 10px', maxHeight: 260, overflowY: 'auto',
                    },
                  }, mail.text.length > 800 ? mail.text.slice(0, 800) + '…' : mail.text)
                : null,
            h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
              h('button', {
                onClick: close,
                style: {
                  border: '1px solid rgba(0,0,0,0.12)', background: '#f5f5f7', cursor: 'pointer',
                  borderRadius: 7, padding: '4px 14px', fontSize: 12, color: '#1c1c1e',
                },
              }, t('close')),
            ),
          ),
        ),
        document.body,
      )
    }

    /* ── 注册 ───────────────────────────────────────────────────────── */

    return {
      name: 'dsh-skillpie-mail',
      inject: ['slots', 'locale'],
      apply: function (ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-skillpie-mail: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key, vars) {
              var s = zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)
              if (vars) for (var k in vars) s = s.replace('{' + k + '}', String(vars[k]))
              return s
            }

        // 同一个槽只 inject 一次:设置页分区(注册+列表)与全局新邮件弹窗分属
        // 不同槽(settings.section / shell.overlay),各自注册。
        ctx.slots.inject('settings.section', function () {
          return ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-skillpie-mail',
              order: 62,
              label: function () { return pageT('title') },
              locale: NS,
            },
            function SettingsSectionSlot(sectionProps) {
              return h(SettingsSection, { t: sectionProps.t || pageT })
            },
          )
        })

        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-skillpie-mail-popup',
              order: 45,
              locale: NS,
            },
            function MailPopupOverlay(overlayProps) {
              return h(MailPopup, { t: overlayProps.t || pageT })
            },
          )
        })
      },
    }
  },
})
