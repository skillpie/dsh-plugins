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
      title: 'SkillPie收件箱',
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
      addTitle: '添加邮箱',
      mergeHint: '已有邮箱填密码直接添加;新用户名自动注册,登录密码为系统自动生成的应用密码(Stalwart 不支持自设账号密码)。',
      email: '邮箱地址',
      password: '密码',
      appPasswordLabel: '密码 / 应用密码',
      appPasswordTip: '已有账号: 填它的应用密码 (app_ 开头) 直接添加; 老账号可在 mail.skillpie.cn/admin 签发。',
      addOk: '添加',
      remove: '移除',
      empty: '还没有邮箱，点「添加邮箱」。',
      mailboxCount: '共 {n} 个邮箱',
      newMail: '新邮件',
      close: '关闭',
      clearAll: '清空',
      markAllRead: '全部已读',
      prevMail: '上一封',
      del: '删除',
      nextMail: '下一封',
      back: '返回',
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
      back: 'Back',
      del: 'Delete',
      prevMail: 'Prev',
      nextMail: 'Next',
      markAllRead: 'Mark all read',
      clearAll: 'Clear',
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

    function fmtTime(iso) {
      if (!iso) return ''
      var d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      var p = function (n) { return n < 10 ? '0' + n : '' + n }
      return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }

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
      var noteState = React.useState('')
      var busyState = React.useState(false)
      var errorState = React.useState('')
      var resultState = React.useState(null)
      var copiedState = React.useState('')

      var copy = function (text, tag) {
        navigator.clipboard.writeText(text).then(function () {
          copiedState[1](tag)
          window.setTimeout(function () { copiedState[1]('') }, 1500)
        }).catch(function () {})
      }

      var submit = function () {
        if (busyState[0]) return
        busyState[1](true)
        errorState[1]('')
        var prefix = emailState[0].trim()
        api('addOrRegister', { username: prefix, note: noteState[0], password: passwordState[0] })
          .then(function (data) {
            props.onChanged()
            if (data.mode === 'registered') resultState[1]({ address: data.address, appPassword: data.appPassword })
            else props.onClose()
          })
          .catch(function (error) { errorState[1](error.message) })
          .finally(function () { busyState[1](false) })
      }

      var result = resultState[0]
      return h(Modal, { title: result ? t('registerOk') : t('addTitle'), onClose: props.onClose },
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
              h('div', { key: 'pwd', style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h('span', { style: labelStyle }, t('registerPwd')),
                h('div', { style: { display: 'flex', gap: 6 } },
                  h('code', { style: { flex: 1, fontSize: 12, wordBreak: 'break-all' } }, result.appPassword),
                  h('button', { type: 'button', style: btnStyle, onClick: function () { copy(result.appPassword, 'pwd') } },
                    copiedState[0] === 'pwd' ? t('copied') : t('copy')),
                ),
              ),
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
                    value: emailState[0], placeholder: 'taobao01',
                    onChange: function (event) { emailState[1](event.target.value.replace(/@.*$/, '')) },
                  }),
                  h('span', {
                    style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: '0 8px', userSelect: 'none', flex: 'none' },
                  }, MAIL_SUFFIX),
                ),
              ),
              h(Field, { key: 'n', label: t('registerNote'), value: noteState[0], placeholder: t('registerNotePh'), onChange: noteState[1] }),
              h(Field, { key: 'p', label: t('appPasswordLabel') + '（选填）', value: passwordState[0], onChange: passwordState[1], placeholder: t('appPasswordTip') }),
              h('div', { key: 'hint2', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('mergeHint')),
              errorState[0] ? h('div', { key: 'e', style: { fontSize: 12, color: '#e5484d' } }, errorState[0]) : null,
              h('div', { key: 'b', style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
                h('button', { type: 'button', style: btnStyle, onClick: props.onClose }, t('close')),
                h('button', { type: 'button', style: btnPrimaryStyle, disabled: busyState[0], onClick: submit },
                  busyState[0] ? t('loading') : t('addOk')),
              ),
            ],
      )
    }

    function SettingsSection(props) {
      var t = props.t || pageT
      var listState = React.useState(null) // null=加载中
      var mailboxes = listState[0]
      var setMailboxes = listState[1]
      var selState = React.useState('') // ''=全部邮箱
      var selected = selState[0]
      var setSelected = selState[1]
      var msgState = React.useState(null)
      var messages = msgState[0]
      var setMessages = msgState[1]
      var openState = React.useState(null)
      var opened = openState[0]
      var setOpened = openState[1]
      var pageState = React.useState(0)
      var page = pageState[0]
      var setPage = pageState[1]
      var dialogState = React.useState(null) // 'add' | null
      var dialog = dialogState[0]
      var setDialog = dialogState[1]
      var confirmingState = React.useState(false) // 清空两段式确认
      var confirming = confirmingState[0]
      var menuState = React.useState(null) // {email,x,y} 右键菜单
      var menu = menuState[0]
      var setMenu = menuState[1]
      var PAGE_SIZE = 10

      var refresh = React.useCallback(function () {
        api('list').then(function (data) { setMailboxes(data.mailboxes) }).catch(function () { setMailboxes([]) })
      }, [])
      React.useEffect(function () { refresh() }, [refresh])

      // 切换账号→拉取对应邮件(''=全部)
      React.useEffect(function () {
        setMessages(null); setOpened(null); setPage(0)
        api('history', { email: selected }).then(function (data) {
          var list = (data.messages || []).slice().sort(function (a, b) {
            return new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0) // 全局时间倒序,最新在前
          })
          setMessages(list)
        }).catch(function () { setMessages([]) })
      }, [selected])

      // 点任意处关闭右键菜单
      React.useEffect(function () {
        if (!menu) return undefined
        var close = function () { setMenu(null) }
        window.addEventListener('click', close)
        return function () { window.removeEventListener('click', close) }
      }, [menu])

      var removeOne = function (email) {
        setMenu(null)
        api('remove', { email: email }).then(function (data) {
          setMailboxes(data.mailboxes)
          if (selected === email) setSelected('')
        }).catch(function () {})
      }

      var prefix = function (email) { return String(email || '').replace(/@skillpie\.cn$/, '') }

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0, height: 520 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, height: 44, flex: 'none', paddingLeft: 10 } },
          h(MailIcon, { size: 16 }),
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, t('title')),
        ),
        h('div', { style: { display: 'flex', flex: 1, minHeight: 0, borderTop: '1px solid #f0f0f2' } },
          /* 左栏:账号列表 */
          h('div', { style: { width: 168, flex: 'none', borderRight: '1px solid #f0f0f2', display: 'flex', flexDirection: 'column', minHeight: 0 } },
            h('div', { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 4px 0 0' } },
            h('div', {
              onClick: function () { setSelected('') },
              style: {
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                fontWeight: selected === '' ? 600 : 400, background: selected === '' ? '#f5f5f7' : 'transparent', borderRadius: 6,
              },
            },
              h(MailIcon, { size: 13 }), t('inboxAll'),
            ),
            (mailboxes || []).map(function (box) {
              var isSel = selected === box.email
              return h('div', {
                key: box.email,
                onClick: function () { setSelected(box.email) },
                onContextMenu: function (event) {
                  event.preventDefault()
                  setMenu({ email: box.email, x: event.clientX, y: event.clientY })
                },
                title: box.email + (box.note ? ' · ' + box.note : '') + '（右键移除）',
                style: {
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                  fontWeight: isSel ? 600 : 400, background: isSel ? '#f5f5f7' : 'transparent', borderRadius: 6,
                },
              },
                h(MailIcon, { size: 13 }),
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  prefix(box.email) + (box.note ? ' ' + box.note : '')),
              )
            }),
            ),
            h('div', { style: { padding: 6 } },
              h('button', {
                type: 'button', style: Object.assign({}, btnPrimaryStyle, { width: '100%', justifyContent: 'center' }),
                onClick: function () { setDialog('add') },
              }, '+ ' + t('add')),
            ),
          ),
          /* 右栏:邮件列表/详情 */
          h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '6px 0 0 10px' } },
            opened
              ? [
                  h('div', { key: 'back', style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('button', { type: 'button', style: btnStyle, onClick: function () { setOpened(null) } }, '‹ ' + t('back')),
                    h('span', { style: { flex: 1 } }),
                    h('button', {
                      type: 'button', style: Object.assign({}, btnStyle, { color: '#e5484d', borderColor: 'rgba(229,72,77,0.4)' }),
                      onClick: function () {
                        var id = opened.id
                        var i = messages.findIndex(function (m) { return m.id === id })
                        var neighbor = messages[i - 1] || messages[i + 1] // 删除后自动跳到相邻邮件
                        api('deleteMail', { id: id }).catch(function () {})
                        syncUnread()
                        var left = messages.filter(function (m) { return m.id !== id })
                        setMessages(left)
                        setOpened(neighbor || null)
                      },
                    }, t('del')),
                    h('button', {
                      type: 'button', style: btnStyle,
                      disabled: messages.findIndex(function (m) { return m.id === opened.id }) <= 0,
                      onClick: function () {
                        var i = messages.findIndex(function (m) { return m.id === opened.id })
                        var next = messages[i - 1] // 列表倒序,上一封=数组前一个(更新)
                        if (next) {
                          if (!next.read) { next.read = true; api('markRead', { id: next.id }).catch(function () {}); syncUnread() }
                          setOpened(next)
                        }
                      },
                    }, '↑ ' + (t('prevMail') || '上一封')),
                    h('button', {
                      type: 'button', style: btnStyle,
                      disabled: messages.findIndex(function (m) { return m.id === opened.id }) < 0 || messages.findIndex(function (m) { return m.id === opened.id }) >= messages.length - 1,
                      onClick: function () {
                        var i = messages.findIndex(function (m) { return m.id === opened.id })
                        var nextM = messages[i + 1] // 数组后一个(更早)
                        if (nextM) {
                          if (!nextM.read) { nextM.read = true; api('markRead', { id: nextM.id }).catch(function () {}); syncUnread() }
                          setOpened(nextM)
                        }
                      },
                    }, '↓ ' + (t('nextMail') || '下一封')),
                  ),
                  h('div', { key: 'subj', style: { fontSize: 14, fontWeight: 600, marginTop: 6 } }, opened.subject || t('noSubject')),
                  h('div', { key: 'meta', style: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#8a8a8e', margin: '6px 0' } },
                    h('span', null, (t('from') || '发件人') + '：' + (opened.from || '-')),
                    h('span', null, (t('toLabel') || '收件邮箱') + '：' + opened.email),
                    h('span', null, (t('dateLabel') || '时间') + '：' + (fmtTime(opened.receivedAt) || opened.date || '-')),
                  ),
                  opened.html
                    ? h('div', {
                        key: 'html',
                        style: { fontSize: 12, color: '#3a3a3c', background: '#f5f5f7', borderRadius: 8, padding: '8px 10px', flex: 1, minHeight: 0, overflowY: 'auto' },
                        dangerouslySetInnerHTML: { __html: opened.html },
                      })
                    : h('div', {
                        key: 'body',
                        style: { fontSize: 12, color: '#3a3a3c', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f5f5f7', borderRadius: 8, padding: '8px 10px', flex: 1, minHeight: 0, overflowY: 'auto' },
                      }, opened.text || '(无正文)'),
                ]
              : [
                  h('div', { key: 'toolbar', style: { display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4, borderBottom: '1px solid #f0f0f2' } },
                    h('button', {
                      type: 'button', style: btnStyle,
                      onClick: function () {
                        if (!messages) return
                        api('markAllRead', { email: selected }).then(function () {
                          // 服务端写完再更新本地,保证实时刷新且不丢
                          setMessages(function (prev) { return prev.map(function (m) { return Object.assign({}, m, { read: true }) }) })
                          syncUnread()
                        }).catch(function () {})
                      },
                    }, t('markAllRead')),
                    h('span', { key: 'sp', style: { flex: 1 } }),
                    h('button', {
                      type: 'button', style: Object.assign({}, btnStyle, confirming ? { color: '#fff', background: '#e5484d', borderColor: '#e5484d' } : { color: '#e5484d', borderColor: 'rgba(229,72,77,0.4)' }),
                      onClick: function () {
                        // DSH 可能屏蔽 window.confirm,两段式确认
                        if (!confirming) {
                          confirmingState[1](true)
                          window.setTimeout(function () { confirmingState[1](false) }, 3000)
                          return
                        }
                        confirmingState[1](false)
                        api('clearHistory', { email: selected }).then(function () {
                          setMessages([]); setPage(0)
                        }).catch(function () {})
                      },
                    }, confirming ? '确认清空?' : t('clearAll')),
                  ),
                  messages === null
                    ? h('div', { key: 'load', style: { fontSize: 12, color: '#8a8a8e' } }, t('loading'))
                    : messages.length === 0
                      ? h('div', { key: 'empty', style: { fontSize: 12, color: '#8a8a8e' } }, t('inboxEmpty'))
                      : [
                          h('div', { key: 'list', style: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' } },
                            messages.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(function (m) {
                              return h('div', {
                                key: m.id,
                                onClick: function () {
                                  setOpened(m)
                                  if (!m.read) {
                                    m.read = true
                                    api('markRead', { id: m.id }).catch(function () {}); syncUnread()
                                  }
                                },
                                style: {
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px',
                                  borderBottom: '1px solid #f0f0f2', fontSize: 12, cursor: 'pointer', borderRadius: 6,
                                  fontWeight: m.read ? 400 : 600, // 未读整行加粗
                                },
                                onMouseEnter: function (event) { event.currentTarget.style.background = '#f5f5f7' },
                                onMouseLeave: function (event) { event.currentTarget.style.background = 'transparent' },
                              },
                                h('span', {
                                  key: 'rdot',
                                  title: m.read ? '已读' : '未读',
                                  style: {
                                    flex: 'none', width: 8, height: 8, borderRadius: 4,
                                    background: m.read ? 'transparent' : '#0a84ff',
                                    border: m.read ? '1px solid #c7c7cc' : 'none',
                                  },
                                }),
                                selected === '' ? h('span', { style: { color: '#8a8a8e', flex: 'none', width: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, prefix(m.email)) : null,
                                h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 } }, m.subject || t('noSubject')),
                                h('span', { style: { color: '#8a8a8e', flex: 'none', width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' } }, m.from || '-'),
                                h('span', { style: { color: '#8a8a8e', flex: 'none', width: 78, fontSize: 11, textAlign: 'right' } }, fmtTime(m.receivedAt)),
                              )
                            })),
                          h('div', { key: 'pager', style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 6, fontSize: 12, color: '#8a8a8e' } },
                            h('span', null, '共 ' + messages.length + ' 封 · 第 ' + (page + 1) + '/' + Math.max(1, Math.ceil(messages.length / PAGE_SIZE)) + ' 页'),
                            h('button', { type: 'button', style: Object.assign({}, btnStyle, { opacity: page === 0 ? 0.4 : 1 }), disabled: page === 0, onClick: function () { setPage(page - 1) } }, '‹ 上一页'),
                            h('button', { type: 'button', style: Object.assign({}, btnStyle, { opacity: (page + 1) * PAGE_SIZE >= messages.length ? 0.4 : 1 }), disabled: (page + 1) * PAGE_SIZE >= messages.length, onClick: function () { setPage(page + 1) } }, '下一页 ›'),
                          ),
                        ],
                ],
          ),
        ),
        dialog === 'add'
          ? h(AddDialog, { t: t, onClose: function () { setDialog(null) }, onChanged: refresh })
          : null,
        menu
          ? ReactDOM.createPortal(
              h('div', {
                style: {
                  position: 'fixed', left: menu.x, top: menu.y, zIndex: 3200,
                  background: '#ffffff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: 4, minWidth: 120,
                },
                onClick: function (event) { event.stopPropagation() },
              },
                h('div', {
                  onClick: function () { removeOne(menu.email) },
                  style: { padding: '6px 10px', fontSize: 12, color: '#e5484d', cursor: 'pointer', borderRadius: 5 },
                  onMouseEnter: function (event) { event.currentTarget.style.background = '#fdecec' },
                  onMouseLeave: function (event) { event.currentTarget.style.background = 'transparent' },
                }, t('remove')),
              ), document.body)
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
      var pageState = React.useState(0) // 收件箱列表分页
      var page = pageState[0]
      var setPage = pageState[1]
      var confirmState = React.useState(false)
      var confirming = confirmState[0]
      var errState = React.useState('')
      var errMsg = errState[0]
      var setErr = errState[1]
      var PAGE_SIZE = 10

      React.useEffect(function () {
        api('history', { email: props.email || '' }).then(function (data) {
          setMessages(data.messages || [])
        }).catch(function () { setMessages([]) })
      }, [])
      // 返回列表时若超出末页则回退
      var backToList = function () {
        setOpened(null)
        setPage(function (p) { return messages && (p + 1) * PAGE_SIZE > messages.length ? Math.max(0, Math.ceil(messages.length / PAGE_SIZE) - 1) : p })
      }

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
                ? h('button', { type: 'button', style: btnStyle, onClick: backToList }, t('back'))
                : null,
              h('button', { type: 'button', style: btnStyle, onClick: closeList }, t('close')),
            ),
            opened
              ? /* 详情视图 */
              [
                h('div', { key: 'meta', style: { fontSize: 12, color: '#6d6d72', display: 'flex', flexDirection: 'column', gap: 2 } },
                  h('span', null, (t('from') || '发件人') + '：' + (opened.from || '-')),
                  h('span', null, (t('toLabel') || '收件邮箱') + '：' + opened.email),
                  h('span', null, (t('dateLabel') || '时间') + '：' + (fmtTime(opened.receivedAt) || opened.date || '-')),
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
                    : [
                        h('div', { key: 'list', style: { display: 'flex', flexDirection: 'column' } },
                          messages.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(function (m) {
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
                            h('span', { style: { color: '#8a8a8e', flex: 'none', width: 78, fontSize: 11, textAlign: 'right' } },
                              fmtTime(m.receivedAt)),
                          )
                          })),
                        h('div', { key: 'pager', style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 6, fontSize: 12, color: '#8a8a8e' } },
                          h('span', null, '共 ' + messages.length + ' 封 · 第 ' + (page + 1) + '/' + Math.max(1, Math.ceil(messages.length / PAGE_SIZE)) + ' 页'),
                          h('button', { type: 'button', style: Object.assign({}, btnStyle, { opacity: page === 0 ? 0.4 : 1 }), disabled: page === 0, onClick: function () { setPage(page - 1) } }, '‹ 上一页'),
                          h('button', { type: 'button', style: Object.assign({}, btnStyle, { opacity: (page + 1) * PAGE_SIZE >= messages.length ? 0.4 : 1 }), disabled: (page + 1) * PAGE_SIZE >= messages.length, onClick: function () { setPage(page + 1) } }, '下一页 ›'),
                          h('button', { type: 'button', style: Object.assign({}, btnStyle, confirming ? { color: '#fff', background: '#e5484d', borderColor: '#e5484d' } : { color: '#e5484d', borderColor: 'rgba(229,72,77,0.4)' }), onClick: function () {
                            // DSH 环境可能屏蔽 window.confirm,改用两段确认
                            if (!confirming) {
                              confirmState[1](true)
                              window.setTimeout(function () { confirmState[1](false) }, 3000)
                              return
                            }
                            confirmState[1](false)
                            api('clearHistory', { email: props.email || '' }).then(function () {
                              setMessages([])
                              setPage(0)
                              setErr('')
                            }).catch(function (e) { setErr('清空失败: ' + (e && e.message ? e.message : e)) })
                          } }, confirming ? '确认清空?' : t('clearAll')),
                        ),
                        errMsg ? h('div', { style: { color: '#e5484d', fontSize: 12, textAlign: 'center', marginTop: 8 } }, errMsg) : null,
                      ],
              ],
          ),
        ),
        document.body,
      )
    }

    /* ── 全局新邮件弹窗 ─────────────────────────────────────────────── */

    // 底部栏图标共享的未读计数(收到新邮件 +1,打开收件箱清零)
    var refreshRef = { current: null } // MailDock 的立即收件入口
    var syncUnread = function () { // 已读/删除后立即校准底部未读数
      api('unread').then(function (d) {
        if (d && typeof d.count === 'number') dockStore.set(d.count)
      }).catch(function () {})
    }
    var dockStore = {
      count: 0,
      subs: [],
      subscribe: function (fn) { this.subs.push(fn); return this.subs.indexOf(fn) },
      set: function (n) { this.count = n; for (var i = 0; i < this.subs.length; i++) this.subs[i](n) },
      add: function (n) { this.set(this.count + n) },
    }


    var pollSeq = 0 // 已取走的通知最大 seq(内存态,刷新后从 0 重新拉取不重复弹:seq 会重置)

    function MailPopup(props) {
      var t = props.t
      var mailsState = React.useState([])
      var mails = mailsState[0]
      var setMails = mailsState[1]

      var viewState = React.useState(0) // hooks 必须全部在条件 return 之前
      var view = viewState[0]
      var setView = viewState[1]

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
            setMails(function (prev) { return prev.concat(data.notifications) })
            dockStore.add(data.notifications.length)
          }).catch(function () {})
        }, 8000)
        return function () {
          stopped = true
          window.clearInterval(timer)
        }
      }, [])

      var idx = mails.length ? Math.min(view, mails.length - 1) : 0
      if (!mails || !mails.length || !ReactDOM || typeof ReactDOM.createPortal !== 'function') return null
      var close = function () { setMails([]) }
      var goPrev = function () { setView(function (v) { return (v - 1 + mails.length) % mails.length }) }
      var goNext = function () { setView(function (v) { return (v + 1) % mails.length }) }
      var pagerBtn = {
        border: '1px solid rgba(0,0,0,0.12)', background: '#f5f5f7', cursor: 'pointer',
        borderRadius: 6, padding: '1px 8px', fontSize: 13, lineHeight: 1.4, color: '#1c1c1e',
      }
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
              h('span', { style: { fontWeight: 600 } }, t('newMail') + (mails.length > 1 ? ' (' + (idx + 1) + '/' + mails.length + ')' : '')),
              mails.length > 1
                ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
                    h('button', { onClick: goPrev, style: pagerBtn }, '‹'),
                    h('button', { onClick: goNext, style: pagerBtn }, '›'),
                  )
                : null,
              h('span', { style: { flex: 1 } }),
              h('button', {
                onClick: close,
                style: {
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 16, lineHeight: 1, color: '#8a8a8e', padding: '0 2px',
                },
              }, '×'),
            ),
            mails.length > 0 ? (function () {
              var mail = mails[idx]
              return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('span', { style: { fontSize: 12, color: '#8a8a8e', wordBreak: 'break-all', flex: 1 } }, mail.email + (mail.folder ? ' · ' + mail.folder : '')),
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
                )
            })() : null,
            h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
              h('button', {
                onClick: close,
                style: {
                  border: '1px solid rgba(0,0,0,0.12)', background: '#f5f5f7', cursor: 'pointer',
                  borderRadius: 7, padding: '4px 14px', fontSize: 12, color: '#1c1c1e',
                },
              }, t('close') + (mails.length > 1 ? ' (' + mails.length + ')' : '')),
            ),
          ),
        ),
        document.body,
      )
    }

    /* ── 注册 ───────────────────────────────────────────────────────── */

// ======================================================================
// dsh-plugins-plugin:精选推荐(内联模块,自动插入,请勿手改)
// 注入在 factory(require) 内,可用 factory 的 require 取 react;
// apply 末尾通过 window.__DSH_FEATURED_INIT__(ctx) 注册 tab。
// ======================================================================
// >>> dsh-plugins-plugin featured inline (auto-inserted, do not remove markers)
// dsh-plugins-plugin — 精选推荐 client 内联模块(embed/featured.client.js)。
// 这是一段"函数体片段",由 integrate.sh 注入到接入插件 lib/client.js 的
// factory(require) 内部(MARK 之间的内容),因此可以直接用 factory 的 require
// 拿 react,并暴露 window.__DSH_FEATURED_INIT__(ctx) 供 apply 末尾调用。
//
// 为什么不用 DSH 的 require.async 包本地 chunk:chunk URL 必须与 bundle 的
// ?rev= 精确匹配,一旦接入包自己的 bundle 加载失败(如 dsh-app:// 404),
// chunk 永远到不了;内联后 tab 跟随接入插件自己的 bundle,零额外请求。
// 注意:本片段绝不能放到 factory 之外 —— 那样 require 会落到 Node 全局。
;(function () {
  window.__FEATURED_FACTORY_RAN__ = true
  try {
      const React = require('react')
          const h = React.createElement
      
          const NS = 'dsh-plugins-plugin'
          const ROUTE = '/dsh-plugins-plugin/featured'
          // 数据统一由宿主半提供:host 拉远程集中目录(node fetch,无浏览器缓存/CORS)
          // 并合并接入插件登记源,client 只读本地路由,永远新鲜。
      
          function fetchJson(url, timeoutMs) {
            const ctrl = typeof AbortController === 'function' ? new AbortController() : null
            const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs)
            return fetch(url, { cache: 'no-store', headers: { accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
              .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status)
                return res.json()
              })
              .finally(() => clearTimeout(timer))
          }
      
          function fetchText(url, timeoutMs) {
            const ctrl = typeof AbortController === 'function' ? new AbortController() : null
            const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs)
            return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
              .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status)
                return res.text()
              })
              .finally(() => clearTimeout(timer))
          }
      
          // 远程条目规范化(与 host 半 normalizeEntry 对齐的宽松版)。
          // 富字段(author/stars/downloads/screenshots 等)由 scripts/enrich.mjs
          // 在构建期从 awesome-dsh-plugin 官方目录 join 进来,这里原样放行。
          function normalizeRemoteEntry(raw) {
            if (!raw || typeof raw !== 'object') return null
            const pkg = String(raw.package || raw.name || '').trim()
            const title = String(raw.title || '').trim()
            if (!pkg || !title) return null
            const entry = { package: pkg, title, source: 'plugins.json' }
            for (const key of ['description', 'version', 'icon', 'homepage', 'author', 'category']) {
              const v = String(raw[key] || '').trim()
              if (v) entry[key] = v
            }
            if (Array.isArray(raw.screenshots)) {
              const shots = raw.screenshots.map((x) => String(x).trim()).filter(Boolean).slice(0, 2)
              if (shots.length) entry.screenshots = shots
            }
            if (typeof raw.stars === 'number' && raw.stars >= 0) entry.stars = raw.stars
            if (typeof raw.downloads === 'number' && raw.downloads >= 0) entry.downloads = raw.downloads
            if (Array.isArray(raw.tags)) {
              const tags = raw.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
              if (tags.length) entry.tags = tags
            }
            return entry
          }
      
          // 数值缩写:586200 → 586.2k,1200000 → 1.2m。
          function fmtCount(n) {
            if (n >= 1e6) return (Math.round(n / 1e5) / 10) + 'm'
            if (n >= 1e3) return (Math.round(n / 100) / 10) + 'k'
            return String(n)
          }
      
          // raw.githubusercontent 在国内常不可达;转 jsdelivr gh 镜像再失败则放弃。
          function shotCandidates(url) {
            const match = String(url).match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(HEAD|[0-9a-fA-F]{6,}|[^/]+)\/(.+)$/)
            if (!match) return [url]
            const [, owner, repo, ref, file] = match
            const branch = ref === 'HEAD' ? 'main' : ref
            return [
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${file}`,
              url,
              `https://cdn.jsdelivr.net/gh/${owner}/${repo}@master/${file}`,
            ]
          }
      
          // 合并已移到宿主半(host 侧远程目录 + 登记源,按包名去重)。
      
          const zh = {
            tabLabel: '精选推荐',
            title: '精选插件',
            subtitle: '来自接入插件的推荐,可一键安装',
            install: '安装',
            installed: '已安装',
            empty: '暂无精选内容:接入插件可通过 dsh-plugins-plugin 的 integrate.sh 推荐插件',
            loading: '加载中…',
            error: '加载失败',
            retry: '重试',
            recommendedBy: '推荐',
            tags: '标签',
            close: '关闭',
            readmeLoading: 'README 加载中…',
            readmeError: 'README 读取失败',
          }
          const en = {
            tabLabel: 'Featured',
            title: 'Featured Plugins',
            subtitle: 'Recommended by integrated plugins, one-click install',
            install: 'Install',
            installed: 'Installed',
            empty: 'Nothing featured yet: plugins can recommend entries via dsh-plugins-plugin integrate.sh',
            loading: 'Loading…',
            error: 'Failed to load',
            retry: 'Retry',
            recommendedBy: 'Recommended by',
            tags: 'Tags',
            close: 'Close',
            readmeLoading: 'Loading README…',
            readmeError: 'Failed to load README',
          }
      
          const S = {
            wrap: { padding: '12px 0 24px', display: 'flex', flexDirection: 'column', gap: 12 },
            // 官方 Discover 同款瀑布流:CSS 多列,卡片高度不一自然堆叠
            grid: { listStyle: 'none', margin: 0, padding: 0, columns: '300px', columnGap: 12 },
            card: {
              breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', marginBottom: 12,
              display: 'flex', flexDirection: 'column', gap: 8, padding: 14,
              border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 12, background: 'var(--dsw-alias-bg-layer-2)',
            },
            head: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
            // 插件名 + GitHub 图标紧贴成组,右侧留给 安装按钮/已安装徽标
            nameWrap: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 auto' },
            title: {
              fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
            },
            ghLink: { display: 'flex', flex: 'none', color: 'var(--dsw-alias-label-secondary)', textDecoration: 'none' },
            ghIcon: { width: 15, height: 15, fill: 'currentColor' },
            badge: { flex: 'none', fontSize: 12, color: 'var(--dsw-alias-state-success-primary)' },
            iconS: { width: 20, height: 20, borderRadius: 6, objectFit: 'contain', flex: 'none', display: 'block' },
            // 作者行 + 数据行合并为一行:左头像+作者,右 v·↓·★
            authorRow: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginTop: -4, cursor: 'pointer' },
            avatar: { width: 14, height: 14, borderRadius: 999, flex: 'none', display: 'block' },
            author: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            meta: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', flex: 'none', marginLeft: 'auto' },
            desc: {
              margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
              display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            },
            shots: { display: 'flex', gap: 8 },
            shot: {
              display: 'block', flex: 1, minWidth: 0, height: 104, objectFit: 'cover', objectPosition: 'top',
              borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', cursor: 'pointer',
            },
            foot: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 },
            chips: { display: 'flex', flexWrap: 'wrap', gap: 6, flex: '1 1 auto', minWidth: 0 },
            chip: { fontSize: 12, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 },
            src: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            btn: {
              flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12,
              padding: '4px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
            },
            btnBusy: { opacity: 0.6, cursor: 'default' },
            note: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
            retryBtn: {
              alignSelf: 'flex-start', cursor: 'pointer', font: 'inherit', fontSize: 12,
              padding: '4px 14px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
              background: 'transparent', color: 'var(--dsw-alias-label-primary)',
            },
            // ── 自建详情弹窗(README 从 npm 包 jsdelivr 读取) ──
            overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
            panel: {
              width: 'min(860px, 92vw)', maxHeight: '84vh', display: 'flex', flexDirection: 'column',
              background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)',
              borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
            },
            panelHead: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 16px 12px' },
            panelIcon: { width: 44, height: 44, borderRadius: 10, objectFit: 'contain', flex: 'none', background: 'var(--dsw-alias-bg-layer-1)' },
            panelTitleCol: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' },
            panelTitle: { fontSize: 17, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', margin: 0 },
            panelPkg: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            panelClose: {
              flex: 'none', cursor: 'pointer', font: 'inherit', fontSize: 12, border: 'none', background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)', padding: '4px 6px',
            },
            panelMeta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 16px 10px', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
            panelDesc: { margin: '0 16px 12px', fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-primary)' },
            panelBody: { margin: '0 16px', borderTop: '1px solid var(--dsw-alias-border-l1)', padding: '14px 2px 18px', overflowY: 'auto', fontSize: 13, lineHeight: 1.7, color: 'var(--dsw-alias-label-primary)' },
            mdNote: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
            mdH: { fontSize: 15, fontWeight: 600, margin: '18px 0 8px' },
            mdH2: { fontSize: 14, fontWeight: 600, margin: '16px 0 6px' },
            mdP: { margin: '0 0 10px' },
            mdList: { margin: '0 0 10px', paddingLeft: 20 },
            mdLi: { margin: '0 0 4px' },
            mdImg: { display: 'block', maxWidth: '100%', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', margin: '8px 0' },
            mdCode: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 4, padding: '1px 5px' },
            mdPre: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, padding: 12, overflowX: 'auto', margin: '0 0 10px' },
            mdPreCode: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 },
            mdA: { color: 'var(--dsw-alias-link)' },
            linkIcon: { width: 11, height: 11, marginRight: 3, verticalAlign: '-1px', color: 'var(--dsw-alias-link)' },
            mdQuote: { borderLeft: '3px solid var(--dsw-alias-border-l1)', paddingLeft: 12, margin: '0 0 12px', color: 'var(--dsw-alias-label-secondary)' },
            mdTable: { borderCollapse: 'collapse', width: '100%', margin: '0 0 12px', fontSize: 12.5 },
            mdTd: { border: '1px solid var(--dsw-alias-border-l1)', padding: '6px 10px', textAlign: 'left', verticalAlign: 'top' },
          }
      
          // GitHub mark(octicon mark-github 16x16 路径)
          const GH_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z'
      
          // 包名行:npm 包名(左,等宽)+ 数据(右,同行);整行可点开详情弹窗。
          // 不展示作者信息(不依赖 awesome-dsh-plugin 的 author 字段)。
          function FeaturedAuthor(props) {
            const pkg = props.pkg
            const meta = props.meta
            const onDetail = props.onDetail
            if (!pkg && !meta) return null
            return h('div', { style: S.authorRow, onClick: onDetail },
              pkg ? h('span', { style: S.author }, pkg) : null,
              meta ? h('span', { style: S.meta }, meta) : null)
          }
      
          // 截图:逐个候选地址回退(jsdelivr gh 镜像 → 原始 raw → master 分支),全失败则隐藏。
          function FeaturedShot(props) {
            const url = props.url
            const pair = React.useState(0)
            const idx = pair[0], setIdx = pair[1]
            const candidates = React.useMemo(() => shotCandidates(url), [url])
            if (idx >= candidates.length) return null
            return h('img', {
              src: candidates[idx], alt: '', style: S.shot, loading: 'lazy',
              onError: () => setIdx(idx + 1),
              onClick: () => window.open(candidates[idx], '_blank', 'noopener'),
            })
          }
      
          // 卡片布局对齐官方 Discover:
          // 标题行(标题 + GitHub 链接) → 作者行(头像+作者) → 数据行(v·↓·★)
          // → 简介(4 行截断) → 截图(≤2) → 脚行(标签 chips + 安装按钮)。
          // 卡片首行插件图标:候选地址逐个回退(jsdelivr gh 镜像优先),无 icon 或全失败不展示。
          function FeaturedHeadIcon(props) {
            const entry = props.entry
            const pair = React.useState(0)
            const idx = pair[0], setIdx = pair[1]
            const candidates = React.useMemo(() => (entry.icon ? shotCandidates(entry.icon) : []), [entry.icon])
            if (!candidates.length || idx >= candidates.length) return null
            return h('img', { src: candidates[idx], alt: '', style: props.large ? S.panelIcon : S.iconS, loading: 'lazy', onError: () => setIdx(idx + 1) })
          }
      
          function FeaturedCard(props) {
            const e = props.entry
            const t = props.t
            const install = props.install
            const onDetail = props.onDetail // 打开自建详情弹窗
            const installed = !!props.installed // 宿主侧 pluginManager.listBundles 判定
            const pair = React.useState(false) // busy
            const busy = pair[0], setBusy = pair[1]
            const donePair = React.useState(false) // 本会话刚装过(仅避免重复点击)
            const done = donePair[0], setDone = donePair[1]
      
            const onClick = () => {
              if (busy || done || typeof install !== 'function') return
              setBusy(true)
              try {
                install({ spec: e.version ? `${e.package}@${e.version}` : e.package, title: e.title, version: e.version || '' })
                setDone(true)
              } finally {
                setBusy(false)
              }
            }
      
            const btnLabel = busy ? '…' : t('install')
            const metaParts = []
            if (e.version) metaParts.push(`v${e.version}`)
            const metaText = metaParts.join(' · ')
      
            const chips = (e.tags || []).slice(0, 2)
            return h('li', { style: S.card },
              h('div', { style: S.head },
                h(FeaturedHeadIcon, { entry: e }),
                h('div', { style: S.nameWrap },
                  h('span', { style: S.title, title: e.title, onClick: onDetail }, e.title),
                  e.homepage ? h('a', { style: S.ghLink, href: e.homepage, target: '_blank', rel: 'noreferrer noopener', title: e.package },
                    h('svg', { style: S.ghIcon, viewBox: '0 0 16 16', 'aria-hidden': 'true' }, h('path', { d: GH_PATH }))) : null),
                // 右上角:已安装绿色徽标,否则安装按钮(参考 billion-context 卡片布局)
                installed || done
                  ? h('span', { style: S.badge }, `✓ ${t('installed')}`)
                  : h('button', {
                      type: 'button', style: Object.assign({}, S.btn, busy ? S.btnBusy : {}),
                      onClick, disabled: busy,
                    }, btnLabel)),
              h(FeaturedAuthor, { pkg: e.package, meta: metaText, onDetail }),
              e.description ? h('p', { style: S.desc, onClick: onDetail }, e.description) : null,
              e.screenshots && e.screenshots.length
                ? h('div', { style: S.shots }, e.screenshots.map((url) => h(FeaturedShot, { key: url, url })))
                : null,
              h('div', { style: S.foot },
                h('div', { style: S.chips },
                  chips.map((c) => h('span', { key: c, style: S.chip, title: c }, c)),
                  e.sourceTitle ? h('span', { style: S.src, title: `${t('recommendedBy')} ${e.sourceTitle}` }, `${t('recommendedBy')} ${e.sourceTitle}`) : null)))
          }
      
          // ── 自建详情弹窗:README 从 npm 包(jsdelivr)读取,轻量 markdown 渲染 ──
          // 相对路径的图片/链接重写到 jsdelivr 包根。
          function mdAbsUrl(url, base) {
            const u = String(url).trim()
            if (/^https?:\/\//i.test(u)) return u
            return base + u.replace(/^\.\//, '')
          }
      
          // 占位符还原:把 s 里 \u0000<idx>\u0000 换回暂存的节点
          function restoreInline(s, tokens) {
            const parts = String(s).split(/\u0000(\d+)\u0000/g)
            const out = []
            for (let i = 0; i < parts.length; i++) {
              if (i % 2 === 1) out.push(tokens[Number(parts[i])])
              else if (parts[i]) out.push(parts[i])
            }
            return out
          }
      
          // 行内解析(占位符两段式):
          // 粗体 → 图片 → 链接 → 行内代码。图片先于链接,使 [![徽章](i)](l) 外链图可用;
          // 粗体内部递归解析,粗体套链接/链接套图片均正常。
          function mdInline(text, base) {
            const tokens = []
            const stash = (node) => { tokens.push(node); return '\u0000' + (tokens.length - 1) + '\u0000' }
            const stashText = (t) => { tokens.push(t); return '\u0000' + (tokens.length - 1) + '\u0000' }
            // 链接统一形态:蓝色 + 前置地球图标(与官方 markdown 链接色一致)
            const makeLink = (href, kids) => h('a', { style: S.mdA, href, target: '_blank', rel: 'noreferrer noopener' },
              h('svg', { style: S.linkIcon, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2' },
                h('circle', { cx: 8, cy: 8, r: 6.3 }),
                h('path', { d: 'M1.7 8h12.6M8 1.7c2.4 1.9 2.4 10.7 0 12.6M8 1.7c-2.4 1.9-2.4 10.7 0 12.6' })),
              ...kids)
            let s = String(text)
            s = s.replace(/\*\*([^*]+)\*\*/g, (m0, inner) => stash(h('strong', null, mdInline(inner, base))))
            s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m0, alt, url) => stash(h('img', { style: S.mdImg, src: mdAbsUrl(url, base), alt: alt || '', loading: 'lazy' })))
            s = s.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m0, label, url) => stash(makeLink(mdAbsUrl(url, base), restoreInline(label, tokens))))
            s = s.replace(/`([^`]+)`/g, (m0, c) => stash(h('code', { style: S.mdCode }, c)))
            // 裸自动链接:<https://…> 与 http(s)://…(URL 中间允许点/斜杠,仅结尾剔除标点)
            const TRAIL_PUNCT = /([.,;:!?"'）)\u3001\u3002\uff0c\uff1b\uff1a\uff01\uff1f\u201d\u2019]|[^\x20-\x7e])+$/
            s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (m0, url) => stash(makeLink(url, [url])))
            s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()\u0000]+)/g, (m0, pre, rawUrl) => {
              const trailMatch = TRAIL_PUNCT.exec(rawUrl)
              const trail = trailMatch ? trailMatch[0] : ''
              const url = trail ? rawUrl.slice(0, -trail.length) : rawUrl
              return stashText(pre) + stash(makeLink(url, [url])) + (trail ? stashText(trail) : '')
            })
            return restoreInline(s, tokens)
          }
      
          // 块级解析:围栏代码块 / 标题 / 列表 / 段落(不追求完整 markdown,够读 README 即可)
          function renderReadme(text, base) {
            const lines = String(text).split('\n')
            const out = []
            let key = 0, para = [], i = 0
            const flushPara = () => {
              if (para.length) {
                out.push(h('p', { style: S.mdP, key: 'p' + (key++) }, mdInline(para.join(' '), base)))
                para = []
              }
            }
            while (i < lines.length) {
              const line = lines[i]
              if (/^```/.test(line)) {
                flushPara()
                const buf = []
                i++
                while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++ }
                i++
                out.push(h('pre', { style: S.mdPre, key: 'c' + (key++) }, h('code', { style: S.mdPreCode }, buf.join('\n'))))
                continue
              }
              // 引用块(> 行,支持连续多行合并)
              if (/^\s*>\s?/.test(line)) {
                flushPara()
                const buf = []
                while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                  buf.push(lines[i].replace(/^\s*>\s?/, ''))
                  i++
                }
                out.push(h('div', { style: S.mdQuote, key: 'q' + (key++) },
                  h('p', { style: S.mdP }, mdInline(buf.join(' ').trim(), base))))
                continue
              }
              // 表格(| 行,第二行为 |---| 分隔)
              if (/^\s*\|/.test(line)) {
                const block = []
                while (i < lines.length && /^\s*\|/.test(lines[i])) { block.push(lines[i].trim()); i++ }
                const cells = (row) => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
                const isSep = (row) => /^\|?[\s:|-]+\|?$/.test(row) && row.includes('-')
                if (block.length >= 2 && isSep(block[1])) {
                  flushPara()
                  const head = cells(block[0])
                  const rows = block.slice(2).filter((r) => !isSep(r)).map(cells)
                  out.push(h('table', { style: S.mdTable, key: 't' + (key++) },
                    h('thead', null, h('tr', null, head.map((c) => h('th', { style: S.mdTd }, mdInline(c, base))))),
                    h('tbody', null, rows.map((r) => h('tr', null, head.map((_, ci) => h('td', { style: S.mdTd }, mdInline(r[ci] || '', base))))))))
                  continue
                }
                // 非法表格形态 → 按普通段落处理
                for (const row of block) para.push(row)
                continue
              }
              const hm = line.match(/^(#{1,4})\s+(.*)/)
              if (hm) {
                flushPara()
                out.push(h(hm[1].length <= 2 ? 'h3' : 'h4', { style: hm[1].length <= 2 ? S.mdH : S.mdH2, key: 'h' + (key++) }, mdInline(hm[2], base)))
                i++
                continue
              }
              const lm = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)/)
              if (lm) {
                flushPara()
                const items = []
                while (i < lines.length) {
                  const m2 = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)/)
                  if (!m2) break
                  items.push(h('li', { style: S.mdLi, key: 'li' + items.length }, mdInline(m2[1], base)))
                  i++
                }
                out.push(h('ul', { style: S.mdList, key: 'u' + (key++) }, items))
                continue
              }
              if (!line.trim()) { flushPara(); i++; continue }
              para.push(line.trim())
              i++
            }
            flushPara()
            return out
          }
      
          function FeaturedModal(props) {
            const e = props.entry
            const t = props.t
            const onClose = props.onClose
            const pair = React.useState({ status: 'loading', kids: [] })
            const state = pair[0], setState = pair[1]
      
            React.useEffect(() => {
              let alive = true
              setState({ status: 'loading', kids: [] })
              const base = `https://cdn.jsdelivr.net/npm/${e.package}/`
              fetchText(base + 'README.md', 10000).then((txt) => {
                if (!alive) return
                setState({ status: 'ready', kids: renderReadme(txt, base) })
              }).catch(() => {
                if (!alive) return
                // jsdelivr npm 主源失败 → GitHub 仓库兜底(README 大小写两种形态)
                const ghCandidates = e.homepage && /^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i.exec(e.homepage)
                if (!ghCandidates) { setState({ status: 'error', kids: [] }); return }
                const ghBase = `https://cdn.jsdelivr.net/gh/${ghCandidates[1]}/${ghCandidates[2]}@main/`
                fetchText(ghBase + 'README.md', 10000).then((txt2) => {
                  if (!alive) return
                  setState({ status: 'ready', kids: renderReadme(txt2, ghBase) })
                }).catch(() => { if (alive) setState({ status: 'error', kids: [] }) })
              })
              return () => { alive = false }
            }, [e.package])
      
            React.useEffect(() => {
              const onKey = (ev) => { if (ev.key === 'Escape') onClose() }
              window.addEventListener('keydown', onKey)
              return () => window.removeEventListener('keydown', onKey)
            }, [onClose])
      
            const metaParts = []
            if (e.version) metaParts.push(`v${e.version}`)
            return h('div', {
              style: S.overlay,
              onClick: (ev) => { if (ev.target === ev.currentTarget) onClose() },
            },
              h('div', { style: S.panel },
                h('div', { style: S.panelHead },
                  h(FeaturedHeadIcon, { entry: e, large: true }),
                  h('div', { style: S.panelTitleCol },
                    h('p', { style: S.panelTitle }, e.title),
                    h('span', { style: S.panelPkg }, e.package)),
                  h('button', { type: 'button', style: S.panelClose, onClick: onClose }, '✕')),
                metaParts.length ? h('div', { style: S.panelMeta }, metaParts.join(' · ')) : null,
                e.description ? h('p', { style: S.panelDesc }, e.description) : null,
                h('div', { style: S.panelBody },
                  state.status === 'loading' ? h('p', { style: S.mdNote }, t('readmeLoading')) : null,
                  state.status === 'error' ? h('p', { style: S.mdNote }, t('readmeError')) : null,
                  state.status === 'ready' ? state.kids : null),
                h('div', { style: Object.assign({}, S.panelMeta, { justifyContent: 'flex-end', paddingTop: 10 }) },
                  h('button', { type: 'button', style: S.retryBtn, onClick: onClose }, t('close')))))
          }
      
          function FeaturedSection(props) {
            const install = props.install
            void props.openPackage // 详情改为自建弹窗,不再调官方 openPackage
            const t = props.t
      
            const pair = React.useState({ status: 'loading', entries: [], installed: {} })
            const state = pair[0], setState = pair[1]
            const noncePair = React.useState(0)
            const nonce = noncePair[0], setNonce = noncePair[1]
            const detailPair = React.useState(null)
            const detail = detailPair[0], setDetail = detailPair[1]
      
            React.useEffect(() => {
              let alive = true
              setState({ status: 'loading', entries: [], installed: {} })
              // 宿主路由一站式返回:远程集中目录(已富化)+ 接入插件登记源 + 已安装表。
              fetchJson(ROUTE, 8000).then((body) => {
                if (!alive) return
                const entries = body && body.ok && body.data && Array.isArray(body.data.entries)
                  ? body.data.entries.map(normalizeRemoteEntry).filter(Boolean)
                  : []
                const installed = body && body.ok && body.data && body.data.installed && typeof body.data.installed === 'object'
                  ? body.data.installed
                  : {}
                setState({ status: entries.length ? 'ready' : 'empty', entries, installed })
              }).catch(() => {
                if (alive) setState({ status: 'error', entries: [] })
              })
              return () => { alive = false }
            }, [nonce])
      
            // tab 标签已表达板块名,不再渲染顶部标题/副标题
            const kids = []
      
            if (state.status === 'loading') {
              kids.push(h('p', { key: 'note', style: S.note }, t('loading')))
            } else if (state.status === 'error') {
              kids.push(h('p', { key: 'note', style: S.note }, t('error')))
              kids.push(h('button', { key: 'retry', type: 'button', style: S.retryBtn, onClick: () => setNonce((n) => n + 1) }, t('retry')))
            } else if (state.status === 'empty') {
              kids.push(h('p', { key: 'note', style: S.note }, t('empty')))
            } else {
              kids.push(h('ul', { key: 'grid', style: S.grid }, state.entries.map((e) => (
                h(FeaturedCard, { key: e.package, entry: e, t, install, onDetail: () => setDetail(e), installed: !!state.installed[e.package] })
              ))))
            }
            return h('div', { style: S.wrap }, kids,
              detail ? h(FeaturedModal, { key: detail.package, entry: detail, t, onClose: () => setDetail(null) }) : null)
          }
      
          // 导出:接入插件 apply 末尾调用 window.__DSH_FEATURED_INIT__(ctx)。
          // 判重用 window 标志,确保多插件接入只注册一块(最先调用者生效)。
          function initFeatured(ctx) {
            if (typeof window !== 'undefined') window.__FEATURED_INIT_CALLED__ = true
            if (typeof window !== 'undefined' && window.__DSH_FEATURED_APPLIED__) return
            if (typeof window !== 'undefined') window.__DSH_FEATURED_APPLIED__ = true
            try {
            ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugins-plugin: locale')
      
            const t = ctx.locale.bind(NS)
      
            ctx.slots.inject('plugins.tab', () => ctx.slots.register({
              name: 'plugins.tab',
              id: 'dsh-plugins-plugin',
              label: () => t('tabLabel'),
              locale: NS,
            }, FeaturedSection), 'dsh-plugins-plugin: featured tab')
            if (typeof window !== 'undefined') window.__FEATURED_OK__ = true
            } catch (e) {
              if (typeof window !== 'undefined') window.__FEATURED_ERR__ = String(e && (e.stack || e.message || e))
            }
          }
      
          window.__DSH_FEATURED_INIT__ = initFeatured
  } catch (error) {
    // 内联模块自身故障不能拖垮接入插件:记录原因,由 apply 处的调用方检查标志位。
    console.error('[dsh-plugins-plugin] 精选推荐模块初始化失败', error)
    window.__FEATURED_ERR__ = String((error && (error.stack || error.message)) || error)
  }
})()
// <<< dsh-plugins-plugin featured inline
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

        // 底部栏邮箱入口:图标+新邮件角标,点击打开收件箱
        ctx.slots.inject('conversation.composer.dock', function () {
          return ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'dsh-skillpie-mail-dock',
              order: 6,
              locale: NS,
            },
            function MailDock() {
              var openState = React.useState(false)
              var open = openState[0]
              var setOpen = openState[1]
              var countState = React.useState(dockStore.count)
              var setCount = countState[1]
              React.useEffect(function () {
                var off = function (n) { setCount(n) }
                dockStore.subs.push(off)
                return function () { dockStore.subs = dockStore.subs.filter(function (fn) { return fn !== off }) }
              }, [])
              // 新邮件轮询:不再自动弹窗,只累加状态栏角标
              React.useEffect(function () {
                var stopped = false
                var refresh = function () {
                  // 立即收一次件(pollNow 让宿主马上拉 IMAP),再校准未读数
                  api('pollNow').catch(function () {})
                  api('poll', { sinceSeq: pollSeq }).then(function (data) {
                    if (stopped || !data.notifications || !data.notifications.length) return
                    for (var i = 0; i < data.notifications.length; i++) {
                      var item = data.notifications[i]
                      if (item.seq > pollSeq) pollSeq = item.seq
                    }
                    return api('unread')
                  }).then(function (d) {
                    if (!stopped && d && typeof d.count === 'number') dockStore.set(d.count)
                  }).catch(function () {})
                }
                refreshRef.current = refresh
                var timer = window.setInterval(refresh, 30000)
                return function () {
                  stopped = true
                  window.clearInterval(timer)
                }
              }, [])
              return [
                h('button', {
                  title: (pageT('sectionTitle') || 'SkillPie 邮箱') + (countState[0] > 0 ? '（' + countState[0] + ' 封新邮件）' : ''),
                  onClick: function () {
                    setOpen(function (v) { return !v })
                    if (refreshRef.current) refreshRef.current() // 点击立即收一次件
                  },
                  style: {
                    boxSizing: 'border-box', borderRadius: 6, maxWidth: '100%',
                    color: 'var(--dsw-alias-label-tertiary, #a0a3a8)', font: 'inherit',
                    lineHeight: 'inherit', whiteSpace: 'nowrap',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px',
                    fontSize: 14, position: 'relative',
                  },
                },
                  h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
                    h('rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }),
                    h('path', { d: 'm3 7 9 6 9-6' })),
                  countState[0] > 0
                    ? h('span', {
                        style: { color: 'var(--dsw-alias-label-tertiary, #a0a3a8)', fontVariantNumeric: 'tabular-nums', fontSize: 'inherit', lineHeight: 'inherit' },
                      }, String(countState[0]))
                    : null,
                ),
                open
                  ? ReactDOM.createPortal(h('div', {
                      style: { position: 'fixed', inset: 0, zIndex: 2600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
                      onClick: function (e) { if (e.target === e.currentTarget) setOpen(false) },
                    },
                      h('div', {
                        style: {
                          background: '#ffffff', borderRadius: 12, boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
                          width: 780, maxWidth: 'calc(100vw - 32px)', maxHeight: '86vh', overflow: 'hidden',
                          padding: 4, position: 'relative',
                        },
                      },
                        h('button', {
                          onClick: function () { setOpen(false) },
                          style: {
                            position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 18, lineHeight: 1, color: '#8a8a8e',
                            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          },
                        }, '×'),
                        h(SettingsSection, { t: pageT }),
                      ),
                    ), document.body)
                  : null,
              ]
            },
          )
        })
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // dsh-plugins-plugin: 精选推荐板块
      },
    }
  },
})
