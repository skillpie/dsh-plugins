// Moka 加班提交流程(移植自 project-report 前身 coder-report 技能的 mokahr_overtime_cli.py)。
// fetch + 手写 cookie jar;支持注入 passportBase/coreBase 供测试桩使用。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
const SEC_CH_UA = '"Chromium";v="144", "Google Chrome";v="144", "Not(A:Brand";v="99"'

export const DEFAULT_FLOW_DEF_ID = '530766336235388928'

// 加班表单字段 uniqKey(租户常量,与技能一致)
export const F = {
  DATE: '4c6d9f98ab3ddeccee3fdf6343ba5682$$0',
  DAY_TYPE: '9ff3b75444fbb3b704b7b7ed5cde3ab1$$0',
  START: 'c21c5c0b231509a4933fef02f9ea004b$$0',
  END: 'b4268160602e6dd4034755da208dfee1$$0',
  DURATION: '5854b87f25ba8555937ede1c545c23c9$$0',
  COMPENSATION: '0461402abdddc9fe17e8cb0da9dfefce$$0',
  REASON: 'fe126e506b96bcd81bb6b719cbcd8b74',
  UNIT_NUM: '3ebc1f6d72bc8b805b92b10c569e679d',
  ATTACHMENT: 'b793f206-b23a-423c-ba5b-17e7c00e669a',
}

export class MokaError extends Error {
  constructor(message, step) {
    super(message)
    this.name = 'MokaError'
    this.step = step || 'unknown'
  }
}

function pad2(n) { return String(n).padStart(2, '0') }

export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { y, m, d }
}

// HH:MM 解析
export function parseHM(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t || ''))
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return { h, min }
}

export function hmString(t) {
  const p = parseHM(t)
  return p ? `${pad2(p.h)}:${pad2(p.min)}` : null
}

// 下班打卡是否跨零点(落在加班日的次日):优先取完整日期串比对;纯 HH:MM 用 hour<12 启发
export function isOvernightOut(clockOut, date) {
  const s = String(clockOut || '')
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  if (m) return m[1] > date
  const p = parseHM(s)
  return !!(p && p.h < 12)
}

// 试算时间格式:跨天加 "次日 " 前缀
export function fmtCalcTime(hm, baseHm) {
  const s = hmString(hm)
  if (!s) return null
  const b = parseHM(baseHm)
  const p = parseHM(hm)
  if (b && p && (p.h * 60 + p.min) < (b.h * 60 + b.min)) return `次日 ${s}`
  return s
}

// settleDuration "X小时Y分钟" → 数值小时
export function parseDurationHours(text) {
  const h = /(\d+)\s*小时/.exec(String(text || ''))
  const min = /(\d+)\s*分钟/.exec(String(text || ''))
  return (h ? Number(h[1]) : 0) + (min ? Number(min[1]) / 60 : 0)
}

function decodeJwtSub(jwt) {
  try {
    const payload = String(jwt || '').split('.')[1]
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const obj = JSON.parse(json)
    return JSON.parse(obj.sub)
  } catch {
    throw new MokaError('登录态 JWT 解析失败', 'login')
  }
}

export class MokaClient {
  constructor({ email, password, passportBase = 'https://passport.mokahr.com', coreBase = 'https://core.mokahr.com', flowDefId = DEFAULT_FLOW_DEF_ID, log = () => {} } = {}) {
    if (!email || !password) throw new MokaError('缺少 Moka 账号配置', 'config')
    this.email = email
    this.password = password
    this.passportBase = passportBase.replace(/\/$/, '')
    this.coreBase = coreBase.replace(/\/$/, '')
    this.flowDefId = flowDefId
    this.log = log
    this.jar = new Map()
  }

  #cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  #saveCookies(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
    for (const line of list) {
      const [pair] = line.split(';')
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (!value || value === 'deleted') this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }

  async #req(base, pathName, body, extraHeaders) {
    const url = `${base}${pathName}`
    const headers = {
      'user-agent': UA,
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      origin: base,
      referer: `${base}/`,
      ...(this.jar.size ? { cookie: this.#cookieHeader() } : {}),
      ...(extraHeaders || {}),
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body || {}) })
    this.#saveCookies(res)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* 非 JSON 响应 */ }
    return { httpOk: res.ok, status: res.status, json, text }
  }

  async login() {
    // ① 账号密码 → rid
    const r1 = await this.#req(this.passportBase, '/api/outer/moka-unified-account/mokaUid/login', {
      isMobile: false, bus: 20, email: this.email, password: this.password,
    })
    if (!r1.httpOk || !r1.json || (r1.json.code !== 200 && r1.json.code !== 0) || !r1.json.data?.rid) {
      throw new MokaError(`登录第一步失败: ${r1.json?.msg || r1.json?.message || `HTTP ${r1.status}`}`, 'login')
    }
    const rid = r1.json.data.rid
    // ② rid(强制) → ticket
    const r2 = await this.#req(this.passportBase, '/api/outer/moka-unified-account/mokaUid/login', {
      isMobile: false, bus: 20, email: this.email, password: this.password, force: true, rid,
    })
    if (!r2.httpOk || !r2.json?.data?.ticket) {
      throw new MokaError(`登录第二步失败: ${r2.json?.msg || `HTTP ${r2.status}`}`, 'login')
    }
    const ticket = r2.json.data.ticket
    // ③ ticket → JWT
    const r3 = await this.#req(this.coreBase, '/api/outer/moka-unified-account/mokaUid/uniLogin?bus=20', {
      loginType: '10', bus: 20, ticket, isMobile: false,
    })
    const d3 = r3.json?.data
    const jwt = d3?.['moka-jwt'] || d3?.mokaJwt
    if (!r3.httpOk || !jwt) {
      throw new MokaError(`登录第三步失败: ${r3.json?.msg || `HTTP ${r3.status}`}`, 'login')
    }
    const sub = decodeJwtSub(jwt)
    const info = {
      jwt,
      employeeId: sub.hcmUid || sub.pid,
      tenantId: sub.hcmTenantId || sub.tid,
      mokaUid: sub.uid || sub.mokaId,
      orgId: sub.oid || sub.atsOrgId,
    }
    if (!info.employeeId) throw new MokaError('JWT 中缺少员工 ID', 'login')
    this.me = info
    return info
  }

  // 考勤详情:clockIn/clockOut/当日是否已提交过加班
  async attendanceDetail(date) {
    const { y, m } = parseDate(date)
    const body = {
      loginType: '10', year: y, month: m, startDate: date, endDate: date,
      fieldVisiblePageEnum: 'VISIBLE_DAY', employeeId: Number(this.me.employeeId),
    }
    const r = await this.#req(this.coreBase, '/api/abs/attendance/myAttendance/v2/m/detail?bus=20', body)
    if (!r.httpOk || !r.json || r.json.code !== 200) {
      // 重复提交等业务错误从这里冒出来
      const msg = r.json?.msg || r.json?.message || `HTTP ${r.status}`
      if (/has submitted overtime/i.test(msg)) throw new MokaError(`当日加班已提交过(${date})`, 'attendance')
      throw new MokaError(`考勤查询失败: ${msg}`, 'attendance')
    }
    const detail = r.json.data?.detail || {}
    let submitted = false
    const otRec = detail['myAttendanceAttendanceRecord#overtimeRecord']
    const otList = otRec?.fieldValue
    if (Array.isArray(otList)) {
      submitted = otList.some((o) => String(o?.beginDate || '').startsWith(date))
    }
    const cio = detail['myAttendanceAttendanceRecord#clockInAndOutTime']
    const first = Array.isArray(cio?.fieldValue) ? cio.fieldValue[0] : null
    const clockIn = first?.clockInTime || null
    const clockOut = first?.clockOutTime || null
    return { clockIn, clockOut, submitted }
  }

  // 试算时长与日期类型
  async settleCalculate({ date, start, end }) {
    const body = {
      loginType: '10', employeeId: Number(this.me.employeeId),
      overtimeDate: date, startTime: start, endTime: end,
    }
    const r = await this.#req(this.coreBase, '/api/abs/account/overtime/v2/settle_calculate?bus=20', body)
    if (!r.httpOk || !r.json || r.json.code !== 200) {
      throw new MokaError(`时长试算失败: ${r.json?.msg || `HTTP ${r.status}`}`, 'calculate')
    }
    const durationText = r.json.data?.settleDuration || ''
    const hours = parseDurationHours(durationText)
    const dayType = r.json.data?.dayType || 'WORKDAY'
    return { durationText, hours, dayType }
  }

  // 审批表单 schema
  async fetchStartInfo() {
    const body = {
      flowDefId: this.flowDefId, applicantId: String(this.me.employeeId), clientType: 'MOBILE',
      type: 'PREDICT_PATH_ONLY', applicantEntityId: '', associatedApplicantEntityId: '',
      hideOriginalValueField: true, enableGroupDefaultFold: true, bus: 20,
    }
    const r = await this.#req(this.coreBase, '/api/workflowplatform/flowDef/fetchWorkflowStartInfo', body)
    if (!r.httpOk || !r.json || r.json.code !== 200 || !r.json.data) {
      throw new MokaError(`获取审批表单失败: ${r.json?.msg || `HTTP ${r.status}`}`, 'form')
    }
    return { flowDefId: r.json.data.flowDefId || this.flowDefId, formDataList: r.json.data.formDataList || [] }
  }

  // 上传附件(multipart)
  async uploadAttachment({ buffer, filename, mime }) {
    const fd = new FormData()
    fd.append('file', new Blob([buffer], { type: mime }), filename)
    const url = `${this.coreBase}/api/workflowplatform/oss/uploadAttachment`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'user-agent': UA,
        accept: 'application/json, text/plain, */*',
        origin: this.coreBase,
        referer: `${this.coreBase}/`,
        ...(this.jar.size ? { cookie: this.#cookieHeader() } : {}),
      },
      body: fd,
    })
    this.#saveCookies(res)
    const json = await res.json().catch(() => null)
    if (!res.ok || !json || json.code !== 200 || !json.data?.url) {
      throw new MokaError(`附件上传失败: ${json?.msg || `HTTP ${res.status}`}`, 'upload')
    }
    return { name: json.data.name || filename, url: json.data.url, size: buffer.length }
  }

  // 按模板填充字段值
  #applyFields(formDataList, values) {
    const groups = Array.isArray(formDataList) ? formDataList : []
    const out = []
    const found = new Set()
    let fieldCount = 0
    for (const group of groups) {
      for (const field of group.fieldList || []) {
        fieldCount++
        found.add(field.uniqKey)
        const item = {
          type: field.fieldType,
          uniqKey: field.uniqKey,
          value: JSON.parse(JSON.stringify(field.value ?? [])),
          linkageAction: field.linkageAction || 0,
          hidden: !!field.hidden,
          bizDataInfo: field.bizDataInfo ?? null,
        }
        if (Object.prototype.hasOwnProperty.call(values, field.uniqKey)) item.value = values[field.uniqKey]
        if (field.originUniqKey) item.originUniqKey = field.originUniqKey
        out.push(item)
      }
    }
    const missing = Object.keys(values).filter((k) => !found.has(k))
    // 附件字段缺位时补一个最小字段(部分租户 schema 不含附件组)
    if (missing.includes(F.ATTACHMENT) && values[F.ATTACHMENT]) {
      out.push({ type: 'attachment', uniqKey: F.ATTACHMENT, value: values[F.ATTACHMENT], linkageAction: 0, hidden: false, bizDataInfo: null })
      missing.splice(missing.indexOf(F.ATTACHMENT), 1)
    }
    if (missing.length > 0) {
      throw new MokaError(`审批表单缺少必需字段: ${missing.join(', ')}`, 'form')
    }
    if (fieldCount === 0) throw new MokaError('审批表单为空,flowDefId 可能失效', 'form')
    return out
  }

  async predict({ flowDefId, formDataList }) {
    const body = {
      flowDefId, applicantId: String(this.me.employeeId), clientType: 'MOBILE',
      type: 'PREDICT_PATH_ONLY', formData: { formDataList },
    }
    const r = await this.#req(this.coreBase, '/api/workflowplatform/flowInst/predict', body)
    if (!r.httpOk || !r.json || r.json.code !== 200) return []
    const nodes = r.json.data?.nodeDataList || []
    return nodes.map((n) => ({
      name: n.nodeName || '',
      mode: n.approvalMode || '',
      assignees: (n.assigneeList || []).map((a) => a.assigneeName).filter(Boolean),
    })).filter((n) => n.name)
  }

  // 完整提交流程:考勤 → 规则 → 试算 → 表单 → 附件 → 提交 → 审批路径
  // opts: { date, reason, attachment?: {buffer, filename, mime}, weekdayStart?: '18:30', minHours?: 2 }
  async submitOvertime(opts) {
    const { date, reason } = opts
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new MokaError('日期格式应为 YYYY-MM-DD', 'submit')
    if (!this.me) await this.login()

    const att = await this.attendanceDetail(date)
    if (att.submitted) throw new MokaError(`当日(${date})加班已提交过,请勿重复提交`, 'attendance')
    const clockOutHM = hmString(att.clockOut)
    if (!clockOutHM) throw new MokaError(`当日(${date})无下班打卡记录,不满足提交条件`, 'attendance')
    const clockInHM = hmString(att.clockIn) || '09:30'
    // 跨零点:下班打卡在次日凌晨(如 02:39),实际远晚于 18:30,规则必过
    const overnight = isOvernightOut(att.clockOut, date)

    // 先按工作日规则试算一次确定 dayType
    const startHM = hmString(opts.weekdayStart || '18:30')
    const calc1 = await this.settleCalculate({ date, start: startHM, end: fmtCalcTime(clockOutHM, startHM) })
    const isWeekend = calc1.dayType && calc1.dayType !== 'WORKDAY'
    let start = startHM
    if (isWeekend) {
      // 非工作日:从实际上班时间起算
      start = clockInHM
    } else if (!overnight) {
      const outMin = parseHM(clockOutHM)
      const t = parseHM(startHM)
      if (outMin.h * 60 + outMin.min < t.h * 60 + t.min) {
        throw new MokaError(`工作日需 ${startHM} 后下班打卡(当前 ${clockOutHM}),不满足提交条件`, 'rule')
      }
    }
    const calc = isWeekend && start !== startHM
      ? await this.settleCalculate({ date, start, end: fmtCalcTime(clockOutHM, start) })
      : calc1
    const minHours = opts.minHours ?? 2
    if (calc.hours < minHours) {
      throw new MokaError(`时长不足:${calc.durationText || `${calc.hours.toFixed(1)}小时`} < ${minHours} 小时`, 'rule')
    }

    const dayTypeZh = isWeekend ? { value: '2', name: '公休日' } : { value: '1', name: '工作日' }
    const startVal = start
    // 跨零点的结束时间与试算一致,带 "次日 " 前缀
    const endVal = overnight ? `次日 ${clockOutHM}` : clockOutHM

    const { flowDefId, formDataList } = await this.fetchStartInfo()
    let attachment = null
    const values = {
      [F.DATE]: [date],
      [F.DAY_TYPE]: [dayTypeZh],
      [F.START]: [{ value: JSON.stringify({ overtimeBeginTime: startVal }), decryptValue: startVal }],
      [F.END]: [{ value: JSON.stringify({ overtimeEndTime: endVal }), decryptValue: endVal }],
      [F.DURATION]: [calc.durationText],
      [F.COMPENSATION]: [{ value: '2', name: '调休假' }],
      [F.REASON]: [reason || '项目开发加班。'],
      [F.UNIT_NUM]: [{
        value: Number(calc.hours.toFixed(2)), decryptValue: null, units: '', name: '',
        digestValue: calc.durationText, fieldLabelExtra: '', fieldLabelExtraEn: '',
        valueDescription: '', descDisplayStyle: null,
      }],
    }
    if (opts.attachment) {
      attachment = await this.uploadAttachment(opts.attachment)
      values[F.ATTACHMENT] = [attachment]
    }
    const finalFormDataList = this.#applyFields(formDataList, values)

    const body = {
      applicantId: String(this.me.employeeId), historyFlowDefId: '', clientType: 'PC',
      flowDefId, formData: { formDataList: finalFormDataList }, associatedApplicantEntityId: '',
    }
    const r = await this.#req(this.coreBase, '/api/workflowplatform/flowInst/create?bus=20', body)
    if (!r.httpOk || !r.json || r.json.code !== 200) {
      throw new MokaError(`提交失败: ${r.json?.msg || r.json?.message || `HTTP ${r.status}`}`, 'submit')
    }
    const approval = await this.predict({ flowDefId, formDataList: finalFormDataList })
    return {
      ok: true,
      date,
      start: startVal,
      end: endVal,
      durationText: calc.durationText,
      hours: Number(calc.hours.toFixed(2)),
      dayType: dayTypeZh.name,
      attachment,
      approval,
      flowResult: r.json.data || null,
    }
  }
}
