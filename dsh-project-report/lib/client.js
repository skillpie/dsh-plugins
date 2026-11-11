/**
 * @skillpie/dsh-project-report — Web client half (module-loader bundle).
 *
 * Registers a "Daily report" tab on conversation.view (session scope):
 *   the tab binds to the current session's project directory (cwd),
 *   summarizes its git commits into an editable daily report, optionally
 *   submits Moka overtime, and exposes the built-in scheduler + history.
 * One report per project: every session of the same project shares it
 * (host keeps a per-project draft keyed by cwd).
 *
 * All visible text goes through the locale service; styles use --dsw-alias-*
 * theme tokens only.
 */
window.__ModuleLoader__.load({
  id: '@skillpie/dsh-project-report',
  factory(require) {
    var React = require('react')
    var h = React.createElement
    var NS = '@skillpie/dsh-project-report'

    var zh = {
      title: '项目汇报',
      tabLabel: '汇报',
      subtitle: '整理本项目的代码提交与会话记录,一键生成工作汇报(项目内所有会话共享同一份)',
      secReport: '汇报',
      secMoka: 'Moka 账号',
      secHistory: '历史记录',
      project: '项目',
      noCwd: '当前会话没有关联的项目目录 — 请从项目里打开会话',
      mineOnly: '仅收集我的',
      collectLabel: '收集方式',
      collectCommits: '收集代码',
      collectSessions: '收集会话',
      date: '日期',
      quick1d: '今天',
      quick2d: '近一天',
      quickWeek: '本周',
      quickMonth: '本月',
      generate: '生成汇报',
      generating: '生成中…',
      commits: '条提交',
      sessions: '条会话',
      noCommits: '该日期窗口(6:00 → 次日 6:00)内没有提交',
      reportPlaceholder: '点击「生成汇报」后,这里会出现可编辑的汇报内容',
      copy: '复制',
      copied: '已复制',
      submitOvertime: '提交加班申请',
      submitting: '提交中…',
      otSettings: '加班提交设置',
      otSettingsHint: '配置加班单提交渠道与账号;提交加班申请时使用',
      channel: '提交渠道',
      cancel: '取消',
      settings: '账号设置',
      mokaChannelDesc: 'Moka 审批流提交',
      mokaEmail: '邮箱',
      mokaPassword: '密码',
      mokaSave: '保存账号',
      mokaSaved: '已保存',
      mokaTest: '测试登录',
      mokaTesting: '登录中…',
      mokaConfigured: '已配置',
      mokaNotConfigured: '未配置',
      schedEnable: '每日收集',
      schedTime: '每日触发时间',
      schedAutoOvertime: '汇总后自动申请加班',
      schedOn: '定时运行中',
      schedOff: '已停用',
      runNow: '立即运行',
      running: '运行中…',
      historyEmpty: '暂无历史记录',
      historyOvertimeOk: '加班已提交',
      historyOvertimeFail: '加班失败',
      historyNoOvertime: '未提交加班',
      historyView: '查看',
      historyDetail: '记录详情',
      'trigger.schedule': '定时',
      'trigger.manual': '手动',
      'trigger.manual-submit': '手动加班',
      otStart: '开始',
      otEnd: '结束',
      otDuration: '时长',
      otDayType: '类型',
      otApproval: '审批路径',
      otAttachment: '附件',
      otError: '失败原因',
      errGeneric: '操作失败',
      confirmSubmit: '确认向 Moka 提交该加班单?',
    }
    var en = {
      title: 'Project report',
      tabLabel: 'Daily report',
      subtitle: 'Summarize this project\'s git commits into a daily report (shared by all sessions of the project)',
      secReport: 'Report',
      secMoka: 'Moka account',
      secHistory: 'History',
      project: 'Project',
      noCwd: 'This session has no project directory — open the session from a project',
      mineOnly: 'Only mine',
      collectLabel: 'Collect',
      collectCommits: 'Collect code',
      collectSessions: 'Collect sessions',
      date: 'Date',
      quick1d: 'Today',
      quick2d: 'Last day',
      quickWeek: 'This week',
      quickMonth: 'This month',
      generate: 'Generate report',
      generating: 'Generating…',
      commits: ' commits',
      sessions: ' sessions',
      noCommits: 'No commits in this window (6:00 → next day 6:00)',
      reportPlaceholder: 'Click "Generate report" and the editable report will appear here',
      copy: 'Copy',
      copied: 'Copied',
      submitOvertime: 'Submit overtime',
      submitting: 'Submitting…',
      otSettings: 'Overtime submission settings',
      otSettingsHint: 'Configure the submission channel and account used when submitting overtime',
      channel: 'Channel',
      cancel: 'Cancel',
      settings: 'Account settings',
      mokaChannelDesc: 'Submit via Moka approval flow',
      mokaEmail: 'Email',
      mokaPassword: 'Password',
      mokaSave: 'Save account',
      mokaSaved: 'Saved',
      mokaTest: 'Test login',
      mokaTesting: 'Signing in…',
      mokaConfigured: 'Configured',
      mokaNotConfigured: 'Not configured',
      schedEnable: 'Daily collect',
      schedTime: 'Daily trigger time',
      schedAutoOvertime: 'Auto-request overtime after summary',
      schedOn: 'Schedule running',
      schedOff: 'Disabled',
      runNow: 'Run now',
      running: 'Running…',
      historyEmpty: 'No history yet',
      historyOvertimeOk: 'Overtime submitted',
      historyOvertimeFail: 'Overtime failed',
      historyNoOvertime: 'No overtime submitted',
      historyView: 'View',
      historyDetail: 'Entry detail',
      'trigger.schedule': 'Scheduled',
      'trigger.manual': 'Manual',
      'trigger.manual-submit': 'Manual overtime',
      otStart: 'Start',
      otEnd: 'End',
      otDuration: 'Duration',
      otDayType: 'Type',
      otApproval: 'Approval path',
      otAttachment: 'Attachment',
      otError: 'Failure reason',
      errGeneric: 'Operation failed',
      confirmSubmit: 'Submit this overtime request to Moka?',
    }

    // ── api helper ──────────────────────────────────────────────────────
    function api(action, payload) {
      return fetch('/dsh-project-report/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      }).then(function (res) { return res.json() }).then(function (out) {
        if (!out || !out.ok) throw new Error((out && out.error) || 'request failed')
        return out.data
      })
    }

    function fmtDate(d) {
      var p = function (x) { return String(x).padStart(2, '0') }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    }

    function todayStr() { return fmtDate(new Date()) }

    function daysAgoStr(n) {
      var d = new Date()
      d.setDate(d.getDate() - n)
      return fmtDate(d)
    }

    // 本周周一日(周一起始)
    function weekStartStr() {
      var d = new Date()
      d.setDate(d.getDate() - (d.getDay() + 6) % 7)
      return fmtDate(d)
    }

    function monthStartStr() {
      return fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    }

    function baseName(p) {
      var s = String(p || '').replace(/\/+$/, '')
      var i = s.lastIndexOf('/')
      return i >= 0 ? s.slice(i + 1) : s
    }

    // ── tiny style presets ──────────────────────────────────────────────
    var S = {
      page: { height: '100%', minHeight: 0, boxSizing: 'border-box', overflowY: 'auto', background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)', padding: '16px 20px 40px' },
      inner: { maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 },
      card: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
      cardHead: { display: 'flex', alignItems: 'center', gap: 8 },
      cardTitle: { fontSize: 13, fontWeight: 600 },
      label: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      input: { height: 28, padding: '0 8px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)', fontSize: 12, boxSizing: 'border-box' },
      btn: function (primary) {
        return {
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px',
          borderRadius: 7, border: primary ? '1px solid transparent' : '1px solid var(--dsw-alias-border-l1)',
          cursor: 'pointer', fontSize: 12,
          background: primary ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-2)',
          color: primary ? '#ffffff' : 'var(--dsw-alias-label-primary)',
        }
      },
      chip: function () {
        return {
          display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px',
          borderRadius: 999, fontSize: 11, border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-secondary)',
        }
      },
      // 快捷区间按钮(active = 品牌色描边)
      quickBtn: function (active) {
        return {
          display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px',
          borderRadius: 999, fontSize: 12, cursor: 'pointer',
          border: active ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-l1)',
          background: active ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
          color: active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
        }
      },
      dot: function (ok) {
        return { width: 7, height: 7, borderRadius: 999, background: ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)', flex: 'none' }
      },
      note: function (err) {
        return { fontSize: 12, color: err ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }
      },
      textarea: { width: '100%', minHeight: 220, padding: 10, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', boxSizing: 'border-box', resize: 'vertical' },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      histRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--dsw-alias-border-l1)', fontSize: 12 },
    }

    // 纯渲染辅助(无 hooks,按普通函数调用);inline = label 与组件同行
    function Field(props) {
      if (props.inline) {
        return h('label', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('span', { style: S.label }, props.label),
          props.children)
      }
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        h('span', { style: S.label }, props.label),
        props.children)
    }

    function OtResult(props) {
      var t = props.t
      var ot = props.ot
      var kids = []
      kids.push(h('div', { style: S.row },
        h('span', { style: Object.assign({}, S.chip(), ot.ok ? { color: 'var(--dsw-alias-state-success-primary)' } : { color: 'var(--dsw-alias-state-error-primary)' }) },
          h('span', { style: S.dot(ot.ok) }),
          ot.ok ? t('historyOvertimeOk') : t('historyOvertimeFail'))))
      if (ot.ok) {
        var kv = []
        if (ot.dayType) kv.push([t('otDayType'), ot.dayType])
        if (ot.start) kv.push([t('otStart'), ot.start])
        if (ot.end) kv.push([t('otEnd'), ot.end])
        if (ot.durationText) kv.push([t('otDuration'), ot.durationText])
        kids.push(h('div', { style: Object.assign({}, S.row, { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }) },
          kv.map(function (p, i) {
            return h('span', { key: i }, p[0] + ': ' + p[1])
          })))
        if (ot.approval && ot.approval.length) {
          kids.push(h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
            t('otApproval') + ': ' + ot.approval.map(function (n) {
              return n.name + (n.assignees && n.assignees.length ? '(' + n.assignees.join('/') + ')' : '')
            }).join(' → ')))
        }
      } else if (ot.error) {
        kids.push(h('div', { style: S.note(true) }, t('otError') + ': ' + ot.error))
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, kids)
    }

    // 齿轮设置图标(lucide 风格,24 网格 stroke currentColor)
    function GearIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('circle', { cx: 12, cy: 12, r: 3 }),
        h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }))
    }

    // ── conversation tab view (hooks component — must render via h()) ──
    // props: sessionId + useSessions(session 作用域标准 props,conversation.view 契约)
    function ReportTabView(props) {
      var t = pageT
      var sessionId = props.sessionId
      var useSessions = props.useSessions
      var summary = useSessions ? useSessions(function (s) { return s && s.byId ? s.byId[sessionId] : null }) : null
      var cwd = (summary && summary.cwd) ? String(summary.cwd).replace(/\/+$/, '') : ''

      var dateStartState = React.useState(todayStr()) // 默认区间:今天 ~ 今天
      var dateStart = dateStartState[0]; var setDateStart = dateStartState[1]
      var dateEndState = React.useState(todayStr())
      var dateEnd = dateEndState[0]; var setDateEnd = dateEndState[1]
      var quickState = React.useState('q1d') // 当前命中的快捷区间(手动改日期后置空)
      var quickKey = quickState[0]; var setQuickKey = quickState[1]
      var mineState = React.useState(true) // 默认勾选「仅整理我的提交」
      var mineOnly = mineState[0]; var setMineOnly = mineState[1]
      var collectState = React.useState({ commits: true, sessions: true }) // 收集方式多选,默认全选
      var collect = collectState[0]; var setCollect = collectState[1]
      var dlgState = React.useState(false) // 加班提交设置弹窗
      var dlgOpen = dlgState[0]; var setDlgOpen = dlgState[1]
      var channelState = React.useState('moka') // 提交渠道(当前仅 Moka)
      var channel = channelState[0]; var setChannel = channelState[1]
      var genState = React.useState(null)
      var gen = genState[0]; var setGen = genState[1]
      var draftState = React.useState('')
      var draft = draftState[0]; var setDraft = draftState[1]
      var busyState = React.useState({})
      var busy = busyState[0]; var setBusy = busyState[1]
      var noteState = React.useState(null)
      var note = noteState[0]; var setNote = noteState[1]
      var mokaEmailState = React.useState('')
      var mokaEmail = mokaEmailState[0]; var setMokaEmail = mokaEmailState[1]
      var mokaPwState = React.useState('')
      var mokaPw = mokaPwState[0]; var setMokaPw = mokaPwState[1]
      var gsState = React.useState(null)
      var gs = gsState[0]; var setGs = gsState[1]
      var schedState = React.useState({ enabled: false, time: '21:30', autoOvertime: false })
      var sched = schedState[0]; var setSched = schedState[1]
      var histState = React.useState(null)
      var hist = histState[0]; var setHist = histState[1]
      var detailState = React.useState(null)
      var detail = detailState[0]; var setDetail = detailState[1]
      var otState = React.useState(null)
      var ot = otState[0]; var setOt = otState[1]

      var setBusyK = function (k, v) { setBusy(function (b) { var nb = Object.assign({}, b); nb[k] = v; return nb }) }
      var flash = function (err, text) { setNote({ err: !!err, text: text }) }
      var schedLoaded = React.useRef(false) // 自动保存闸:服务端值加载前不回写

      var refreshState = React.useCallback(function () {
        api('getState').then(function (data) {
          setGs(data)
          setMokaEmail(data.mokaEmail || '')
          if (data.settings && data.settings.schedule) {
            setSched({
              enabled: !!data.settings.schedule.enabled,
              time: data.settings.schedule.time || '21:30',
              autoOvertime: !!data.settings.schedule.autoOvertime,
            })
          }
          if (data.settings && data.settings.collect) {
            setCollect({ commits: data.settings.collect.commits !== false, sessions: !!data.settings.collect.sessions })
          }
          schedLoaded.current = true // 服务端值已就位,之后的 sched 变更才触发自动保存
        }).catch(function (err) { flash(true, (t('errGeneric') || 'error') + ': ' + err.message) })
      }, [])

      var refreshHistory = React.useCallback(function () {
        api('history').then(function (data) { setHist(data.entries || []) }).catch(function () { setHist([]) })
      }, [])

      // 项目唯一日报:进入 Tab 时取当前项目已保存的那份(所有会话共享)
      React.useEffect(function () {
        if (!cwd) return
        api('getReport', { cwd: cwd }).then(function (data) {
          var rep = data && data.report
          if (rep && rep.markdown) {
            setGen(rep)
            setDraft(rep.markdown)
            if (typeof rep.mineOnly === 'boolean') setMineOnly(rep.mineOnly)
            if (rep.date) {
              setDateStart(rep.date)
              setDateEnd(rep.dateEnd || rep.date)
              setQuickKey(rep.date === todayStr() && (rep.dateEnd || rep.date) === todayStr() ? 'q1d' : null)
            }
          }
        }).catch(function () { /* 无草稿,静默 */ })
      }, [cwd])

      React.useEffect(function () {
        refreshState(); refreshHistory()
      }, [refreshState, refreshHistory])

      // 每日收集设置自动保存:勾选/时间变更即写服务端(服务端值加载完成前不回写)
      React.useEffect(function () {
        if (!schedLoaded.current) return
        api('setSettings', { schedule: sched }).catch(function (err) { flash(true, err.message) })
      }, [sched.enabled, sched.time, sched.autoOvertime])

      var applyQuick = function (key, start, end) {
        setQuickKey(key); setDateStart(start); setDateEnd(end < start ? start : end)
      }

      var doGenerate = function () {
        setBusyK('gen', true); setNote(null); setOt(null)
        api('generate', { cwd: cwd, date: dateStart, dateEnd: dateEnd, mineOnly: mineOnly, collect: collect }).then(function (data) {
          setGen(data); setDraft(data.report || '')
          if (!data.total) flash(false, t('noCommits'))
        }).catch(function (err) { flash(true, err.message) }).finally(function () { setBusyK('gen', false) })
      }

      var doSubmitOvertime = function () {
        if (!window.confirm(t('confirmSubmit'))) return
        setBusyK('ot', true); setNote(null); setOt(null)
        api('submitOvertime', {
          cwd: cwd,
          date: gen ? (gen.dateEnd || gen.date) : dateEnd,
          reportMarkdown: draft,
          projects: gen && gen.repos ? gen.repos.map(function (r) { return r.name }) : (gen && gen.stats && gen.stats.repos ? gen.stats.repos.map(function (r) { return r.name }) : []),
          commits: gen ? (gen.total || 0) : 0,
        }).then(function (data) {
          setOt(data && data.result ? data.result : { ok: true })
          flash(false, t('historyOvertimeOk'))
          refreshHistory()
        }).catch(function (err) {
          setOt({ ok: false, error: err.message })
        }).finally(function () { setBusyK('ot', false) })
      }

      var doCopy = function () {
        try {
          navigator.clipboard.writeText(draft).then(function () { flash(false, t('copied')) }, function () { flash(true, t('errGeneric')) })
        } catch (e) { flash(true, t('errGeneric')) }
      }

      var doSaveMoka = function (onDone) {
        setBusyK('mokaSave', true); setNote(null)
        api('saveMoka', { email: mokaEmail, password: mokaPw }).then(function () {
          flash(false, t('mokaSaved')); setMokaPw('')
          if (typeof onDone === 'function') onDone()
        }).catch(function (err) { flash(true, err.message) }).finally(function () { setBusyK('mokaSave', false) })
      }

      var doTestMoka = function () {
        setBusyK('mokaTest', true); setNote(null)
        api('mokaTest').then(function (data) {
          flash(false, t('mokaConfigured') + ' — ' + (data && data.message ? data.message : 'ok'))
        }).catch(function (err) { flash(true, err.message) }).finally(function () { setBusyK('mokaTest', false) })
      }

      var doRunNow = function () {
        setBusyK('runNow', true); setNote(null)
        api('runNow', { cwd: cwd, autoOvertime: sched.autoOvertime }).then(function (data) {
          var entry = data && data.entry
          if (entry) {
            setGen({ cwd: cwd, project: baseName(cwd), date: entry.date, report: entry.report, total: entry.commits, repos: (entry.projects || []).map(function (n) { return { name: n } }), items: [] })
            setDraft(entry.report || '')
            if (entry.overtime) setOt(entry.overtime)
          }
          flash(false, 'OK')
          refreshHistory()
        }).catch(function (err) { flash(true, err.message) }).finally(function () { setBusyK('runNow', false) })
      }

      var openDetail = function (id) {
        api('historyEntry', { id: id }).then(function (data) { setDetail(data.entry) }).catch(function (err) { flash(true, err.message) })
      }

      var mokaOk = !!(gs && gs.mokaConfigured)
      var schedOn = !!(gs && gs.settings && gs.settings.schedule && gs.settings.schedule.enabled)

      var kids = []
      // header:项目名 + 调度状态
      kids.push(h('div', { style: Object.assign({}, S.cardHead, { gap: 10 }) },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('span', { style: { fontSize: 16, fontWeight: 600 } }, t('title') + (cwd ? ' · ' + baseName(cwd) : '')),
          h('span', { style: S.label }, t('subtitle'))),
        h('span', { style: { flex: 1 } }),
        h('span', { style: S.chip() }, h('span', { style: S.dot(schedOn) }), schedOn ? t('schedOn') : t('schedOff'))))
      if (note) kids.push(h('div', { style: S.note(note.err) }, note.text))
      if (!cwd) {
        kids.push(h('section', { style: S.card },
          h('div', { style: S.note(true) }, t('noCwd'))))
        return h('div', { style: S.page }, h('div', { style: S.inner }, kids))
      }

      // ── report card
      var reportKids = []
      var quickDefs = [
        { key: 'q1d', label: t('quick1d'), start: todayStr(), end: todayStr() },
        { key: 'q2d', label: t('quick2d'), start: daysAgoStr(1), end: todayStr() },
        { key: 'qw', label: t('quickWeek'), start: weekStartStr(), end: todayStr() },
        { key: 'qm', label: t('quickMonth'), start: monthStartStr(), end: todayStr() },
      ]
      reportKids.push(h('div', { style: S.row },
        h('span', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
          quickDefs.map(function (qd) {
            return h('button', {
              key: qd.key, type: 'button', style: S.quickBtn(quickKey === qd.key),
              onClick: function () { applyQuick(qd.key, qd.start, qd.end) },
            }, qd.label)
          })),
        h(Field, { label: t('date'), inline: true },
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
            h('input', { type: 'date', value: dateStart, max: dateEnd, onChange: function (e) { setQuickKey(null); setDateStart(e.target.value || dateStart) }, style: S.input }),
            h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 } }, '~'),
            h('input', { type: 'date', value: dateEnd, min: dateStart, onChange: function (e) { setQuickKey(null); setDateEnd(e.target.value || dateEnd) }, style: S.input }))),
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: collect.sessions, onChange: function (e) { setCollect(Object.assign({}, collect, { sessions: e.target.checked })) } }),
          h('span', { style: { fontSize: 12 } }, t('collectSessions'))),
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: collect.commits, onChange: function (e) { setCollect(Object.assign({}, collect, { commits: e.target.checked })) } }),
          h('span', { style: { fontSize: 12 } }, t('collectCommits'))),
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: mineOnly, onChange: function (e) { setMineOnly(e.target.checked) } }),
          h('span', { style: { fontSize: 12 } }, t('mineOnly'))),
        h('span', { style: { flex: 1 } })))
      if (gen) {
        var repos = gen.repos || (gen.stats && gen.stats.repos) || []
        var dateLabel = gen.dateEnd && gen.dateEnd !== gen.date ? gen.date + ' ~ ' + gen.dateEnd : (gen.date || '')
        reportKids.push(h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
          dateLabel + ' · ' + (gen.total || 0) + t('commits')
          + (gen.sessionCount ? ' · ' + gen.sessionCount + t('sessions') : '')
          + ' · ' + repos.map(function (r) { return r.name + '(' + (r.total != null ? r.total : r.commits) + ')' }).join(', ')))
      }
      reportKids.push(h('textarea', {
        value: draft, onChange: function (e) { setDraft(e.target.value) },
        placeholder: t('reportPlaceholder'), style: S.textarea, spellCheck: false,
      }))
      reportKids.push(h('div', { style: S.row },
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: sched.enabled, onChange: function (e) { setSched(function (s0) { return Object.assign({}, s0, { enabled: e.target.checked }) }) } }),
          h('span', { style: { fontSize: 12 } }, t('schedEnable'))),
        h('input', { type: 'time', value: sched.time, onChange: function (e) { setSched(function (s0) { return Object.assign({}, s0, { time: e.target.value }) }) }, style: S.input }),
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: sched.autoOvertime, onChange: function (e) { setSched(function (s0) { return Object.assign({}, s0, { autoOvertime: e.target.checked }) }) } }),
          h('span', { style: { fontSize: 12 } }, t('schedAutoOvertime'))),
        h('button', { type: 'button', style: S.btn(false), disabled: !!busy.runNow, onClick: doRunNow }, busy.runNow ? t('running') : t('runNow')),
        h('span', { style: { flex: 1 } }),
        h('button', { type: 'button', style: S.btn(false), onClick: doCopy }, t('copy')),
        h('button', { type: 'button', style: S.btn(true), disabled: !draft || !!busy.ot, onClick: doSubmitOvertime }, busy.ot ? t('submitting') : t('submitOvertime')),
        h('button', {
          type: 'button', title: t('settings'),
          style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' },
          onClick: function () { setDlgOpen(true) },
        }, h(GearIcon, null))))
      if (ot) reportKids.push(h(OtResult, { t: t, ot: ot }))
      kids.push(h('section', { style: S.card },
        h('div', { style: S.cardHead },
          h('span', { style: S.cardTitle }, t('secReport')),
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', style: S.btn(true), disabled: !!busy.gen, onClick: doGenerate }, busy.gen ? t('generating') : t('generate'))),
        reportKids))

      // ── history card
      var histKids = []
      if (detail) {
        histKids.push(h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)' } },
          h('div', { style: S.row },
            h('span', { style: { fontSize: 12, fontWeight: 600 } }, t('historyDetail') + ' · ' + (detail.date || '')),
            h('span', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.btn(false), onClick: function () { setDetail(null) } }, '×')),
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
            (t('trigger.' + (detail.trigger || 'manual')) || detail.trigger || '') + ' · ' + (detail.at || '')),
          detail.overtime ? h(OtResult, { t: t, ot: detail.overtime }) : h('div', { style: S.label }, t('historyNoOvertime')),
          h('pre', { style: { margin: 0, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--dsw-alias-label-primary)' } }, detail.report || '')))
      }
      if (hist && hist.length) {
        for (var hi = 0; hi < hist.length; hi++) {
          ;(function (e) {
            var badge
            if (e.overtime && e.overtime.ok) {
              badge = h('span', { style: Object.assign({}, S.chip(), { color: 'var(--dsw-alias-state-success-primary)' }) }, t('historyOvertimeOk') + (e.overtime.durationText ? ' ' + e.overtime.durationText : ''))
            } else if (e.overtime && !e.overtime.ok) {
              badge = h('span', { style: Object.assign({}, S.chip(), { color: 'var(--dsw-alias-state-error-primary)' }) }, t('historyOvertimeFail'))
            } else {
              badge = h('span', { style: S.chip() }, t('historyNoOvertime'))
            }
            histKids.push(h('div', { key: e.id, style: S.histRow },
              h('span', { style: { fontWeight: 600 } }, e.date),
              h('span', { style: S.label }, (t('trigger.' + (e.trigger || 'manual')) || e.trigger || '') + ' · ' + (e.commits || 0) + t('commits')),
              badge,
              h('span', { style: { flex: 1 } }),
              h('button', { type: 'button', style: S.btn(false), onClick: function () { openDetail(e.id) } }, t('historyView'))))
          })(hist[hi])
        }
      } else {
        histKids.push(h('div', { style: S.label }, t('historyEmpty')))
      }
      kids.push(h('section', { style: S.card },
        h('div', { style: S.cardHead }, h('span', { style: S.cardTitle }, t('secHistory'))),
        histKids))

      // ── 加班提交设置弹窗(提交渠道选择 + 渠道账号表单)
      if (dlgOpen) {
        var channelDefs = [{ key: 'moka', label: 'Moka', desc: t('mokaChannelDesc') }]
        kids.push(h('div', {
          style: { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
          onClick: function (e) { if (e.target === e.currentTarget) setDlgOpen(false) },
        },
          h('div', {
            style: { width: 460, maxWidth: '92%', maxHeight: '86%', overflowY: 'auto', background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' },
            onClick: function (e) { e.stopPropagation() },
          },
            h('div', { style: S.cardHead },
              h('span', { style: S.cardTitle }, t('otSettings')),
              h('span', { style: { flex: 1 } }),
              h('span', { style: S.chip() }, h('span', { style: S.dot(mokaOk) }), mokaOk ? t('mokaConfigured') : t('mokaNotConfigured')),
              h('button', {
                type: 'button', title: t('cancel'),
                style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 16, cursor: 'pointer' },
                onClick: function () { setDlgOpen(false) },
              }, '×')),
            h('div', { style: S.note(false) }, t('otSettingsHint')),
            h(Field, { label: t('channel'), inline: true },
              h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                channelDefs.map(function (ch) {
                  return h('button', {
                    key: ch.key, type: 'button', title: ch.desc, style: S.quickBtn(channel === ch.key),
                    onClick: function () { setChannel(ch.key) },
                  }, ch.label)
                }))),
            channel === 'moka' ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
              h('div', { style: S.row },
                h(Field, { label: t('mokaEmail') }, h('input', { type: 'text', value: mokaEmail, onChange: function (e) { setMokaEmail(e.target.value) }, style: Object.assign({}, S.input, { width: 230 }), placeholder: 'name@company.com', autoComplete: 'off', spellCheck: false })),
                h(Field, { label: t('mokaPassword') }, h('input', { type: 'password', value: mokaPw, onChange: function (e) { setMokaPw(e.target.value) }, style: Object.assign({}, S.input, { width: 180 }), placeholder: mokaOk ? '••••••••' : '', autoComplete: 'new-password' }))),
              h('div', { style: S.row },
                h('button', { type: 'button', style: S.btn(true), disabled: !mokaEmail || !mokaPw || !!busy.mokaSave, onClick: function () { doSaveMoka(function () { setDlgOpen(false) }) } }, busy.mokaSave ? t('mokaSaved') : t('mokaSave')),
                h('button', { type: 'button', style: S.btn(false), disabled: !mokaOk || !!busy.mokaTest, onClick: doTestMoka }, busy.mokaTest ? t('mokaTesting') : t('mokaTest')),
                h('button', { type: 'button', style: S.btn(false), onClick: function () { setDlgOpen(false) } }, t('cancel')))) : null)))
      }

      return h('div', { style: S.page },
        h('div', { style: S.inner }, kids))
    }

    // Bound per-apply so the locale service resolves the current language.
    var pageT = function (key) { return key }

    return {
      name: '@skillpie/dsh-project-report',
      inject: ['slots', 'layout', 'locale'],
      apply: function (ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, '@skillpie/dsh-project-report: dictionaries')

        pageT = (ctx.locale && typeof ctx.locale.bind === 'function')
          ? ctx.locale.bind(NS)
          : function (key) { return (zh[key] != null ? zh[key] : (en[key] != null ? en[key] : key)) }

        // 会话顶部 Tab「日报」:conversation.view(session 作用域,一次渲染一个 view)
        ctx.slots.inject('conversation.view', function () {
          return ctx.slots.register({
            name: 'conversation.view',
            id: 'dsh-project-report',
            order: 90,
            locale: NS,
            label: function () { return pageT('tabLabel') },
          }, ReportTabView)
        })
      },
    }
  },
})
