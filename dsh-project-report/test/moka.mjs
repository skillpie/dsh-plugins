// Moka 加班全流程测试:本地桩服务器顶替 passport/core,验证登录三步、
// 考勤规则(工作日/周末/重复提交/无打卡/时长不足/早退)、表单填充、附件上传、审批路径。
// 运行:node test/moka.mjs  (全程仅访问 127.0.0.1,不触真实接口)
import assert from 'node:assert/strict'
import http from 'node:http'

import { MokaClient, MokaError, fmtCalcTime, parseDurationHours, F } from '../lib/moka.js'
import { renderAttachment } from '../lib/render.js'

const failures = []
let passed = 0
async function check(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failures.push({ name, err })
    console.error(`  ✗ ${name}\n    ${err?.stack || err}`)
  }
}

/* ── JWT 夹具(payload.sub 为 JSON 字符串) ─────────────────────────── */
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const SUB = { hcmUid: '12345', hcmTenantId: 'T1', uid: 'u9', oid: 'o1' }
const JWT = `${b64u({ alg: 'none' })}.${b64u({ sub: JSON.stringify(SUB) })}.sig`

/* ── 按日期/参数的行为表 ────────────────────────────────────────────── */
const ATT = {
  // date: { clockIn, clockOut, submitted? }
  '2026-11-10': { clockIn: '2026-11-10 09:12', clockOut: '2026-11-10 22:05' },
  '2026-11-11': { clockIn: '2026-11-11 09:00', clockOut: '2026-11-11 21:40', submitted: [{ beginDate: '2026-11-11 18:30' }] },
  '2026-11-12': { clockIn: '2026-11-12 09:00', clockOut: null },
  '2026-11-13': { clockIn: '2026-11-13 09:00', clockOut: '2026-11-13 19:00' },
  '2026-11-14': { clockIn: '2026-11-14 10:00', clockOut: '2026-11-14 16:00' }, // 周六
  '2026-11-15': { clockIn: '2026-11-15 09:00', clockOut: '2026-11-15 17:00' }, // 工作日早退
  '2026-11-16': { clockIn: '2026-11-16 10:00', clockOut: '2026-11-17 02:39' }, // 跨零点(完整日期串次日)
  '2026-11-17': { clockIn: '2026-11-17 10:00', clockOut: '02:39' }, // 跨零点(纯 HH:MM 启发)
  '2026-11-18': { clockIn: '2026-11-18 09:00', clockOut: '2026-11-18 02:39' }, // 同日凌晨(非跨零点,早退)
}
function calcFor({ start, end, date }) {
  if (start === '18:30') {
    if (date === '2026-11-14') return { dayType: 'WEEKEND', settleDuration: '2小时0分钟' }
    if (end === '22:05') return { dayType: 'WORKDAY', settleDuration: '3小时35分钟' }
    if (end === '19:00') return { dayType: 'WORKDAY', settleDuration: '30分钟' }
    if (end === '次日 17:00') return { dayType: 'WORKDAY', settleDuration: '22小时30分钟' }
    if (end === '次日 02:39') return { dayType: 'WORKDAY', settleDuration: '8小时9分钟' }
  }
  if (start === '10:00' && end === '16:00') return { dayType: 'WEEKEND', settleDuration: '6小时0分钟' }
  if (start === '10:00' && end === '次日 02:39') return { dayType: 'WORKDAY', settleDuration: '16小时39分钟' }
  return { dayType: 'WORKDAY', settleDuration: '1小时0分钟' }
}

// 表单模板:9 个字段齐备
function startInfoTemplate(omitKeys = []) {
  const types = {
    [F.DATE]: 'date', [F.DAY_TYPE]: 'select', [F.START]: 'time', [F.END]: 'time',
    [F.DURATION]: 'text', [F.COMPENSATION]: 'select', [F.REASON]: 'textarea',
    [F.UNIT_NUM]: 'number', [F.ATTACHMENT]: 'attachment',
  }
  const fieldList = Object.entries(types)
    .filter(([k]) => !omitKeys.includes(k))
    .map(([uniqKey, fieldType]) => ({ uniqKey, fieldType, value: null, linkageAction: [], hidden: false }))
  return [{ groupUniqKey: 'g1', fieldList }]
}

/* ── 桩服务器(passport 与 core 共用一个端口,按路径区分) ───────────── */
const seen = { uniLoginUrl: '', detailCookie: '', detailBody: null, uploadCt: '', createBody: null, uaOk: true }
const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => { raw += c })
  req.on('end', () => {
    const send = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)) }
    if (seen.uaOk && !/Chrome\/144/.test(req.headers['user-agent'] || '')) seen.uaOk = false
    if (req.url.startsWith('/api/outer/moka-unified-account/mokaUid/login')) {
      res.setHeader('set-cookie', 'sid=abc123; Path=/')
      const body = JSON.parse(raw || '{}')
      if (body.force) send({ code: 200, data: { ticket: 'TK1' } })
      else send({ code: 200, data: { rid: 'R1' } })
      return
    }
    if (req.url.startsWith('/api/outer/moka-unified-account/mokaUid/uniLogin')) {
      seen.uniLoginUrl = req.url
      send({ code: 200, data: { 'moka-jwt': JWT, 'moka-uid': 'u9' } })
      return
    }
    if (req.url.startsWith('/api/abs/attendance/myAttendance/v2/m/detail')) {
      seen.detailCookie = req.headers.cookie || ''
      const body = JSON.parse(raw || '{}')
      seen.detailBody = body
      const a = ATT[body.startDate] || { clockIn: null, clockOut: null }
      const detail = {
        'myAttendanceAttendanceRecord#overtimeRecord': { fieldValue: a.submitted || [] },
        'myAttendanceAttendanceRecord#clockInAndOutTime': { fieldValue: [{ clockInTime: a.clockIn, clockOutTime: a.clockOut }] },
      }
      send({ code: 200, data: { detail } })
      return
    }
    if (req.url.startsWith('/api/abs/account/overtime/v2/settle_calculate')) {
      const body = JSON.parse(raw || '{}')
      send({ code: 200, data: calcFor({ start: body.startTime, end: body.endTime, date: body.overtimeDate }) })
      return
    }
    if (req.url.startsWith('/api/workflowplatform/flowDef/fetchWorkflowStartInfo')) {
      const body = JSON.parse(raw || '{}')
      const tpl = body.__omit ? startInfoTemplate(body.__omit) : startInfoTemplate()
      send({ code: 200, data: { flowDefId: 'FD_ACTIVE', formDataList: tpl } })
      return
    }
    if (req.url.startsWith('/api/workflowplatform/oss/uploadAttachment')) {
      seen.uploadCt = req.headers['content-type'] || ''
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ code: 200, data: { name: 'coder-report.png', url: 'https://oss.example/f.png' } }))
      return
    }
    if (req.url.startsWith('/api/workflowplatform/flowInst/create')) {
      seen.createBody = JSON.parse(raw || '{}')
      send({ code: 200, data: { flowInstId: 'FI1', flowStatus: 'PENDING' } })
      return
    }
    if (req.url.startsWith('/api/workflowplatform/flowInst/predict')) {
      send({ code: 200, data: { nodeDataList: [
        { nodeName: '直属上级审批', approvalMode: 'AND', assigneeList: [{ assigneeName: '老板' }] },
        { nodeName: 'HR 备案', approvalMode: 'OR', assigneeList: [{ assigneeName: '小王' }, { assigneeName: '小李' }] },
      ] } })
      return
    }
    send({ code: 404, msg: `stub missing route: ${req.url}` })
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

function flatValues(formDataList) {
  const map = {}
  for (const item of formDataList) {
    if (item.uniqKey) map[item.uniqKey] = item.value
    else for (const f of item.fieldList || []) map[f.uniqKey] = f.value
  }
  return map
}
function expectMokaError(promise, step, msgPart) {
  return promise.then(
    () => { throw new Error(`应抛 MokaError(step=${step})`) },
    (err) => {
      assert.ok(err instanceof MokaError, `应为 MokaError,实际 ${err?.name}`)
      assert.equal(err.step, step, `step 应为 ${step},实际 ${err.step}: ${err.message}`)
      if (msgPart) assert.ok(String(err.message).includes(msgPart), `消息应含 "${msgPart}",实际 "${err.message}"`)
    },
  )
}

const client = new MokaClient({ email: 'a@b.com', password: 'pw', passportBase: base, coreBase: base })

console.log('\n[units]')
await check('fmtCalcTime 跨天前缀', () => {
  assert.equal(fmtCalcTime('22:05', '18:30'), '22:05')
  assert.equal(fmtCalcTime('17:00', '18:30'), '次日 17:00')
  assert.equal(fmtCalcTime('00:30', '23:00'), '次日 00:30')
  assert.equal(fmtCalcTime('bad', '18:30'), null)
})
await check('parseDurationHours', () => {
  assert.equal(parseDurationHours('3小时35分钟'), 3 + 35 / 60)
  assert.equal(parseDurationHours('2小时'), 2)
  assert.equal(parseDurationHours('45分钟'), 0.75)
  assert.equal(parseDurationHours(''), 0)
})

console.log('\n[login]')
await check('登录三步 → 员工信息 + cookie jar', async () => {
  const me = await client.login()
  assert.equal(me.employeeId, '12345')
  assert.equal(me.tenantId, 'T1')
  assert.equal(me.mokaUid, 'u9')
  assert.equal(me.orgId, 'o1')
  assert.equal(client.jar.get('sid'), 'abc123')
  assert.ok(seen.uniLoginUrl.includes('bus=20'))
  assert.ok(seen.uaOk, '请求应带 Chrome UA')
})
await check('登录失败 → MokaError(login)', async () => {
  const bad = new MokaClient({ email: 'x@y.com', password: 'nope', passportBase: base, coreBase: base })
  // 桩固定返回成功;这里换真实错误路径:用错误基址触达 404 stub 分支
  const bad2 = new MokaClient({ email: 'x@y.com', password: 'nope', passportBase: base + '/404', coreBase: base })
  await expectMokaError(bad2.login(), 'login')
  assert.ok(bad)
})

console.log('\n[attendance & rules]')
await check('考勤请求带 cookie 与 employeeId', async () => {
  const d = await client.attendanceDetail('2026-11-10')
  assert.equal(d.clockOut, '2026-11-10 22:05')
  assert.equal(d.submitted, false)
  assert.ok(seen.detailCookie.includes('sid=abc123'))
  assert.equal(seen.detailBody.employeeId, 12345)
  assert.equal(seen.detailBody.startDate, '2026-11-10')
})
await check('跨零点下班(完整日期串)必过规则且 END 带次日前缀', async () => {
  const result = await client.submitOvertime({ date: '2026-11-16', reason: '跨零点加班。' })
  assert.equal(result.end, '次日 02:39')
  assert.equal(result.dayType, '工作日')
  assert.ok(result.hours >= 2)
  const v = flatValues(seen.createBody.formData.formDataList)
  assert.equal(JSON.parse(v[F.END][0].value).overtimeEndTime, '次日 02:39')
  assert.equal(v[F.END][0].decryptValue, '次日 02:39')
})
await check('跨零点下班(纯 HH:MM)走次日启发', async () => {
  const result = await client.submitOvertime({ date: '2026-11-17', reason: '跨零点加班2。' })
  assert.equal(result.end, '次日 02:39')
  assert.ok(result.hours >= 2)
})
await check('同日凌晨打卡(非跨零点)仍被 18:30 规则拒绝', async () => {
  await assert.rejects(() => client.submitOvertime({ date: '2026-11-18', reason: 'x' }),
    (e) => e.step === 'rule' && /18:30/.test(e.message))
})
await check('工作日正常提交(含附件)全链路', async () => {
  const attachment = renderAttachment({ date: '2026-11-10', repoNames: ['alpha'], total: 4, items: [{ category: '业务模块', text: '订单导出', times: ['09:30'] }], overtime: null })
  const result = await client.submitOvertime({ date: '2026-11-10', reason: '业务模块：订单导出 总结。', attachment })
  assert.equal(result.ok, true)
  assert.equal(result.start, '18:30')
  assert.equal(result.end, '22:05')
  assert.equal(result.durationText, '3小时35分钟')
  assert.equal(result.dayType, '工作日')
  assert.ok(Math.abs(result.hours - 3.58) < 1e-9) // hours 经 toFixed(2) 舍入
  assert.deepEqual(result.approval.map((n) => n.name), ['直属上级审批', 'HR 备案'])
  assert.deepEqual(result.approval[1].assignees, ['小王', '小李'])
  assert.equal(result.attachment.url, 'https://oss.example/f.png')
  assert.ok(seen.uploadCt.startsWith('multipart/form-data'))
})
await check('create 提交体字段值形态', () => {
  const v = flatValues(seen.createBody.formData.formDataList)
  assert.equal(seen.createBody.flowDefId, 'FD_ACTIVE')
  assert.equal(seen.createBody.clientType, 'PC')
  assert.deepEqual(v[F.DATE], ['2026-11-10'])
  assert.deepEqual(v[F.DAY_TYPE], [{ value: '1', name: '工作日' }])
  assert.equal(JSON.parse(v[F.START][0].value).overtimeBeginTime, '18:30')
  assert.equal(v[F.START][0].decryptValue, '18:30')
  assert.equal(JSON.parse(v[F.END][0].value).overtimeEndTime, '22:05')
  assert.deepEqual(v[F.DURATION], ['3小时35分钟'])
  assert.deepEqual(v[F.COMPENSATION], [{ value: '2', name: '调休假' }])
  assert.deepEqual(v[F.REASON], ['业务模块：订单导出 总结。'])
  assert.equal(v[F.UNIT_NUM][0].digestValue, '3小时35分钟')
  assert.equal(v[F.ATTACHMENT][0].url, 'https://oss.example/f.png')
})
await check('重复提交 → attendance 拒绝', async () => {
  await expectMokaError(client.submitOvertime({ date: '2026-11-11', reason: 'x' }), 'attendance', '已提交过')
})
await check('无下班打卡 → attendance 拒绝', async () => {
  await expectMokaError(client.submitOvertime({ date: '2026-11-12', reason: 'x' }), 'attendance', '下班打卡')
})
await check('时长不足 2 小时 → rule 拒绝', async () => {
  await expectMokaError(client.submitOvertime({ date: '2026-11-13', reason: 'x' }), 'rule', '时长不足')
})
await check('工作日早退(17:00 下班) → rule 拒绝', async () => {
  await expectMokaError(client.submitOvertime({ date: '2026-11-15', reason: 'x' }), 'rule', '18:30')
})
await check('周末从实际上班时间起算 → 公休日', async () => {
  const result = await client.submitOvertime({ date: '2026-11-14', reason: '周末值班' })
  assert.equal(result.start, '10:00')
  assert.equal(result.end, '16:00')
  assert.equal(result.dayType, '公休日')
  const v = flatValues(seen.createBody.formData.formDataList)
  assert.deepEqual(v[F.DAY_TYPE], [{ value: '2', name: '公休日' }])
  assert.equal(JSON.parse(v[F.START][0].value).overtimeBeginTime, '10:00')
})
await check('表单缺必需字段 → form 拒绝', async () => {
  // 临时改用缺 REASON 字段的模板
  const origFetch = client.fetchStartInfo.bind(client)
  client.fetchStartInfo = async () => ({ flowDefId: 'FD2', formDataList: startInfoTemplate([F.REASON]) })
  await expectMokaError(client.submitOvertime({ date: '2026-11-10', reason: 'x' }), 'form', '缺少必需字段')
  client.fetchStartInfo = origFetch
})
await check('缺账号 → config 拒绝(构造时即抛)', () => {
  assert.throws(() => new MokaClient({ email: '', password: '' }), (e) => e instanceof MokaError && e.step === 'config')
})

server.close()
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
