/**
 * live-check.mjs — 对真实 dsh-remote 进程做只读冒烟（gui 模式）。
 *
 * 用法: node test/live-check.mjs [origin] [code]
 *   origin 默认 http://127.0.0.1:52639（本地透传），公网例:
 *   node test/live-check.mjs https://dsh.skillpie.cn 52301705
 *
 * 检查项（全部只读）:
 *   1. GET /<code>/        → 200 且是代理的 GUI 壳（id="root" + 访客 shim），
 *                            不是"宿主机暂时离线"占位页；
 *   2. GET /<code>/（无斜杠）→ 302 到 /<code>/；
 *   3. GET /dsh-remote/api → 属主 API 存活（仅宿主角色直接可达时）。
 *
 * 注意: 旧版探针打 /<code>/ws（console 模式端点），gui 模式下必然
 * socket hang up——那是假警报，不要再用它判断 gui 模式健康。
 */
import { get } from 'node:http'
import { get as httpsGet } from 'node:https'

const origin = process.argv[2] ?? 'http://127.0.0.1:52639'
const code = process.argv[3] ?? ''

const fail = (msg) => { console.error('LIVE CHECK FAILED:', msg); process.exit(1) }
if (!/^\d{8}$/.test(code)) fail(`缺少 8 位远程码: node test/live-check.mjs <origin> <code>`)

function fetchText(url, maxBytes = 400_000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? httpsGet : get
    const req = mod(url, { headers: { 'user-agent': 'dsh-remote-live-check' } }, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (c) => { size += c.length; if (size <= maxBytes) chunks.push(c) })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(20_000, () => { req.destroy(new Error('timeout')) })
  })
}

const base = origin.replace(/\/+$/, '')

// 1. GUI 壳代理 + 访客 shim
const page = await fetchText(`${base}/${code}/`).catch((e) => fail(`GET /${code}/ 失败: ${e.message}`))
if (page.status !== 200) fail(`GET /${code}/ → ${page.status}（离线页/404 都说明 host 未注册到中转）`)
if (!page.body.includes('id="root"')) fail(`GET /${code}/ 不是 GUI 壳（缺 id="root"），可能被占位页/降级响应顶替`)
if (!page.body.includes('dsh-remote visitor shim')) fail('代理 HTML 缺少访客 URL shim（公网访客的 /api/* 调用会 400/405）')
console.log(`✅ GET /${code}/ → 200 GUI 壳 + 访客 shim`)

// 2. 裸码 302
const bare = await fetchText(`${base}/${code}`).catch((e) => fail(`GET /${code} 失败: ${e.message}`))
if (bare.status !== 302 || !String(bare.headers.location ?? '').startsWith(`/${code}/`)) {
  fail(`GET /${code} → ${bare.status}（期望 302 → /${code}/）`)
}
console.log(`✅ GET /${code} → 302 → /${code}/`)

// 3. 属主 API（本地/宿主角色才直接可达；relay-only 服务器 404 属正常）
const api = await fetchText(`${base}/dsh-remote/api`).catch(() => null)
if (api && api.status === 200 && api.body.includes('"ok":true')) {
  console.log('✅ GET /dsh-remote/api → 属主 API 存活')
} else {
  console.log('ℹ️ /dsh-remote/api 未直接可达（relay-only 部署属正常）')
}

console.log(`\n🎉 LIVE CHECK 通过: ${base}/${code}/ 可正常访问`)
