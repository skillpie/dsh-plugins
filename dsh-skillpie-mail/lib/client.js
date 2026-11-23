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

    // 正文链接修复:旧版 sanitizeHtml 把 href 挪进 data-href 并加了 pointer-events:none,
    // 链接看得见却点不动。这里把存量旧格式还原成真实可点链接;新格式(已带 href)原样通过。
    function mailLinkHtml(html) {
      var out = String(html || '').replace(/pointer-events\s*:\s*none;?/gi, '')
      out = out.replace(/<a\s([^>]*)>/gi, function (m, attrs) {
        if (/(^|\s)href\s*=/i.test(attrs)) return m
        var dh = /(?:^|\s)data-href\s*=\s*"([^"]*)"/i.exec(attrs)
        if (!dh || !/^https?:/i.test(dh[1])) return m
        var rest = attrs.replace(/(?:^|\s)data-href\s*=\s*"[^"]*"/i, '')
        return '<a href="' + dh[1] + '" target="_blank" rel="noopener noreferrer"' + rest + '>'
      })
      return out
    }

    // 正文容器统一点击委托:桌面端 window.open 由主进程 shell.openExternal 接到系统浏览器,
    // 浏览器端开新标签;preventDefault 兜住全局拦截,也不让正文内跳转污染 GUI 路由
    function openMailLink(event) {
      var node = event.target
      var a = node && typeof node.closest === 'function' ? node.closest('a') : null
      if (!a) return
      var url = a.getAttribute('href') || a.getAttribute('data-href') || ''
      if (!/^https?:/i.test(url)) return
      event.preventDefault()
      window.open(url, '_blank', 'noopener,noreferrer')
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
                        onClick: openMailLink,
                        dangerouslySetInnerHTML: { __html: mailLinkHtml(opened.html) },
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
                      onClick: openMailLink,
                      dangerouslySetInnerHTML: { __html: mailLinkHtml(opened.html) },
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
                        onClick: openMailLink,
                        dangerouslySetInnerHTML: { __html: mailLinkHtml(mail.html) },
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
// 注入在 factory(require) 内,可用 factory 的 require 取 react;
// apply 末尾通过 window.__DSH_FEATURED_INIT__(ctx) 注册 tab。
// ======================================================================
// >>> dsh-featured inline (auto-inserted, do not remove markers)
// 精选插件 client 内联模块(由 dsh-featured 的 integrate.sh 自动插入)。
// 这是一段"函数体片段",由 integrate.sh 注入到接入插件 lib/client.js 的
// factory(require) 内部(MARK 之间的内容),因此可以直接用 factory 的 require
// 拿 react,并暴露 window.__DSH_FEATURED_INIT__(ctx) 供 apply 末尾调用。
//
// 为什么不用 DSH 的 require.async 包本地 chunk:chunk URL 必须与 bundle 的
// ?rev= 精确匹配,一旦接入包自己的 bundle 加载失败(如 dsh-app:// 404),
// chunk 永远到不了;内联后 tab 跟随接入插件自己的 bundle,零额外请求。
// 注意:本片段绝不能放到 factory 之外 —— 那样 require 会落到 Node 全局。
//
// 本片段只做「极简入口」:注册精选插件 tab,点开自动安装完整版 dsh-featured,
// 装完由它接管完整功能。卡片/详情/搜索/筛选/申请收录等重逻辑都不在此,
// 全部交给 dsh-featured,这样接入插件只需背上极小的一段代码。
;(function () {
  window.__FEATURED_FACTORY_RAN__ = true
  try {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-plugins-plugin'
    const FULL_PKG = 'dsh-featured'

    const zh = {
      tabLabel: '精选插件',
      welcome: '精选插件完整版(dsh-featured)未安装。',
      installFull: '安装完整版',
      installing: '正在安装完整版…',
      installed: '已安装,刷新后即可使用完整功能。',
      installedShort: '已安装',
      desc: '一个入口逛完社区精选的好插件:搜索、标签筛选、一键安装、README 详情。',
    }
    const en = {
      tabLabel: 'Featured',
      welcome: 'The full Featured plugin (dsh-featured) is not installed.',
      installFull: 'Install full version',
      installing: 'Installing…',
      installed: 'Installed — refresh to use the full experience.',
      installedShort: 'Installed',
      desc: 'One tab for community-featured plugins: search, filter, one-click install, README details.',
    }

    const S = {
      wrap: { padding: '24px 16px', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 },
      title: { fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--dsw-alias-label-primary)' },
      desc: { fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--dsw-alias-label-secondary)' },
      note: { fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--dsw-alias-label-primary)' },
      btn: {
        alignSelf: 'flex-start', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 500,
        padding: '7px 16px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-brand-primary)', color: '#fff',
      },
      btnOff: { opacity: 0.6, cursor: 'default' },
    }

    function FeaturedSection(props) {
      const install = props.install
      const t = props.t || ((k) => zh[k])
      // 已安装判定:宿主路由返回的 installed 表里有 FULL_PKG
      const pair = React.useState('idle') // idle | running | installed
      const st = pair[0], setSt = pair[1]

      React.useEffect(() => {
        if (st !== 'idle') return
        if (typeof install !== 'function') { setSt('installed'); return }
        setSt('running')
        try {
          install({ spec: FULL_PKG, title: t('tabLabel'), version: '' })
          setSt('installed')
        } catch {
          setSt('installed')
        }
      }, [st, install])

      const label = st === 'running' ? t('installing')
        : (st === 'installed' ? t('installedShort') : t('installFull'))

      return h('div', { style: S.wrap },
        h('p', { style: S.desc }, t('desc')),
        st === 'idle' ? h('p', { style: S.note }, t('welcome')) : null,
        h('button', {
          type: 'button',
          style: Object.assign({}, S.btn, st === 'installed' ? S.btnOff : {}),
          disabled: st === 'installed',
          onClick: () => {
            if (st !== 'idle' || typeof install !== 'function') return
            setSt('running')
            try { install({ spec: FULL_PKG, title: t('tabLabel'), version: '' }); setSt('installed') }
            catch { setSt('installed') }
          },
        }, label))
    }

    function initFeatured(ctx) {
      if (typeof window !== 'undefined') window.__FEATURED_INIT_CALLED__ = true
      if (typeof window !== 'undefined' && window.__DSH_FEATURED_APPLIED__) return
      if (typeof window !== 'undefined') window.__DSH_FEATURED_APPLIED__ = true
      if (typeof window !== 'undefined' && window.__DSH_FEATURED_FULL__) {
        // 全量版(dsh-featured 插件)已加载:让位,不注册内联板块,避免双 tab 竞态
        return
      }
      try {
        const localeDisposable = ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugins-plugin: locale')
        const t = ctx.locale.bind(NS)
        let tabDisposable = null
        ctx.slots.inject('plugins.tab', () => {
          tabDisposable = ctx.slots.register({
            name: 'plugins.tab',
            id: 'dsh-plugins-plugin',
            label: () => t('tabLabel'),
            locale: NS,
            priority: 100,
          }, FeaturedSection)
          return tabDisposable
        }, 'dsh-plugins-plugin: featured tab')

        if (typeof window !== 'undefined') {
          window.__DSH_FEATURED_ENTRY__ = {
            kind: 'inline',
            dispose() {
              try { if (typeof tabDisposable === 'function') tabDisposable() } catch { /* 已注销 */ }
              try { if (typeof localeDisposable === 'function') localeDisposable() } catch { /* 已注销 */ }
              window.__DSH_FEATURED_APPLIED__ = false
              window.__DSH_FEATURED_ENTRY__ = null
            },
          }
          window.__FEATURED_OK__ = true
        }
      } catch (e) {
        if (typeof window !== 'undefined') window.__FEATURED_ERR__ = String(e && (e.stack || e.message || e))
      }
    }

    window.__DSH_FEATURED_INIT__ = initFeatured
  } catch (error) {
    console.error('[精选插件] 模块初始化失败', error)
    window.__FEATURED_ERR__ = String((error && (error.stack || error.message)) || error)
  }
})()
// <<< dsh-featured inline
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
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // 精选插件
      },
    }
  },
})
