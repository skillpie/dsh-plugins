/**
 * dsh-project-report — Web client half (module-loader bundle).
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
  id: 'dsh-project-report',
  factory(require) {
    var React = require('react')
    var h = React.createElement
    var NS = 'dsh-project-report'

    var zh = {
      title: '项目汇报',
      tabLabel: '汇报',
      subtitle: '整理本项目的代码提交与会话记录,一键生成工作汇报(项目内所有会话共享同一份)',
      secReport: '汇报',
      secSched: '定时汇报',
      secMoka: 'Moka 账号',
      secHistory: '历史记录',
      project: '项目',
      noCwd: '当前会话没有关联的项目目录 — 请从项目里打开会话',
      mineOnly: '仅收集我的',
      collectLabel: '收集方式',
      collectCommits: '收集代码',
      collectSessions: '收集会话',
      date: '日期',
      quick1d: '昨天',
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
      otSection: '加班申请',
      otHint: '手动提交:以当前汇报内容为加班事由,加班单日期=所选日期区间的最后一天(单日即该日)。定时自动提交:在「定时汇报」勾选「生成后自动申请加班」。',
      cutover: '割接偏移(小时)',
      cutoverHint: '汇报日 D 的统计窗口 = D + 偏移小时 → 次日 + 偏移小时,提交/会话按此归日。偏移 6(默认):凌晨 6 点前仍算前一汇报日——加班到次日凌晨都归到前一天,与 Moka 加班日界一致',
      prevDayReport: '汇报前一天',
      prevDayHint: '第二天到点自动生成前一天的汇报(窗口=前一天割接→当天割接)并提交前一天的加班单,适合跨零点加班次日补交',
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
      schedAutoOvertime: '生成后自动申请加班',
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
      secSched: 'Scheduled reports',
      secMoka: 'Moka account',
      secHistory: 'History',
      project: 'Project',
      noCwd: 'This session has no project directory — open the session from a project',
      mineOnly: 'Only mine',
      collectLabel: 'Collect',
      collectCommits: 'Collect code',
      collectSessions: 'Collect sessions',
      date: 'Date',
      quick1d: 'Yesterday',
      quick2d: 'Today',
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
      otSection: 'Overtime',
      otHint: 'Manual submit uses the current report as the reason; the sheet is dated the last day of the selected range. Or enable "auto-request after generate" in scheduled reports.',
      cutover: 'Cutover offset (hours)',
      cutoverHint: 'Report day D covers D + offset hours to next day + offset hours. Offset 6 (default): before 6 AM still counts as the previous report day — past-midnight work stays on the previous day, aligned with the Moka overtime boundary',
      prevDayReport: 'Report previous day',
      prevDayHint: 'Next day at the trigger time, generate the previous day report (window = previous day cutover to this day cutover) and submit its overtime sheet, for past-midnight work',
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
      schedAutoOvertime: 'Auto-request overtime after generate',
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
    // 割接偏移显示值:'06:00' → 6(非法回退 6)
    function cutoverHours(cut) {
      var m = /^(\d{1,2}):/.exec(String(cut || ''))
      var n = m ? Number(m[1]) : NaN
      return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 6
    }

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
      var title = props.title || undefined
      if (props.inline) {
        return h('label', { style: { display: 'flex', alignItems: 'center', gap: 6 }, title: title },
          h('span', { style: S.label }, props.label),
          props.children)
      }
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 }, title: title },
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
        kids.push(h('div', { style: S.note(true) }, (ot.date ? t('otDate') + ' ' + ot.date + ' · ' : '') + t('otError') + ': ' + ot.error))
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

      var dateStartState = React.useState(daysAgoStr(1)) // 汇报日,默认:昨天 ~ 昨天(次日早上汇报前一天)
      var dateStart = dateStartState[0]; var setDateStart = dateStartState[1]
      var dateEndState = React.useState(daysAgoStr(1))
      var dateEnd = dateEndState[0]; var setDateEnd = dateEndState[1]
      var quickState = React.useState('q1d') // 当前命中的快捷区间(手动改日期后置空)
      var cutoverState = React.useState('06:00') // 每日割接时刻(全局设置;汇报日 D = D 割接 → 次日割接)
      var cutover = cutoverState[0]; var setCutover = cutoverState[1]
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
      var cwdRef = React.useRef(cwd) // 自动保存时取当前项目路径(项目隔离:写到该项目自己的 schedule)
      cwdRef.current = cwd

      // 项目隔离:getState/setSettings 携带 cwd,读取/保存该项目自己的每日收集设置
      var refreshState = React.useCallback(function () {
        schedLoaded.current = false // 项目(或首次)加载开始,先关闸防止旧值回写
        api('getState', { cwd: cwdRef.current }).then(function (data) {
          setGs(data)
          setMokaEmail(data.mokaEmail || '')
          // 每项目 schedule:enabled 不做全局回退,默认关闭
          var sch = data.schedule || (data.settings && data.settings.schedule) || {}
          setSched({
            enabled: !!sch.enabled,
            time: sch.time || '21:30',
            autoOvertime: !!sch.autoOvertime,
            prevDay: !!sch.prevDay,
          })
          if (data.settings && data.settings.cutover) setCutover(data.settings.cutover)
          if (data.settings && data.settings.collect) {
            setCollect({ commits: data.settings.collect.commits !== false, sessions: !!data.settings.collect.sessions })
          }
          schedLoaded.current = true // 服务端值已就位,之后的 sched 变更才触发自动保存
        }).catch(function (err) { flash(true, (t('errGeneric') || 'error') + ': ' + err.message) })
      }, [])

      var refreshHistory = React.useCallback(function () {
        api('history', { cwd: cwdRef.current }).then(function (data) { setHist(data.entries || []) }).catch(function () { setHist([]) })
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
              setQuickKey(inferQuick(rep.date, rep.dateEnd || rep.date))
            }
          }
        }).catch(function () { /* 无草稿,静默 */ })
      }, [cwd])

      React.useEffect(function () {
        refreshState(); refreshHistory()
      }, [refreshState, refreshHistory, cwd]) // cwd 变化(会话切换项目)时按新项目重新加载

      // 每日收集设置自动保存:勾选/时间变更即写服务端(服务端值加载完成前不回写;项目隔离:写到 cwdRef 当前项目)
      React.useEffect(function () {
        if (!schedLoaded.current) return
        api('setSettings', { cwd: cwdRef.current, schedule: sched }).catch(function (err) { flash(true, err.message) })
      }, [sched.enabled, sched.time, sched.autoOvertime, sched.prevDay])

      // 快捷区间推断:匹配当前汇报日区间命中哪个快捷键(不匹配返回 null)
      var inferQuick = function (st, ed) {
        if (st === daysAgoStr(1) && ed === daysAgoStr(1)) return 'q1d'
        if (st === todayStr() && ed === todayStr()) return 'q2d'
        if (st === weekStartStr() && ed === todayStr()) return 'qw'
        if (st === monthStartStr() && ed === todayStr()) return 'qm'
        return null
      }

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
          setOt(data && data.result ? Object.assign({ ok: true }, data.result) : { ok: true })
          flash(false, t('historyOvertimeOk') + (data && data.date ? ' (' + data.date + ')' : ''))
          refreshHistory()
        }).catch(function (err) {
          setOt({ ok: false, error: err.message, date: gen ? (gen.dateEnd || gen.date) : dateEnd })
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

      var openDetail = function (id) {
        api('historyEntry', { id: id }).then(function (data) { setDetail(data.entry) }).catch(function (err) { flash(true, err.message) })
      }

      var mokaOk = !!(gs && gs.mokaConfigured)
      // 页头 chip 反映当前项目自己的每日收集开关(项目隔离)
      // 加载完成后优先用本地 sched 状态(勾选即保存,chip 立即跟随);未加载时回退 getState 结果
      var gsSchedOn = !!(gs && ((gs.schedule && gs.schedule.enabled) || (!gs.schedule && gs.settings && gs.settings.schedule && gs.settings.schedule.enabled)))
      var schedOn = schedLoaded.current ? !!sched.enabled : gsSchedOn

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
        { key: 'q1d', label: t('quick1d'), start: daysAgoStr(1), end: daysAgoStr(1) }, // 昨天单日(默认:次日早上汇报前一天)
        { key: 'q2d', label: t('quick2d'), start: todayStr(), end: todayStr() }, // 今天单日
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
        h(Field, { label: t('cutover'), inline: true, title: t('cutoverHint') },
          h('input', {
            type: 'number', min: 0, max: 23, step: 1, value: cutoverHours(cutover),
            onChange: function (e) {
              var n = Number(e.target.value)
              if (!Number.isInteger(n) || n < 0 || n > 23) return
              setCutover(String(n).padStart(2, '0') + ':00')
              api('setSettings', { cutover: n }).catch(function (err) { flash(true, err.message) })
            },
            style: Object.assign({}, S.input, { width: 64 }),
          })),
        h('span', { style: { flex: 1 } })))
      // meta(日期区间 · 提交/会话数 · 仓库分布)与收集方式同行,靠右
      var metaEl = null
      if (gen) {
        var repos = gen.repos || (gen.stats && gen.stats.repos) || []
        var dateLabel = gen.dateEnd && gen.dateEnd !== gen.date ? gen.date + ' ~ ' + gen.dateEnd : (gen.date || '')
        metaEl = h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
          dateLabel + ' · ' + (gen.total || 0) + t('commits')
          + (gen.sessionCount ? ' · ' + gen.sessionCount + t('sessions') : '')
          + ' · ' + repos.map(function (r) { return r.name + '(' + (r.total != null ? r.total : r.commits) + ')' }).join(', '))
      }
      reportKids.push(h('div', { style: S.row },
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: collect.sessions, onChange: function (e) { setCollect(Object.assign({}, collect, { sessions: e.target.checked })) } }),
          h('span', { style: { fontSize: 12 } }, t('collectSessions'))),
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: collect.commits, onChange: function (e) { setCollect(Object.assign({}, collect, { commits: e.target.checked })) } }),
          h('span', { style: { fontSize: 12 } }, t('collectCommits'))),
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: mineOnly, onChange: function (e) { setMineOnly(e.target.checked) } }),
          h('span', { style: { fontSize: 12 } }, t('mineOnly'))),
        h('span', { style: { flex: 1 } }),
        metaEl))
      reportKids.push(h('textarea', {
        value: draft, onChange: function (e) { setDraft(e.target.value) },
        placeholder: t('reportPlaceholder'), style: S.textarea, spellCheck: false,
      }))
      // 底部行:左=每日收集(按项目隔离),右=复制/提交加班申请/账号设置
      reportKids.push(h('div', { style: S.row },
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: sched.enabled, onChange: function (e) { setSched(function (s0) { return Object.assign({}, s0, { enabled: e.target.checked }) }) } }),
          h('span', { style: { fontSize: 12 } }, t('schedEnable'))),
        h('input', { type: 'time', value: sched.time, onChange: function (e) { setSched(function (s0) { return Object.assign({}, s0, { time: e.target.value }) }) }, style: S.input }),
        h('label', { style: S.row, title: t('prevDayHint') },
          h('input', { type: 'checkbox', checked: !!sched.prevDay, onChange: function (e) { setSched(function (s0) { return Object.assign({}, s0, { prevDay: e.target.checked }) }) } }),
          h('span', { style: { fontSize: 12 } }, t('prevDayReport'))),
        h('label', { style: S.row },
          h('input', { type: 'checkbox', checked: sched.autoOvertime, onChange: function (e) { setSched(function (s0) { return Object.assign({}, s0, { autoOvertime: e.target.checked }) }) } }),
          h('span', { style: { fontSize: 12 } }, t('schedAutoOvertime'))),
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
      name: 'dsh-project-report',
      inject: ['slots', 'layout', 'locale'],
      apply: function (ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en })
        }, 'dsh-project-report: dictionaries')

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
        if (typeof window.__DSH_FEATURED_INIT__ === 'function') window.__DSH_FEATURED_INIT__(ctx) // dsh-plugins-plugin: 精选推荐板块
      },
    }
  },
})
