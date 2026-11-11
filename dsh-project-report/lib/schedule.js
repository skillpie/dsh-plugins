// 定时判定(纯函数,便于单测):每天到达 schedule.time 后且今天未跑过则触发。
// 支持"错峰补跑":DSH 在触发点之后启动也会当天补跑一次。

export function pad2(n) { return String(n).padStart(2, '0') }

export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseTimeStr(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return { h, min }
}

export function shouldFire(now, schedule, lastRunDate) {
  if (!schedule || !schedule.enabled) return false
  const t = parseTimeStr(schedule.time)
  if (!t) return false
  const today = localDateStr(now)
  if (lastRunDate === today) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= t.h * 60 + t.min
}
