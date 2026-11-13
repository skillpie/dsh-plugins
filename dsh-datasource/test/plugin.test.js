import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { test } from 'node:test'
import plugin, { buildToolDefinitions, dispatch, Config, ROUTE } from '../lib/index.js'
import { DbaService } from '../lib/service.js'

const workspace = tmpdir()

test('Config materializes defaults and rejects bad values', () => {
  assert.deepEqual(Config['~standard'].validate(undefined).value, {
    demo: true, allowWrite: true, agentTools: true, agentWriteApproval: true, maxRows: 200,
  })
  const bad = Config['~standard'].validate({ maxRows: -1, demo: 'yes' })
  assert.ok(bad.issues.length >= 2)
  const good = Config['~standard'].validate({ maxRows: 50, dshHome: '/tmp/x' })
  assert.equal(good.value.maxRows, 50)
  assert.equal(good.value.dshHome, '/tmp/x')
})

test('agent tools list, describe, query and execute', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true } })
  try {
    const [list, describe, query, execute] = buildToolDefinitions(dba)

    // 查数手册随首次列表调用带给模型（插件侧最接近注入的通道）。
    const demoId = (await dba.listConnections()).connections[0].id
    await dba.setNotes(demoId, '统计 GMV 一律排除已取消订单')
    const listed = await list.execute({})
    assert.match(listed.summary, /示例数据库/)
    assert.match(listed.summary, /查数手册/)
    assert.match(listed.summary, /GMV/)
    assert.equal(listed.connections.length, 1)

    const tables = await describe.execute({})
    assert.match(tables.summary, /users/)

    const columns = await describe.execute({ table: 'users' })
    assert.ok(columns.columns.some((column) => column.name === 'email'))
    assert.equal(columns.table, 'users')

    const result = await query.execute({ sql: 'SELECT name, city FROM users ORDER BY id LIMIT 3' })
    assert.equal(result.rows.length, 3)
    assert.ok(result.columns.includes('name'))
    assert.match(result.summary, /查询成功/)
    assert.match(result.summary, /\| name \| city \|/)

    await assert.rejects(
      () => execute.execute({ sql: 'DELETE FROM users', confirm: false }),
      /显式确认/,
    )
    const written = await execute.execute({
      sql: "INSERT INTO users (id,name,email,city,vip,created_at) VALUES (102,'助手','a102@example.com','上海',0,'2026-10-24 21:00:00')",
      confirm: true,
    })
    assert.equal(written.changes, 1)

    await assert.rejects(() => query.execute({ sql: 'DELETE FROM users' }), /read-only/)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('dispatch answers the HTTP action vocabulary', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true } })
  try {
    const overview = await dispatch(dba, { action: 'overview' })
    assert.equal(overview.ok, true)
    const id = overview.connections[0].id
    const rows = await dispatch(dba, { action: 'rows', id, table: 'orders', limit: 2, offset: 0 })
    assert.equal(rows.rows.length, 2)
    const query = await dispatch(dba, { action: 'query', id, sql: 'SELECT COUNT(*) AS n FROM orders' })
    assert.equal(query.rows[0].n, 18)
    await assert.rejects(() => dispatch(dba, { action: 'nope' }), /unknown action/)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('plugin registers the HTTP route and answers it', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const routes = []
  const cleanups = []
  const ctx = {
    effect(fn, _label) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    },
    inject(names, callback) {
      if (!names.includes('webServer')) return
      callback({
        effect(fn) {
          const cleanup = fn()
          if (typeof cleanup === 'function') cleanups.push(cleanup)
        },
        webServer: {
          register(options) {
            routes.push(options)
            return () => {}
          },
        },
      })
    },
  }
  plugin.apply(ctx, { demo: true, allowWrite: true, agentTools: false, maxRows: 200, dshHome: home })
  try {
    assert.equal(routes.length, 1)
    assert.equal(routes[0].path, ROUTE)
    const req = Readable.from([JSON.stringify({ action: 'overview' })])
    req.method = 'POST'
    let payload = null
    const res = {
      writeHead() {},
      end(body) { payload = JSON.parse(String(body)) },
    }
    await routes[0].handler(req, res)
    assert.equal(payload.ok, true)
    assert.equal(payload.connections[0].demo, true)

    // A cross-origin page is refused before the body is read.
    const crossReq = Readable.from([JSON.stringify({ action: 'overview' })])
    crossReq.method = 'POST'
    crossReq.headers = { origin: 'https://evil.example', host: '127.0.0.1:64820' }
    let refused = null
    const crossRes = {
      writeHead(status) { refused = status },
      end(body) { refused = { status: refused, body: JSON.parse(String(body)) } },
    }
    await routes[0].handler(crossReq, crossRes)
    assert.equal(refused.status, 403)
    assert.equal(refused.body.ok, false)
  } finally {
    for (const cleanup of cleanups) await cleanup()
    await rm(home, { recursive: true, force: true })
  }
})

test('agent tools honor the conversation selection', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true } })
  try {
    const overview = await dba.listConnections()
    const demo = overview.connections[0]
    const second = await dba.addConnection({ kind: 'sqlite', name: 'other', file: join(home, 'other.db') })
    const exec = { agent: { session: { id: 'session-tools', header: { cwd: '/workspace/demo' } } } }
    const [list, , query] = buildToolDefinitions(dba)

    await dba.setSessionSelection('session-tools', [demo.id], '/workspace/demo')
    const listed = await list.execute({}, exec)
    assert.deepEqual(listed.selectedIds, [demo.id])
    assert.equal(listed.connections.find((row) => row.id === demo.id).selected, true)
    assert.equal(listed.connections.find((row) => row.id === second.id).selected, false)

    const ok = await query.execute({ sql: 'SELECT COUNT(*) AS n FROM users' }, exec)
    assert.equal(ok.rows[0].n, 8)

    await assert.rejects(
      () => query.execute({ sql: 'SELECT 1', connectionId: second.id }, exec),
      /不在当前会话的选择范围/,
    )

    await dba.setSessionSelection('session-tools', [], '/workspace/demo')
    await assert.rejects(
      () => query.execute({ sql: 'SELECT 1' }, exec),
      /还没有选择数据库/,
    )
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('dispatch exposes session-state, session-set and session-status', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true } })
  try {
    const state = await dispatch(dba, { action: 'session-state', sessionId: 's-api' })
    assert.equal(state.ok, true)
    assert.equal(state.selectedIds.length, 1)
    const id = state.selectedIds[0]

    const empty = await dispatch(dba, { action: 'session-set', sessionId: 's-api', ids: [] })
    assert.deepEqual(empty.selectedIds, [])

    const restored = await dispatch(dba, { action: 'session-set', sessionId: 's-api', ids: [id] })
    assert.deepEqual(restored.selectedIds, [id])

    const status = await dispatch(dba, { action: 'session-status', sessionId: 's-api' })
    assert.equal(status.connections[0].ok, true)

    await assert.rejects(
      () => dispatch(dba, { action: 'query', sessionId: 's-api', id: 'missing', sql: 'SELECT 1' }),
      /not selected|not found/,
    )
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('agent tools include db_export, keyword filter and allowFullTable', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true } })
  try {
    const definitions = buildToolDefinitions(dba)
    assert.deepEqual(
      definitions.map((definition) => definition.name),
      ['db_list_connections', 'db_describe_schema', 'db_query', 'db_execute', 'db_export'],
    )
    const [, describe, , execute, exportTool] = definitions

    // keyword 收窄表清单
    const narrowed = await describe.execute({ keyword: 'order' })
    assert.equal(narrowed.tables.length, 1)
    assert.equal(narrowed.tables[0].name, 'orders')
    assert.ok(narrowed.keyword)

    // UPDATE 无 WHERE 被拒绝
    await assert.rejects(
      () => execute.execute({ sql: 'UPDATE users SET vip = 1', confirm: true }),
      /WHERE/,
    )
    // 多语句批在一个事务里逐条执行
    const batch = await execute.execute({
      sql: 'UPDATE users SET vip = 1 WHERE id = 1; UPDATE users SET vip = 0 WHERE id = 1',
      confirm: true,
    })
    assert.equal(batch.changes, 2)
    assert.ok(Array.isArray(batch.results))
    assert.equal(batch.results.length, 2)

    // db_export 落盘 csv
    const exported = await exportTool.execute({ scope: 'csv', tables: 'users', outputDir: join(home, 'agent-out') })
    assert.match(exported.summary, /已导出 1 个文件/)
    assert.equal(exported.files.length, 1)
    assert.match(exported.files[0].path, /users/)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('notes and export actions flow through dispatch', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true } })
  try {
    const overview = await dispatch(dba, { action: 'overview' })
    const id = overview.connections[0].id

    const saved = await dispatch(dba, { action: 'notes-set', id, notes: '# 手册\n统计 GMV 排除已取消订单' })
    assert.match(saved.notes, /手册/)
    const fetched = await dispatch(dba, { action: 'notes-get', id })
    assert.match(fetched.notes, /统计/)

    const exported = await dispatch(dba, { action: 'export', id, scope: 'csv', tables: ['users'], outputDir: join(home, 'dispatch-out') })
    assert.equal(exported.ok, true)
    assert.equal(exported.files.length, 1)

    // describe 列表模式带回手册
    const tables = await dispatch(dba, { action: 'tables', id })
    assert.match(tables.notes, /统计/)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})

test('activity counter wraps tool executions', async () => {
  const home = await mkdtemp(join(workspace, '.tmp-test-'))
  const dba = new DbaService({ dshHome: home, config: { demo: true } })
  try {
    const definitions = buildToolDefinitions(dba)
    assert.equal(dba.activityBusy(), false)
    await definitions[2].execute({ sql: 'SELECT COUNT(*) AS n FROM users' })
    assert.equal(dba.activityBusy(), false)
    // dispatch 暴露 activity 动作
    const activity = await dispatch(dba, { action: 'activity' })
    assert.equal(activity.busy, false)
  } finally {
    await dba.dispose()
    await rm(home, { recursive: true, force: true })
  }
})
