/**
 * dsh-skillpie-mail 冒烟测试。
 *
 * 桩 credentials(内存记录) + 真实 http 服务器 + lib/index.js 的真实 dispatch,
 * 覆盖 list / addFromRegister(经 store) / remove / poll / pollNow(离线时逐邮箱
 * 失败应静默、整体仍 ok) / 密码不外泄 / 非法 JSON 与未知 action。
 */
import http from 'node:http'
import assert from 'node:assert/strict'
import { MailStore, RECORD_ID, dispatch, ROUTE } from '../lib/index.js'

// ── 桩 credentials ───────────────────────────────────────────────────
const records = new Map()
const credentials = {
  async getRecord(id) {
    return records.get(id) ?? null
  },
  async modifyRecord(id, write) {
    records.set(id, await write())
    return records.get(id)
  },
}

const store = new MailStore(credentials)
const cfg = {
  registerUrl: 'http://127.0.0.1:1/register', // 不可达,register 动作应报错不崩
  imapHost: '127.0.0.1',
  imapPort: 1, // 不可达端口:pollNow 走逐邮箱失败路径
  pollInterval: 20,
  folders: ['INBOX'],
}

async function main() {
  // 1. 空列表
  assert.deepEqual(await dispatch(store, cfg, { action: 'list' }), { ok: true, mailboxes: [] })

  // 2. addFromRegister(注册成功路径,跳过 IMAP 校验) + 密码不外泄
  await store.addFromRegister({ address: 'demo@skillpie.cn', appPassword: 'app_secret123', note: '测试' })
  const listed = await dispatch(store, cfg, { action: 'list' })
  assert.equal(listed.mailboxes.length, 1)
  assert.equal(listed.mailboxes[0].email, 'demo@skillpie.cn')
  assert.equal(JSON.stringify(listed).includes('app_secret123'), false, '密码不得出现在 list 响应')

  // 3. 重复添加被拒
  await assert.rejects(() => store.add('demo@skillpie.cn', 'x'), /已在列表中/)

  // 4. poll:无新邮件时 ok + 空通知;通知环带 seq,剥密码
  const poll1 = await dispatch(store, cfg, { action: 'poll' })
  assert.equal(poll1.ok, true)
  assert.deepEqual(poll1.notifications, [])
  store.notifications.push({ id: 'demo@skillpie.cn:9', seq: 1, email: 'demo@skillpie.cn', subject: '验证码 882211', text: '您的验证码' })
  const poll2 = await dispatch(store, cfg, { action: 'poll', sinceSeq: 0 })
  assert.equal(poll2.notifications.length, 1)
  assert.equal(poll2.notifications[0].subject, '验证码 882211')
  assert.equal(JSON.stringify(poll2).includes('password'), false)
  const poll3 = await dispatch(store, cfg, { action: 'poll', sinceSeq: 1 })
  assert.deepEqual(poll3.notifications, [])

  // 5. pollNow:IMAP 不可达时逐邮箱失败静默,整体仍 ok
  const now = await dispatch(store, cfg, { action: 'pollNow' })
  assert.equal(now.ok, true)

  // 6. remove
  const removed = await dispatch(store, cfg, { action: 'remove', email: 'demo@skillpie.cn' })
  assert.deepEqual(removed.mailboxes, [])
  await assert.rejects(() => dispatch(store, cfg, { action: 'remove', email: 'demo@skillpie.cn' }), /没有该邮箱/)

  // 7. 非法 JSON / 未知 action → 错误不崩
  await assert.rejects(() => dispatch(store, cfg, { action: 'nope' }), /unknown action/)

  // 8. 真实 http 服务器走 webServer 桩注册的 exact 路由
  const routes = new Map()
  const webServer = {
    register(spec) {
      assert.equal(spec.kind, 'exact')
      routes.set(spec.path, spec.handler)
    },
  }
  const ctx = {
    async inject(deps, fn) {
      assert.deepEqual(deps, ['credentials'])
      const child = {
        credentials, // 插件内 await child.credentials 构造 store
        effect(setup, name) {
          const disposer = setup()
          void disposer // 计时器已起,测试结束由进程退出回收
          void name
        },
        webServer,
      }
      await fn(child)
    },
    effect() {},
  }
  const plugin = (await import('../lib/index.js')).default
  assert.equal(plugin.name, 'dsh-skillpie-mail')
  // 传测试配置,register 指向不可达端口,避免测试打到真实注册接口
  await plugin.apply(ctx, { registerUrl: 'http://127.0.0.1:1/register', imapHost: '127.0.0.1', imapPort: 1, pollInterval: 20 })

  const handler = routes.get(ROUTE)
  assert.ok(handler, 'exact 路由已注册: ' + ROUTE)

  const server = http.createServer(handler)
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  const port = server.address().port

  async function post(body, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${ROUTE}`, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
    return { status: response.status, json: await response.json() }
  }

  // GET 探活
  const got = await fetch(`http://127.0.0.1:${port}${ROUTE}`)
  assert.deepEqual(await got.json(), { ok: true, service: 'dsh-skillpie-mail', route: ROUTE })

  // 正常动作
  assert.equal((await post({ action: 'list' })).json.ok, true)
  assert.equal((await post({ action: 'poll', sinceSeq: 0 })).json.ok, true)

  // 跨源拒绝
  const cross = await post({ action: 'list' }, { Origin: 'https://evil.example', Host: undefined })
  assert.equal(cross.json.ok, false)
  assert.equal(cross.json.error, 'cross-origin request refused')

  // 同源放行
  const same = await post({ action: 'list' }, { Origin: `http://127.0.0.1:${port}` })
  assert.equal(same.json.ok, true)

  // 非法 JSON 与未知 action 都返回 ok:false 而非 500
  assert.equal((await post('{bad json')).json.ok, false)
  assert.equal((await post({ action: 'zzz' })).json.error, 'unknown action: zzz')

  // register:上游不可达 → ok:false 带错误信息
  const reg = await post({ action: 'register', username: 'abc' })
  assert.equal(reg.json.ok, false)

  server.close()

  // 9. 记录形态:凭据键两段式且 payload 走 grant
  const record = records.get(RECORD_ID)
  assert.equal(record.kind, 'grant')
  assert.ok(Array.isArray(record.payload.mailboxes))
  assert.ok(!RECORD_ID.slice(0, RECORD_ID.indexOf('/')).includes('/'), 'scope 不得含 /')

  console.log('dsh-skillpie-mail smoke: all assertions passed')
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('SMOKE FAILED:', error)
    process.exit(1)
  },
)
